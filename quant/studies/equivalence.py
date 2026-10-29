"""Bounded rational comparison of declarative expressions; no source execution.

Proof is restricted to the common defined domain under identical input and
parameter semantics. A synthetic counterexample uses the parent's parameters.
"""
import json
from fractions import Fraction
from quant.research.contracts import digest

LIMIT = 128

class Unsupported(Exception):
    pass


def clean(poly):
    out = {k: v for k, v in poly.items() if v}
    if len(out) > LIMIT or any(len(k) > 16 or abs(v.numerator).bit_length() > 512 or v.denominator.bit_length() > 512 for k, v in out.items()):
        raise Unsupported()
    return out


def add(a, b, sign=1):
    result = dict(a)
    for key, value in b.items(): result[key] = result.get(key, Fraction()) + sign * value
    return clean(result)


def multiply(a, b):
    if len(a) * len(b) > LIMIT * 4: raise Unsupported()
    out = {}
    for x, p in a.items():
        for y, q in b.items():
            key = tuple(sorted(x + y)); out[key] = out.get(key, Fraction()) + p * q
    return clean(out)


def rational(node):
    op = node['op']
    if op == 'constant':
        value = node['value']
        if type(value) not in (int, float): raise Unsupported()
        return clean({(): Fraction(str(value))}), {(): Fraction(1)}
    if op in ('input', 'parameter', 'lag'):
        key = digest(node)
        return {(key,): Fraction(1)}, {(): Fraction(1)}
    if op == 'neg':
        n, d = rational(node['args'][0]); return {key: -value for key, value in n.items()}, d
    if op not in ('add', 'sub', 'mul', 'div'): raise Unsupported()
    a, b = rational(node['args'][0]); c, d = rational(node['args'][1])
    if op in ('add', 'sub'): return add(multiply(a, d), multiply(c, b), 1 if op == 'add' else -1), multiply(b, d)
    if op == 'mul': return multiply(a, c), multiply(b, d)
    if not c: raise Unsupported()
    return multiply(a, d), multiply(b, c)


def number(value):
    try:
        parsed = json.loads(value)
        if type(parsed) not in (int, float): raise ValueError()
        return Fraction(str(parsed))
    except (ValueError, TypeError, ZeroDivisionError): raise Unsupported()


def sample(node, parameters, index=2000):
    op = node['op']
    if op == 'input': return Fraction(100)
    if op == 'parameter': return parameters[node['name']]
    if op == 'constant':
        if type(node['value']) not in (int, float): raise Unsupported()
        return Fraction(str(node['value']))
    if op == 'neg': return -sample(node['args'][0], parameters, index)
    if op == 'lag':
        window = sample(node['args'][1], parameters, index)
        if window.denominator != 1 or window < 1 or window > index: raise Unsupported()
        return sample(node['args'][0], parameters, index - int(window))
    if op not in ('add', 'sub', 'mul', 'div'): raise Unsupported()
    a = sample(node['args'][0], parameters, index); b = sample(node['args'][1], parameters, index)
    if op == 'add': return a + b
    if op == 'sub': return a - b
    if op == 'mul': return a * b
    if not b: raise Unsupported()
    return a / b


def compare(parent, candidate, parent_id, claim='uncertain'):
    """Compare the calculation with shared input meanings and shared parameters."""
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
        a, b = rational(left); c, d = rational(right)
        if not b or not d: raise Unsupported()
        diff = add(multiply(a, d), multiply(c, b), -1)
        if not diff:
            result.update(status='equivalent', reason='在相同输入和参数、两式均有定义的范围内，受支持的实数代数运算证明等价；不证明浮点舍入、缺失值或平台行为相同')
            return result
    except (Unsupported, KeyError, TypeError, ValueError, RecursionError):
        result['reason'] = '表达式包含暂不支持的运算或比较范围过大'; return result
    try:
        parameters = {key: number(value['default_value']) for key, value in params_a.items()}
        a = sample(left, parameters); b = sample(right, parameters)
        if a != b:
            result.update(status='different', reason='相同输入和参数下找到反例，两式不等价',
                counterexample={'inputs': {key: '100（各时点）' for key in sorted(inputs_a)},
                    'parameters': {key: str(value) for key, value in sorted(parameters.items())},
                    'parent': str(a), 'candidate': str(b)})
        else: result.update(status='unknown', reason='合成样例结果相同，但不足以证明等价')
    except (Unsupported, KeyError, TypeError, ValueError, ZeroDivisionError, RecursionError):
        result.update(status='unknown', reason='无法用父代默认参数形成有效的合成反例')
    return result
