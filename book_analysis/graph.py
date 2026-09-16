"""Graph persistence, bounded read projections and durable user overrides."""
from copy import deepcopy

from django.db import transaction
from django.db.models import Q

from .errors import AnalysisError
from .extraction import EDGE_KINDS
from .models import BookAnalysis, ChapterResult, Correction, GraphEdge, GraphNode, NodeSource
from .parsers import stable_id


def add_segment(revision, chapter, payload: dict):
    for item in payload['nodes']:
        node_id = stable_id(revision.pk, item['canonical_id'])
        node, _ = GraphNode.objects.get_or_create(id=node_id, defaults={'revision': revision, 'canonical_id': item['canonical_id'], 'kind': item['kind'], 'name': item['name'], 'ordinal': item['ordinal'], 'time_label': item['time_label'], 'time_order': item['time_order'], 'thread': item.get('thread', '')})
        fact = {'description': item['description'], 'status': item['status'], 'evidence': item['evidence'], 'ordinal': item['ordinal']}
        if fact not in node.facts:
            node.facts = [*node.facts, fact]
        node.aliases = list(dict.fromkeys([*node.aliases, *item['aliases']]))
        if item['name'] != node.name:
            if len(item['name']) > len(node.name) and node.name in item['name']:
                node.aliases = list(dict.fromkeys([*node.aliases, node.name]))
                node.name = item['name']
            elif item['name'] not in node.aliases:
                node.aliases.append(item['name'])
        node.ordinal = min(node.ordinal, item['ordinal'])
        node.time_order = node.time_order or item['time_order']
        node.time_label = node.time_label or item['time_label']
        node.save()
        if revision.mode == 'story':
            from .facts import save_fact
            save_fact(node, chapter, {'attribute': 'description', 'value': item['description'], 'evidence': item['evidence'], 'ordinal': item['ordinal'], 'status': item['status']})
            for attr, names in [('name', [item['name']]), ('alias', item['aliases'])]:
                for name in names:
                    if name in item['evidence']['quote']:
                        save_fact(node, chapter, {'attribute': attr, 'value': name, 'evidence': item['evidence'], 'ordinal': item['ordinal']})
        NodeSource.objects.get_or_create(id=stable_id(node.pk, chapter.pk), defaults={'node': node, 'chapter': chapter})
    for item in payload.get('attributes', []):
        from .facts import save_fact
        node = GraphNode.objects.get(revision=revision, canonical_id=item['canonical_id'])
        save_fact(node, chapter, item)
        NodeSource.objects.get_or_create(id=stable_id(node.pk, chapter.pk), defaults={'node': node, 'chapter': chapter})
    for item in payload['edges']:
        source = GraphNode.objects.get(revision=revision, canonical_id=item['source'])
        target = GraphNode.objects.get(revision=revision, canonical_id=item['target'])
        key = edge_key(item['source'], item['target'], item['kind'], item['context'], item['label'])
        edge, _ = GraphEdge.objects.get_or_create(id=stable_id(revision.pk, key), defaults={'revision': revision, 'source': source, 'target': target, 'kind': item['kind'], 'label': item['label'], 'context': item['context']})
        if item['evidence'] not in edge.evidence:
            edge.evidence = [*edge.evidence, item['evidence']]
            edge.save()
        if item['kind'] == 'at_time':
            event, moment = (source, target) if source.kind == 'event' else (target, source)
            if event.kind == 'event' and moment.kind == 'time':
                event.time_label = event.time_label or moment.time_label or moment.name
                event.time_order = event.time_order or moment.time_order
                event.save()


def edge_key(source: str, target: str, kind: str, context: dict, label: str) -> str:
    return stable_id(source, target, kind, context.get('chapter_id', ''), label)


def relevant_registry(revision, text: str, through_chapter: int | None = None) -> list[dict]:
    rows = GraphNode.objects.filter(revision=revision)
    if through_chapter is not None:
        rows = rows.filter(ordinal__lt=(through_chapter + 1) * 1000000000)
    rows = rows.values('canonical_id', 'kind', 'name', 'aliases', 'facts').iterator(chunk_size=300)
    result = []
    for row in rows:
        names = [row['name'], *row['aliases']]
        mentions = [name for name in names if len(name) >= 2]
        if row['kind'] == 'person':
            mentions.extend(name[:2] for name in names if len(name) >= 3)
        if any(name in text for name in mentions):
            result.append({k: row[k] for k in ('canonical_id', 'kind', 'name', 'aliases')})
        elif row['kind'] == 'event' and any(f['evidence']['quote'] in text for f in row['facts']):
            result.append({k: row[k] for k in ('canonical_id', 'kind', 'name', 'aliases')})
    result.sort(key=lambda item: min((text.find(name) for name in [item['name'], *item['aliases']] if name and text.find(name) >= 0), default=len(text)))
    result = result[:80]
    canonical_ids = [item['canonical_id'] for item in result]
    nodes = {node.canonical_id: node for node in GraphNode.objects.filter(revision=revision, canonical_id__in=canonical_ids)}
    from .models import ProfileChange
    changes = ProfileChange.objects.filter(node_id__in=[node.pk for node in nodes.values()]).order_by('chapter__ordinal', 'id')
    if through_chapter is not None:
        changes = changes.filter(chapter__ordinal__lte=through_chapter)
    summaries = {}
    for change in changes:
        if 'introduction' in change.patch:
            summaries[change.node_id] = change.patch['introduction'][:2]
    relations = {node.pk: [] for node in nodes.values()}
    edges = GraphEdge.objects.filter(revision=revision).filter(Q(source_id__in=relations) | Q(target_id__in=relations)).select_related('source', 'target')
    for edge in edges:
        if through_chapter is not None and edge.context.get('ordinal', 0) > through_chapter:
            continue
        relation = {'source': edge.source.canonical_id, 'target': edge.target.canonical_id, 'label': edge.label}
        for node_id in (edge.source_id, edge.target_id):
            if node_id in relations and len(relations[node_id]) < 8:
                relations[node_id].append(relation)
    for item in result:
        node = nodes[item['canonical_id']]
        item['summary'] = summaries.get(node.pk, [])
        item['relations'] = relations[node.pk]
    return result


class Projection:
    def __init__(self, revision, through_chapter=None):
        self.through_chapter = through_chapter
        self.revision = revision
        self.corrections = list(Correction.objects.filter(book=revision.book).filter(Q(introduced_ordinal=0) | Q(introduced_ordinal__lte=through_chapter))) if through_chapter is not None else list(Correction.objects.filter(book=revision.book))
        self.nodes = {c.key: c.patch for c in self.corrections if c.kind == 'node'}
        self.edge_patches = {c.key: c.patch for c in self.corrections if c.kind == 'edge'}

    def resolve(self, key: str) -> str:
        visited = set()
        while self.nodes.get(key, {}).get('merge_into'):
            if key in visited:
                raise AnalysisError('节点合并存在循环，请修正合并关系', 409)
            visited.add(key)
            key = self.nodes[key]['merge_into']
        return key

    def merged_keys(self, keys: set[str]) -> set[str]:
        return keys | {key for key in self.nodes if self.resolve(key) in keys}

    def node(self, row) -> dict:
        key = self.resolve(row.canonical_id)
        patch = self.nodes.get(key, {})
        facts = deepcopy(row.facts)
        name, aliases = row.name, row.aliases
        time_label, time_order = row.time_label, row.time_order
        ordinal = row.ordinal
        if self.through_chapter is not None:
            facts = [f for f in facts if f.get('evidence') and f['evidence'].get('ordinal', 0) <= self.through_chapter]
            from .models import EntityFact
            attrs = list(EntityFact.objects.filter(node=row, evidence__chapter__ordinal__lte=self.through_chapter).order_by('evidence__ordinal'))
            names = [f.value for f in attrs if f.attribute == 'name']
            name = names[0] if names else (row.name if any(row.name in f['evidence']['quote'] for f in facts) else '未明确名称')
            aliases = list(dict.fromkeys(f.value for f in attrs if f.attribute == 'alias'))
            moments = [f for f in attrs if f.attribute == 'time']
            time_label = moments[-1].value if moments else ''
            time_order = ''
            ordinal = min((f.get('ordinal', 0) for f in facts), default=row.ordinal)

        if patch.get('description'):
            facts.append({'description': patch['description'], 'status': 'user', 'evidence': None})
        return {'id': key, 'kind': row.kind, 'name': patch.get('name', name), 'aliases': patch.get('aliases', aliases), 'facts': facts, 'ordinal': ordinal, 'time_label': patch.get('time_label', time_label), 'time_order': time_order, 'thread': row.thread}

    def serialize_nodes(self, rows: list) -> list:
        groups = {}
        for row in sorted(rows, key=lambda n: n.canonical_id != self.resolve(n.canonical_id)):
            key = self.resolve(row.canonical_id)
            if self.nodes.get(key, {}).get('hidden'):
                continue
            item = self.node(row)
            if key in groups:
                groups[key]['facts'] += [f for f in item['facts'] if f not in groups[key]['facts']]
                groups[key]['aliases'] = list(dict.fromkeys([*groups[key]['aliases'], row.name, *item['aliases']]))
                groups[key]['ordinal'] = min(item['ordinal'], groups[key]['ordinal'])
            else:
                groups[key] = item
        return list(groups.values())

    def edge(self, row) -> dict | None:
        if self.through_chapter is not None and (row.context.get('ordinal', 0) > self.through_chapter or not any(e.get('ordinal', 0) <= self.through_chapter for e in row.evidence)):
            return None
        source, target = row.source.canonical_id, row.target.canonical_id
        key = edge_key(source, target, row.kind, row.context, row.label)
        patch = self.edge_patches.get(key, {})
        if patch.get('hidden'):
            return None
        return {'id': key, 'source': self.resolve(source), 'target': self.resolve(target), 'kind': patch.get('kind', row.kind), 'label': patch.get('label', row.label), 'evidence': [e for e in row.evidence if self.through_chapter is None or e.get('ordinal', 0) <= self.through_chapter], 'context': row.context, 'origin': 'user' if patch else 'ai'}

    def extra_edges(self) -> list:
        return [{'id': c.key, **c.patch, 'source': self.resolve(c.patch['source']), 'target': self.resolve(c.patch['target']), 'evidence': [], 'context': {}, 'origin': 'user'} for c in self.corrections if c.kind == 'relation' and not c.patch.get('hidden')]


def read_graph(revision, *, chapter_id: str = '', kind: str = '', query: str = '', center: str = '', thread: str = '', view: str = 'graph', order: str = 'narrative', page: int = 1, limit: int = 200, through_chapter: int | None = None, include_inferred: bool = False) -> dict:
    projection = Projection(revision, through_chapter)
    rows = GraphNode.objects.filter(revision=revision)
    if through_chapter is not None:
        rows = rows.filter(ordinal__lt=(through_chapter + 1) * 1000000000)
    threads = list(rows.exclude(thread='').values_list('thread', flat=True).distinct().order_by('thread')[:100])
    if thread:
        rows = rows.filter(thread=thread)
    if center:
        center = projection.resolve(center)
        center_keys = projection.merged_keys({center})
        center_ids = GraphNode.objects.filter(revision=revision, canonical_id__in=center_keys).values_list('id', flat=True)
        edges = GraphEdge.objects.filter(revision=revision).filter(Q(source_id__in=center_ids) | Q(target_id__in=center_ids))
        visible_edges = [edge for edge in edges if through_chapter is None or any(ev.get('ordinal', 0) <= through_chapter for ev in edge.evidence)]
        adjacent = {edge.source_id for edge in visible_edges} | {edge.target_id for edge in visible_edges} | set(center_ids)
        extras = {e[key] for e in projection.extra_edges() if e['source'] == center or e['target'] == center for key in ('source', 'target')}
        rows = rows.filter(Q(id__in=adjacent) | Q(canonical_id__in=projection.merged_keys(extras)))
    if chapter_id:
        chapter_keys = GraphNode.objects.filter(revision=revision, id__in=NodeSource.objects.filter(chapter_id=chapter_id).values('node_id')).values_list('canonical_id', flat=True)
        resolved = {projection.resolve(key) for key in chapter_keys}
        rows = rows.filter(canonical_id__in=projection.merged_keys(resolved))
    if view in ('flow', 'timeline'):
        rows = rows.filter(kind='event')
        limit = min(limit, 50)
    elif kind:
        rows = rows.filter(kind=kind)
    if query:
        patched = {key for key, patch in projection.nodes.items() if query.casefold() in str(patch.get('name', '')).casefold() or any(query.casefold() in alias.casefold() for alias in patch.get('aliases', []))}
        if through_chapter is None:
            rows = rows.filter(Q(name__icontains=query) | Q(aliases__icontains=query) | Q(canonical_id__in=projection.merged_keys(patched)))
        else:
            from .models import EntityFact
            visible_matches = EntityFact.objects.filter(node__revision=revision, evidence__chapter__ordinal__lte=through_chapter, value__icontains=query).values('node_id')
            rows = rows.filter(Q(id__in=visible_matches) | Q(canonical_id__in=projection.merged_keys(patched)))
    targets = set(GraphNode.objects.filter(revision=revision, canonical_id__in={projection.resolve(key) for key in projection.nodes}).values_list('canonical_id', flat=True))
    rows = rows.exclude(canonical_id__in=[key for key in projection.nodes if projection.resolve(key) != key and projection.resolve(key) in targets])
    hidden = [key for key in projection.nodes if projection.nodes.get(projection.resolve(key), {}).get('hidden')]
    rows = rows.exclude(canonical_id__in=hidden).order_by('ordinal', 'id')
    if order == 'time':
        # Unknown story dates retain their narrative order in a separate group.
        from django.db.models import Case, IntegerField, Value, When
        rows = rows.annotate(unknown=Case(When(time_order='', then=Value(1)), default=Value(0), output_field=IntegerField())).order_by('unknown', 'time_order', 'ordinal', 'id')
    total = rows.count()
    selected = list(rows[(page - 1) * limit:page * limit])
    resolved_keys = {projection.resolve(n.canonical_id) for n in selected}
    selected = list(GraphNode.objects.filter(revision=revision, canonical_id__in=projection.merged_keys(resolved_keys)))
    nodes = projection.serialize_nodes(selected)
    if through_chapter is not None:
        nodes = [n for n in nodes if n['facts']]
    for node in nodes:
        node['fact_total'] = len(node['facts'])
        node['facts'] = node['facts'][:3]
    keys = {n['id'] for n in nodes}
    node_ids = [n.id for n in selected]
    edges = [projection.edge(e) for e in GraphEdge.objects.filter(revision=revision, source_id__in=node_ids, target_id__in=node_ids).select_related('source', 'target')]
    edges = [e for e in [*edges, *projection.extra_edges()] if e and e['source'] in keys and e['target'] in keys and e['source'] != e['target']]
    if include_inferred:
        from .profiles import visible_hypotheses
        edges += [{'id': h.key, 'source': h.source.canonical_id, 'target': h.target.canonical_id, 'kind': 'related_to', 'label': h.description, 'evidence': [], 'context': {'state': h.state}, 'origin': 'inferred'} for h in visible_hypotheses(revision, through_chapter) if h.target_id and h.source.canonical_id in keys and h.target.canonical_id in keys and h.state != 'refuted']
    if view == 'flow':
        ordered = sorted(nodes, key=lambda n: (n['time_order'] == '', n['time_order'], n['ordinal']) if order == 'time' else (n['ordinal'],))
        edges += [{'id': stable_id(a['id'], b['id'], 'next'), 'source': a['id'], 'target': b['id'], 'kind': 'next', 'label': '叙述顺序' if order == 'narrative' else '展示顺序（非因果）', 'evidence': [], 'context': {}, 'origin': 'derived'} for a, b in zip(ordered, ordered[1:]) if not any(e['source'] == a['id'] and e['target'] == b['id'] and e['kind'] == 'next' for e in edges)]
    return {'nodes': nodes, 'edges': edges, 'total': total, 'page': page, 'limit': limit, 'threads': threads}


def node_detail(revision, key: str, page: int = 1, through_chapter: int | None = None) -> dict:
    projection = Projection(revision, through_chapter)
    key = projection.resolve(key)
    rows = list(GraphNode.objects.filter(revision=revision, canonical_id__in=projection.merged_keys({key})))
    if not rows or projection.nodes.get(key, {}).get('hidden'):
        raise AnalysisError('节点不存在', 404)
    item = projection.serialize_nodes(rows)[0]
    if through_chapter is not None and not item['facts']:
        raise AnalysisError('对象尚未在此范围出现', 404)
    if revision.mode == 'story':
        from .profiles import profile_for_nodes, visible_hypotheses
        ordered_rows = sorted(rows, key=lambda row: row.canonical_id != key)
        item['profile'] = profile_for_nodes(ordered_rows, through_chapter)
        item['hypotheses'] = [{'id': h.key, 'description': h.description, 'state': h.state, 'chapter_title': h.chapter.title, 'basis': h.basis} for h in visible_hypotheses(revision, through_chapter) if h.source_id in {r.pk for r in rows}]
    total = len(item['facts'])
    # Editing must not depend on which page contains the appended user fact.
    item['correction_description'] = projection.nodes.get(key, {}).get('description', '')
    item['facts'] = item['facts'][(page - 1) * 50:page * 50]
    item['fact_total'] = total
    item['fact_page'] = page
    neighbors = read_graph(revision, center=key, limit=200, through_chapter=through_chapter)
    return {'node': item, 'neighbors': neighbors}


@transaction.atomic
def correct_node(revision, key: str, patch: dict) -> None:
    BookAnalysis.objects.select_for_update().get(book_id=revision.book_id)
    projection = Projection(revision)
    key = projection.resolve(key)
    node_detail(revision, key)
    allowed = {'name', 'description', 'aliases', 'hidden', 'merge_into'}
    if set(patch) - allowed:
        raise AnalysisError('不支持的节点修正字段')
    if 'name' in patch and (not isinstance(patch['name'], str) or not 1 <= len(patch['name'].strip()) <= 255):
        raise AnalysisError('节点名称无效')
    if 'description' in patch and (not isinstance(patch['description'], str) or len(patch['description']) > 4000):
        raise AnalysisError('节点说明过长或无效')
    if 'aliases' in patch and (not isinstance(patch['aliases'], list) or len(patch['aliases']) > 50 or any(not isinstance(a, str) or not a.strip() or len(a) > 255 for a in patch['aliases'])):
        raise AnalysisError('别名应为不超过 50 项的文本列表')
    if 'hidden' in patch and not isinstance(patch['hidden'], bool):
        raise AnalysisError('隐藏状态必须是布尔值')
    if 'merge_into' in patch and (not isinstance(patch['merge_into'], str) or len(patch['merge_into']) > 64):
        raise AnalysisError('合并对象 ID 无效')
    if patch.get('merge_into'):
        target = projection.resolve(patch['merge_into'])
        target_node = node_detail(revision, target)['node']
        source_node = node_detail(revision, key)['node']
        if target == key or target_node['kind'] != source_node['kind']:
            raise AnalysisError('只能合并不同的同类型节点')
        patch['merge_into'] = target
    row, _ = Correction.objects.get_or_create(id=stable_id(revision.book_id, 'node', key), defaults={'book_id': revision.book_id, 'kind': 'node', 'key': key, 'introduced_ordinal': max(ChapterResult.objects.filter(revision=revision).values_list('chapter__ordinal', flat=True), default=0)})
    row.patch = {**row.patch, **patch}
    row.save()


@transaction.atomic
def correct_edge(revision, key: str, patch: dict, new: bool = False):
    projection = Projection(revision)
    allowed = {'source', 'target', 'kind', 'label', 'hidden'} if new else {'kind', 'label', 'hidden'}
    if set(patch) - allowed or ('kind' in patch and (not isinstance(patch['kind'], str) or patch['kind'] not in EDGE_KINDS)):
        raise AnalysisError('关系类型或字段无效')
    if 'label' in patch and (not isinstance(patch['label'], str) or not 1 <= len(patch['label']) <= 255):
        raise AnalysisError('关系说明无效')
    if 'hidden' in patch and not isinstance(patch['hidden'], bool):
        raise AnalysisError('隐藏状态必须是布尔值')
    existing = Correction.objects.filter(book_id=revision.book_id, kind='relation', key=key).first()
    if new:
        if not all(field in patch for field in ('source', 'target', 'kind', 'label')):
            raise AnalysisError('关系缺少起点、终点、类型或说明')
        for endpoint in ('source', 'target'):
            if not isinstance(patch[endpoint], str) or not 1 <= len(patch[endpoint]) <= 64:
                raise AnalysisError('关系对象 ID 无效')
            patch[endpoint] = projection.resolve(patch[endpoint])
            node_detail(revision, patch[endpoint])
        if patch['source'] == patch['target']:
            raise AnalysisError('关系不能连接同一个节点')
    elif not existing:
        found = any(edge_key(e.source.canonical_id, e.target.canonical_id, e.kind, e.context, e.label) == key for e in GraphEdge.objects.filter(revision=revision).select_related('source', 'target').iterator())
        if not found:
            raise AnalysisError('关系不存在', 404)
    kind = 'relation' if new or existing else 'edge'
    row, _ = Correction.objects.get_or_create(id=stable_id(revision.book_id, kind, key), defaults={'book_id': revision.book_id, 'kind': kind, 'key': key, 'introduced_ordinal': max(ChapterResult.objects.filter(revision=revision).values_list('chapter__ordinal', flat=True), default=0)})
    row.patch = {**row.patch, **patch}
    row.save()
    return key
