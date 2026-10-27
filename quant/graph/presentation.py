"""Bounded graph projection from owned immutable facts and semantic suggestions."""
from django.db.models import Q
from django.shortcuts import get_object_or_404
from quant.models import FactorComparison, FactorMerge, FactorRelation
from quant.factors.curation import curation_data
from quant.factors.grouping import fingerprints
from .indexing import candidates, index_status
from .projection import projection


def graph_data(collection, focus_id: str = '') -> dict:
    available = candidates(collection)
    center = get_object_or_404(available, pk=focus_id) if focus_id else available.first()
    status = index_status(collection)
    if not center:
        return {'focus_id': '', 'nodes': [], 'edges': [], 'index': status, 'limited': False}
    selected = {center.pk: center}
    edges = []
    central = fingerprints(center)
    limited = False
    for candidate in available.exclude(pk=center.pk):
        local = candidate.data.get('formula_version')
        if local and center.pk in local['parent_candidate_ids']:
            if len(selected) < 21:
                selected[candidate.pk] = candidate
                edges.append({'id': f'derived:{center.pk}:{candidate.pk}', 'from': f'factor:{center.pk}',
                    'to': f'factor:{candidate.pk}', 'kind': 'derived_from', 'label': '公式修订', 'historical': False,
                    'similarity': None, 'detail': ('AI自动研究的独立候选；研究评价与实证表现分开' if local['origin'] == 'ai_study' else 'AI 定义修订的独立研究版本；未继承原文引证、评分或实验结论' if local['origin'] == 'ai_repair' else '人工定义的独立研究版本；未继承原文引证、评分或实验结论')})
            else: limited = True
        proof = candidate.data.get('derivation', {})
        if candidate.derived_checkpoint_id and center.pk in proof.get('parent_candidate_ids', []):
            if len(selected) < 21:
                selected[candidate.pk] = candidate
                edges.append({'id': f'derived:{center.pk}:{candidate.pk}', 'from': f'factor:{center.pk}',
                    'to': f'factor:{candidate.pk}', 'kind': 'derived_from', 'label': '实验衍生', 'historical': False,
                    'similarity': None, 'detail': f"实验 {proof['request_id']} / {proof['attempt_id']}；不证明组合优于父代"})
            else:
                limited = True
        other = fingerprints(candidate)
        kind = 'same_expression' if central['expression'] and other['expression'] == central['expression'] else 'same_source' if central['raw'] and other['raw'] == central['raw'] else ''
        if kind:
            if len(selected) >= 13:
                limited = True
                continue
            selected[candidate.pk] = candidate
            edges.append({'id': f'{kind}:{candidate.pk}', 'from': f'factor:{center.pk}', 'to': f'factor:{candidate.pk}',
                'kind': kind, 'label': '相同表达式与契约' if kind == 'same_expression' else '相同原文与契约',
                'historical': False, 'similarity': None, 'detail': '结构或原文一致，未验证实际输出等价'})
    relationships = list(FactorRelation.objects.filter(Q(left=center) | Q(right=center), kind='semantic_similar').order_by('-created_at', 'id')[:100])
    related_ids = {rel.right_id if rel.left_id == center.pk else rel.left_id for rel in relationships}
    neighbors = {candidate.pk: candidate for candidate in available.filter(pk__in=related_ids)}
    seen = set()
    for relation in relationships:
        other_id = relation.right_id if relation.left_id == center.pk else relation.left_id
        if other_id in seen or other_id not in neighbors:
            continue
        seen.add(other_id)
        other = neighbors[other_id]
        if len(selected) >= 21 and other_id not in selected:
            limited = True
            continue
        selected[other_id] = other
        proof = relation.evidence
        current = {center.pk: center, other.pk: other}
        try:
            unchanged = all(projection(current[getattr(relation, side + '_id')])[1] == proof[side + '_projection_hash'] for side in ('left', 'right'))
        except ValueError:
            unchanged = False
        historical = not unchanged or status['model_signature'] != proof['model_signature']
        edges.append({'id': relation.pk, 'from': f'factor:{center.pk}', 'to': f'factor:{other.pk}',
            'kind': 'semantic_similar', 'label': '语义相近（历史）' if historical else '语义相近', 'historical': historical,
            'similarity': proof['similarity'], 'detail': f"{proof['model_name']} · 余弦相似度；不代表相关性、等价或收益。"})
    # Direct fixed-sample evidence stays separate from embedding relations and
    # from human grouping. A-B plus B-C never synthesizes an A-C proof edge.
    comparisons = list(FactorComparison.objects.filter(anthology=collection,
        result__status='pass', result__evaluation_status='completed').filter(Q(left=center) | Q(right=center)).order_by('-created_at', 'id')[:101])
    merges = list(FactorMerge.objects.filter(anthology=collection, withdrawal__isnull=True).filter(
        Q(comparison__left=center) | Q(comparison__right=center)).select_related('comparison').order_by('-created_at', 'id')[:101])
    limited = limited or len(comparisons) > 100 or len(merges) > 100
    comparisons, merges = comparisons[:100], merges[:100]
    proof_ids = {identity for record in [*comparisons, *(item.comparison for item in merges)]
                 for identity in (record.left_id, record.right_id)} - {center.pk}
    proof_neighbors = {row.pk: row for row in available.filter(pk__in=proof_ids)}
    for kind, records in [('sample_equivalent', comparisons), ('merged_group', merges)]:
        for record in records:
            comparison = record if kind == 'sample_equivalent' else record.comparison
            other_id = comparison.right_id if comparison.left_id == center.pk else comparison.left_id
            other = selected.get(other_id) or proof_neighbors.get(other_id)
            if not other:
                continue
            if other_id not in selected and len(selected) >= 21:
                limited = True
                continue
            selected[other_id] = other
            counts, policy = comparison.result['counts'], comparison.plan['policy']
            detail = (f"固定行情 {comparison.dataset_id}；共同有效 {counts['common_valid']} / 比较 {counts['compared_rows']} 行；"
                f"预热 {policy['warmup_bars']} 行，绝对容差 {policy['absolute_tolerance']}、相对容差 {policy['relative_tolerance']}。"
                '只证明本次实际参数和受控表达式的样本输出一致，不证明原平台或全局公式等价。')
            if kind == 'merged_group':
                detail = record.name + '；人工合并分组，可撤销；' + detail
            edges.append({'id': kind + ':' + record.pk, 'from': f'factor:{center.pk}', 'to': f'factor:{other_id}',
                'kind': kind, 'label': '固定样本输出一致' if kind == 'sample_equivalent' else '已合并分组',
                'historical': False, 'similarity': None, 'comparison_id': comparison.pk,
                'merge_id': record.pk if kind == 'merged_group' else None, 'detail': detail})
    from .correlation_graph import append as append_correlations
    limited = append_correlations(collection, center, available, selected, edges) or limited
    nodes = []
    from .research import append as append_research
    limited = append_research(collection, center, available, selected, nodes, edges) or limited
    # Include factual parents independently of semantic similarity. Never label
    # an experimentally combined expression as extracted from its anchor report.
    for candidate in list(selected.values()):
        local = candidate.data.get('formula_version')
        proof = candidate.data.get('derivation') or local
        if not proof:
            continue
        for parent in available.filter(pk__in=proof['parent_candidate_ids']):
            if parent.pk not in selected and len(selected) >= 29:
                limited = True
                continue
            selected[parent.pk] = parent
            edges.append({'id': f'derived:{parent.pk}:{candidate.pk}', 'from': f'factor:{parent.pk}',
                'to': f'factor:{candidate.pk}', 'kind': 'derived_from', 'label': '公式修订' if local else '实验衍生', 'historical': False,
                'similarity': None, 'detail': ('AI研究衍生，研究分不代表实证表现' if local['origin'] == 'ai_study' else 'AI 定义修订，原平台等价与实证仍待验证' if local['origin'] == 'ai_repair' else '人工公式修订，实证仍待验证') if local else f"实验 {proof['request_id']} / {proof['attempt_id']}；不证明组合优于父代"})
    emitted = set()
    for candidate in selected.values():
        report = candidate.report
        label = curation_data(candidate)['curation']['name']
        for identity, kind, text, entry_id, report_id in [
            (f'factor:{candidate.pk}', 'factor', label, report.entry_id, report.pk),
            (f'report:{report.pk}', 'report', report.entry.title, report.entry_id, report.pk),
            (f'source:{report.source_id}', 'source', report.source.payload.get('title') or report.source.payload.get('language') or '来源材料', report.entry_id, report.pk),
        ]:
            if identity not in emitted:
                emitted.add(identity)
                nodes.append({'id': identity, 'kind': kind, 'label': text, 'entry_id': entry_id, 'report_id': report_id})
        edges.extend([
            {'id': f'from-report:{candidate.pk}', 'from': f'report:{report.pk}', 'to': f'factor:{candidate.pk}',
                'kind': 'origin_context' if candidate.derived_checkpoint_id or candidate.data.get('formula_version') else 'extracted_from',
                'label': '祖先来源' if candidate.derived_checkpoint_id or candidate.data.get('formula_version') else '提取', 'historical': False, 'similarity': None,
                'detail': '首个父代的来源报告；生成或修订公式并非原文摘录' if candidate.derived_checkpoint_id or candidate.data.get('formula_version') else '不可变报告中的提取记录'},
            {'id': f'from-source:{report.pk}', 'from': f'source:{report.source_id}', 'to': f'report:{report.pk}', 'kind': 'analyzed_from', 'label': '分析', 'historical': False, 'similarity': None, 'detail': '报告绑定的实际来源快照'},
        ])
    from quant.strategy_exports.graph import append as append_strategies
    limited = append_strategies(collection, selected, nodes, edges) or limited
    from .evidence import append as append_evidence
    limited = append_evidence(collection, center, nodes, edges) or limited
    unique_edges = {edge['id']: edge for edge in edges}
    return {'focus_id': center.pk, 'nodes': nodes, 'edges': list(unique_edges.values()), 'index': status, 'limited': limited}
