"""Common discrete parameter regions across every planned inner window.

Descriptive development evidence only. No holdout, new simulation or I/O.
The old one-window summaries remain unchanged for historical AI contracts.
"""
import copy
from math import prod
from .sensitivity import analyze as axis_analysis, RULE as AXIS_RULE
from .joint_sensitivity import analyze as joint_analysis, RULE as JOINT_RULE

LIMITS = [
    '全部计划外折及内层窗口分别比较，不拼接收益或跨时间归因；后折可使用前折已过去历史，窗口不是独立重复样本。',
    '共同区段是每个窗口支持的已测离散集合交集；不补缺角、不跨越失败或未执行点，不推断中间值或连续参数范围。',
    '每窗沿用单/联合参数v1固定正收益、入场、覆盖、相对基线及极差规则，不能用均值掩盖某窗失败。',
    '同一原始父代、固定其他参数和分类模式分别比较；公式变异与组合仍不用于参数归因。',
    '仅使用内层训练/验证，不读取外层测试；预热按实际计算记录，受控表达式结果不等于原平台表现。',
    '共同区段仍需新数据复核，不提供统计显著性、最优参数、跨请求多重检验控制或金融有效性证明。',
]


def _maximal(regions: list[dict]) -> list[dict]:
    unique = []
    for region in regions:
        if region not in unique:
            unique.append(region)
    return [region for region in unique if not any(region != other and region.keys() == other.keys()
        and all(set(values) <= set(other[name]) for name, values in region.items()) for other in unique)]


def intersections(groups: list[list[dict]], *, minimum: int, dimensions: int) -> list[dict]:
    """Intersect complete sampled rectangles, retaining every maximal alternative."""
    result = groups[0] if groups else []
    for group in groups[1:]:
        merged = []
        for left in result:
            for right in group:
                if left.keys() != right.keys():
                    continue
                overlap = {name: sorted(set(values) & set(right[name])) for name, values in left.items()}
                if (all(overlap.values()) and prod(len(values) for values in overlap.values()) >= minimum
                        and sum(len(values) > 1 for values in overlap.values()) >= dimensions):
                    merged.append(overlap)
        result = _maximal(merged)
        if not result:
            break
    return _maximal(result)


def _project(attempt: dict, inner: int) -> dict:
    row = next((row for row in attempt.get('inner_evaluation', {}).get('folds', []) if row['number'] == inner), None)
    return {**attempt, 'metrics': row['metrics'] if row else {}}


def _compact(point: dict) -> dict:
    return {key: copy.deepcopy(point[key]) for key in ('attempt_id', 'status', 'reason', 'comparable', 'eligible', 'eligibility_reasons')} | {
        'value': copy.deepcopy(point.get('value', point.get('parameters'))),
        'metrics': {part: {name: metric[name] for name in ('total_return', 'max_drawdown')} if metric else None
                    for part, metric in point['metrics'].items()}}


def _comparison_runs(points: list[dict]) -> list[list]:
    runs, current = [], []
    for point in points + [{'comparable': False}]:
        if point['comparable']:
            current.append(point['value'])
        else:
            if len(current) >= AXIS_RULE['minimum_points']:
                runs.append(current)
            current = []
    return runs


def _windows(plan: dict, attempts: list[dict]) -> list[dict]:
    policy = plan['config']['walk_forward']
    plain = plan | {'config': {key: value for key, value in plan['config'].items() if key != 'walk_forward'}}
    windows = []
    for outer in range(1, policy['folds'] + 1):
        for inner in range(1, policy['inner_folds'] + 1):
            projected = [_project(attempt, inner) for attempt in attempts if attempt.get('fold') == outer]
            ranges={part:next(({'start':row['metrics'][part]['start'],'end':row['metrics'][part]['end']}
                for row in projected if part in row['metrics'] and all(key in row['metrics'][part] for key in ('start','end'))),None)
                for part in ('train','validation')}
            windows.append({'outer_fold': outer, 'inner_fold': inner,
                'ranges':ranges,
                'axes': axis_analysis(plain, projected)['families'],
                'joint': joint_analysis(plain, projected)['families']})
    return windows


def _axis(family: dict, name: str, windows: list[dict]) -> dict:
    evidence, comparable, supported = [], [], []
    baseline = family['baseline_parameters'][name]
    for window in windows:
        source = next(row for row in window['axes'] if row['seed_id'] == family['seed_id'])
        axis = next(row for row in source['axes'] if row['parameter'] == name)
        evidence.append({'outer_fold': window['outer_fold'], 'inner_fold': window['inner_fold'],
            'ranges':copy.deepcopy(window['ranges']),
            'baseline_attempt_id': source['baseline_attempt_id'], 'points': [_compact(point) for point in axis['points']],
            'supported_values': [{name: region['sampled_values']} for region in axis['regions']]})
        comparable.append([{name: run} for run in _comparison_runs(axis['points'])])
        supported.append([{name: region['sampled_values']} for region in axis['regions']])
    comparison = intersections(comparable, minimum=3, dimensions=1)
    regions = intersections(supported, minimum=3, dimensions=1)
    return {'parameter': name, 'baseline_value': baseline, 'windows': evidence,
        'comparison_regions': comparison, 'regions': regions,
        'status': 'sampled_region' if regions else 'no_supported_region' if comparison else 'insufficient_comparison'}


def _joint(family: dict, context: dict, windows: list[dict]) -> dict:
    evidence, comparable, supported = [], [], []
    for window in windows:
        source = next(row for row in window['joint'] if row['seed_id'] == family['seed_id'])
        group = next(row for row in source['contexts'] if row['context_id'] == context['context_id'])
        evidence.append({'outer_fold': window['outer_fold'], 'inner_fold': window['inner_fold'],
            'ranges':copy.deepcopy(window['ranges']),
            'baseline_attempt_id': group['baseline_attempt_id'], 'points': [_compact(point) for point in group['points']],
            'supported_values': [region['sampled_values'] for region in group['regions']]})
        comparable.append([region['sampled_values'] for region in group['comparison_cells']])
        supported.append([region['sampled_values'] for region in group['regions']])
    comparison = intersections(comparable, minimum=4, dimensions=2)
    regions = intersections(supported, minimum=4, dimensions=2)
    return {key: copy.deepcopy(context[key]) for key in ('context_id', 'fixed_parameters', 'axes', 'baseline_parameters')} | {
        'windows': evidence, 'comparison_regions': comparison, 'regions': regions,
        'status': 'sampled_region' if regions else 'no_supported_region' if comparison else 'insufficient_comparison'}


def analyze(plan: dict, attempts: list[dict]) -> dict | None:
    policy = plan.get('config', {}).get('walk_forward', {})
    if policy.get('version') != 2:
        return None
    windows = _windows(plan, attempts)
    families = []
    for axis_family, joint_family in zip(windows[0]['axes'], windows[0]['joint']):
        families.append({key: copy.deepcopy(axis_family[key]) for key in ('seed_id', 'name', 'baseline_parameters')} | {
            'axes': [_axis(axis_family, axis['parameter'], windows) for axis in axis_family['axes']],
            'contexts': [_joint(joint_family, context, windows) for context in joint_family['contexts'] if len(context['axes']) >= 2],
            'excluded_variants': [dict(copy.deepcopy(row), outer_fold=window['outer_fold'])
                for window in windows if window['inner_fold']==1
                for family in window['axes'] if family['seed_id']==axis_family['seed_id']
                for row in family['excluded_variants']]})
    groups=[group for family in families for group in family['axes']+family['contexts']]
    return {'version': 1, 'method': 'all-planned-inner-sampled-regions-1',
        'outer_folds': policy['folds'], 'inner_folds': policy['inner_folds'], 'planned_windows': len(windows),
        'axis_rule': copy.deepcopy(AXIS_RULE), 'joint_rule': copy.deepcopy(JOINT_RULE),
        'maximum_score_without_common_region': 2, 'limitations': list(LIMITS), 'families': families,
        'status': 'sampled_region' if any(group['regions'] for group in groups) else
            'no_supported_region' if any(group['comparison_regions'] for group in groups) else 'insufficient_comparison',
        'excluded_combination_ids': [row['id'] for row in attempts if row['operation'] not in ('source_candidate', 'parameter_variant')]}


def supports_score(value: dict, cited: set[str], *, stable: bool) -> bool:
    """The root evidence binds all windows; cite a complete representative window."""
    for family in value['families']:
        for group in family['axes'] + family['contexts']:
            for region in group['regions' if stable else 'comparison_regions']:
                for window in group['windows']:
                    members = [point for point in window['points'] if all(
                        (point['value'] if 'parameter' in group else point['value'][name]) in values
                        for name, values in region.items())]
                    members=[point for point in members if point['attempt_id'] in cited]
                    if window['baseline_attempt_id'] not in cited:
                        continue
                    if 'parameter' in group and len(members)>=3:
                        return True
                    if 'parameter' not in group and len(members)>=4:
                        levels=[{point['value'][name] for point in members} for name in region]
                        if sum(len(values)>1 for values in levels)>=2 and prod(len(values) for values in levels)==len(members):
                            return True
    return False


def model_evidence(value: dict) -> dict:
    """Metrics already occur once under each attempt's original inner records."""
    result=copy.deepcopy(value)
    result['metric_source']='attempt_id -> inner_evaluation.folds with number = inner_fold -> metrics'
    for family in result['families']:
        for group in family['axes']+family['contexts']:
            for window in group['windows']:
                for point in window['points']:
                    point.pop('metrics')
    return result
