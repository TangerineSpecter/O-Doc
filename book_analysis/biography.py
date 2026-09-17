"""Read-only biography projection; narrative order is not a fabricated chronology."""
import re
from django.db.models import Count, Q

from .graph import read_graph
from .errors import AnalysisError
from .models import BiographyQuote, ChapterResult, GraphEdge, GraphNode, NodeSource


def read_biography_outline(revision, *, through_chapter: int | None = None) -> dict:
    """A bounded, chapter-shaped overview. Anchors are navigation, not causal claims."""
    chapters = ChapterResult.objects.filter(revision=revision).select_related('chapter').order_by('chapter__ordinal')
    if through_chapter is not None:
        chapters = chapters.filter(chapter__ordinal__lte=through_chapter)
    total = chapters.count()
    rows = list(chapters[:200])
    chapter_ids = [row.chapter_id for row in rows]
    counts = {(row['chapter_id'], row['node__kind']): row['total'] for row in NodeSource.objects.filter(chapter_id__in=chapter_ids, node__revision=revision, node__kind__in=('event', 'claim')).values('chapter_id', 'node__kind').annotate(total=Count('id'))}
    quotes = dict(BiographyQuote.objects.filter(revision=revision, chapter_id__in=chapter_ids).values('chapter_id').annotate(total=Count('id')).values_list('chapter_id', 'total'))
    anchors_by_chapter = {chapter_id: [] for chapter_id in chapter_ids}
    per_kind = {}
    sources = NodeSource.objects.filter(chapter_id__in=chapter_ids, node__revision=revision, node__kind__in=('event', 'claim')).order_by('chapter_id', 'node__kind', 'node__ordinal', 'node_id').values('chapter_id', 'node__kind', 'node__canonical_id', 'node__name')
    for source in sources.iterator(chunk_size=500):
        key = (source['chapter_id'], source['node__kind'])
        if per_kind.get(key, 0) >= 2:
            continue
        anchors_by_chapter[source['chapter_id']].append({'id': source['node__canonical_id'], 'name': source['node__name'], 'kind': source['node__kind']})
        per_kind[key] = per_kind.get(key, 0) + 1
    items = []
    for row in rows:
        items.append({'id': row.chapter_id, 'ordinal': row.chapter.ordinal, 'title': row.chapter.title,
                      'summary': str(row.digest.get('summary') or '')[:240], 'events': counts.get((row.chapter_id, 'event'), 0),
                      'ideas': counts.get((row.chapter_id, 'claim'), 0), 'quotes': quotes.get(row.chapter_id, 0), 'anchors': anchors_by_chapter[row.chapter_id]})
    return {'subject_name': revision.subject_name, 'chapters': items, 'total': total, 'truncated': total > len(items)}


def read_biography(revision, *, chapter_id: str = '', through_chapter: int | None = None, page: int = 1) -> dict:
    if revision.mode != 'biography':
        return {'events': {'nodes': [], 'total': 0}, 'ideas': {'nodes': [], 'total': 0}, 'quotes': {'items': [], 'total': 0}, 'covered_chapters': [], 'total_chapters': 0}
    options = {'chapter_id': chapter_id, 'through_chapter': through_chapter, 'page': page, 'limit': 20}
    events = read_graph(revision, kind='event', **options)
    ideas = read_graph(revision, kind='claim', **options)
    if chapter_id:
        # A node can recur across chapters; its first three global facts may belong
        # to a different chapter than the one being read here.
        ids = [node['id'] for node in [*events['nodes'], *ideas['nodes']]]
        full_facts = dict(GraphNode.objects.filter(revision=revision, canonical_id__in=ids).values_list('canonical_id', 'facts'))
        for node in [*events['nodes'], *ideas['nodes']]:
            visible = [fact for fact in full_facts.get(node['id'], []) if fact.get('evidence', {}).get('chapter_id') == chapter_id and (through_chapter is None or fact.get('evidence', {}).get('ordinal', 0) <= through_chapter)]
            node['facts'] = visible[:3]
            node['fact_total'] = len(visible)
    idea_ids = {node['id'] for node in ideas['nodes']}
    event_ids = {node['id'] for node in events['nodes']}
    selected = {node.canonical_id: node for node in GraphNode.objects.filter(revision=revision, canonical_id__in=idea_ids | event_ids)}
    selected_ids = {node.pk for node in selected.values()}
    links = []
    for edge in GraphEdge.objects.filter(revision=revision, kind='related_to').filter(Q(source_id__in=selected_ids) | Q(target_id__in=selected_ids)).select_related('source', 'target')[:100]:
        claim, event = (edge.source, edge.target) if edge.source.kind == 'claim' else (edge.target, edge.source)
        if event.kind != 'event' or (claim.canonical_id not in idea_ids and event.canonical_id not in event_ids):
            continue
        evidence = [item for item in edge.evidence if through_chapter is None or item.get('ordinal', 0) <= through_chapter]
        if evidence:
            links.append({'idea_id': claim.canonical_id, 'idea_name': claim.name,
                          'idea_chapter_id': next((fact.get('evidence', {}).get('chapter_id', '') for fact in claim.facts if fact.get('evidence')), ''),
                          'event_id': event.canonical_id, 'event_name': event.name,
                          'event_chapter_id': next((fact.get('evidence', {}).get('chapter_id', '') for fact in event.facts if fact.get('evidence')), ''),
                          'evidence': evidence[0]})
    quotes = BiographyQuote.objects.filter(revision=revision).order_by('ordinal', 'id')
    if chapter_id:
        quotes = quotes.filter(chapter_id=chapter_id)
    if through_chapter is not None:
        quotes = quotes.filter(chapter__ordinal__lte=through_chapter)
    total = quotes.count()
    items = list(quotes[(page - 1) * 20:page * 20])
    event_names = dict(GraphNode.objects.filter(revision=revision, kind='event', canonical_id__in=[row.event_id for row in items if row.event_id]).values_list('canonical_id', 'name'))
    covered = list(ChapterResult.objects.filter(revision=revision).order_by('chapter__ordinal').values_list('chapter__ordinal', flat=True))
    if through_chapter is not None:
        covered = [ordinal for ordinal in covered if ordinal <= through_chapter]
    return {
        'subject_name': revision.subject_name,
        'events': {'nodes': events['nodes'], 'total': events['total']},
        'ideas': {'nodes': ideas['nodes'], 'total': ideas['total']},
        'idea_event_links': links,
        'quotes': {'items': [{'id': row.pk, 'speaker': row.speaker, 'text': row.text, 'evidence': row.evidence, 'attribution_evidence': row.attribution_evidence, 'event_id': row.event_id, 'event_name': event_names.get(row.event_id, '')} for row in items], 'total': total},
        'page': page,
        'covered_chapters': covered,
        'total_chapters': revision.overview.get('total_chapters', 0),
    }


def _same_source_passage(left: dict | None, right: dict | None) -> bool:
    """Match the same continuous source passage, not merely a shared chapter."""
    if not left or not right or left.get('chapter_id') != right.get('chapter_id'):
        return False
    a, b = (re.sub(r'\s+', '', item.get('quote', '')) for item in (left, right))
    if min(len(a), len(b)) >= 8 and (a in b or b in a):
        return True
    first, second = left.get('locator', {}), right.get('locator', {})
    if first.get('format') != second.get('format') or first.get('href') != second.get('href'):
        return False
    a_offset, b_offset = first.get('offset'), second.get('offset')
    if not isinstance(a_offset, int) or not isinstance(b_offset, int):
        return False
    return min(a_offset + len(left.get('quote', '')), b_offset + len(right.get('quote', ''))) - max(a_offset, b_offset) >= 8


def read_biography_detail(revision, *, chapter_id: str, target_id: str, target_kind: str, through_chapter: int | None = None) -> dict:
    """Locate a card and return its associations independently of list pages."""
    if revision.mode != 'biography' or target_kind not in ('event', 'claim', 'quote'):
        raise AnalysisError('传记卡片类型无效', 400)
    chapter = ChapterResult.objects.filter(revision=revision, chapter_id=chapter_id).select_related('chapter').first()
    if not chapter or (through_chapter is not None and chapter.chapter.ordinal > through_chapter):
        raise AnalysisError('章节不在当前已分析范围内', 404)
    quotes = BiographyQuote.objects.filter(revision=revision, chapter_id=chapter_id).order_by('ordinal', 'id')
    if target_kind == 'quote':
        quote = quotes.filter(pk=target_id).first()
        if not quote:
            raise AnalysisError('原话不在本章', 404)
        related_claims = []
        claims = GraphNode.objects.filter(revision=revision, kind='claim', pk__in=NodeSource.objects.filter(chapter_id=chapter_id).values('node_id'))
        for claim in claims.iterator(chunk_size=100):
            if any(_same_source_passage(fact.get('evidence'), quote.evidence) or _same_source_passage(fact.get('evidence'), quote.attribution_evidence) for fact in claim.facts):
                related_claims.append({'id': claim.canonical_id, 'name': claim.name})
        rank = quotes.filter(Q(ordinal__lt=quote.ordinal) | Q(ordinal=quote.ordinal, id__lt=quote.pk)).count()
        return {'page': rank // 20 + 1, 'related_quotes': [], 'related_claims': related_claims}
    nodes = GraphNode.objects.filter(revision=revision, kind=target_kind, pk__in=NodeSource.objects.filter(chapter_id=chapter_id).values('node_id'))
    if through_chapter is not None:
        nodes = nodes.filter(ordinal__lt=(through_chapter + 1) * 1000000000)
    node = nodes.filter(canonical_id=target_id).first()
    if not node:
        raise AnalysisError('卡片不在本章', 404)
    rank = nodes.filter(Q(ordinal__lt=node.ordinal) | Q(ordinal=node.ordinal, id__lt=node.pk)).count()
    if target_kind == 'event':
        related_quotes = quotes.filter(event_id=target_id)
    else:
        evidence = [fact.get('evidence') for fact in node.facts if fact.get('evidence', {}).get('chapter_id') == chapter_id]
        related_quotes = [quote for quote in quotes.iterator(chunk_size=100) if any(_same_source_passage(item, quote.attribution_evidence) for item in evidence)]
    return {'page': rank // 20 + 1,
            'related_quotes': [{'id': quote.pk, 'speaker': quote.speaker, 'text': quote.text, 'evidence': quote.evidence,
                                'attribution_evidence': quote.attribution_evidence, 'event_id': quote.event_id, 'event_name': node.name if target_kind == 'event' else ''} for quote in related_quotes],
            'related_claims': []}
