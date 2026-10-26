"""Versioned, descriptive one-at-a-time evidence. Never reads final holdout.

Reconstructed from immutable plans/checkpoints; no model, execution or database I/O.
Keep v1 unchanged when introducing another rule so historical evidence hashes replay.
"""
import copy
from quant.factors.expression import finite_number

PARTS = ('train', 'validation')
METRICS = ('total_return', 'max_drawdown', 'turnover', 'entries', 'missing_signals', 'bars')
RULE = {'version': 1, 'minimum_points': 3, 'return_spread_limit': .02,
        'drawdown_spread_limit': .02, 'baseline_return_loss_limit': .02,
        'baseline_drawdown_increase_limit': .02, 'requires_positive_return': True,
        'requires_entries': True, 'minimum_signal_coverage': .9, 'maximum_missing_fraction_spread': .05,
        'selection_partitions': ['train', 'validation'], 'interpolation_allowed': False}
LIMITS = ['仅比较同一来源、相同表达式/行情/成本下单个数值信号参数的取值，其他参数固定为本轮基线。',
          '每个区段要求两段信号覆盖均至少 90%，点间缺失比例极差不超过 5 个百分点；预热仍按原实验记录计入，尚未做统一预热重算。',
          '区段仅包含已抽样且通过规则的取值，不推断未测中间值；2 个百分点容差是固定筛选规则，不是统计显著性或最优参数证明。',
          '训练与验证同时检查；不读取留出表现。结果仅适用于本次数据与成交假设，仍需新的独立数据检验。',
          '无交易、信号覆盖不足、失败或未执行的取值不能连接成稳定区段；多参数联动不归因于单个参数。']


def _parameters(node):
    return ({node['name']} if node.get('op') == 'parameter' else set()) | set().union(*(_parameters(child) for child in node.get('args', [])))


def _changed(values, baseline):
    if not isinstance(values, dict) or values.keys() != baseline.keys():
        return None
    return [name for name in values if type(values[name]) is not type(baseline[name]) or values[name] != baseline[name]]


def _metric(attempt, part):
    source = (attempt or {}).get('metrics', {}).get(part, {})
    if not all(finite_number(source.get(key)) for key in METRICS):
        return None
    return {key: source[key] for key in METRICS}


def _point(value, attempt, base):
    result = {'value': value, 'attempt_id': attempt['id'] if attempt else '',
              'status': attempt['status'] if attempt else 'not_run',
              'reason': attempt.get('reason', '') if attempt else '计划取值尚未执行', 'metrics': {}, 'delta': {}}
    for part in PARTS:
        metric, reference = _metric(attempt, part), _metric(base, part)
        result['metrics'][part] = metric
        result['delta'][part] = {key: metric[key] - reference[key] for key in METRICS} if metric and reference else None
    comparable = bool(base and base['status'] == 'evaluated' and attempt and attempt['status'] == 'evaluated')
    if comparable and attempt != base:
        left, right = attempt.get('recipe', {}), base.get('recipe', {})
        comparable = all(
            attempt.get('metrics', {}).get(part, {}).get(key) == base.get('metrics', {}).get(part, {}).get(key)
            for part in PARTS for key in ('start', 'end', 'bars')) and all(key in left and key in right and left[key] == right[key]
                         for key in ('expression', 'bindings', 'output_type', 'units', 'parameter_names'))
    result['comparable'] = comparable and all(result['delta'][part] is not None for part in PARTS)
    reasons = []
    if not result['comparable']:
        reasons.append('没有已评价的同条件基线与对照')
    else:
        for part, title in (('train', '训练'), ('validation', '验证')):
            metric, delta = result['metrics'][part], result['delta'][part]
            if metric['entries'] <= 0:
                reasons.append(title + '段没有入场')
            if metric['bars'] <= 0 or 1 - metric['missing_signals'] / metric['bars'] < RULE['minimum_signal_coverage'] - 1e-12:
                reasons.append(title + '段信号覆盖不足 90%（含预热）')
            if metric['total_return'] <= 0:
                reasons.append(title + '段收益不为正')
            if delta['total_return'] < -RULE['baseline_return_loss_limit'] - 1e-12:
                reasons.append(title + '段收益较基线下降超过 2 个百分点')
            if delta['max_drawdown'] > RULE['baseline_drawdown_increase_limit'] + 1e-12:
                reasons.append(title + '段回撤较基线增加超过 2 个百分点')
    result['eligibility_reasons'] = reasons
    result['eligible'] = not reasons
    return result


def _spreads(points):
    return {part: {key: max(row['metrics'][part][key] for row in points) - min(row['metrics'][part][key] for row in points)
                   for key in ('total_return', 'max_drawdown')} for part in PARTS}


def _regions(points, baseline):
    candidates = []
    for start in range(len(points)):
        for end in range(start + RULE['minimum_points'], len(points) + 1):
            subset = points[start:end]
            if not all(row['eligible'] for row in subset):
                break
            spreads = _spreads(subset)
            missing_spread = {part: max(row['metrics'][part]['missing_signals'] / row['metrics'][part]['bars'] for row in subset)
                              - min(row['metrics'][part]['missing_signals'] / row['metrics'][part]['bars'] for row in subset) for part in PARTS}
            if any(value > RULE['maximum_missing_fraction_spread'] + 1e-12 for value in missing_spread.values()):
                break
            if any(spreads[part]['total_return'] > RULE['return_spread_limit'] + 1e-12
                   or spreads[part]['max_drawdown'] > RULE['drawdown_spread_limit'] + 1e-12 for part in PARTS):
                break
            candidates.append((start, end, spreads))
    # Keep every maximal supported group, including overlapping groups; no winner picking.
    return [{'sampled_values': [row['value'] for row in points[start:end]],
             'attempt_ids': [row['attempt_id'] for row in points[start:end]], 'spreads': spreads,
             'includes_baseline': any(row['value'] == baseline for row in points[start:end])}
            for start, end, spreads in candidates if not any(
                other_start <= start and other_end >= end and (other_start, other_end) != (start, end)
                for other_start, other_end, _ in candidates)]


def analyze(plan: dict, attempts: list[dict]) -> dict:
    if 'walk_forward' in plan.get('config', {}):
        # Different folds have different markets/time ranges. Never merge their
        # points into a fictitious single-parameter comparison.
        fold = max((row['fold'] for row in attempts), default=0)
        value = analyze({**plan, 'config': {key: val for key, val in plan['config'].items() if key != 'walk_forward'}},
            [row for row in attempts if row['fold'] == fold])
        if plan['config']['walk_forward'].get('version') == 2:
            value['limitations'].insert(0, '嵌套验证仅描述该外折最后已启动内层窗口的参数敏感度；不代表所有内层稳定性，实际选择使用完整内层均值。')
        value['limitations'].insert(0, f'仅比较最后已启动的第 {fold} 折训练/验证尝试；不跨折混合参数归因。')
        return value
    families = []
    for seed in plan['seeds']:
        baseline = seed['parameters']
        base = next((row for row in attempts if row['operation'] == 'source_candidate' and row['parents'] == [seed['id']]), None)
        variants = [row for row in attempts if row['operation'] == 'parameter_variant' and base and row['parents'] == [base['id']]]
        active = _parameters(seed['candidate'].get('expression') or {})
        allowed = {row['name'] for row in seed['candidate']['parameters'] if row['category'] == 'signal'
                   and row['name'] in active and finite_number(baseline.get(row['name']))}
        axes, excluded = {}, []
        # Include unexecuted planned points; cancelled/budget-limited batches must not hide holes.
        configurations = [(values, next((row for row in variants if row.get('requested_parameters') == values), None))
                          for values in seed.get('variants', [])]
        configurations += [(row.get('requested_parameters'), row) for row in variants
                           if not any(row.get('requested_parameters') == values for values in seed.get('variants', []))]
        for values, attempt in configurations:
            changes = _changed(values, baseline)
            name = changes[0] if changes and len(changes) == 1 else None
            if name not in allowed or not finite_number(values[name]):
                excluded.append({'attempt_id': attempt['id'] if attempt else '', 'parameters': values,
                                 'reason': '不是单个参与计算的数值信号参数变体'})
                continue
            axis = axes.setdefault(name, {baseline[name]: _point(baseline[name], base, base)})
            # Duplicate configurations are not additional observations. Prefer a completed original.
            point = _point(values[name], attempt, base)
            if values[name] not in axis or (point['comparable'] and not axis[values[name]]['comparable']):
                axis[values[name]] = point
        rendered = []
        for name, mapping in sorted(axes.items()):
            points = [mapping[value] for value in sorted(mapping)]
            measured = [row for row in points if row['comparable']]
            regions = _regions(points, baseline[name])
            rendered.append({'parameter': name, 'baseline_value': baseline[name], 'points': points,
                             'compared_points': len(measured), 'spreads': _spreads(measured) if len(measured) >= 2 else None,
                             'regions': regions, 'status': 'sampled_region' if regions else
                             'insufficient_comparison' if len(measured) < 3 else 'no_supported_region'})
        families.append({'seed_id': seed['id'], 'name': seed['candidate']['name'],
                         'baseline_attempt_id': base['id'] if base else '', 'baseline_parameters': baseline,
                         'axes': rendered, 'excluded_variants': excluded})
    return copy.deepcopy({'version': 1, 'rule': RULE, 'limitations': LIMITS, 'families': families,
                          'excluded_combination_ids': [row['id'] for row in attempts if row['operation'] not in ('source_candidate', 'parameter_variant')]})
