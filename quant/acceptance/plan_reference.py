"""Independent Decimal oracle for the captured Python SMA plan only.

Not a product executor: unsupported nodes fail rather than delegating to the
product calculator. No uploaded Python, source eval, or native platform calls.
"""
from decimal import Decimal, localcontext
import math


def signals(recipe, rows):
    size = len(rows)

    def visit(node):
        op = node['op']
        if op == 'input':
            column = recipe['bindings'][node['name']]
            return [Decimal(str(row[column])) for row in rows]
        if op == 'parameter':
            return Decimal(str(recipe['parameters'][node['name']]))
        if op == 'constant':
            return Decimal(str(node['value']))
        if op == 'sma':
            values, window = (visit(child) for child in node['args'])
            if not isinstance(values, list) or isinstance(window, list) or window != int(window) or not 1 <= window <= 2000:
                raise ValueError('Reference only supports a fixed positive integer SMA window')
            length = int(window)
            return [None if index+1 < length or any(v is None for v in values[index+1-length:index+1])
                    else sum(values[index+1-length:index+1])/length for index in range(size)]
        if op not in ('add','sub','mul','div'):
            raise ValueError(f'Unimplemented reference node: {op}')
        a, b = (visit(child) for child in node['args'])
        left = a if isinstance(a, list) else [a]*size
        right = b if isinstance(b, list) else [b]*size
        def binary(x, y):
            if x is None or y is None or op == 'div' and y == 0:
                return None
            return x+y if op == 'add' else x-y if op == 'sub' else x*y if op == 'mul' else x/y
        return [binary(x,y) for x,y in zip(left,right)]

    with localcontext() as context:
        context.prec = 45
        result = visit(recipe['expression'])
        if not isinstance(result, list) or len(result) != size:
            raise ValueError('Reference requires one causal signal per row')
        return result


def ledger(rows, values, start, end, *, baseline=False):
    with localcontext() as context:
        context.prec = 45
        one, cost = Decimal(1), Decimal('0.001')
        balance = peak = one
        drawdown = Decimal(0)
        held = entries = turnover = exposure = missing = 0
        returns, curve = [], [{'timestamp':rows[start]['timestamp'],'equity':1.0}]
        for index in range(start, end):
            signal = values[index-1]
            missing += int(signal is None)
            target = int(baseline or signal is not None and signal > 0)
            change = abs(target-held)
            entries += int(target > held)
            turnover += change
            exposure += target
            before = balance
            balance *= one-cost*change
            if target:
                balance *= Decimal(str(rows[index+1]['open']))/Decimal(str(rows[index]['open']))
            if index+1 == end:
                balance *= one-cost*target
                turnover += target
            peak = max(peak,balance)
            drawdown = max(drawdown,one-balance/peak)
            returns.append(float(balance/before-one))
            curve.append({'timestamp':rows[index+1]['timestamp'],'equity':float(balance)})
            held = target
        return {'total_return':float(balance-one),'max_drawdown':float(drawdown),'entries':entries,
                'turnover':turnover,'exposure_fraction':exposure/(end-start),'missing_signals':missing,
                'bars':end-start,'start':rows[start]['timestamp'],'end':rows[end]['timestamp'],
                'curve':curve,'returns':returns}


def check_metrics(actual, expected, *, paths=False):
    def close(observed, wanted):
        if type(observed) not in (int,float) or not math.isfinite(observed) or not math.isfinite(wanted) or abs(observed-wanted) > 2e-11:
            raise AssertionError('Decimal reference mismatch or nonfinite result')
    for key, wanted in expected.items():
        if key in ('curve','returns'):
            if not paths:
                continue
            if len(actual[key]) != len(wanted):
                raise AssertionError(f'{key} length mismatch')
            for observed, reference in zip(actual[key], wanted):
                if key == 'curve':
                    if observed['timestamp'] != reference['timestamp']:
                        raise AssertionError('Curve timestamp mismatch')
                    observed, reference = observed['equity'], reference['equity']
                close(observed, reference)
        elif isinstance(wanted, float):
            close(actual[key], wanted)
        elif actual[key] != wanted:
            raise AssertionError(f'{key} reference mismatch')
