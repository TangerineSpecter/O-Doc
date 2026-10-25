"""Bounded, typed formula transformations using the existing causal expression IR.

The proposal schedule sees training facts only. Every invoked transform, including
rejection, is checkpointed by search; no uploaded source is executed.
"""
import copy
import random
from collections.abc import Iterator
from collections import deque
from rest_framework.exceptions import ValidationError
from quant.factors.expression import validate_expression, finite_number
from quant.research.contracts import digest

VERSION = 'quant-local-search-3'
LEGACY_OPERATORS = ('lag', 'smooth', 'zscore', 'mean', 'weighted_mean', 'residual', 'and', 'or')
OPERATORS = LEGACY_OPERATORS + ('ts_rank', 'gate')
CROSSOVER_OPERATORS = OPERATORS + ('crossover',)
UNARY = {'lag', 'smooth', 'zscore', 'ts_rank'}
NAMES = {'lag': '滞后', 'smooth': '平滑', 'zscore': '滚动标准化', 'mean': '均值组合',
         'weighted_mean': '加权组合', 'residual': '滚动残差', 'and': '条件交集', 'or': '条件并集', 'ts_rank': '时序相对排序', 'gate': '条件门控', 'crossover': '公式片段交叉'}
DEFAULT_POLICY = {'version': 2, 'operators': list(OPERATORS), 'windows': [3, 10], 'weights': [.25, .75], 'max_nodes': 96}


def validate_policy(value: dict) -> dict:
    if not isinstance(value, dict) or set(value) != {'version', 'operators', 'windows', 'weights', 'max_nodes'} or type(value['version']) is not int or value['version'] not in (1, 2, 3):
        raise ValidationError('公式演化配置版本或字段无效')
    allowed = LEGACY_OPERATORS if value['version'] == 1 else OPERATORS if value['version'] == 2 else CROSSOVER_OPERATORS
    operators, windows, weights = (value[key] for key in ('operators', 'windows', 'weights'))
    if not isinstance(operators, list) or not 1 <= len(operators) <= len(allowed) or any(not isinstance(op, str) or op not in allowed for op in operators) or len(set(operators)) != len(operators):
        raise ValidationError('请指定不重复的受支持演化算子')
    if not isinstance(windows, list) or not 1 <= len(windows) <= 4 or any(type(n) is not int or not 1 <= n <= 2000 for n in windows) or len(set(windows)) != len(windows):
        raise ValidationError('演化窗口须为 1–4 个不重复的 1–2000 整数')
    if not isinstance(weights, list) or not 1 <= len(weights) <= 4 or any(not finite_number(n) or not 0 < n < 1 for n in weights) or len(set(weights)) != len(weights):
        raise ValidationError('演化权重须为 1–4 个不重复的 0–1 之间数值（不含端点）')
    if type(value['max_nodes']) is not int or not 8 <= value['max_nodes'] <= 128:
        raise ValidationError('变异公式节点上限须为 8–128')
    return value


def validate_transform(transform: dict, policy: dict) -> dict:
    validate_policy(policy)
    keys = {'version', 'operator', 'window', 'weight'}
    if isinstance(transform, dict) and transform.get('operator') == 'crossover':
        keys |= {'recipient_path', 'donor_path'}
    if not isinstance(transform, dict) or set(transform) != keys or type(transform['version']) is not int or transform['version'] != policy['version']:
        raise ValidationError('公式变换记录无效')
    op = transform['operator']
    if not isinstance(op, str) or op not in policy['operators']:
        raise ValidationError('公式变换不在本轮允许算子中')
    if op == 'crossover':
        from .crossover import path_valid
        if not path_valid(transform['recipient_path'], recipient=True) or not path_valid(transform['donor_path']):
            raise ValidationError('公式交叉路径必须是最多 12 层的子节点索引，接收位置不能是根节点')
    if op in UNARY | {'residual'}:
        if type(transform['window']) is not int or transform['window'] not in policy['windows']:
            raise ValidationError('公式变换窗口不属于冻结方案')
    elif transform['window'] is not None:
        raise ValidationError('此变换不接受窗口')
    if op == 'weighted_mean':
        if not finite_number(transform['weight']) or transform['weight'] not in policy['weights']:
            raise ValidationError('组合权重不属于冻结方案')
    elif transform['weight'] is not None:
        raise ValidationError('此变换不接受权重')
    return transform


def _node(op: str, *args: dict) -> dict:
    return {'op': op, 'args': [copy.deepcopy(arg) for arg in args]}


def _joined(left: dict, right: dict) -> tuple[dict, dict, dict]:
    result = {'bindings': {}, 'parameters': {}, 'parameter_names': {}, 'output_type': left['output_type'], 'units': left['units']}
    def branch(value, prefix):
        def visit(node):
            node = copy.deepcopy(node)
            if node['op'] in ('input', 'parameter'):
                node['name'] = prefix + node['name']
            if 'args' in node:
                node['args'] = [visit(child) for child in node['args']]
            return node
        for key in ('bindings', 'parameters', 'parameter_names'):
            result[key].update({prefix + name: item for name, item in value[key].items()})
        return visit(value['expression'])
    return result, branch(left, 'a_'), branch(right, 'b_')


def transform_recipe(parents: list[dict], transform: dict, policy: dict) -> dict:
    from .search import combine, nodes
    validate_transform(transform, policy)
    op = transform['operator']
    if len(parents) != (1 if op in UNARY else 2):
        raise ValidationError('公式变换父代数量不符')
    left = parents[0]
    number = left['output_type'] == 'numeric_series'
    if op in ('smooth', 'zscore', 'ts_rank') and not number:
        raise ValidationError('平滑/标准化/排序只接受数值序列')
    constant = lambda n: {'op': 'constant', 'value': n}
    if op in UNARY:
        result = copy.deepcopy(left)
        source, window = result['expression'], constant(transform['window'])
        if op == 'zscore':
            result['expression'] = _node('div', _node('sub', source, _node('sma', source, window)), _node('std', source, window))
            result['units'] = 'dimensionless'
        else:
            result['expression'] = _node({'lag': 'lag', 'smooth': 'sma', 'ts_rank': 'ts_rank'}[op], source, window)
            if op == 'ts_rank':
                result['units'] = 'dimensionless'
    elif op == 'crossover':
        from .crossover import graft
        result, recipient, donor = _joined(left, parents[1])
        result['expression'] = graft(left, parents[1], transform['recipient_path'], transform['donor_path'], recipient, donor)
    elif op == 'gate':
        if parents[1]['output_type'] != 'boolean_series':
            raise ValidationError('条件门控的第二父代必须是布尔过滤条件')
        result, signal, condition = _joined(left, parents[1])
        result['expression'] = _node('gate', signal, condition)
    elif op in ('mean', 'and', 'or'):
        result = combine(left, parents[1], op)
    else:
        right = parents[1]
        if not number or right['output_type'] != 'numeric_series':
            raise ValidationError('加权组合/滚动残差只接受数值序列')
        if any(value['units'].strip().lower() in ('', 'unknown', '未知', '未说明') for value in parents):
            raise ValidationError('加权组合/残差需要明确的声明单位')
        if op == 'weighted_mean' and left['units'] != right['units']:
            raise ValidationError('加权组合需要相同声明单位')
        result, y, x = _joined(left, right)
        if op == 'weighted_mean':
            weight = transform['weight']
            result['expression'] = _node('add', _node('mul', constant(weight), y), _node('mul', constant(1 - weight), x))
        else:
            # Trailing population covariance / variance, with intercept. The
            # expression calculator propagates missing windows and zero division.
            window = constant(transform['window'])
            mean_y, mean_x = _node('sma', y, window), _node('sma', x, window)
            cov = _node('sub', _node('sma', _node('mul', y, x), window), _node('mul', mean_y, mean_x))
            var = _node('sub', _node('sma', _node('mul', x, x), window), _node('mul', mean_x, mean_x))
            beta = _node('div', cov, var)
            result['expression'] = _node('sub', y, _node('add', mean_y, _node('mul', beta, _node('sub', x, mean_x))))
    validate_expression(result['expression'], set(result['bindings']), set(result['parameters']))
    if nodes(result['expression']) > policy['max_nodes'] or len(result['bindings']) > 20 or len(result['parameters']) > 30:
        raise ValidationError('变异公式超过冻结复杂度或输入/参数预算')
    return result


def proposals(attempts: list[dict], policy: dict, randomizer: random.Random, generation: int) -> Iterator[dict]:
    """Interleave operator families so one Cartesian product cannot consume all budget.

    Keep all original parents in generation one; subsequently retain train Pareto
    and a seeded diversity sample, capped at eight parents per generation.
    """
    from .search import pareto
    evaluated = [row for row in attempts if row['status'] == 'evaluated']
    frontier = pareto(attempts)
    originals = [row for row in evaluated if row['operation'] == 'source_candidate']
    candidates = originals + [row for row in frontier if row not in originals] if generation == 1 else frontier
    extras = [row for row in evaluated if row not in candidates]
    randomizer.shuffle(extras)
    # Training frontier and originals are bounded, with two exploration slots
    # when available. No validation or holdout metric is read here.
    parents = candidates[:8] if generation == 1 else candidates[:6] + extras[:2]
    parents += [row for row in candidates[6:] if row not in parents][:8 - len(parents)]
    groups = []
    for op in policy['operators']:
        rows = []
        pairs = [(row,) for row in parents] if op in UNARY else [(a, b) for a in parents for b in parents if a['id'] != b['id']]
        for pair in pairs:
            if op == 'crossover':
                from .crossover import selected
                for paths in selected(pair[0]['recipe'], pair[1]['recipe'], randomizer):
                    rows.append({'parents': [row['id'] for row in pair], 'transformation': {'version': policy['version'],
                        'operator': op, 'window': None, 'weight': None, **paths}})
                continue
            # Incompatible combinations still become recorded rejected attempts.
            for value in policy['windows'] if op in UNARY | {'residual'} else policy['weights'] if op == 'weighted_mean' else [None]:
                rows.append({'parents': [row['id'] for row in pair], 'transformation': {'version': policy['version'], 'operator': op,
                    'window': value if op in UNARY | {'residual'} else None, 'weight': value if op == 'weighted_mean' else None}})
        randomizer.shuffle(rows)
        if rows:
            groups.append(deque(rows))
    randomizer.shuffle(groups)
    tried = {digest([row['parents'], row['transformation']]) for row in attempts if row.get('transformation')}
    while groups:
        for group in groups:
            proposal = group.popleft()
            if digest([proposal['parents'], proposal['transformation']]) not in tried:
                yield proposal
        groups = [group for group in groups if group]
