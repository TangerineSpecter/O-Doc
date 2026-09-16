"""Copy version-scoped facts and invalidate downstream derived conclusions."""
from .models import EntityFact, GraphNode, Hypothesis, ProfileChange, SourceEvidence
from .parsers import stable_id


def copy_analysis(previous, revision, excluded):
    nodes = {n.canonical_id: n for n in GraphNode.objects.filter(revision=revision)}
    evidence_map, fact_map = {}, {}
    for ev in SourceEvidence.objects.filter(revision=previous).exclude(chapter_id__in=excluded):
        new_id = stable_id(revision.pk, ev.chapter_id, ev.locator, ev.quote)
        SourceEvidence.objects.get_or_create(id=new_id, defaults={'revision': revision, 'chapter_id': ev.chapter_id, 'quote': ev.quote, 'locator': ev.locator, 'ordinal': ev.ordinal})
        evidence_map[ev.pk] = new_id
    for fact in EntityFact.objects.filter(node__revision=previous).select_related('node'):
        if fact.node.canonical_id not in nodes or fact.evidence_id not in evidence_map:
            continue
        node = nodes[fact.node.canonical_id]
        values = {key: getattr(fact, key) for key in ('attribute', 'value', 'attribution', 'speaker', 'time_label', 'status')}
        identity = stable_id(node.pk, evidence_map[fact.evidence_id], values)
        EntityFact.objects.get_or_create(id=identity, defaults={'node': node, 'evidence_id': evidence_map[fact.evidence_id], **values})
        fact_map[fact.pk] = identity
    from .models import Chapter, GraphEdge
    cutoff = min(Chapter.objects.filter(pk__in=excluded).values_list('ordinal', flat=True), default=2147483647)
    edges = {e.pk: stable_id(revision.pk, e.pk) for e in GraphEdge.objects.filter(revision=previous)}
    refs = {**edges, **evidence_map, **fact_map}
    for change in ProfileChange.objects.filter(node__revision=previous, chapter__ordinal__lt=cutoff).select_related('node'):
        node = nodes.get(change.node.canonical_id)
        if not node:
            continue
        patch = {key: [{**item, 'basis': [refs[ref] for ref in item['basis'] if ref in refs]} for item in items] for key, items in change.patch.items()}
        patch = {key: [item for item in items if item['basis']] for key, items in patch.items()}
        ProfileChange.objects.get_or_create(node=node, chapter_id=change.chapter_id, defaults={'id': stable_id(node.pk, change.chapter_id, 'profile'), 'patch': patch, 'basis': [refs[ref] for ref in change.basis if ref in refs], 'state': change.state, 'legacy': change.legacy})
    for h in Hypothesis.objects.filter(revision=previous, chapter__ordinal__lt=cutoff).select_related('source', 'target'):
        source = nodes.get(h.source.canonical_id)
        target = nodes.get(h.target.canonical_id) if h.target_id else None
        if not source or (h.target_id and not target) or any(ref not in refs for ref in h.basis):
            continue
        Hypothesis.objects.get_or_create(id=stable_id(revision.pk, h.key, h.chapter_id), defaults={'revision': revision, 'key': h.key, 'chapter_id': h.chapter_id, 'source': source, 'target': target, 'description': h.description, 'state': h.state, 'basis': [refs[ref] for ref in h.basis]})
