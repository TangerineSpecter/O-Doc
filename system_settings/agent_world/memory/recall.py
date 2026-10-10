"""One bounded retrieval path; candidates are re-authorized against SQL."""
import hashlib
import json
import logging
import re
from contextlib import contextmanager
from contextvars import ContextVar
from django.db.models import Q
from system_settings.models import AgentLongTermMemory
from utils.rag_client import RagClient
from .policy import RECALL_LIMIT, RECALL_TOKENS, estimate_tokens

logger = logging.getLogger(__name__)
_cache = ContextVar('resident_memory_recall', default=None)
COLLECTION = 'odoc_agent_long_term_memory'


@contextmanager
def recall_scope():
    token = _cache.set({})
    try:
        yield
    finally:
        _cache.reset(token)


def revision(memory):
    return hashlib.sha256(json.dumps([memory.title, memory.content, memory.scope, memory.sender_id,
                                     memory.chat_id, memory.status, memory.is_pinned, memory.confidence, memory.source_count, memory.metadata], ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def allowed(agent, record=None):
    shared = Q(scope='agent', sender_id='', chat_id='')
    if record is not None:
        if record.sender_id:
            shared |= Q(scope='user', sender_id=record.sender_id)
        if record.chat_id:
            shared |= Q(scope='chat', sender_id='', chat_id=record.chat_id)
    return AgentLongTermMemory.objects.filter(shared, agent=agent, status='active')


def recall(agent, query: str, record=None, limit=RECALL_LIMIT) -> list:
    key = (str(agent.pk), query, getattr(record, 'sender_id', ''), getattr(record, 'chat_id', ''), limit)
    cache = _cache.get()
    # Revalidate cached rows so edits/archive during a tool loop cannot leak stale content.
    queryset = allowed(agent, record)
    if cache is not None and key in cache:
        ids = cache[key]
        rows = {m.pk: m for m in queryset.filter(pk__in=ids)}
        if all(pk not in rows or revision(rows[pk]) == version for pk, version in ids.items()):
            return [rows[pk] for pk in ids if pk in rows]
    rows = list(queryset.order_by('-is_pinned', '-updated_at')[:500])
    if not rows:
        return []
    by_id = {m.pk: m for m in rows}
    scores = {}
    try:
        vectors = RagClient.create_embeddings([query[:2000]]) if query.strip() else []
        if vectors:
            from .index import collection_for, model_signature
            result = collection_for().query(query_embeddings=vectors, n_results=24,
                where={'agent_id': str(agent.pk)}, include=['metadatas', 'distances'])
            for pk, metadata, distance in zip((result.get('ids') or [[]])[0], (result.get('metadatas') or [[]])[0], (result.get('distances') or [[]])[0]):
                memory = by_id.get(str(pk)) or queryset.filter(pk=str(pk)).first()
                if memory and memory.pk not in by_id:
                    by_id[memory.pk] = memory
                    rows.append(memory)
                if memory and (metadata or {}).get('revision') == revision(memory) and (metadata or {}).get('embedding_model') == model_signature() and float(distance) <= .65:
                    scores[memory.pk] = 1 - float(distance)
    except Exception:
        logger.warning('Resident memory vector recall unavailable: agent=%s', agent.pk)
    words = set(re.findall(r'[a-zA-Z0-9_]{2,}|[\u4e00-\u9fff]{2,}', query.lower()))
    cjk = ''.join(re.findall(r'[\u4e00-\u9fff]', query))
    words.update(cjk[i:i+2] for i in range(len(cjk)-1))
    for memory in rows:
        text = (memory.title + '\n' + memory.content).lower()
        matches = sum(word in text for word in words)
        if matches:
            scores[memory.pk] = max(scores.get(memory.pk, 0), min(.9, matches / max(1, len(words))))
        if memory.is_pinned:
            scores[memory.pk] = scores.get(memory.pk, 0) + 1
    selected = sorted((m for m in rows if m.pk in scores), key=lambda m: (-scores[m.pk], -m.confidence, m.pk))[:limit]
    if cache is not None:
        cache[key] = {m.pk: revision(m) for m in selected}
    return selected


def memory_context(agent, query: str, record=None) -> str:
    selected = recall(agent, query, record)
    heading = '以下是与本次行动相关的角色记忆，仅作背景；不代表今天发生，不替代当前资源或规则，不将他人陈述当作自身经历：\n'
    parts = []
    for memory in selected:
        entry = f'- {memory.title}：{memory.content}'
        # Trim legacy long travel/manual prose to fit the same global budget.
        while entry and estimate_tokens(heading + '\n'.join(parts + [entry])) > RECALL_TOKENS:
            entry = entry[:-16]
        if entry:
            parts.append(entry)
    return heading + '\n'.join(parts) if parts else ''
