"""Joint numeric parameter evidence, stratified by fixed categorical modes.

Version 1 is immutable: historical review v5 hashes replay this exact rule.
No database/model I/O, no use of holdout, no change to search fitness/selection.
"""
import copy
from .sensitivity import RULE as AXIS_RULE, _parameters, _changed, _point
from .joint_regions import rectangles
from quant.factors.expression import finite_number
from quant.research.contracts import digest

RULE = {**AXIS_RULE, 'minimum_points': 4, 'minimum_dimensions': 2,
        'complete_cartesian_grid': True, 'categorical_mode': 'fixed_context'}
LIMITS = ['仅比较同一来源、同式、同行情、同成本的参数组；公式交叉与组合不混入参数归因。',
          '每个联合区域至少包含两个变化的数值参数及四个完整笛卡尔积采样点；失败、未执行或缺失的组合不能补齐。',
          '数值轴按已规划或实际尝试的离散值排序；不证明声明范围中的其他值、未测中间值或连续区域。',
          '字符串模式和布尔开关按固定配置分组；各组须有数值参数保持原基线的实际对照，不把模式选项当作连续数量。',
          '训练与验证同时检查，固定容差不等于统计显著性；留出不参与区域筛选，候选区域仍须独立数据复核。']


def _key(parameters: dict) -> str:
    return digest(parameters)


def _context(seed: dict, configurations: list[tuple[dict, dict | None]], numeric: list[str], fixed: dict) -> dict:
    baseline = seed['parameters'] | fixed
    base = next((attempt for values, attempt in configurations if values == baseline and attempt
                 and attempt['status'] == 'evaluated'), None)
    base = base or next((attempt for values, attempt in configurations if values == baseline), None)
    mapping = {}
    # A missing reference is itself visible, never silently substituted with the
    # winning combination or with a baseline from a different categorical mode.
    for values, attempt in [(baseline, base)] + configurations:
        point = _point(values, attempt, base)
        point['parameters'] = point.pop('value')
        key = tuple(values[name] for name in numeric)
        if key not in mapping or point['comparable'] and not mapping[key]['comparable']:
            mapping[key] = point
    points = [mapping[key] for key in sorted(mapping)]
    axes = [name for name in numeric if len({point['parameters'][name] for point in points}) > 1]
    comparisons = rectangles(points, axes, RULE, stable=False)
    regions = rectangles(points, axes, RULE, stable=True)
    for region in comparisons + regions:
        region['includes_baseline'] = bool(base and base['id'] in region['attempt_ids'])
    return {'context_id': _key(fixed)[:16], 'fixed_parameters': fixed, 'axes': axes,
            'baseline_parameters': baseline, 'baseline_attempt_id': base['id'] if base else '',
            'points': points, 'compared_points': sum(point['comparable'] for point in points),
            'comparison_cells': comparisons, 'regions': regions,
            'status': 'sampled_region' if regions else 'no_supported_region' if comparisons else 'incomplete_grid'}


def analyze(plan: dict, attempts: list[dict]) -> dict:
    if 'walk_forward' in plan.get('config', {}):
        fold = max((row['fold'] for row in attempts), default=0)
        result = analyze(plan | {'config': {key: val for key, val in plan['config'].items() if key != 'walk_forward'}},
                         [row for row in attempts if row['fold'] == fold])
        if plan['config']['walk_forward'].get('version') == 2:
            result['limitations'].insert(0, '嵌套验证仅描述该外折最后已启动内层窗口的参数敏感度；不代表所有内层稳定性，实际选择使用完整内层均值。')
        result['limitations'].insert(0, f'仅分析最后已启动的第 {fold} 折；不同时间折的组合不拼成一个联合区域。')
        return result
    families = []
    for seed in plan['seeds']:
        baseline = seed['parameters']
        base = next((row for row in attempts if row['operation'] == 'source_candidate' and row['parents'] == [seed['id']]), None)
        variants = [row for row in attempts if row['operation'] == 'parameter_variant' and base and row['parents'] == [base['id']]]
        active = _parameters(seed['candidate'].get('expression') or {})
        allowed = {row['name'] for row in seed['candidate']['parameters'] if row['category'] == 'signal' and row['name'] in active}
        numeric = sorted(name for name in allowed if finite_number(baseline.get(name)))
        configurations = [(baseline, base)] + [(values, next((row for row in variants if row.get('requested_parameters') == values), None))
                                             for values in seed.get('variants', [])]
        configurations += [(row['requested_parameters'], row) for row in variants
                           if not any(row['requested_parameters'] == values for values in seed.get('variants', []))]
        contexts, excluded = {}, []
        for values, attempt in configurations:
            changed = _changed(values, baseline)
            if changed is None or not set(changed) <= allowed or not all(finite_number(values[name]) for name in numeric) or any(
                    type(values[name]) is not type(baseline[name]) for name in baseline if name not in numeric):
                excluded.append({'attempt_id': attempt['id'] if attempt else '', 'parameters': values,
                                 'reason': '包含非信号、未参与计算或类型不一致的参数变化'})
                continue
            fixed = {name: value for name, value in values.items() if name not in numeric}
            group = contexts.setdefault(_key(fixed), {'fixed': fixed, 'configurations': []})
            group['configurations'].append((values, attempt))
        families.append({'seed_id': seed['id'], 'name': seed['candidate']['name'],
                         'contexts': [_context(seed, group['configurations'], numeric, group['fixed']) for _, group in sorted(contexts.items())],
                         'excluded_variants': excluded})
    return copy.deepcopy({'version': 1, 'rule': RULE, 'limitations': LIMITS, 'families': families,
                          'excluded_combination_ids': [row['id'] for row in attempts if row['operation'] not in ('source_candidate', 'parameter_variant')]})


def supports_score(value: dict | None, cited: set[str]) -> bool:
    """A low score may cite a complete but unstable/losing comparison grid."""
    return bool(value and any(context['baseline_attempt_id'] in cited and rectangles(
        [point for point in context['points'] if point['attempt_id'] in cited], context['axes'], RULE, stable=False)
        for family in value['families'] for context in family['contexts']))
