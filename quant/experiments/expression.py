"""Typed causal calculator v1, without script evaluation or dynamic imports.

Windows include the current closed bar; std uses ddof=0. Missing data is
propagated and full windows are required. This defines this engine's semantics,
not equivalence to an original platform's indicator.
"""
import time
from dataclasses import dataclass
import numpy as np
import pandas as pd
from rest_framework.exceptions import ValidationError
from quant.factors.expression import validate_expression, UNARY, ROLLING, finite_number, parameter_value

MAX_WINDOW = 2000
MAX_ROWS = 20000


@dataclass
class Value:
    kind: str  # number or boolean, kept separate even though NumPy coerces bool.
    series: pd.Series


def calculate(expression: dict, inputs: dict, parameters: dict, *, expected='numeric_series', check=None, deadline=None) -> list:
    if not isinstance(inputs, dict) or not inputs or len(inputs) > 20 or not isinstance(parameters, dict) or len(parameters) > 30:
        raise ValidationError('输入/参数合同无效')
    validate_expression(expression, set(inputs), set(parameters))
    if any(not isinstance(values, list) for values in inputs.values()):
        raise ValidationError('行情输入必须为数组')
    size = len(next(iter(inputs.values())))
    if size < 2 or size > MAX_ROWS or any(not isinstance(values, list) or len(values) != size for values in inputs.values()):
        raise ValidationError('输入序列长度不一致或超出计算上限')
    if expected not in ('numeric_series', 'boolean_series'):
        raise ValidationError('只支持数值或布尔序列输出')
    deadline = deadline if deadline is not None else time.monotonic() + 15
    def guard():
        if check:
            check()
        if time.monotonic() >= deadline:
            raise TimeoutError('表达式计算超过时间预算')
    def number(value):
        return finite_number(value)
    series = {}
    for name, values in inputs.items():
        if any(value is not None and not number(value) for value in values):
            raise ValidationError('行情输入必须为有限数值或明确缺失')
        series[name] = pd.Series(values, dtype='float64')
    if any(not parameter_value(value) for value in parameters.values()):
        raise ValidationError('计算参数只允许有限数值、布尔及有界字符串，不解析字符串代码')
    def scalar(node):
        value = node['value'] if node['op'] == 'constant' else parameters[node['name']]
        return Value('string' if isinstance(value, str) else 'boolean' if type(value) is bool else 'number',
            pd.Series([value] * size, dtype='object' if isinstance(value, str) else 'float64'))
    def visit(node):
        guard()
        op = node['op']
        if op == 'input':
            return Value('number', series[node['name']])
        if op in ('constant', 'parameter'):
            return scalar(node)
        left = visit(node['args'][0])
        if op in ROLLING:
            if left.kind == 'string':
                raise ValidationError('字符串不能用于时序或统计窗口')
            window_node = node['args'][1]
            window = window_node['value'] if window_node['op'] == 'constant' else parameters[window_node['name']]
            if type(window) is not int or not 1 <= window <= MAX_WINDOW:
                raise ValidationError(f'窗口参数须为 1–{MAX_WINDOW} 的整数')
            if op == 'lag':
                return Value(left.kind, left.series.shift(window))
            if left.kind != 'number':
                raise ValidationError('统计窗口需要数值序列')
            rolling = left.series.rolling(window, min_periods=window)
            output = {'sma': lambda: rolling.mean(), 'sum': lambda: rolling.sum(), 'std': lambda: rolling.std(ddof=0),
                'highest': lambda: rolling.max(), 'lowest': lambda: rolling.min(),
                'ts_rank': lambda: (rolling.rank(method='average') - .5) / window}[op]()
        elif op in UNARY:
            if left.kind != 'number':
                raise ValidationError('数值算子不能接收布尔值')
            with np.errstate(all='ignore'):
                output = {'abs': lambda: left.series.abs(), 'neg': lambda: -left.series,
                    'log': lambda: np.log(left.series.where(left.series > 0))}[op]()
        else:
            right = visit(node['args'][1])
            if left.kind == 'string' and op != 'eq' or right.kind == 'string' and op != 'eq':
                raise ValidationError('字符串只允许同类型相等比较')
            if op == 'gate':
                if right.kind != 'boolean':
                    raise ValidationError('条件门控的第二父代必须是布尔过滤条件')
                return Value(left.kind, left.series.where(right.series == 1))
            if op in ('and', 'or'):
                if left.kind != 'boolean' or right.kind != 'boolean':
                    raise ValidationError('逻辑组合需要两个布尔条件')
            elif op == 'eq':
                if left.kind != right.kind:
                    raise ValidationError('相等比较需要同类型输入')
            elif left.kind != 'number' or right.kind != 'number':
                raise ValidationError('算术与大小比较需要数值输入')
            a, b = left.series, right.series
            valid = a.notna() & b.notna()
            with np.errstate(all='ignore'):
                output = {'add': lambda: a + b, 'sub': lambda: a - b, 'mul': lambda: a * b,
                    'div': lambda: a / b.where(b != 0), 'min': lambda: np.minimum(a, b), 'max': lambda: np.maximum(a, b),
                    'gt': lambda: a > b, 'lt': lambda: a < b, 'eq': lambda: a == b,
                    'and': lambda: (a == 1) & (b == 1), 'or': lambda: (a == 1) | (b == 1)}[op]()
            output = output.astype('float64').where(valid)
            if op in ('gt', 'lt', 'eq', 'and', 'or'):
                return Value('boolean', output)
        return Value('number', output.replace([np.inf, -np.inf], np.nan))
    computed = visit(expression)
    if computed.kind != ('number' if expected == 'numeric_series' else 'boolean'):
        raise ValidationError('表达式实际输出与候选声明类型不一致')
    guard()
    return [None if pd.isna(value) else bool(value) if computed.kind == 'boolean' else float(value) for value in computed.series]
