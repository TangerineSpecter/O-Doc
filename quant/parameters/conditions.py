"""Typed, bounded implications over fixed parameter values; never executes source."""
import copy
import operator

from rest_framework.exceptions import ValidationError
from quant.factors.expression import finite_number, text_value
from . import arithmetic

OPERATORS = {'lt': operator.lt, 'lte': operator.le, 'gt': operator.gt,
             'gte': operator.ge, 'eq': operator.eq, 'ne': operator.ne}
SYMBOLS = {'lt': '<', 'lte': '≤', 'gt': '>', 'gte': '≥', 'eq': '=', 'ne': '≠'}


def validate(predicate, types=None, *, allow_text=False, allow_arithmetic=False):
    """Validate every branch, including branches inactive for current defaults."""
    count = 0

    def tick(depth):
        nonlocal count
        count += 1
        if depth > (8 if allow_arithmetic else 6) or count > (64 if allow_arithmetic else 32):
            raise ValidationError('每个条件表达式最多 64 个节点、8 层（含操作数）' if allow_arithmetic else '每个条件表达式最多 32 个节点、6 层')

    def operand(value, depth):
        if allow_arithmetic:
            return arithmetic.validate(value, types, tick=tick, depth=depth, allow_text=allow_text)
        if not isinstance(value, dict):
            raise ValidationError('条件比较操作数必须是参数引用或常量')
        if set(value) == {'parameter'}:
            name = value['parameter']
            if not isinstance(name, str) or not 1 <= len(name) <= 200:
                raise ValidationError('条件参数名无效')
            if types is not None and (name not in types or not types[name]):
                raise ValidationError('条件约束必须引用同一参数清单中的已识别类型')
            if types is not None and types[name] == 'string' and not allow_text:
                raise ValidationError('字符串条件需要 domain v3')
            return types[name] if types is not None else None
        if set(value) == {'value'} and (type(value['value']) is bool or finite_number(value['value'])):
            return 'bool' if type(value['value']) is bool else 'number'
        if set(value) == {'value'} and allow_text and text_value(value['value']):
            return 'string'
        raise ValidationError('条件常量只支持有限数值、布尔值，或 v3 的有界字符串')

    def visit(node, depth):
        tick(depth)
        if not isinstance(node, dict) or not isinstance(node.get('operator'), str):
            raise ValidationError('条件表达式格式无效')
        op = node['operator']
        if op in ('all', 'any') and set(node) == {'operator', 'arguments'}:
            if not isinstance(node['arguments'], list) or not 2 <= len(node['arguments']) <= 8:
                raise ValidationError('且/或条件需要 2–8 个子条件')
            for child in node['arguments']:
                visit(child, depth + 1)
        elif op == 'not' and set(node) == {'operator', 'argument'}:
            visit(node['argument'], depth + 1)
        elif op in OPERATORS and set(node) == {'operator', 'left', 'right'}:
            left, right = operand(node['left'], depth + 1), operand(node['right'], depth + 1)
            if not (arithmetic.references(node['left']) | arithmetic.references(node['right'])):
                raise ValidationError('条件比较必须引用至少一个参数')
            if left is not None and right is not None:
                if (left in ('bool', 'string') or right in ('bool', 'string')) and (left != right or op not in ('eq', 'ne')):
                    raise ValidationError('布尔或字符串条件仅支持同类型值之间的相等/不等比较')
        else:
            raise ValidationError('未知条件运算符或多余字段')

    visit(predicate, 1)


def references(predicate):
    op = predicate['operator']
    if op in ('all', 'any'):
        return set().union(*(references(child) for child in predicate['arguments']))
    if op == 'not':
        return references(predicate['argument'])
    return arithmetic.references(predicate['left']) | arithmetic.references(predicate['right'])


def validate_values(predicate, values):
    """V4 input representation bounds apply even to inactive numeric branches."""
    for name in references(predicate):
        if name not in values:
            raise ValidationError('条件约束缺少依赖参数值')
        if type(values[name]) in (int, float):
            arithmetic.rational(values[name])


def evaluate(predicate, values, *, exact=False):
    op = predicate['operator']
    if op in ('all', 'any'):
        return (all if op == 'all' else any)(evaluate(child, values, exact=exact) for child in predicate['arguments'])
    if op == 'not':
        return not evaluate(predicate['argument'], values, exact=exact)
    def value(operand):
        if exact:
            return arithmetic.evaluate(operand, values)
        return values[operand['parameter']] if 'parameter' in operand else operand['value']
    return OPERATORS[op](value(predicate['left']), value(predicate['right']))


def renamed(predicate, mapping):
    node = copy.deepcopy(predicate)
    op = node['operator']
    if op in ('all', 'any'):
        node['arguments'] = [renamed(child, mapping) for child in node['arguments']]
    elif op == 'not':
        node['argument'] = renamed(node['argument'], mapping)
    else:
        for key in ('left', 'right'):
            node[key] = arithmetic.renamed(node[key], mapping)
    return node


def describe(predicate):
    op = predicate['operator']
    if op in ('all', 'any'):
        return '(' + (' 且 ' if op == 'all' else ' 或 ').join(describe(child) for child in predicate['arguments']) + ')'
    if op == 'not':
        return '非(' + describe(predicate['argument']) + ')'
    return f'{arithmetic.describe(predicate["left"])} {SYMBOLS[op]} {arithmetic.describe(predicate["right"])}'
