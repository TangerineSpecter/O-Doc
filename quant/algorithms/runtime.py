"""Standard-library-only causal algorithm runtime. No eval, exec, imports from input, or I/O.

Inputs are equal-length numeric arrays; steps run in source order on closed bars.
Pine-style na arithmetic propagates missing values, comparisons with na are false.
"""
import ast
from collections import deque
import math
import time

NA = float('nan')

def missing(value):
    return value is None or isinstance(value, float) and math.isnan(value)

def truth(value):
    return not missing(value) and bool(value)

class AlgorithmRuntime:
    def __init__(self, program, inputs, parameters, check=None, deadline=None):
        self.program, self.inputs, self.parameters = program, inputs, parameters
        self.check, self.deadline = check, deadline or time.monotonic() + 15
        self.env, self.state, self.history, self.streams, self.trees = {}, {}, {}, {}, {}
        self.index = 0

    def guard(self):
        if self.check: self.check()
        if time.monotonic() >= self.deadline: raise TimeoutError('算法计算超过时间预算')

    def value(self, text, path):
        if text not in self.trees: self.trees[text] = ast.parse(text, mode='eval').body
        return self.visit(self.trees[text], path)

    def visit(self, node, path):
        if isinstance(node, ast.Constant): return NA if node.value is None else node.value
        if isinstance(node, ast.Name): return NA if node.id == 'na' else self.env[node.id]
        if isinstance(node, ast.IfExp):
            branch = truth(self.visit(node.test, path + '/test'))
            return self.visit(node.body if branch else node.orelse, path + ('/yes' if branch else '/no'))
        if isinstance(node, ast.BoolOp):
            values = [truth(self.visit(item, path + f'/{i}')) for i, item in enumerate(node.values)]
            return all(values) if isinstance(node.op, ast.And) else any(values)
        if isinstance(node, ast.UnaryOp):
            value = self.visit(node.operand, path + '/arg')
            if isinstance(node.op, ast.Not): return not truth(value)
            return -value if isinstance(node.op, ast.USub) else value
        if isinstance(node, ast.BinOp):
            a, b = self.visit(node.left, path + '/a'), self.visit(node.right, path + '/b')
            if missing(a) or missing(b): return NA
            try:
                if isinstance(node.op, ast.Add): result = a + b
                elif isinstance(node.op, ast.Sub): result = a - b
                elif isinstance(node.op, ast.Mult): result = a * b
                elif isinstance(node.op, ast.Div): result = a / b
                elif isinstance(node.op, ast.Mod): result = a % b
                elif isinstance(node.op, ast.Pow): result = math.pow(a, b)
                else: raise ValueError('Unsupported arithmetic')
                return result if type(result) is bool or math.isfinite(result) else NA
            except (ZeroDivisionError, OverflowError, ValueError): return NA
        if isinstance(node, ast.Compare):
            values = [self.visit(node.left, path + '/left'), *[self.visit(item, path + f'/right/{i}') for i, item in enumerate(node.comparators)]]
            for i, op in enumerate(node.ops):
                a, b = values[i:i + 2]
                if missing(a) or missing(b): return False
                match = (a > b if isinstance(op, ast.Gt) else a >= b if isinstance(op, ast.GtE) else a < b if isinstance(op, ast.Lt)
                         else a <= b if isinstance(op, ast.LtE) else a == b if isinstance(op, ast.Eq) else a != b)
                if not match: return False
            return True
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            args = [self.visit(item, path + f'/arg/{i}') for i, item in enumerate(node.args)]
            return self.call(node.func.id, args, path)
        raise ValueError('Unsupported algorithm expression')

    def call(self, name, args, path):
        if name == 'is_na': return missing(args[0])
        if name == 'nz': return (args[1] if len(args) > 1 else 0.0) if missing(args[0]) else args[0]
        if name == 'history':
            variable, bars = args
            if type(bars) is not int or not 0 <= bars <= 2000: raise ValueError('Invalid history window')
            if bars == 0: return self.env.get(variable, NA)
            previous = self.history.get(variable, ())
            return previous[-bars] if len(previous) >= bars else NA
        if name in ('sma', 'rolling_sum', 'std', 'highest', 'lowest', 'ema', 'rma', 'rsi', 'crossover', 'crossunder'):
            cache = self.streams.setdefault(path, {'values': deque(maxlen=2000), 'last': NA, 'bar': -1})
            if cache['bar'] == self.index: return cache['result']
            cache['bar'] = self.index
            if name in ('crossover', 'crossunder'):
                a, b = args; previous = cache.get('pair', (NA, NA)); cache['pair'] = (a, b)
                result = (not any(missing(v) for v in (a, b, *previous)) and
                    (a > b and previous[0] <= previous[1] if name == 'crossover' else a < b and previous[0] >= previous[1]))
            else:
                value, window = args
                if type(window) is not int or not 1 <= window <= 2000: raise ValueError('Invalid rolling window')
                if name == 'rsi':
                    previous = cache.get('price', NA)
                    if not missing(value): cache['price'] = value
                    delta = value - previous
                    if missing(delta): result = NA
                    else:
                        gain, loss = max(delta, 0.0), max(-delta, 0.0)
                        cache.setdefault('gains', deque(maxlen=2000)).append(gain)
                        cache.setdefault('losses', deque(maxlen=2000)).append(loss)
                        if 'avg_gain' not in cache and len(cache['gains']) >= window:
                            cache['avg_gain'] = sum(list(cache['gains'])[-window:]) / window
                            cache['avg_loss'] = sum(list(cache['losses'])[-window:]) / window
                        elif 'avg_gain' in cache:
                            cache['avg_gain'] += (gain - cache['avg_gain']) / window
                            cache['avg_loss'] += (loss - cache['avg_loss']) / window
                        result = NA if 'avg_gain' not in cache else (100.0 if cache['avg_loss'] == 0 and cache['avg_gain'] > 0 else NA if cache['avg_loss'] == 0 else 100.0 - 100.0 / (1.0 + cache['avg_gain'] / cache['avg_loss']))
                elif name in ('ema', 'rma'):
                    if not missing(value): cache['values'].append(value)
                    if name == 'ema':
                        if not missing(value): cache['last'] = value if missing(cache['last']) else cache['last'] + 2.0 / (window + 1) * (value - cache['last'])
                    elif missing(cache['last']):
                        if len(cache['values']) >= window: cache['last'] = sum(list(cache['values'])[-window:]) / window
                    elif not missing(value): cache['last'] += (value - cache['last']) / window
                    result = cache['last']
                else:
                    cache['values'].append(value)
                    values = list(cache['values'])[-window:]
                    if len(values) < window or any(missing(v) for v in values): result = NA
                    elif name == 'rolling_sum': result = sum(values)
                    elif name == 'sma': result = sum(values) / window
                    elif name == 'highest': result = max(values)
                    elif name == 'lowest': result = min(values)
                    else:
                        mean = sum(values) / window
                        result = math.sqrt(sum((v - mean) ** 2 for v in values) / window)
            cache['result'] = result
            return result
        if any(missing(v) for v in args): return NA
        try:
            functions = {'abs': abs, 'sqrt': math.sqrt, 'pow': math.pow, 'min': min, 'max': max, 'log': math.log, 'exp': math.exp, 'int': int, 'float': float}
            result = functions[name](*args)
            return result if math.isfinite(result) else NA
        except (ZeroDivisionError, ValueError, OverflowError): return NA

    def steps(self, rows, path='steps'):
        for i, row in enumerate(rows):
            key = path + f'/{i}'
            if row['kind'] == 'if':
                branch = 'then' if truth(self.value(row['test'], key + '/test')) else 'else'
                self.steps(row[branch], key + '/' + branch)
            elif row['kind'] == 'initialize':
                if row['name'] not in self.state: self.state[row['name']] = self.value(row['value'], key)
                self.env[row['name']] = self.state[row['name']]
            else: self.env[row['name']] = self.value(row['value'], key)

    def run(self):
        if not self.inputs or len(self.inputs) > 20: raise ValueError('Inputs required')
        size = len(next(iter(self.inputs.values())))
        if not 2 <= size <= 20000 or any(not isinstance(v, list) or len(v) != size for v in self.inputs.values()): raise ValueError('Invalid input length')
        if any(v is not None and (type(v) not in (int, float) or not math.isfinite(v)) for values in self.inputs.values() for v in values): raise ValueError('Inputs must contain finite numbers or None')
        output = []
        for self.index in range(size):
            if self.index % 32 == 0: self.guard()
            self.env = {**self.parameters, **{name: NA if values[self.index] is None else values[self.index] for name, values in self.inputs.items()}}
            self.steps(self.program['steps'])
            value = self.value(self.program['output'], 'output')
            if not missing(value) and (self.program['output_type'] == 'boolean_series') != (type(value) is bool):
                raise ValueError('算法实际输出类型与声明不一致')
            output.append(None if missing(value) else bool(value) if self.program['output_type'] == 'boolean_series' else float(value))
            for name in self.state: self.state[name] = self.env[name]
            for name, value in self.env.items(): self.history.setdefault(name, deque(maxlen=2000)).append(value)
        self.guard()
        return output


def calculate_program(program, inputs, parameters, *, check=None, deadline=None):
    return AlgorithmRuntime(program, inputs, parameters, check, deadline).run()
