"""Rebuild local vector indexes from synchronized business records."""
import hashlib
import json
import logging
import os
from datetime import timedelta
from math import ceil

from django.contrib.auth import get_user_model
from django.db import OperationalError, ProgrammingError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from article.models import Article, Image
from anthology.models import Anthology
from memos.models import Memo
from system_settings.models import AgentLongTermMemory, AgentShortTermMemory, SystemSetting
from utils.rag_client import RagClient, RagDeadlineReached

logger = logging.getLogger(__name__)
RUNTIME_KEY = 'system_embedding_recovery_runtime'
ARTICLE_STATUS_REFRESH_SECONDS = 300


def _batch_size():
    try:
        return max(1, min(50, int(os.getenv('ODOC_EMBEDDING_RECOVERY_BATCH_SIZE', '5'))))
    except (TypeError, ValueError):
        return 5


def _rebuildable_counts():
    return {
        'Agent 长短期记忆': (
            AgentLongTermMemory.objects.filter(status=AgentLongTermMemory.STATUS_ACTIVE).count()
            + AgentShortTermMemory.objects.filter(
                expires_at__gt=timezone.now(),
                promoted_at__isnull=True,
                agent__archived_at__isnull=True,
            ).count()
        ),
        '文章 RAG': Article.objects.filter(is_valid=True).exclude(content='').count(),
        '闪念': Memo.objects.filter(is_valid=True).exclude(content='').count(),
        '图片搜索': Image.objects.filter(is_valid=True).filter(
            Q(ai_visual_description__gt='') | Q(visual_description_override__gt='')
        ).count(),
    }


def _has_rebuildable_content():
    try:
        return any(_rebuildable_counts().values())
    except (OperationalError, ProgrammingError):
        return False


def _runtime():
    try:
        setting = SystemSetting.objects.filter(key=RUNTIME_KEY).first()
    except (OperationalError, ProgrammingError):
        return {}
    return dict(setting.value or {}) if setting else {}


def get_local_article_pending_counts():
    """Return this server's latest per-collection article vector status, if known."""
    runtime = _runtime()
    counts = runtime.get('local_article_pending_by_collection')
    checked_at = runtime.get('local_article_status_checked_at')
    if not isinstance(counts, dict) or not checked_at:
        return None
    return counts


def _save_local_article_pending_counts(counts):
    runtime = _runtime()
    runtime['local_article_pending_by_collection'] = {
        str(coll_id): max(0, int(count))
        for coll_id, count in counts.items()
        if count > 0
    }
    runtime['local_article_status_checked_at'] = timezone.now().isoformat()
    runtime['updated_at'] = timezone.now().isoformat()
    SystemSetting.objects.update_or_create(
        key=RUNTIME_KEY,
        defaults={'value': runtime, 'description': '本机向量索引自动恢复运行状态'},
    )


def _refresh_local_article_status_if_stale():
    runtime = _runtime()
    checked_at = parse_datetime(str(runtime.get('local_article_status_checked_at') or ''))
    now = timezone.now()
    if (checked_at and timezone.is_aware(checked_at)
            and 0 <= (now - checked_at).total_seconds() < ARTICLE_STATUS_REFRESH_SECONDS):
        return

    from system_settings.article_rag_scheduler import _article_rag_scheduler

    if not _article_rag_scheduler._run_lock.acquire(blocking=False):
        return
    try:
        collection = RagClient.get_collection()
        existing = collection.get(include=['metadatas'])
        signature = RagClient.embedding_model_signature()
        metadata_by_article = {}
        vector_count_by_article = {}
        for vector_id, metadata in zip(existing.get('ids', []), existing.get('metadatas', [])):
            if not metadata or not metadata.get('article_id'):
                continue
            article_id = str(metadata['article_id'])
            metadata_by_article[article_id] = metadata
            vector_count_by_article[article_id] = vector_count_by_article.get(article_id, 0) + 1

        pending_by_collection = {}
        for article in Article.objects.filter(is_valid=True).exclude(content='').iterator(chunk_size=200):
            if not (article.content or '').strip():
                continue
            article_id = str(article.article_id)
            metadata = metadata_by_article.get(article_id) or {}
            expected_chunks = ceil(len(article.content) / 500)
            if (metadata.get('content_hash') != _article_hash(article)
                    or metadata.get('embedding_model') != signature
                    or vector_count_by_article.get(article_id, 0) != expected_chunks):
                coll_id = str(article.coll_id)
                pending_by_collection[coll_id] = pending_by_collection.get(coll_id, 0) + 1

        _save_local_article_pending_counts(pending_by_collection)
    except (OperationalError, ProgrammingError):
        logger.debug('Could not refresh local article vector status while database is unavailable', exc_info=True)
    except Exception:
        logger.exception('Could not refresh local article vector status')
    finally:
        _article_rag_scheduler._run_lock.release()


def _notify_once(state):
    runtime = _runtime()
    if runtime.get('notice_state') == state:
        return

    if state == 'missing_model':
        counts = _rebuildable_counts()
        categories = '、'.join(name for name, count in counts.items() if count)
        content = (
            f'本机发现可恢复的向量索引数据：{categories or "Agent 记忆、文章 RAG、闪念或图片搜索"}，'
            '但没有可用的默认向量模型。请到“设置 > AI 模型”添加支持 Embeddings 的模型，配置服务商 API 地址和密钥，'
            '并将它设为默认向量模型；再到“设置 > 定时任务”开启文章 RAG 任务并设置夜间执行窗口。'
            '配置完成后服务器会在该窗口内自动分批重建，无需手动点击。'
        )
    else:
        content = (
            '本机正在恢复向量索引，但默认向量模型请求失败。请到“设置 > AI 模型”确认默认模型有效，'
            '并检查服务商 API 地址、密钥和 Embeddings 接口权限。服务器会自动重试，已有业务内容不会受影响。'
        )

    User = get_user_model()
    recipients = list(User.objects.filter(is_active=True, is_superuser=True))
    if not recipients:
        recipients = list(User.objects.filter(is_active=True, is_staff=True))
    if not recipients:
        recipients = list(User.objects.filter(is_active=True))
    if not recipients:
        return

    from message.models import Notification

    with transaction.atomic():
        for recipient in recipients:
            Notification.objects.create(
                user=recipient,
                title='向量索引恢复需要配置' if state == 'missing_model' else '向量索引恢复失败',
                content=content,
                type='warning',
                link='/settings',
            )
        runtime['notice_state'] = state
        runtime['notice_sent_at'] = timezone.now().isoformat()
        runtime['updated_at'] = timezone.now().isoformat()
        SystemSetting.objects.update_or_create(
            key=RUNTIME_KEY,
            defaults={'value': runtime, 'description': '本机向量索引自动恢复运行状态'},
        )


def _clear_notice():
    runtime = _runtime()
    if not runtime.get('notice_state'):
        return
    runtime['notice_state'] = ''
    runtime['notice_resolved_at'] = timezone.now().isoformat()
    runtime['updated_at'] = timezone.now().isoformat()
    try:
        SystemSetting.objects.update_or_create(
            key=RUNTIME_KEY,
            defaults={'value': runtime, 'description': '本机向量索引自动恢复运行状态'},
        )
    except (OperationalError, ProgrammingError):
        logger.debug('Could not clear local embedding recovery notice state', exc_info=True)


def _article_hash(article):
    value = [article.title or '', article.content or '', str(article.coll_id)]
    return hashlib.sha256(json.dumps(
        value, ensure_ascii=False, separators=(',', ':'),
    ).encode('utf-8')).hexdigest()


def _refresh_article_vectors_unlocked(limit, deadline=None):
    model = RagClient.get_embedding_model()
    signature = RagClient.embedding_model_signature(model) if model else ''
    collection = RagClient.get_collection(model_signature=signature)
    existing = collection.get(include=['metadatas'])
    old_model_ids = [
        vector_id
        for vector_id, metadata in zip(existing.get('ids', []), existing.get('metadatas', []))
        if metadata and metadata.get('embedding_model') and metadata.get('embedding_model') != signature
    ]
    if old_model_ids:
        collection.delete(ids=old_model_ids)
        old_model_ids = set(old_model_ids)
    else:
        old_model_ids = set()
    by_article = {}
    vector_count_by_article = {}
    for vector_id, metadata in zip(existing.get('ids', []), existing.get('metadatas', [])):
        if vector_id in old_model_ids:
            continue
        if metadata and metadata.get('article_id'):
            article_id = str(metadata['article_id'])
            by_article[article_id] = metadata
            vector_count_by_article[article_id] = vector_count_by_article.get(article_id, 0) + 1

    articles = Article.objects.filter(is_valid=True).exclude(content='').order_by('updated_at')
    candidates = []
    pending_by_collection = {}
    for article in articles.iterator(chunk_size=200):
        if not (article.content or '').strip():
            continue
        article_id = str(article.article_id)
        metadata = by_article.get(article_id, {})
        if (not article.is_rag_synced
                or metadata.get('content_hash') != _article_hash(article)
                or metadata.get('embedding_model') != signature
                or vector_count_by_article.get(article_id, 0) != ceil(len(article.content) / 500)):
            coll_id = str(article.coll_id)
            pending_by_collection[coll_id] = pending_by_collection.get(coll_id, 0) + 1
            if len(candidates) < limit:
                candidates.append(article)

    indexed = 0
    failed = 0
    affected_coll_ids = set()
    deadline_kwargs = {'deadline': deadline} if deadline else {}
    for article in candidates:
        if deadline and timezone.now() >= deadline:
            break
        try:
            RagClient.add_article(
                article.article_id,
                article.title,
                article.content,
                article.coll_id,
                model=model,
                **deadline_kwargs,
            )
            with transaction.atomic():
                fresh = Article.objects.select_for_update().filter(article_id=article.article_id, is_valid=True).first()
                if fresh is None or _article_hash(fresh) != _article_hash(article):
                    # 仅清理本次旧版本，避免误删并发写入的新版本向量。
                    collection.delete(where={'$and': [
                        {'article_id': str(article.article_id)},
                        {'content_hash': _article_hash(article)},
                        {'embedding_model': signature},
                    ]})
                    if fresh is None:
                        pending_by_collection[str(article.coll_id)] = max(
                            0, pending_by_collection.get(str(article.coll_id), 0) - 1,
                        )
                    continue
                if not fresh.is_rag_synced:
                    fresh.is_rag_synced = True
                    fresh.last_rag_synced_at = timezone.now()
                    fresh.save(update_fields=['is_rag_synced', 'last_rag_synced_at'])
                affected_coll_ids.add(fresh.coll_id)
            indexed += 1
            pending_by_collection[str(article.coll_id)] = max(
                0, pending_by_collection.get(str(article.coll_id), 0) - 1,
            )
        except RagDeadlineReached:
            break
        except Exception:
            failed += 1
            logger.exception('Article vector recovery failed: article_id=%s', article.article_id)
    for anthology in Anthology.objects.filter(coll_id__in=affected_coll_ids):
        try:
            anthology.update_stats()
        except Exception:
            logger.exception('Failed to update anthology stats after vector recovery: coll_id=%s', anthology.coll_id)
    _save_local_article_pending_counts(pending_by_collection)
    return {'indexed': indexed, 'failed': failed, 'pending': sum(pending_by_collection.values())}


def _refresh_article_vectors(limit, deadline=None):
    from system_settings.article_rag_scheduler import _article_rag_scheduler

    if not _article_rag_scheduler._run_lock.acquire(blocking=False):
        return {'indexed': 0, 'failed': 0}
    try:
        return _refresh_article_vectors_unlocked(limit, deadline=deadline)
    finally:
        _article_rag_scheduler._run_lock.release()


def _refresh_memo_vectors(limit, deadline=None):
    memos = list(Memo.objects.filter(is_valid=True).exclude(content='').order_by('updated_at'))
    if not memos:
        return {'indexed': 0, 'failed': 0}
    collection = RagClient.get_memo_collection()
    existing = collection.get(include=['metadatas'])
    signature = RagClient.embedding_model_signature()
    old_model_ids = [
        vector_id
        for vector_id, metadata in zip(existing.get('ids', []), existing.get('metadatas', []))
        if metadata and metadata.get('embedding_model') and metadata.get('embedding_model') != signature
    ]
    if old_model_ids:
        collection.delete(ids=old_model_ids)
        old_model_ids = set(old_model_ids)
    else:
        old_model_ids = set()
    metadata_by_id = dict(zip(
        (str(value) for value in existing.get('ids', []) if value not in old_model_ids),
        (metadata or {} for value, metadata in zip(existing.get('ids', []), existing.get('metadatas', []))
         if value not in old_model_ids),
    ))
    pending = []
    for memo in memos:
        if not (memo.content or '').strip():
            continue
        metadata = metadata_by_id.get(str(memo.memo_id), {})
        content_hash = hashlib.sha256((memo.content or '').strip().encode('utf-8')).hexdigest()
        if (metadata.get('updated_at') != (memo.updated_at.isoformat() if memo.updated_at else '')
                or metadata.get('content_hash') != content_hash
                or metadata.get('embedding_model') != signature):
            pending.append(memo)
            if len(pending) >= limit:
                break
    try:
        deadline_kwargs = {'deadline': deadline} if deadline else {}
        indexed = RagClient.sync_memos(pending, strict=True, **deadline_kwargs)
        return {'indexed': indexed, 'failed': 0}
    except Exception:
        logger.exception('Memo vector recovery batch failed')
        return {'indexed': 0, 'failed': 1}


def check_embedding_recovery_readiness():
    """Notify when recoverable local indexes exist but no embedding model is configured."""
    try:
        _refresh_local_article_status_if_stale()
        model = RagClient.get_embedding_model()
        if not model:
            if _has_rebuildable_content():
                _notify_once('missing_model')
            return False
        return True
    except (OperationalError, ProgrammingError):
        logger.debug('Embedding recovery readiness check waiting for database readiness', exc_info=True)
        return False
    except Exception:
        logger.exception('Could not check embedding recovery readiness')
        return False


def recover_local_embedding_indexes(deadline=None):
    """Run one bounded recovery pass from synchronized business records."""
    try:
        if not check_embedding_recovery_readiness():
            return

        limit = _batch_size()
        failures = 0
        deadline_kwargs = {'deadline': deadline} if deadline else {}
        if not deadline or timezone.now() < deadline:
            try:
                from system_settings.agent_world.memory.index import refresh_index

                failures += refresh_index(limit=limit, **deadline_kwargs).get('failed', 0)
            except Exception:
                failures += 1
                logger.exception('Long-term Agent memory vector recovery failed')

        if not deadline or timezone.now() < deadline:
            try:
                from system_settings.agent_memory import refresh_short_term_memory_index

                failures += refresh_short_term_memory_index(limit=limit, **deadline_kwargs).get('failed', 0)
            except Exception:
                failures += 1
                logger.exception('Short-term Agent memory vector recovery failed')

        if not deadline or timezone.now() < deadline:
            try:
                failures += _refresh_article_vectors(limit, **deadline_kwargs)['failed']
            except Exception:
                failures += 1
                logger.exception('Article RAG vector recovery failed')

        if not deadline or timezone.now() < deadline:
            try:
                failures += _refresh_memo_vectors(limit, **deadline_kwargs)['failed']
            except Exception:
                failures += 1
                logger.exception('Memo vector recovery failed')

        if (not deadline or timezone.now() + timedelta(minutes=3) < deadline):
            try:
                from article.image_search_jobs import (
                    IMAGE_INDEX_RETRYABLE_ERROR,
                    enqueue_missing_image_index_recovery_jobs,
                )
                from article.models import ImageVisualIndex

                enqueue_missing_image_index_recovery_jobs(batch_size=min(limit, 5), max_jobs=1)
                failures += int(ImageVisualIndex.objects.filter(
                    enabled=True,
                    error=IMAGE_INDEX_RETRYABLE_ERROR,
                ).exists())
            except Exception:
                failures += 1
                logger.exception('Image vector recovery enqueue failed')

        if failures:
            _notify_once('provider_error')
        else:
            _clear_notice()
    except (OperationalError, ProgrammingError):
        logger.debug('Embedding recovery waiting for database readiness', exc_info=True)
    except Exception:
        logger.exception('Unexpected error during local embedding recovery')
        try:
            _notify_once('provider_error')
        except Exception:
            logger.exception('Could not create embedding recovery warning')
