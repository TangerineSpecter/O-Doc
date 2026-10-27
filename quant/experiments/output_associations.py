"""Freeze existing sample observations for review; never execute expressions here."""
import copy
from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.research_memory.contract import instant
from quant.graph.correlation import KIND, METHOD as STAT_METHOD, CLAIM
from quant.comparisons.contracts import comparison_hash

METHOD = 'review-output-associations-1'
PREFIX = 'output_association:'
LIMIT = 8
SCOPE = 'same_dataset_hash_planning_options_with_original_parent'
FIELDS = {'version', 'method', 'scope', 'cutoff', 'limit', 'known_matches', 'complete_scan', 'omitted_at_least', 'items'}


def _qualifies(edge: dict, options: dict, seeds: set, dataset_hash: str) -> bool:
    return (edge.get('kind') == KIND and edge.get('left') in options and edge.get('right') in options
        and bool({edge.get('left'), edge.get('right')} & seeds)
        and edge.get('evidence', {}).get('dataset_hash') == dataset_hash)


def item(identity: str, edge: dict, comparison: dict, dataset: dict, options: dict,
         *, collection_id: str, dataset_hash: str, cutoff: str) -> dict:
    """References and hashes prove which saved observation was supplied, not causality."""
    raw = edge.get('evidence', {})
    plan = comparison.get('plan', {})
    if (edge.get('kind') != KIND or raw.get('version') != 1 or raw.get('method') != STAT_METHOD
            or raw.get('claim') != CLAIM or digest(raw) != edge.get('content_hash')
            or identity != digest([STAT_METHOD, edge.get('left'), edge.get('right'), edge.get('content_hash')])[:40]
            or comparison.get('anthology') != collection_id or dataset.get('anthology') != collection_id
            or comparison.get('content_hash') != raw.get('comparison_hash')
            or comparison_hash(plan, comparison.get('result')) != raw.get('comparison_hash')
            or comparison.get('result', {}).get('evaluation_status') != 'completed'
            or comparison.get('dataset') != raw.get('dataset_id') or plan.get('dataset_id') != raw.get('dataset_id')
            or dataset.get('content_hash') != dataset_hash or raw.get('dataset_hash') != dataset_hash
            or plan.get('dataset_hash') != dataset_hash
            or {comparison.get('left'), comparison.get('right')} != {edge.get('left'), edge.get('right')}
            or instant(edge['created_at']) >= instant(cutoff)
            or instant(comparison['created_at']) > instant(edge['created_at'])):
        raise ValidationError('冻结输出统计的对照、范围、时间或指纹不一致')
    sides = []
    for name in ('left', 'right'):
        side = plan[name]
        baseline = options.get(side['id'])
        if (not baseline or side['candidate_hash'] != digest(baseline['candidate'])
                or side['candidate_hash'] != digest(side['candidate'])):
            raise ValidationError('统计观察不属于本次可规划的同版候选')
        match = digest({'parameters': side['parameters'], 'bindings': side['bindings']}) == digest({
            'parameters': baseline['parameters'], 'bindings': baseline['bindings']})
        sides.append({'candidate_id': side['id'], 'name': side['candidate']['name'],
            'candidate_hash': side['candidate_hash'], 'parameters': copy.deepcopy(side['parameters']),
            'bindings': copy.deepcopy(side['bindings']), 'current_baseline_matches': match})
    stats = raw['statistics']
    if stats['output_hashes'] != comparison['result']['output_hashes']:
        raise ValidationError('冻结统计与原对照输出指纹不一致')
    snapshot = dataset['snapshot']
    return {'relation_id': identity, 'relation_hash': edge['content_hash'], 'created_at': instant(edge['created_at']).isoformat(),
        'comparison_id': raw['comparison_id'], 'comparison_hash': comparison['content_hash'],
        'comparison_name': plan['name'], 'dataset': {'id': raw['dataset_id'], 'content_hash': dataset_hash,
            **{key: snapshot.get(key) for key in ('symbol', 'timeframe', 'timezone', 'source', 'price_adjustment')}},
        'sides': sides, 'policy': copy.deepcopy(plan['policy']), 'statistics': copy.deepcopy(stats),
        'baseline_scope': 'current_baselines_match' if all(row['current_baseline_matches'] for row in sides) else 'historical_configuration_only',
        'claim': 'historical_full_comparison_sample_not_current_windows_or_independent_complementarity',
        'selection_used': False}


def freeze(result, options: list[dict], *, cutoff: str | None = None) -> dict:
    from quant.models import FactorRelation, FactorComparison, MarketDataset
    stop = instant(cutoff or timezone.now().isoformat())
    cutoff = stop.isoformat()
    query_stop = stop if settings.USE_TZ else timezone.make_naive(stop, timezone.get_default_timezone())
    by_id = {row['id']: row for row in options}
    seeds = {row['id'] for row in result.request.plan['seeds']}
    from django.db.models import Q
    records = list(FactorRelation.objects.filter(kind=KIND, left_id__in=by_id, right_id__in=by_id,
        evidence__dataset_hash=result.request.plan['dataset_hash'], created_at__lt=query_stop)
        .filter(Q(left_id__in=seeds) | Q(right_id__in=seeds)).order_by('-created_at', 'id')[:LIMIT + 1])
    items = []
    for row in records[:LIMIT]:
        edge = {'left': row.left_id, 'right': row.right_id, 'kind': row.kind, 'evidence': row.evidence,
            'content_hash': row.content_hash, 'created_at': instant(row.created_at.isoformat()).isoformat()}
        comparison = FactorComparison.objects.get(pk=row.evidence['comparison_id'])
        dataset = MarketDataset.objects.get(pk=row.evidence['dataset_id'])
        items.append(item(row.pk, edge, {'anthology': comparison.anthology_id, 'left': comparison.left_id,
            'right': comparison.right_id, 'dataset': comparison.dataset_id, 'plan': comparison.plan,
            'result': comparison.result, 'content_hash': comparison.content_hash,
            'created_at': instant(comparison.created_at.isoformat()).isoformat()},
            {'anthology': dataset.anthology_id, 'content_hash': dataset.content_hash, 'snapshot': dataset.snapshot},
            by_id, collection_id=result.request.anthology_id, dataset_hash=result.request.plan['dataset_hash'], cutoff=cutoff))
    return {'version': 1, 'method': METHOD, 'scope': SCOPE, 'cutoff': cutoff, 'limit': LIMIT,
        'known_matches': len(records), 'complete_scan': len(records) <= LIMIT,
        'omitted_at_least': max(0, len(records) - LIMIT), 'items': items}


def validate(value: dict, rows: dict, options: list[dict], plan: dict, *, collection_id: str, latest_at: str | None = None) -> dict:
    if (not isinstance(value, dict) or set(value) != FIELDS or type(value['version']) is not int
            or value['version'] != 1 or value['method'] != METHOD or value['scope'] != SCOPE
            or type(value['limit']) is not int or value['limit'] != LIMIT
            or type(value['known_matches']) is not int or not 0 <= value['known_matches'] <= LIMIT + 1
            or type(value['complete_scan']) is not bool or value['complete_scan'] != (value['known_matches'] <= LIMIT)
            or type(value['omitted_at_least']) is not int or value['omitted_at_least'] != max(0, value['known_matches'] - LIMIT)
            or not isinstance(value['items'], list) or len(value['items']) != min(LIMIT, value['known_matches'])):
        raise ValidationError('冻结输出统计的版本或有界计数无效')
    cutoff = instant(value['cutoff'])
    if latest_at is not None and cutoff > instant(latest_at):
        raise ValidationError('输出统计冻结时间晚于本次解读')
    by_id = {row['id']: row for row in options}
    seeds = {row['id'] for row in plan['seeds']}
    seen = set()
    for selected in value['items']:
        identity = selected.get('relation_id') if isinstance(selected, dict) else None
        edge = rows.get('quant.factorrelation', {}).get(identity, {})
        if identity in seen or not _qualifies(edge, by_id, seeds, plan['dataset_hash']):
            raise ValidationError('输出统计重复或不属于本次候选与行情')
        seen.add(identity)
        raw = edge['evidence']
        expected = item(identity, edge, rows.get('quant.factorcomparison', {}).get(raw.get('comparison_id'), {}),
            rows.get('quant.marketdataset', {}).get(raw.get('dataset_id'), {}), by_id,
            collection_id=collection_id, dataset_hash=plan['dataset_hash'], cutoff=value['cutoff'])
        # Canonical hashing also distinguishes false/0 and true/1.
        if digest(selected) != digest(expected):
            raise ValidationError('冻结统计事实、参数匹配状态或范围不可改写')
    return value


def for_result(result, value: dict, options: list[dict], *, latest_at: str | None = None) -> dict:
    """Only selected immutable records are reread; never rerank or recompute on retry."""
    from quant.models import FactorRelation, FactorComparison, MarketDataset
    if not isinstance(value, dict) or not isinstance(value.get('items'), list) or any(
            not isinstance(row, dict) or 'relation_id' not in row for row in value['items']):
        raise ValidationError('实验解读缺少有效的冻结输出统计')
    ids = [row['relation_id'] for row in value.get('items', [])]
    edges = {row.pk: {'left': row.left_id, 'right': row.right_id, 'kind': row.kind, 'evidence': row.evidence,
        'content_hash': row.content_hash, 'created_at': instant(row.created_at.isoformat()).isoformat()}
        for row in FactorRelation.objects.filter(pk__in=ids)}
    comparisons = {row.pk: {'anthology': row.anthology_id, 'left': row.left_id, 'right': row.right_id,
        'dataset': row.dataset_id, 'plan': row.plan, 'result': row.result, 'content_hash': row.content_hash,
        'created_at': instant(row.created_at.isoformat()).isoformat()}
        for row in FactorComparison.objects.filter(pk__in=[row['evidence']['comparison_id'] for row in edges.values()])}
    datasets = {row.pk: {'anthology': row.anthology_id, 'content_hash': row.content_hash, 'snapshot': row.snapshot}
        for row in MarketDataset.objects.filter(pk__in=[row['evidence']['dataset_id'] for row in edges.values()])}
    return validate(value, {'quant.factorrelation': edges, 'quant.factorcomparison': comparisons, 'quant.marketdataset': datasets},
        options, result.request.plan, collection_id=result.request.anthology_id, latest_at=latest_at)


def evidence(value: dict) -> dict:
    return {'output_associations': {key: copy.deepcopy(item) for key, item in value.items() if key != 'items'} | {
        'evidence_refs': [PREFIX + row['relation_id'] for row in value['items']],
        'scope_note': '原完整对照样本可能包含已查看留出；非本实验各窗口统计，不参与本轮搜索或独立验证。'},
        **{PREFIX + row['relation_id']: copy.deepcopy(row) for row in value['items']}}
