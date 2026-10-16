"""Rebuildable local index; no durable vector state is synchronized."""
import logging
import hashlib
from django.utils import timezone
from system_settings.models import AgentLongTermMemory
from utils.rag_client import RagClient
from .recall import COLLECTION, revision

logger = logging.getLogger(__name__)


def refresh_index(limit=5, deadline=None):
    result = {'indexed': 0, 'pending': 0, 'failed': 0}
    try:
        memories = list(AgentLongTermMemory.objects.filter(status='active'))
        if not RagClient.get_embedding_model():
            result['pending'] = len(memories)
            return result
        collection = collection_for()
        client = RagClient.get_client()
        for item in client.list_collections():
            name = item if isinstance(item, str) else item.name
            if name.startswith(COLLECTION + '_v1_') and name != collection.name:
                client.delete_collection(name)
        existing = collection.get(include=['metadatas'])
        metadata = dict(zip(existing.get('ids', []), existing.get('metadatas', [])))
        current = {m.pk: m for m in memories}
        obsolete = set(metadata) - set(current)
        if obsolete:
            collection.delete(ids=sorted(obsolete))
        changed = [m for pk, m in current.items() if (metadata.get(pk) or {}).get('revision') != revision(m) or
                   (metadata.get(pk) or {}).get('embedding_model') != model_signature()]
        result['pending'] = len(changed)
        signature = model_signature()
        for memory in changed[:max(1, limit)]:
            if deadline and timezone.now() >= deadline:
                break
            try:
                vectors = RagClient.create_embeddings([memory.title + '\n' + memory.content], strict=True)
                if len(vectors) != 1:
                    raise ValueError('向量模型未返回有效结果')
                fresh = AgentLongTermMemory.objects.filter(pk=memory.pk, status='active').first()
                if fresh is None or revision(fresh) != revision(memory):
                    continue
                collection.upsert(ids=[memory.pk], documents=[memory.content], embeddings=vectors,
                    metadatas=[{'agent_id': str(memory.agent_id), 'revision': revision(memory), 'embedding_model': signature}])
                fresh = AgentLongTermMemory.objects.filter(pk=memory.pk, status='active').first()
                if fresh is None or revision(fresh) != revision(memory):
                    collection.delete(ids=[memory.pk])
                else:
                    result['indexed'] += 1
            except Exception:
                result['failed'] += 1
                logger.exception('Resident memory index refresh failed: memory=%s', memory.pk)
        result['pending'] = max(0, result['pending'] - result['indexed'])
    except Exception:
        logger.warning('Resident memory index refresh failed; keyword retrieval remains available')
        result['failed'] += 1
    return result


def model_signature():
    return RagClient.embedding_model_signature()


def collection_for():
    name = COLLECTION + '_v1_' + hashlib.sha256(model_signature().encode()).hexdigest()[:12]
    return RagClient.get_client().get_or_create_collection(name=name, metadata={'hnsw:space': 'cosine'})
