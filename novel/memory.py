"""Replay only adopted version facts. Narrative visibility and story time differ."""
import hashlib
import json
from .models import Chapter, Entity, Fact, Outline, Rule, Thread, Relation, Revision


def fingerprint(project, before=None):
    chapters = Chapter.objects.filter(project=project, is_valid=True)
    current_chapter = []
    if before is not None:
        # Current prose has its own revision guard. Writing metadata must also
        # invalidate candidates/checks without hashing adoption's own pointers.
        current_chapter = list(chapters.filter(position=before).values(
            'id', 'title', 'volume', 'position', 'outline', 'entity_ids',
            'story_time', 'time_order', 'pov'))
        chapters = chapters.filter(position__lt=before)
    data = {'project': [project.blueprint, project.style, project.setup],
            'current_chapter': current_chapter,
            'chapters': list(chapters.values_list('id', 'position', 'adopted_id', 'needs_review')),
            'facts': list(active_facts(project, before=before).values_list('chapter_id', 'data')),
            'entities': list(Entity.objects.filter(project=project).order_by('id').values()),
            'threads': list(Thread.objects.filter(project=project).order_by('id').values()),
            'rules': list(Rule.objects.filter(project=project).order_by('id').values()),
            'relations': list(Relation.objects.filter(project=project).order_by('id').values()),
            'outlines': list(Outline.objects.filter(project=project).order_by('id').values())}
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str, ensure_ascii=False).encode()).hexdigest()


def active_facts(project, through=None, before=None):
    chapters = Chapter.objects.filter(project=project, is_valid=True)
    if through is not None:
        chapters = chapters.filter(position__lte=through)
    if before is not None:
        chapters = chapters.filter(position__lt=before)
    adopted = list(chapters.exclude(adopted_id='').values_list('adopted_id', flat=True))
    return Fact.objects.filter(project=project, revision_id__in=adopted, chapter__needs_review=False).select_related('chapter', 'revision').order_by('chapter__position', 'created_at', 'id')


def state_at(project, through=None, before=None, time_order=None):
    states = {e.pk: dict(e.initial_state) for e in Entity.objects.filter(project=project)}
    relations, timeline, thread_states, reader_knowledge = [], [], {}, []
    facts = list(active_facts(project, through, before))
    def event_time(fact):
        return fact.data.get('time_order') if fact.data.get('time_order') is not None else fact.chapter.time_order
    chronology_known = all(event_time(f) is not None for f in facts)
    if chronology_known:
        facts.sort(key=lambda f: (event_time(f), f.chapter.position, f.created_at, f.pk))
    for fact in facts:
        d = fact.data
        # A previously narrated flash-forward is not the present scene state.
        effective_time = event_time(fact)
        if time_order is not None and effective_time is not None and effective_time > time_order:
            continue
        historical_only = d.get('scene_mode') in ('flashback', 'flashforward') and (effective_time is None or not chronology_known)
        if historical_only:
            timeline.append(dict(d, chapter_id=fact.chapter_id, chapter_title=fact.chapter.title,
                                 revision_id=fact.revision_id, story_time=d.get('story_time') or fact.chapter.story_time, time_order=effective_time))
            continue
        eid = d.get('entity_id')
        if d.get('kind') == 'state' and eid in states and d.get('certainty', 'certain') == 'certain':
            states[eid][d.get('field', 'description')] = d.get('value')
            if d.get('field') == 'holder':
                for current in states.values():
                    if isinstance(current.get('items'), list):
                        current['items'] = [item for item in current['items'] if item != eid]
                holder = d.get('value')
                if holder in states:
                    items = states[holder].get('items', [])
                    states[holder]['items'] = list(dict.fromkeys([*(items if isinstance(items, list) else []), eid]))
        elif d.get('kind') == 'state' and eid in states:
            states[eid].setdefault('uncertain', []).append(d.get('description', ''))
        elif d.get('kind') == 'knowledge' and d.get('scope') == 'reader':
            reader_knowledge.append({'description': d.get('description', ''), 'certainty': d.get('certainty', 'certain')})
        elif d.get('kind') == 'knowledge' and eid in states and d.get('scope', 'character') == 'character':
            existing = states[eid].get('knowledge', [])
            states[eid]['knowledge'] = (existing if isinstance(existing, list) else [existing]) + [{'description': d.get('description', ''), 'certainty': d.get('certainty', 'certain')}]
        elif d.get('kind') == 'relation':
            relations = [r for r in relations if (r.get('entity_id'), r.get('target_id')) != (d.get('entity_id'), d.get('target_id'))]
            relations.append(dict(d, chapter_id=fact.chapter_id, chapter_title=fact.chapter.title, revision_id=fact.revision_id, story_time=fact.chapter.story_time))
        elif d.get('kind') == 'thread':
            thread_states[d['thread_id']] = d.get('state')
        timeline.append(dict(d, chapter_id=fact.chapter_id, chapter_title=fact.chapter.title,
                             revision_id=fact.revision_id, story_time=d.get('story_time') or fact.chapter.story_time, time_order=effective_time))
    chapters = Chapter.objects.filter(project=project, is_valid=True, needs_review=False)
    if through is not None:
        chapters = chapters.filter(position__lte=through)
    if before is not None:
        chapters = chapters.filter(position__lt=before)
    visible = set()
    for revision in Revision.objects.filter(pk__in=chapters.exclude(adopted_id='').values_list('adopted_id', flat=True)):
        visible.update(revision.entity_ids)
    visible.update(d['entity_id'] for d in timeline if d.get('entity_id'))
    return {'states': states, 'relations': relations, 'timeline': timeline, 'thread_states': thread_states, 'reader_knowledge': reader_knowledge, 'visible_entity_ids': sorted(visible)}


def invalidate_later(chapter):
    # Each save must participate in revision tracking; bulk update would bypass it.
    for later in Chapter.objects.filter(project=chapter.project, position__gt=chapter.position, is_valid=True).exclude(adopted_id=''):
        later.needs_review = True
        later.save(update_fields=['needs_review', 'updated_at'])

