"""Version 4 comparison: deterministic checks for common numerical operators."""
import json
from decimal import Decimal, InvalidOperation, localcontext
from quant.research.contracts import digest
from .equivalence import Unsupported, add, multiply, rational

OPAQUE = {'lag', 'log', 'abs', 'sma', 'sum', 'std', 'highest', 'lowest', 'ts_rank', 'min', 'max'}


def algebra(node):
    op = node['op']
    if op in OPAQUE:
        return {'op': 'input', 'name': 'opaque:' + digest(node)}
    if op in ('add', 'sub', 'mul', 'div', 'neg'):
        return {'op': op, 'args': [algebra(child) for child in node['args']]}
    return node


def decimal_value(value):
    try:
        value = json.loads(value)
        if type(value) not in (int, float): raise Unsupported()
        value = Decimal(str(value))
        if not value.is_finite(): raise Unsupported()
        return value
    except (ValueError, TypeError, InvalidOperation): raise Unsupported()


def evaluate(expression, parameters, pattern):
    """Use fixed, local synthetic sequences. Never execute model/source text."""
    cache, steps = {}, [0]
    def walk(node, index):
        steps[0] += 1
        if steps[0] > 30000 or index < 0: raise Unsupported()
        key = (id(node), index)
        if key in cache: return cache[key]
        op = node['op']
        if op == 'input': value = Decimal(100) if pattern == 'constant' else Decimal(100) + Decimal(index % 97) / 10
        elif op == 'parameter': value = parameters[node['name']]
        elif op == 'constant':
            if type(node['value']) not in (int, float): raise Unsupported()
            value = Decimal(str(node['value']))
        elif op in ('lag', 'sma', 'sum', 'std', 'highest', 'lowest', 'ts_rank'):
            width = walk(node['args'][1], index)
            if width != int(width) or width < 1 or width > 2000: raise Unsupported()
            n = int(width)
            if op == 'lag': value = walk(node['args'][0], index - n)
            else:
                if index - n + 1 < 0: raise Unsupported()
                values = [walk(node['args'][0], t) for t in range(index - n + 1, index + 1)]
                if op == 'sum': value = sum(values, Decimal(0))
                elif op == 'sma': value = sum(values, Decimal(0)) / n
                elif op == 'highest': value = max(values)
                elif op == 'lowest': value = min(values)
                elif op == 'std':
                    mean = sum(values, Decimal(0)) / n
                    value = (sum(((v - mean) ** 2 for v in values), Decimal(0)) / n).sqrt()
                else:
                    last = values[-1]; less = sum(v < last for v in values); equal = sum(v == last for v in values)
                    value = (Decimal(less) + Decimal(equal) / 2) / n
        elif op in ('neg', 'abs', 'log'):
            a = walk(node['args'][0], index)
            if op == 'neg': value = -a
            elif op == 'abs': value = abs(a)
            elif a > 0: value = a.ln()
            else: raise Unsupported()
        elif op in ('add', 'sub', 'mul', 'div', 'min', 'max'):
            a, b = (walk(arg, index) for arg in node['args'])
            if op == 'add': value = a + b
            elif op == 'sub': value = a - b
            elif op == 'mul': value = a * b
            elif op == 'div':
                if not b: raise Unsupported()
                value = a / b
            elif op == 'min': value = min(a, b)
            else: value = max(a, b)
        else: raise Unsupported()
        if not value.is_finite() or value.adjusted() > 200: raise Unsupported()
        cache[key] = value
        return value
    with localcontext() as context:
        context.prec = 40
        return walk(expression, 2000)


def compare(parent, candidate, parent_id, claim='uncertain'):
    result = {'parent_id': parent_id, 'claim': claim, 'status': 'unknown', 'reason': '', 'counterexample': None,
        'parameter_scope': '同名输入视为相同，使用同一组参数；不代表两份默认参数配置相同', 'default_parameters_differ': False}
    left, right = parent.get('expression'), candidate.get('expression')
    if not isinstance(left, dict) or not isinstance(right, dict):
        result['reason'] = '至少一方没有结构化表达式，暂无法比较'; return result
    inputs_a = {p['name'] for p in parent['inputs']}; inputs_b = {p['name'] for p in candidate['inputs']}
    params_a = {p['name']: p for p in parent['parameters']}; params_b = {p['name']: p for p in candidate['parameters']}
    if inputs_a != inputs_b or set(params_a) != set(params_b) or parent['output_type'] != candidate['output_type']:
        result['reason'] = '输入、参数或输出类型不同，未建立一一对应'; return result
    if any(params_a[k].get('type') != params_b[k].get('type') for k in params_a):
        result['reason'] = '同名参数类型不同，未建立一一对应'; return result
    result['default_parameters_differ'] = any(params_a[k]['default_value'] != params_b[k]['default_value'] for k in params_a)
    try:
        a, b = rational(algebra(left)); c, d = rational(algebra(right))
        if not b or not d: raise Unsupported()
        if not add(multiply(a, d), multiply(c, b), -1):
            result.update(status='equivalent', reason='同输入、同参数且两式均有定义时，受支持的实数代数运算证明等价；未证明浮点舍入、缺失值或平台行为相同')
            return result
    except (Unsupported, KeyError, TypeError, ValueError, RecursionError):
        pass
    try:
        parameters = {key: decimal_value(value['default_value']) for key, value in params_a.items()}
        for pattern in ('constant', 'varying'):
            a, b = evaluate(left, parameters, pattern), evaluate(right, parameters, pattern)
            tolerance = Decimal('1e-24') * max(Decimal(1), abs(a), abs(b))
            if abs(a - b) > tolerance:
                input_value = '100（各时点）' if pattern == 'constant' else '100 + (时点序号 % 97) / 10'
                result.update(status='different', reason='相同输入和参数下找到合成数值反例，两式不等价',
                    counterexample={'inputs': {key: input_value for key in sorted(inputs_a)},
                        'parameters': {key: str(value) for key, value in sorted(parameters.items())},
                        'index': 2000, 'parent': str(a), 'candidate': str(b)})
                return result
        result['reason'] = '合成样例结果相同，但不足以证明等价'
    except (Unsupported, KeyError, TypeError, ValueError, InvalidOperation, ZeroDivisionError, RecursionError, OverflowError):
        result['reason'] = '包含暂不支持的运算，或无法形成有效合成样例'
    return result
