"""Direct fixed-sample evidence and its curation state at one historical cutoff."""
import copy

from rest_framework.exceptions import ValidationError
from quant.comparisons.contracts import comparison_hash, merge_hash, withdrawal_hash
from quant.research.contracts import digest
from .contract import instant
from .evidence import market, seed_info

MERGE_LIMIT = 8


def record(identity: str, comparison: dict, dataset: dict, references: dict, merges: list[dict],
           *, cutoff: str, merge_total: int) -> dict:
    plan, result = comparison['plan'], comparison['result']
    collection = str(comparison['anthology'])
    if comparison['content_hash'] != comparison_hash(plan, result) or instant(comparison['created_at']) >= instant(cutoff):
        raise ValidationError('历史因子对照哈希或冻结时点无效')
    if str(dataset['anthology']) != collection or dataset['content_hash'] != plan['dataset_hash']:
        raise ValidationError('历史因子对照行情归属或哈希无效')
    seeds, sides = [], {}
    for side in ('left', 'right'):
        frozen = plan[side]
        ref = references[frozen['id']]
        if (ref['collection_id'] != collection or ref['data'] != frozen['candidate']
                or ref['source_id'] != frozen['source_id']
                or instant(ref['created_at']) > instant(comparison['created_at'])):
            raise ValidationError('历史因子对照候选与来源不一致')
        seeds.append(seed_info(frozen['id'], frozen['candidate'], ref))
        sides[side] = {key: copy.deepcopy(frozen[key]) for key in
            ('id', 'candidate_hash', 'source_id', 'source_hash', 'report_id', 'report_hash', 'bindings', 'parameters')}
        sides[side]['definition'] = {key: copy.deepcopy(frozen['candidate'][key]) for key in
            ('name', 'formula', 'expression', 'inputs', 'output_type', 'units')}
        if frozen['candidate'].get('formula_version'):
            sides[side]['formula_version'] = copy.deepcopy(frozen['candidate']['formula_version'])
            sides[side]['source_role'] = 'ancestor_context_not_authored_formula_source'
    if type(merge_total) is not int or merge_total < 0 or len(merges) != min(merge_total, MERGE_LIMIT):
        raise ValidationError('历史因子对照逻辑合并覆盖统计无效')
    states = []
    for merge in merges:
        if (str(merge['anthology']) != collection or str(merge['comparison']) != identity
                or instant(merge['created_at']) >= instant(cutoff)
                or merge['content_hash'] != merge_hash(collection, identity, comparison['content_hash'],
                    merge['name'], merge['reason'], merge['curation'])):
            raise ValidationError('历史因子对照逻辑合并不属于固定事实')
        withdrawal = merge.get('withdrawal')
        if withdrawal and instant(withdrawal['created_at']) >= instant(cutoff):
            withdrawal = None  # A later withdrawal cannot rewrite an older model input.
        if withdrawal and (str(withdrawal['anthology']) != collection or str(withdrawal['merge']) != merge['id']
                or withdrawal['content_hash'] != withdrawal_hash(collection, merge['id'], merge['content_hash'], withdrawal['reason'])):
            raise ValidationError('历史合并撤销出处或哈希无效')
        states.append({key: copy.deepcopy(merge[key]) for key in ('id', 'name', 'reason', 'curation', 'content_hash')} | {
            'created_at': instant(merge['created_at']).isoformat(), 'active_at_cutoff': withdrawal is None,
            'withdrawal': {key: copy.deepcopy(withdrawal[key]) for key in ('id', 'reason', 'content_hash')} | {
                'created_at': instant(withdrawal['created_at']).isoformat()} if withdrawal else None})
    snapshot, bars = dataset['snapshot'], dataset['snapshot']['rows']
    evidence = {'comparison_id': identity, 'comparison_hash': comparison['content_hash'],
        'engine_version': plan['engine_version'], 'runtime': copy.deepcopy(plan['runtime']), 'sides': sides,
        'dataset': {key: snapshot.get(key) for key in ('symbol', 'timeframe', 'timezone', 'price_adjustment', 'source')} | {
            'id': plan['dataset_id'], 'content_hash': dataset['content_hash'], 'row_count': len(bars),
            'start': bars[0]['timestamp'], 'end': bars[-1]['timestamp']},
        'policy': copy.deepcopy(plan['policy']), 'result': copy.deepcopy(result),
        'logical_merges': {'cutoff': cutoff, 'total': merge_total, 'included': len(states),
                           'omitted': merge_total - len(states), 'limit': MERGE_LIMIT, 'items': states},
        'evidence_status': 'fixed_sample_controlled_outputs_only', 'independent_holdout_proven': False,
        'limitations': ['只证明给定样本、参数、输入绑定和容差下的受控输出；不证明原平台或全局公式等价。',
                       '逻辑合并是人工整理事实，不是收益证据；撤销不抹除原始对照结果。',
                       '只提供该直接对照的有界合并历史，不推导同组其他候选间的传递等价。',
                       '使用过的对照行情不再自动视为新研究的独立留出。']}
    return {'id': identity, 'kind': 'comparison', 'title': plan['name'], 'entry_id': seeds[0]['entry_id'],
        'collection_id': collection, 'created_at': instant(comparison['created_at']).isoformat(),
        'content_hash': digest(evidence), 'seeds': seeds, 'market': market(snapshot), 'evidence': evidence,
        'has_negative_evidence': result['status'] == 'fail'}
