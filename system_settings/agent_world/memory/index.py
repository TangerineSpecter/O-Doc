"""Rebuildable local index; no durable vector state is synchronized."""
import logging
import hashlib
from system_settings.models import AgentLongTermMemory
from utils.rag_client import RagClient
from .recall import COLLECTION, revision

logger = logging.getLogger(__name__)


def refresh_index(limit=5):
    try:
        if not RagClient.get_embedding_model():
            return
        collection = collection_for()
        client = RagClient.get_client()
        for item in client.list_collections():
            name = item if isinstance(item, str) else item.name
            if name.startswith(COLLECTION + '_v1_') and name != collection.name:
                client.delete_collection(name)
        existing = collection.get(include=['metadatas'])
        metadata = dict(zip(existing.get('ids', []), existing.get('metadatas', [])))
        current = {m.pk: m for m in AgentLongTermMemory.objects.filter(status='active')}
        obsolete = set(metadata) - set(current)
        if obsolete:
            collection.delete(ids=sorted(obsolete))
        changed = [m for pk, m in current.items() if (metadata.get(pk) or {}).get('revision') != revision(m) or
                   (metadata.get(pk) or {}).get('embedding_model') != model_signature()][:limit]
        for memory in changed:
            signature = model_signature()
            vectors = RagClient.create_embeddings([memory.title + '\n' + memory.content])
            if not vectors or len(vectors) != 1:
                continue
            fresh = AgentLongTermMemory.objects.filter(pk=memory.pk, status='active').first()
            if fresh is None or revision(fresh) != revision(memory):
                continue
            collection.upsert(ids=[memory.pk], documents=[memory.content], embeddings=vectors,
                metadatas=[{'agent_id': str(memory.agent_id), 'revision': revision(memory), 'embedding_model': signature}])
            fresh = AgentLongTermMemory.objects.filter(pk=memory.pk, status='active').first()
            if fresh is None or revision(fresh) != revision(memory):
                collection.delete(ids=[memory.pk])
    except Exception:
        logger.warning('Resident memory index refresh failed; keyword retrieval remains available')


def model_signature():
    model = RagClient.get_embedding_model()
    return str(model.pk) + ':' + model.name + ':' + str(model.provider_id) + ':' + model.provider.base_url if model else ''


def collection_for():
    name = COLLECTION + '_v1_' + hashlib.sha256(model_signature().encode()).hexdigest()[:12]
    return RagClient.get_client().get_or_create_collection(name=name, metadata={'hnsw:space': 'cosine'})
