"""Novel-only Chroma index is a disposable cache; SQL decides valid versions."""
import hashlib
import logging
from utils.rag_client import RagClient
from .models import Chapter, Entity, Outline, Review, Revision, Rule, Thread, Relation
from .memory import state_at
from .embedding import embeddings

logger = logging.getLogger(__name__)


def collection():
    model = RagClient.get_embedding_model()
    if model is None:
        return None
    key = hashlib.sha256(f'{model.pk}:{model.name}'.encode()).hexdigest()[:16]
    return RagClient.get_client().get_or_create_collection(f'novel_{key}')


def index_revision(revision):
    col = collection()
    if col is None:
        return False
    chunks = [revision.content[i:i + 1200] for i in range(0, len(revision.content), 1000) if revision.content[i:i + 1200].strip()]
    if not chunks:
        return True
    keys = [f'{revision.pk}:{i}' for i in range(len(chunks))]
    if len(col.get(ids=keys, include=[])['ids']) == len(keys):
        return True
    from utils.token_usage import usage_scope
    with usage_scope(owner_id=revision.chapter.project.anthology.user_id, record=revision, purpose='novel', phase='index'):
        vectors = embeddings(chunks)
    if len(vectors) != len(chunks):
        raise ValueError('向量结果不完整')
    col.upsert(ids=keys, documents=chunks, embeddings=vectors,
               metadatas=[{'project_id': revision.chapter.project_id, 'revision_id': revision.pk} for _ in chunks])
    return True


def retrieve(project, chapter, query):
    chapters = Chapter.objects.filter(project=project, is_valid=True, needs_review=False, position__lt=chapter.position).exclude(adopted_id='')
    if chapter.time_order is not None:
        chapters = chapters.exclude(time_order__gt=chapter.time_order)
    allowed = set(chapters.values_list('adopted_id', flat=True))
    fallback = []
    import re
    words = [e.name for e in Entity.objects.filter(project=project) if e.name in query]
    words += [w for w in re.split(r'[\s，。！？、；]+', query) if 1 < len(w) < 40]
    words = list(dict.fromkeys(words))[:15]
    revisions = Revision.objects.filter(pk__in=allowed).order_by('-chapter__position')[:30]
    for rev in revisions:
        for start in range(0, len(rev.content), 1000):
            chunk = rev.content[start:start + 1200]
            if any(w in chunk for w in words):
                fallback.append({'revision_id': rev.pk, 'quote': chunk})
            if len(fallback) >= 4:
                break
        if len(fallback) >= 4:
            break
    mode = '结构化资料与关键词检索'
    try:
        col = collection()
        if col is not None and allowed:
            embedding = embeddings([query])
            if embedding:
                result = col.query(query_embeddings=embedding, n_results=20, where={'project_id': str(project.pk)}, include=['documents', 'metadatas'])
                hits = [{'revision_id': m['revision_id'], 'quote': q} for m, q in zip(result['metadatas'][0], result['documents'][0]) if m['revision_id'] in allowed][:4]
                if hits:
                    return hits, '结构化资料与向量检索'
    except Exception:
        logger.warning('Novel retrieval unavailable project=%s', project.pk)
    return fallback, mode


def context(project, chapter=None):
    import json
    before = chapter.position if chapter else None
    state = state_at(project, before=before, time_order=chapter.time_order if chapter else None)
    entities = Entity.objects.filter(project=project)
    relevant = set(chapter.entity_ids) if chapter else set()
    if chapter:
        for e in entities:
            if e.name in chapter.outline:
                relevant.add(e.pk)
    # All identities remain available; only involved biographies consume the budget.
    entity_data = [{'id': e.pk, 'name': e.name, 'aliases': e.aliases, 'kind': e.kind,
                   'importance': e.importance, 'roles': e.roles,
                   'biography': e.biography[:3000] if not relevant or e.pk in relevant else '',
                   'plan': e.plan[:1000] if e.pk in relevant else '', 'state': state['states'].get(e.pk, {})} for e in entities]
    summaries = []
    for c in Chapter.objects.filter(project=project, is_valid=True).exclude(adopted_id='').order_by('-position'):
        if before is not None and c.position >= before:
            continue
        review = Review.objects.filter(revision_id=c.adopted_id).order_by('-created_at').first()
        if review:
            summaries.append({'chapter': c.title, 'summary': review.summary[:800]})
        if len(summaries) == 6:
            break
    quotes, mode = retrieve(project, chapter, chapter.outline or chapter.title) if chapter else ([], '结构化资料')
    related_relations = [r for r in state['relations'] if not relevant or r.get('entity_id') in relevant or r.get('target_id') in relevant]
    volume_summaries = {}
    for c in Chapter.objects.filter(project=project, is_valid=True, needs_review=False).exclude(adopted_id='').select_related('project'):
        if before is not None and c.position >= before:
            continue
        review = Review.objects.filter(revision_id=c.adopted_id).order_by('-created_at').first()
        if review:
            volume_summaries.setdefault(c.volume, []).append({'chapter': c.title, 'summary': review.summary[:250]})
    for volume, items in volume_summaries.items():
        if len(items) > 4:
            volume_summaries[volume] = {'chapter_count': len(items), 'opening': items[0], 'recent': items[-3:]}
    data = {'setup': project.setup, 'blueprint': project.blueprint[:8000], 'style': project.style[:4000],
            'entities': entity_data, 'relations': related_relations, 'planned_relations': list(Relation.objects.filter(project=project).values()), 'recent_summaries': list(reversed(summaries)), 'volume_summaries': volume_summaries,
            'reader_knowledge': state['reader_knowledge'],
            'outlines': list(Outline.objects.filter(project=project).order_by('position').values('level', 'title', 'content'))[:30],
            'threads': [dict(t, state=state['thread_states'].get(t['id'], t['state'])) for t in Thread.objects.filter(project=project).values()],
            'rules': list(Rule.objects.filter(project=project, enabled=True).values('id', 'kind', 'instruction', 'strength', 'scope', 'scope_entity_ids', 'scope_chapter_ids', 'example', 'alternative', 'exception')),
            'retrieved_evidence': quotes}
    # Keep mandatory identities/rules/state; shrink prose fields rather than silently
    # slicing JSON or dropping a death/knowledge constraint at the end of a prompt.
    rendered = json.dumps(data, ensure_ascii=False, default=str)
    if len(rendered) > 42000:
        data['retrieved_evidence'] = quotes[:2]
        for e in entity_data:
            e['biography'] = e['biography'][:600]
        data['blueprint'] = data['blueprint'][:3000]
        data['outlines'] = [{'title': o['title'], 'content': o['content'][:300]} for o in data['outlines']]
        rendered = json.dumps(data, ensure_ascii=False, default=str)
    if len(rendered) > 60000:
        from rest_framework.exceptions import ValidationError
        raise ValidationError('本章资料过多，请明确本章涉及人物或拆成较小场景')
    return rendered, mode

