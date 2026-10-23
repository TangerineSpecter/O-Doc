from utils.token_usage import attributed
import hashlib
import json
import logging
import os
from datetime import timedelta

from django.db import OperationalError, ProgrammingError
from django.utils import timezone

from system_settings.models import AgentIMMessage, AgentIMSession, AgentLongTermMemory, AgentShortTermMemory
from utils.ai_service import AIService
from utils.id_generator import generate_agent_conversation_id
from utils.rag_client import RagClient

logger = logging.getLogger(__name__)

AGENT_MEMORY_COLLECTION = 'odoc_agent_short_term_memory'
DEFAULT_MEMORY_TTL_DAYS = 30
DEFAULT_RECALL_LIMIT = 5
PROMOTION_RECALL_COUNT = 3
PROMOTION_BEST_SCORE = 0.8
PROMOTION_QUERY_SOURCE_COUNT = 3


def get_memory_ttl_days():
    raw_value = os.getenv('ODOC_AGENT_MEMORY_TTL_DAYS', str(DEFAULT_MEMORY_TTL_DAYS))
    try:
        return max(1, int(raw_value))
    except (TypeError, ValueError):
        return DEFAULT_MEMORY_TTL_DAYS


def get_agent_memory_collection(signature=None):
    signature = signature if signature is not None else _agent_memory_model_signature()
    if not signature:
        return RagClient.get_collection(name=AGENT_MEMORY_COLLECTION)
    suffix = hashlib.sha256(signature.encode('utf-8')).hexdigest()[:12]
    return RagClient.get_collection(name=f'{AGENT_MEMORY_COLLECTION}_v1_{suffix}')


def get_or_create_im_session(agent, record):
    session, _ = AgentIMSession.objects.get_or_create(
        agent=agent,
        platform=AgentIMMessage.PLATFORM_FEISHU,
        chat_id=record.chat_id or '',
        sender_id=record.sender_id or '',
        defaults={'sender_id': record.sender_id or ''},
    )
    changed_fields = []
    if record.sender_id and not session.sender_id:
        session.sender_id = record.sender_id
        changed_fields.append('sender_id')
    if not session.conversation_id:
        session.conversation_id = generate_agent_conversation_id()
        changed_fields.append('conversation_id')
    if changed_fields:
        session.save(update_fields=[*changed_fields, 'updated_at'])
    return session


def assign_record_conversation(agent, record):
    session = get_or_create_im_session(agent, record)
    message_queryset = AgentIMMessage.objects.filter(
        agent=agent,
        platform=AgentIMMessage.PLATFORM_FEISHU,
        chat_id=record.chat_id or '',
        sender_id=record.sender_id or '',
        conversation_id='',
    ).exclude(id=record.id)
    from system_settings.sync_state import record_bulk_change
    record_bulk_change(message_queryset)
    message_queryset.update(conversation_id=session.conversation_id)
    if record.conversation_id != session.conversation_id:
        record.conversation_id = session.conversation_id
        record.save(update_fields=['conversation_id', 'updated_at'])
    return session.conversation_id


def start_new_conversation(agent, record):
    session = get_or_create_im_session(agent, record)
    old_conversation_id = session.conversation_id
    session.conversation_id = generate_agent_conversation_id()
    session.summary = ''
    session.summary_until = None
    session.summary_token_estimate = 0
    session.save(update_fields=['conversation_id', 'summary', 'summary_until', 'summary_token_estimate', 'updated_at'])

    if record.conversation_id != old_conversation_id:
        record.conversation_id = old_conversation_id
        record.save(update_fields=['conversation_id', 'updated_at'])
    return session.conversation_id


def build_memory_context(agent, record, user_text):
    from .agent_world.memory.recall import memory_context
    long_context = memory_context(agent, user_text, record)
    recalled_short_memories = recall_short_term_memories(agent, record, user_text)
    messages = []

    if long_context:
        content = long_context
        if content:
            messages.append({
                'role': 'system',
                'content': f'以下是当前 Agent 的角色经历及与当前对话相关的长期记忆。仅在与当前问题相关时使用：\n{content}',
            })

    if recalled_short_memories:
        content = '\n'.join(
            f"- {item['content']}"
            for item in recalled_short_memories
            if item.get('content')
        )
        if content:
            messages.append({
                'role': 'system',
                'content': f'以下是短期记忆中与当前问题相近的历史片段。请按相关性谨慎使用：\n{content}',
            })

    return messages


def recall_short_term_memories(agent, record, query_text, limit=DEFAULT_RECALL_LIMIT):
    query = (query_text or '').strip()
    if not query:
        return []

    try:
        embeddings = RagClient.create_embeddings([query])
        if not embeddings:
            return []
        collection = get_agent_memory_collection()
        results = collection.query(
            query_embeddings=embeddings,
            n_results=limit * 4,
            where={'agent_id': str(agent.id)},
            include=['documents', 'metadatas', 'distances'],
        )
    except Exception:
        logger.exception('Agent short-term memory recall failed: agent=%s', agent.id)
        return []

    ids = (results.get('ids') or [[]])[0] if results else []
    docs = (results.get('documents') or [[]])[0] if results else []
    metadatas = (results.get('metadatas') or [[]])[0] if results else []
    distances = (results.get('distances') or [[]])[0] if results else []
    if not ids:
        return []

    now = timezone.now()
    query_source = _query_source(record, query)
    recalled = []
    for index, memory_id in enumerate(ids):
        metadata = metadatas[index] if index < len(metadatas) and isinstance(metadatas[index], dict) else {}
        if not _matches_memory_scope(record, metadata):
            continue
        memory = AgentShortTermMemory.objects.filter(
            id=str(memory_id),
            agent=agent,
            expires_at__gt=now,
            agent__archived_at__isnull=True,
        promoted_at__isnull=True,
        ).first()
        if not memory:
            continue

        score = _score_from_distance(distances[index] if index < len(distances) else None)
        query_sources = memory.query_sources if isinstance(memory.query_sources, list) else []
        if query_source not in query_sources:
            query_sources = [*query_sources, query_source]
        memory.recall_count += 1
        memory.best_score = max(memory.best_score or 0, score)
        memory.query_sources = query_sources[-20:]
        memory.last_recalled_at = now
        memory.save(update_fields=['recall_count', 'best_score', 'query_sources', 'last_recalled_at', 'updated_at'])

        recalled.append({
            'id': memory.id,
            'content': docs[index] if index < len(docs) else memory.content,
            'score': score,
        })
        if len(recalled) >= limit:
            break

    return recalled


def store_short_term_memory(agent, record):
    if not record.content or not record.response:
        return None

    content = (
        f"用户：{record.content.strip()}\n"
        f"Agent：{record.response.strip()}"
    )
    expires_at = timezone.now() + timedelta(days=get_memory_ttl_days())
    memory = AgentShortTermMemory.objects.create(
        agent=agent,
        chat_id=record.chat_id or '',
        sender_id=record.sender_id or '',
        conversation_id=record.conversation_id or '',
        source_message=record,
        content=content,
        expires_at=expires_at,
        metadata={'message_id': record.message_id},
    )

    try:
        signature = _agent_memory_model_signature()
        embeddings = RagClient.create_embeddings([content])
        if not embeddings:
            return memory
        collection = get_agent_memory_collection(signature)
        collection.upsert(
            documents=[content],
            embeddings=embeddings,
            metadatas=[{
                'agent_id': str(agent.id),
                'chat_id': record.chat_id or '',
                'sender_id': record.sender_id or '',
                'conversation_id': record.conversation_id or '',
                'source_message_id': record.id,
                'expires_at': expires_at.isoformat(),
                'content_hash': hashlib.sha256(content.encode('utf-8')).hexdigest(),
                'embedding_model': signature,
            }],
            ids=[memory.id],
        )
    except Exception:
        logger.exception('Agent short-term memory store failed: memory=%s', memory.id)

    return memory


def _agent_memory_model_signature():
    from system_settings.agent_world.memory.index import model_signature

    return model_signature()


def refresh_short_term_memory_index(limit=5, deadline=None):
    """Rebuild this device's short-term memory vectors from synchronized rows."""
    now = timezone.now()
    current_rows = list(AgentShortTermMemory.objects.filter(
        expires_at__gt=now,
        promoted_at__isnull=True,
        agent__archived_at__isnull=True,
    ).select_related('agent').order_by('created_at'))
    if not current_rows:
        return {'indexed': 0, 'pending': 0, 'failed': 0}

    signature = _agent_memory_model_signature()
    if not signature:
        return {'indexed': 0, 'pending': len(current_rows), 'failed': 0}

    collection = get_agent_memory_collection(signature)
    existing = collection.get(include=['metadatas'])
    existing_metadata = dict(zip(existing.get('ids', []), existing.get('metadatas', [])))
    current_by_id = {memory.pk: memory for memory in current_rows}
    obsolete_ids = sorted(set(existing_metadata) - set(current_by_id))
    if obsolete_ids:
        collection.delete(ids=obsolete_ids)

    changed = []
    for memory in current_rows:
        metadata = existing_metadata.get(memory.pk) or {}
        content_hash = hashlib.sha256(memory.content.encode('utf-8')).hexdigest()
        if metadata.get('content_hash') != content_hash or metadata.get('embedding_model') != signature:
            changed.append((memory, content_hash))

    indexed = 0
    failed = 0
    for memory, content_hash in changed[:max(1, limit)]:
        if deadline and timezone.now() >= deadline:
            break
        try:
            vectors = RagClient.create_embeddings([memory.content], strict=True)
            if len(vectors) != 1:
                raise ValueError('向量模型未返回有效结果')
            fresh = AgentShortTermMemory.objects.filter(
                pk=memory.pk,
                expires_at__gt=timezone.now(),
                promoted_at__isnull=True,
                agent__archived_at__isnull=True,
            ).select_related('agent').first()
            if not fresh or hashlib.sha256(fresh.content.encode('utf-8')).hexdigest() != content_hash:
                continue
            collection.upsert(
                documents=[fresh.content],
                embeddings=vectors,
                metadatas=[{
                    'agent_id': str(fresh.agent_id),
                    'chat_id': fresh.chat_id or '',
                    'sender_id': fresh.sender_id or '',
                    'conversation_id': fresh.conversation_id or '',
                    'expires_at': fresh.expires_at.isoformat(),
                    'content_hash': content_hash,
                    'embedding_model': signature,
                }],
                ids=[fresh.pk],
            )
            indexed += 1
        except Exception:
            failed += 1
            logger.exception('Agent short-term memory index refresh failed: memory=%s', memory.pk)

    return {'indexed': indexed, 'pending': max(0, len(changed) - indexed), 'failed': failed}


def promote_due_short_term_memories():
    from .agent_availability import AgentUnavailableError
    now = timezone.now()
    cutoff = now - timedelta(days=get_memory_ttl_days())
    candidates = list(AgentShortTermMemory.objects.select_related('agent').filter(
        promoted_at__isnull=True,
        agent__archived_at__isnull=True,
        expires_at__gt=now,
        created_at__gte=cutoff,
        recall_count__gte=PROMOTION_RECALL_COUNT,
        best_score__gte=PROMOTION_BEST_SCORE,
    ).order_by('agent_id', 'sender_id', 'chat_id', '-best_score')[:100])

    promoted_count = 0
    for memory in candidates:
        query_sources = memory.query_sources if isinstance(memory.query_sources, list) else []
        if len(set(query_sources)) < PROMOTION_QUERY_SOURCE_COUNT:
            continue
        try:
            promoted = promote_short_term_memory(memory)
        except AgentUnavailableError:
            logger.info('Skipping unavailable agent memory promotion: agent=%s memory=%s', memory.agent_id, memory.pk)
            continue
        if promoted:
            promoted_count += 1

    expired_count = purge_expired_short_term_memories(now)
    return {'promoted_count': promoted_count, 'expired_count': expired_count}


def promote_short_term_memory(memory):
    from .agent_availability import agent_operation
    with agent_operation(memory.agent) as agent:
        result = _promote_short_term_memory(memory)
        return result


def _promote_short_term_memory(memory):
    suggested = _summarize_memory_for_promotion(memory)
    if not suggested:
        return None

    from .agent_availability import require_active_agent
    require_active_agent(memory.agent)
    long_memory = AgentLongTermMemory.objects.create(
        agent=memory.agent,
        scope='user' if memory.sender_id else 'chat',
        chat_id=memory.chat_id or '',
        sender_id=memory.sender_id or '',
        memory_type=suggested.get('memory_type') or AgentLongTermMemory.TYPE_OTHER,
        title=suggested.get('title') or '长期记忆',
        content=suggested.get('content') or memory.content,
        confidence=float(suggested.get('confidence') or min(0.95, max(0.75, memory.best_score or 0.8))),
        source_count=max(1, memory.recall_count),
        metadata={
            'promoted_from': memory.id,
            'source_message_id': memory.source_message_id,
            'query_sources': memory.query_sources,
        },
    )
    memory.promoted_at = timezone.now()
    memory.save(update_fields=['promoted_at', 'updated_at'])
    return long_memory


def purge_expired_short_term_memories(now=None):
    now = now or timezone.now()
    expired = list(AgentShortTermMemory.objects.filter(expires_at__lte=now, agent__archived_at__isnull=True).values_list('id', flat=True)[:500])
    if not expired:
        return 0

    try:
        get_agent_memory_collection().delete(ids=[str(item_id) for item_id in expired])
    except Exception:
        logger.exception('Failed to delete expired agent memories from ChromaDB')

    AgentShortTermMemory.objects.filter(id__in=expired).delete()
    return len(expired)


@attributed('memory')
def _summarize_memory_for_promotion(memory):
    prompt = f"""请判断下面这段 Agent 短期对话记忆是否值得晋升为长期记忆。

只有稳定偏好、长期事实、长期项目、明确指令才值得保存。临时任务、寒暄、一次性问题请返回 should_save=false。

请只返回 JSON：
{{
  "should_save": true,
  "memory_type": "preference|fact|project|instruction|other",
  "title": "不超过20字标题",
  "content": "长期记忆内容",
  "confidence": 0.8
}}

短期记忆：
{memory.content}
"""
    try:
        raw = AIService.chat_completion_messages(
            [{'role': 'user', 'content': prompt}],
            model_id=memory.agent.model_id,
        )
        data = _parse_json_object(raw)
    except Exception:
        logger.exception('Failed to summarize short-term memory: %s', memory.id)
        return None

    if not data or not data.get('should_save'):
        memory.promoted_at = timezone.now()
        memory.save(update_fields=['promoted_at', 'updated_at'])
        return None

    memory_type = data.get('memory_type') or AgentLongTermMemory.TYPE_OTHER
    valid_types = {choice[0] for choice in AgentLongTermMemory.MEMORY_TYPES}
    if memory_type not in valid_types:
        memory_type = AgentLongTermMemory.TYPE_OTHER
    data['memory_type'] = memory_type
    return data


def _parse_json_object(text):
    if not text:
        return {}
    raw = str(text).strip()
    if raw.startswith('```'):
        lines = raw.splitlines()
        if lines and lines[0].strip().startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        raw = '\n'.join(lines).strip()
    start = raw.find('{')
    end = raw.rfind('}')
    if start >= 0 and end > start:
        raw = raw[start:end + 1]
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _matches_memory_scope(record, metadata):
    metadata_sender_id = metadata.get('sender_id') or ''
    metadata_chat_id = metadata.get('chat_id') or ''
    if record.sender_id:
        return metadata_sender_id == record.sender_id
    return metadata_chat_id == (record.chat_id or '')


def _score_from_distance(distance):
    try:
        value = float(distance)
    except (TypeError, ValueError):
        return 0
    return max(0, min(1, 1 - value))


def _query_source(record, query):
    base = record.message_id or record.id or query
    digest = hashlib.sha1(str(base).encode('utf-8')).hexdigest()[:12]
    return f'{record.platform}:{digest}'


def safe_promote_due_short_term_memories():
    try:
        return promote_due_short_term_memories()
    except (OperationalError, ProgrammingError):
        return {'promoted_count': 0, 'expired_count': 0}
    except Exception:
        logger.exception('Unexpected error in agent memory promotion')
        return {'promoted_count': 0, 'expired_count': 0}
