"""Evidence-backed entity facts, including import of legacy observations."""
from .models import EntityFact, SourceEvidence
from .parsers import stable_id

ATTRIBUTES = {'description', 'name', 'alias', 'identity', 'age', 'occupation', 'role', 'trait', 'background', 'behavior', 'goal', 'action', 'result', 'parent_place', 'time', 'object', 'observation', 'statement'}
ATTRIBUTIONS = {'narrator', 'self_report', 'other_report', 'user'}


def evidence_data(row):
    return {'chapter_id': row.chapter_id, 'chapter_title': row.chapter.title, 'ordinal': row.chapter.ordinal, 'quote': row.quote, 'locator': row.locator}


def save_fact(node, chapter, item):
    ev = item['evidence']
    evidence, _ = SourceEvidence.objects.get_or_create(id=stable_id(node.revision_id, chapter.pk, ev['locator'], ev['quote']), defaults={'revision_id': node.revision_id, 'chapter': chapter, 'quote': ev['quote'], 'locator': ev['locator'], 'ordinal': item.get('ordinal', chapter.ordinal * 1000000000)})
    values = {key: item.get(key, '') for key in ('attribute', 'value', 'speaker', 'time_label')}
    values['attribution'] = item.get('attribution', 'narrator')
    values['status'] = item.get('status', 'explicit')
    fact, _ = EntityFact.objects.get_or_create(id=stable_id(node.pk, evidence.pk, values), defaults={'node': node, 'evidence': evidence, **values})
    return fact


def import_legacy(revision):
    from .models import Chapter, GraphNode
    chapters = {ch.pk: ch for ch in Chapter.objects.filter(book=revision.book)}
    for node in GraphNode.objects.filter(revision=revision).iterator():
        for item in node.facts:
            ev = item.get('evidence')
            if not ev or ev.get('chapter_id') not in chapters:
                continue
            chapter = chapters[ev['chapter_id']]
            save_fact(node, chapter, {'attribute': 'description', 'value': item['description'], 'evidence': ev, 'ordinal': item.get('ordinal', chapter.ordinal * 1000000000), 'status': item.get('status', 'explicit')})
            # Legacy names lack their own provenance; only import when quoted.
            for attribute, names in [('name', [node.name]), ('alias', node.aliases)]:
                for name in names:
                    if name and name in ev['quote']:
                        save_fact(node, chapter, {'attribute': attribute, 'value': name, 'evidence': ev})
