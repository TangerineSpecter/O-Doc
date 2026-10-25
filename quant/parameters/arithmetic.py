"""Bounded decimal-text rational operands for domain v4, never source execution."""
import copy
import operator
from collections.abc import Callable
from fractions import Fraction
from rest_framework.exceptions import ValidationError
from quant.factors.expression import finite_number, text_value

MAX_BITS = 4096
MAX_INPUT = 9007199254740991
MAX_VALUE = Fraction('1.7976931348623157e308')
OPERATORS = {'add': operator.add, 'sub': operator.sub, 'mul': operator.mul, 'div': operator.truediv}
SYMBOLS = {'add': '+', 'sub': '−', 'mul': '×', 'div': '÷'}


def checked(value: Fraction) -> Fraction:
    if value.numerator.bit_length() > MAX_BITS or value.denominator.bit_length() > MAX_BITS or abs(value) > MAX_VALUE:
        raise ValidationError('条件算术超过数值或精度预算')
    return value


def rational(value) -> Fraction:
    if not finite_number(value):
        raise ValidationError('条件算术只能使用有限数值，布尔和字符串不可参与')
    if abs(value) > MAX_INPUT:
        raise ValidationError('条件算术输入超过安全表示范围 ±9007199254740991')
    return checked(Fraction(str(value)))


def validate(node: dict, types: dict[str, str] | None, *, tick: Callable[[int], None],
             depth: int, allow_text: bool = True) -> str | None:
    tick(depth)
    if not isinstance(node, dict):
        raise ValidationError('条件算术操作数必须是参数、常量或受支持的算术节点')
    if set(node) == {'parameter'}:
        name = node['parameter']
        if not isinstance(name, str) or not 1 <= len(name) <= 200:
            raise ValidationError('条件参数名无效')
        if types is not None and (name not in types or types[name] not in ('int', 'number', 'bool', 'string')):
            raise ValidationError('条件约束必须引用同一参数清单中的已识别类型')
        if types is not None and types[name] == 'string' and not allow_text:
            raise ValidationError('字符串条件需要 domain v3 或 v4')
        return types[name] if types is not None else None
    if set(node) == {'value'}:
        value = node['value']
        if type(value) is bool:
            return 'bool'
        if finite_number(value):
            rational(value)
            return 'number'
        if allow_text and text_value(value):
            return 'string'
        raise ValidationError('条件常量只支持有限数值、布尔或有界字符串')
    op = node.get('operator')
    if op == 'neg' and set(node) == {'operator', 'argument'}:
        kinds = [validate(node['argument'], types, tick=tick, depth=depth + 1, allow_text=allow_text)]
    elif isinstance(op, str) and op in OPERATORS and set(node) == {'operator', 'left', 'right'}:
        kinds = [validate(node[key], types, tick=tick, depth=depth + 1, allow_text=allow_text) for key in ('left', 'right')]
    else:
        raise ValidationError('未知条件算术运算符或多余字段')
    if any(kind not in (None, 'int', 'number') for kind in kinds):
        raise ValidationError('布尔和字符串不可参与条件算术')
    return 'number'


def references(node: dict) -> set[str]:
    if 'parameter' in node:
        return {node['parameter']}
    if 'value' in node:
        return set()
    if node['operator'] == 'neg':
        return references(node['argument'])
    return references(node['left']) | references(node['right'])


def evaluate(node: dict, values: dict[str, int | float | bool | str]) -> Fraction | bool | str:
    if 'parameter' in node or 'value' in node:
        value = values[node['parameter']] if 'parameter' in node else node['value']
        return rational(value) if finite_number(value) else value
    if node['operator'] == 'neg':
        value = evaluate(node['argument'], values)
        if not isinstance(value, Fraction):
            raise ValidationError('布尔和字符串不可参与条件算术')
        return checked(-value)
    left, right = evaluate(node['left'], values), evaluate(node['right'], values)
    if not isinstance(left, Fraction) or not isinstance(right, Fraction):
        raise ValidationError('布尔和字符串不可参与条件算术')
    if node['operator'] == 'div' and right == 0:
        raise ValidationError('条件算术不能除以零')
    return checked(OPERATORS[node['operator']](left, right))


def renamed(node: dict, mapping: dict[str, str]) -> dict:
    node = copy.deepcopy(node)
    if 'parameter' in node:
        node['parameter'] = mapping[node['parameter']]
    elif 'value' not in node:
        if node['operator'] == 'neg':
            node['argument'] = renamed(node['argument'], mapping)
        else:
            for key in ('left', 'right'):
                node[key] = renamed(node[key], mapping)
    return node


def describe(node: dict) -> str:
    if 'parameter' in node:
        return node['parameter']
    if 'value' in node:
        value = node['value']
        return ('true' if value else 'false') if type(value) is bool else str(value)
    if node['operator'] == 'neg':
        return '−(' + describe(node['argument']) + ')'
    return f'({describe(node["left"])} {SYMBOLS[node["operator"]]} {describe(node["right"])})'
