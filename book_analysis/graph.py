"""Graph persistence, bounded read projections and durable user overrides."""
from copy import deepcopy

from django.db import transaction
from django.db.models import Q

from .errors import AnalysisError
from .extraction import EDGE_KINDS
from .models import BookAnalysis, Correction, GraphEdge, GraphNode, NodeSource
from .parsers import stable_id


def add_segment(revision, chapter, payload: dict):
    for item in payload['nodes']:
        node_id = stable_id(revision.pk, item['canonical_id'])
        node, _ = GraphNode.objects.get_or_create(id=node_id, defaults={'revision': revision, 'canonical_id': item['canonical_id'], 'kind': item['kind'], 'name': item['name'], 'ordinal': item['ordinal'], 'time_label': item['time_label'], 'time_order': item['time_order'], 'thread': item.get('thread', '')})
        fact = {'description': item['description'], 'status': item['status'], 'evidence': item['evidence'], 'ordinal': item['ordinal']}
        if fact not in node.facts:
            node.facts = [*node.facts, fact]
        node.aliases = list(dict.fromkeys([*node.aliases, *item['aliases']]))
        node.ordinal = min(node.ordinal, item['ordinal'])
        node.time_order = node.time_order or item['time_order']
        node.time_label = node.time_label or item['time_label']
        node.save()
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


def relevant_registry(revision, text: str) -> list[dict]:
    rows = GraphNode.objects.filter(revision=revision).values('canonical_id', 'kind', 'name', 'aliases', 'facts').iterator(chunk_size=300)
    result = []
    for row in rows:
        names = [row['name'], *row['aliases']]
        if any(len(name) >= 2 and name in text for name in names):
            result.append({k: row[k] for k in ('canonical_id', 'kind', 'name', 'aliases')})
        elif row['kind'] == 'event' and any(f['evidence']['quote'] in text for f in row['facts']):
            result.append({k: row[k] for k in ('canonical_id', 'kind', 'name', 'aliases')})
        if len(result) >= 40:
            break
    return result


class Projection:
    def __init__(self, revision):
        self.revision = revision
        self.corrections = list(Correction.objects.filter(book=revision.book))
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
        if patch.get('description'):
            facts.append({'description': patch['description'], 'status': 'user', 'evidence': None})
        return {'id': key, 'kind': row.kind, 'name': patch.get('name', row.name), 'aliases': patch.get('aliases', row.aliases), 'facts': facts, 'ordinal': row.ordinal, 'time_label': patch.get('time_label', row.time_label), 'time_order': row.time_order, 'thread': row.thread}

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
        source, target = row.source.canonical_id, row.target.canonical_id
        key = edge_key(source, target, row.kind, row.context, row.label)
        patch = self.edge_patches.get(key, {})
        if patch.get('hidden'):
            return None
        return {'id': key, 'source': self.resolve(source), 'target': self.resolve(target), 'kind': patch.get('kind', row.kind), 'label': patch.get('label', row.label), 'evidence': row.evidence, 'context': row.context, 'origin': 'user' if patch else 'ai'}

    def extra_edges(self) -> list:
        return [{'id': c.key, **c.patch, 'source': self.resolve(c.patch['source']), 'target': self.resolve(c.patch['target']), 'evidence': [], 'context': {}, 'origin': 'user'} for c in self.corrections if c.kind == 'relation' and not c.patch.get('hidden')]


def read_graph(revision, *, chapter_id: str = '', kind: str = '', query: str = '', center: str = '', thread: str = '', view: str = 'graph', order: str = 'narrative', page: int = 1, limit: int = 200) -> dict:
    projection = Projection(revision)
    rows = GraphNode.objects.filter(revision=revision)
    threads = list(rows.exclude(thread='').values_list('thread', flat=True).distinct().order_by('thread')[:100])
    if thread:
        rows = rows.filter(thread=thread)
    if center:
        center = projection.resolve(center)
        center_keys = projection.merged_keys({center})
        center_ids = GraphNode.objects.filter(revision=revision, canonical_id__in=center_keys).values_list('id', flat=True)
        edges = GraphEdge.objects.filter(revision=revision).filter(Q(source_id__in=center_ids) | Q(target_id__in=center_ids))
        adjacent = set(edges.values_list('source_id', flat=True)) | set(edges.values_list('target_id', flat=True)) | set(center_ids)
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
        rows = rows.filter(Q(name__icontains=query) | Q(aliases__icontains=query) | Q(canonical_id__in=projection.merged_keys(patched)))
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
    for node in nodes:
        node['fact_total'] = len(node['facts'])
        node['facts'] = node['facts'][:3]
    keys = {n['id'] for n in nodes}
    node_ids = [n.id for n in selected]
    edges = [projection.edge(e) for e in GraphEdge.objects.filter(revision=revision, source_id__in=node_ids, target_id__in=node_ids).select_related('source', 'target')]
    edges = [e for e in [*edges, *projection.extra_edges()] if e and e['source'] in keys and e['target'] in keys and e['source'] != e['target']]
    if view == 'flow':
        ordered = sorted(nodes, key=lambda n: (n['time_order'] == '', n['time_order'], n['ordinal']) if order == 'time' else (n['ordinal'],))
        edges += [{'id': stable_id(a['id'], b['id'], 'next'), 'source': a['id'], 'target': b['id'], 'kind': 'next', 'label': '叙述顺序' if order == 'narrative' else '展示顺序（非因果）', 'evidence': [], 'context': {}, 'origin': 'derived'} for a, b in zip(ordered, ordered[1:]) if not any(e['source'] == a['id'] and e['target'] == b['id'] and e['kind'] == 'next' for e in edges)]
    return {'nodes': nodes, 'edges': edges, 'total': total, 'page': page, 'limit': limit, 'threads': threads}


def node_detail(revision, key: str, page: int = 1) -> dict:
    projection = Projection(revision)
    key = projection.resolve(key)
    rows = list(GraphNode.objects.filter(revision=revision, canonical_id__in=projection.merged_keys({key})))
    if not rows or projection.nodes.get(key, {}).get('hidden'):
        raise AnalysisError('节点不存在', 404)
    item = projection.serialize_nodes(rows)[0]
    total = len(item['facts'])
    # Editing must not depend on which page contains the appended user fact.
    item['correction_description'] = projection.nodes.get(key, {}).get('description', '')
    item['facts'] = item['facts'][(page - 1) * 50:page * 50]
    item['fact_total'] = total
    item['fact_page'] = page
    neighbors = read_graph(revision, center=key, limit=200)
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
    row, _ = Correction.objects.get_or_create(id=stable_id(revision.book_id, 'node', key), defaults={'book_id': revision.book_id, 'kind': 'node', 'key': key})
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
    row, _ = Correction.objects.get_or_create(id=stable_id(revision.book_id, kind, key), defaults={'book_id': revision.book_id, 'kind': kind, 'key': key})
    row.patch = {**row.patch, **patch}
    row.save()
    return key
