"""Standalone runtime included in exported Python candidates (standard library only)."""
import math
import statistics


def calculate(rows, parameters=None):
    """Chronological, closed OHLCV dictionaries -> values; None means unavailable."""
    if not isinstance(rows, list) or not 2 <= len(rows) <= 20000:
        raise ValueError('Provide 2–20000 chronological closed bars')
    params = dict(SPEC['parameters'])
    if parameters is not None:
        if not isinstance(parameters, dict) or set(parameters) - set(params):
            raise ValueError('Unknown parameter')
        for name, value in parameters.items():
            default = params[name]
            if (type(default) is str and type(value) is not str) or (type(default) is bool and type(value) is not bool) or (type(default) is int and type(value) is not int) or (type(default) is float and type(value) not in (int, float)):
                raise ValueError('Parameter type mismatch')
        params.update(parameters)
    if any(type(value) not in (bool, str) and (type(value) not in (int, float) or not math.isfinite(value)) for value in params.values()):
        raise ValueError('Non-finite parameter')
    for name, allowed in SPEC.get('string_choices', {}).items():
        if params[name] not in allowed:
            raise ValueError('Undeclared string choice: ' + name)
    def visit(node):
        op = node['op']
        if op == 'input':
            column = SPEC['bindings'][node['name']]
            values = [row[column] for row in rows]
            if any(value is not None and (type(value) not in (int, float) or not math.isfinite(value)) for value in values):
                raise ValueError('Input must be finite numeric or None')
            return values
        if op in ('constant', 'parameter'):
            return [node['value'] if op == 'constant' else params[node['name']]] * len(rows)
        left = visit(node['args'][0])
        if op in ('lag', 'sma', 'sum', 'std', 'highest', 'lowest', 'ts_rank'):
            window = node['args'][1]
            n = window['value'] if window['op'] == 'constant' else params[window['name']]
            if type(n) is not int or not 1 <= n <= 2000:
                raise ValueError('Window must be an integer in 1–2000')
            if op == 'lag':
                return [None] * min(n, len(rows)) + left[:max(0, len(rows) - n)]
            output = []
            for index in range(len(rows)):
                values = left[max(0, index-n+1):index+1]
                if len(values) != n or None in values:
                    output.append(None)
                    continue
                try:
                    value = {'sma': lambda: statistics.mean(values), 'sum': lambda: math.fsum(values),
                             'std': lambda: statistics.pstdev(values), 'highest': lambda: max(values), 'lowest': lambda: min(values),
                             'ts_rank': lambda: (sum(item < values[-1] for item in values) + .5 * sum(item == values[-1] for item in values)) / n}[op]()
                    output.append(value if math.isfinite(value) else None)
                except (OverflowError, ValueError):
                    output.append(None)
            return output
        right = visit(node['args'][1]) if len(node['args']) == 2 else [None] * len(rows)
        output = []
        for a, b in zip(left, right):
            if a is None or (len(node['args']) == 2 and b is None):
                output.append(None)
                continue
            if op == 'gate':
                output.append(a if b is True else None)
                continue
            try:
                value = {'abs': lambda: abs(a), 'neg': lambda: -a, 'log': lambda: math.log(a),
                         'add': lambda: a+b, 'sub': lambda: a-b, 'mul': lambda: a*b, 'div': lambda: a/b,
                         'min': lambda: min(a,b), 'max': lambda: max(a,b), 'gt': lambda: a>b, 'lt': lambda: a<b,
                         'eq': lambda: a==b, 'and': lambda: bool(a and b), 'or': lambda: bool(a or b)}[op]()
                output.append(value if math.isfinite(value) else None)
            except (ZeroDivisionError, ValueError, OverflowError):
                output.append(None)
        return output
    return visit(SPEC['expression'])
