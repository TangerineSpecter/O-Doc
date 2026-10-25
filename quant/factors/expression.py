"""Small declarative expression vocabulary. Structural checks are not equivalence proofs."""
import math
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest

UNARY = {'abs', 'neg', 'log'}
BINARY = {'add', 'sub', 'mul', 'div', 'min', 'max', 'gt', 'lt', 'eq', 'and', 'or', 'gate'}
ROLLING = {'lag', 'sma', 'sum', 'std', 'highest', 'lowest', 'ts_rank'}


def finite_number(value) -> bool:
    try:
        return type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        return False


def text_value(value) -> bool:
    return isinstance(value, str) and len(value) <= 200 and all(ord(char) >= 32 for char in value)


def parameter_value(value) -> bool:
    return type(value) is bool or finite_number(value) or text_value(value)


def validate_expression(node: dict, inputs: set[str], parameters: set[str]) -> dict:
    budget = [0]

    def visit(value, depth=0):
        budget[0] += 1
        if depth > 12 or budget[0] > 128 or not isinstance(value, dict):
            raise ValidationError('因子表达式过深、过大或不是对象')
        op = value.get('op')
        if not isinstance(op, str):
            raise ValidationError('表达式算子必须为字符串')
        if op == 'input' and set(value) == {'op', 'name'} and isinstance(value['name'], str) and value['name'] in inputs:
            return
        if op == 'parameter' and set(value) == {'op', 'name'} and isinstance(value['name'], str) and value['name'] in parameters:
            return
        if op == 'constant' and set(value) == {'op', 'value'}:
            if finite_number(value['value']) or text_value(value['value']):
                return
        if op in UNARY | BINARY | ROLLING and set(value) == {'op', 'args'}:
            args = value['args']
            if isinstance(args, list) and len(args) == (1 if op in UNARY else 2):
                for child in args:
                    visit(child, depth + 1)
                if op in ROLLING:
                    window = args[1]
                    if window['op'] not in ('constant', 'parameter'):
                        raise ValidationError('窗口必须是常量或明确的参数')
                    if window['op'] == 'constant' and (type(window['value']) is not int or window['value'] < 1):
                        raise ValidationError('窗口必须是正整数')
                return
        raise ValidationError('因子表达式含未知算子、字段或未声明的输入/参数')

    visit(node)
    return node


def expression_hash(candidate: dict) -> str:
    if candidate['expression'] is None:
        return ''
    # Preserve operand order and all data/parameter contracts. A hash match is
    # only exact structural identity, NOT cross-platform semantic equivalence.
    return digest({'grammar': 1, **{key: candidate[key] for key in
        ('role', 'expression', 'inputs', 'parameters', 'output_type', 'units', 'timeframe', 'dependencies')}})
