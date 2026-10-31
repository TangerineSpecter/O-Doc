"""Explicit owner-authorized query embedding; no remote calls under collection locks."""
from django.db import transaction
from quant.locking import collection_lock
from quant.models import FactorVector
from quant.factors.curation import curation_data, curation_data_many
from quant.factors.services import candidate_data
from quant.graph.indexing import candidates, embedding_model
from quant.graph.projection import projection, cosine
from utils.ai_observer import observe_ai
from utils.ai_service import AIService
from utils.bounded_embeddings import embed_texts
from utils.rag_client import RagClient, RagSyncError
from utils.token_usage import usage_scope
from .ranking import rank


def snapshot(collection, query: dict, signature: str) -> list[dict]:
    vectors = {row.candidate_id: row for row in FactorVector.objects.filter(
        candidate__report__entry__anthology=collection, candidate__report__entry__is_valid=True,
        model_signature=signature)} if signature else {}
    from quant.taxonomy.services import current
    vocabulary = current(collection.pk)
    rows = []
    available = list(candidates(collection))
    curations = curation_data_many(available)
    for candidate in available:
        if query.get('entry_id') and query['entry_id'] != candidate.report.entry_id:
            continue
        if query.get('role') and query['role'] != candidate.data['role']:
            continue
        if query.get('family') and query['family'] != curation_data(candidate, curations=curations)['curation']['family']:
            continue
        try:
            fingerprint = projection(candidate, curations=curations)[1]
        except ValueError:
            fingerprint = ''
        cached = vectors.get(candidate.pk)
        vector = cached.vector if fingerprint and cached and cached.projection_hash == fingerprint and cosine(cached.vector, cached.vector) is not None else None
        item = candidate_data(candidate, vocabulary, curations=curations)
        if query.get('admission_stage') and query['admission_stage']!=item['admission']['stage']:
            continue
        if query.get('reuse_status') and query['reuse_status'] != item['verification']['reuse_status']:
            continue
        if query.get('taxonomy_term') and query['taxonomy_term'] not in {term['id'] for term in item['classification']['terms']}:
            continue
        rows.append({'item': item, 'vector': vector, 'projection_hash': fingerprint})
    return rows


def search(collection, query: dict, check_access) -> dict:
    model = embedding_model()
    signature = RagClient.embedding_model_signature(model) if model else ''
    with collection_lock(collection.pk), transaction.atomic():
        check_access()
        rows = snapshot(collection, query, signature)
    usable = sum(row['vector'] is not None for row in rows)
    vector, state = None, 'no_model' if not model else 'no_index' if not usable else 'ready'
    if usable and model:
        try:
            config = AIService.get_client_config_for_model(model.pk)
            with usage_scope(owner_id=collection.user_id, record=collection, purpose='quant', phase='factor_search'), observe_ai(lambda *_args, **_kwargs: None, check_access):
                vectors = embed_texts([query['q']], purpose='query', model=model, timeout_seconds=30, capture_config=config)
            if len(vectors) != 1 or cosine(vectors[0], vectors[0]) is None:
                raise ValueError('invalid query vector')
            vector = vectors[0]
        except (RagSyncError, TimeoutError, ValueError):
            state = 'unavailable'  # No provider response or credentials exposed.
    # Recheck ownership, latest revisions, vector signatures, filters and deletion
    # after waiting for a provider. Never return stale private records.
    with collection_lock(collection.pk), transaction.atomic():
        check_access()
        latest = embedding_model()
        if signature != (RagClient.embedding_model_signature(latest) if latest else ''):
            vector, state, signature = None, 'model_changed', ''
        rows = snapshot(collection, query, signature)
        if vector is not None and not any(row['vector'] and len(row['vector']) == len(vector) for row in rows):
            vector, state = None, 'no_compatible_index'
        ranked = rank(rows, query['q'], vector)
        groups = {}
        for row in ranked:
            item = row['item']
            key = item['fingerprints'].get(query['group_by']) or item['id']
            if key in groups:
                groups[key]['occurrence_count'] += 1
            else:
                groups[key] = item | {'occurrence_count': 1, 'search_match': row['match'] | {
                    'projection_hash': row['projection_hash'], 'model_signature': signature if vector else ''}}
        available = sum(row['vector'] is not None and (vector is None or len(row['vector']) == len(vector)) for row in rows)
        items = list(groups.values())[:100]
        return {'items': items, 'total': len(items), 'occurrence_total': len(ranked), 'search': {
            'method': 'hybrid-rrf-v1', 'query': query['q'], 'semantic_status': state,
            'model_name': model.name if model else '', 'candidate_total': len(rows), 'indexed_total': available,
            'matched_groups': len(groups), 'returned_groups': len(items), 'limit': 100,
            'semantic_threshold': .3, 'claim': 'retrieval_relevance_only'}}
