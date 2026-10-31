"""Translate numerical Pine declarations into the common ordered algorithm.

Only the dependency closure of the requested output is compiled. Plotting,
labels, orders and prose do not become numerical factors or fabricated inputs.
"""
import ast
import re
from .contract import references, validate_program

TOKEN = re.compile(r'\s*(?:(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+)|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)|("(?:\\.|[^"\\])*")|(:=|>=|<=|==|!=|[+*/%<>()\[\]?:,=-]))')
CALLS = {'math.pow': 'pow', 'math.sqrt': 'sqrt', 'math.abs': 'abs', 'math.max': 'max', 'math.min': 'min', 'math.log': 'log', 'math.exp': 'exp',
         'math.sum': 'rolling_sum', 'ta.sma': 'sma', 'ta.ema': 'ema', 'ta.rma': 'rma', 'ta.rsi': 'rsi', 'ta.stdev': 'std',
         'ta.highest': 'highest', 'ta.lowest': 'lowest', 'ta.crossover': 'crossover', 'ta.crossunder': 'crossunder', 'ta.macd': 'macd', 'na': 'is_na', 'nz': 'nz', 'int': 'int', 'float': 'float'}
PRECEDENCE = {'or': 1, 'and': 2, '==': 3, '!=': 3, '>': 4, '<': 4, '>=': 4, '<=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6}

class PineExpression:
    def __init__(self, text):
        self.tokens, self.index = [], 0
        position = 0
        while position < len(text):
            if not text[position:].strip(): break
            found = TOKEN.match(text, position)
            if not found: raise ValueError('不支持的 Pine 计算语法：' + text[position:position + 60])
            self.tokens.append(next(v for v in found.groups() if v is not None)); position = found.end()

    def peek(self): return self.tokens[self.index] if self.index < len(self.tokens) else ''
    def take(self, value=None):
        token = self.peek()
        if not token or value is not None and token != value: raise ValueError('Pine 计算式缺少 ' + str(value))
        self.index += 1
        return token

    def parse(self, minimum=0):
        token = self.take()
        if token in ('-', '+', 'not'):
            left = '(' + token + ' ' + self.parse(7) + ')'
        elif token == '(':
            left = '(' + self.parse() + ')'; self.take(')')
        elif token == 'true': left = 'True'
        elif token == 'false': left = 'False'
        elif re.fullmatch(r'\d.*|\.\d.*', token): left = token
        elif token.startswith('"'): left = token
        elif self.peek() == '(':
            if token not in CALLS: raise ValueError('计算依赖包含尚未转换的函数：' + token)
            self.take('('); args = []
            if self.peek() != ')':
                while True:
                    args.append(self.parse())
                    if self.peek() != ',': break
                    self.take(',')
            self.take(')'); left = CALLS[token] + '(' + ', '.join(args) + ')'
        elif re.fullmatch(r'[A-Za-z_]\w*', token): left = token
        else: raise ValueError('计算依赖包含尚未转换的符号：' + token)
        if self.peek() == '[':
            self.take('['); bars = self.parse(); self.take(']')
            if not re.fullmatch(r'[A-Za-z_]\w*', left): raise ValueError('历史索引须引用已命名的序列')
            left = 'history(' + repr(left) + ', ' + bars + ')'
        while self.peek() in PRECEDENCE and PRECEDENCE[self.peek()] >= minimum:
            op = self.take(); right = self.parse(PRECEDENCE[op] + 1)
            left = '(' + left + ' ' + op + ' ' + right + ')'
        if minimum == 0 and self.peek() == '?':
            self.take('?'); yes = self.parse(); self.take(':'); no = self.parse()
            left = '(' + yes + ' if ' + left + ' else ' + no + ')'
        return left


def convert(text):
    parser = PineExpression(text)
    result = parser.parse()
    if parser.peek(): raise ValueError('Pine 计算式未完整转换：' + parser.peek())
    # Normalise parentheses and expose conventional Python calculation notation.
    return ast.unparse(ast.parse(result, mode='eval').body)


def strip_comment(line):
    return re.split(r'//(?=(?:[^"\\]|\\.|"(?:\\.|[^"\\])*")*$)', line, maxsplit=1)[0].rstrip()


def parse_source(code, *, legacy=False):
    lines = [(len(line) - len(line.lstrip()), strip_comment(line).strip(), i + 1) for i, line in enumerate(code.splitlines())]
    parameters, input_sources, errors = {}, {}, {}
    for _, text, _ in lines:
        found = re.match(r'(\w+)\s*=\s*input(?:\.(int|float|bool|source))?\((.+)', text)
        if found:
            name, kind, default = found.groups()
            # Parse only the first argument; the closing input parenthesis and
            # UI keyword arguments are not part of the default expression.
            default = PineExpression(re.sub(r'^defval\s*=\s*', '', default)).parse()
            if kind is None:
                try: literal = ast.literal_eval(default)
                except (ValueError, SyntaxError): literal = None
                kind = 'bool' if type(literal) is bool else 'int' if type(literal) is int else 'float' if type(literal) is float else 'source'
            if kind == 'source': input_sources[name] = default
            else: parameters[name] = {'type': kind, 'default': default}
    known = set(parameters) | set(input_sources)
    # Discover all typed numerical declarations before parsing reassignments.
    known.update(match.group(1) for _, text, _ in lines if (match := re.match(r'(?:var\s+)?(?:float|int|bool)\s+(\w+)\s*=', text)))
    def block(start, indent):
        rows = []; index = start
        while index < len(lines):
            level, text, line = lines[index]
            if not text: index += 1; continue
            if level < indent: break
            if level > indent: index += 1; continue
            if text.startswith('else'): break
            if not legacy and re.match(r'(?:for|while)\b', text):
                # A loop can update an already-declared output. Preserve those
                # writes as unsupported dependencies instead of compiling only
                # the initializer. Unrelated outputs can still be translated.
                after = index + 1
                while after < len(lines) and (not lines[after][1] or lines[after][0] > level):
                    _, body, body_line = lines[after]
                    changed = re.match(r'(?:(?:var|float|int|bool)\s+)*(\w+)\s*(?::=|[+*/%\-]=|=(?!=))', body)
                    if changed:
                        name = changed.group(1)
                        errors[name] = f'第{body_line}行：输出依赖尚未支持的循环更新，请提供完整 Python 转换'
                        rows.append({'kind': 'assign', 'name': name, 'value': None, '_line': body_line, '_type': None})
                    after += 1
                index = after
                continue
            if text.startswith('if '):
                test = text[3:]
                following = index + 1
                while following < len(lines) and not lines[following][1]: following += 1
                child_indent = lines[following][0] if following < len(lines) and lines[following][0] > level else level + 1
                yes, after = block(index + 1, child_indent)
                no = []
                if after < len(lines) and lines[after][0] == level and lines[after][1].startswith('else'):
                    marker = lines[after][1]
                    if marker.startswith('else if '):
                        original = lines[after]; lines[after] = (level, marker[5:], original[2])
                        branch, after = block_one_if(after, level)
                        no = [branch]
                        lines[original[2] - 1] = original
                    else: no, after = block(after + 1, child_indent)
                if yes or no:
                    try: condition = convert(test)
                    except ValueError as exc: condition = None; errors['@if:' + str(line)] = str(exc)
                    rows.append({'kind': 'if', 'test': condition, 'then': yes, 'else': no, '_line': line})
                index = after; continue
            macd = re.match(r'\[\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*(ta\.macd\(.+\))$', text)
            if macd:
                a, b, c, rhs = macd.groups()
                args = ast.parse(convert(rhs), mode='eval').body.args
                if len(args) != 4: raise ValueError('MACD需要价格、快周期、慢周期和信号周期')
                price, fast, slow, signal = map(ast.unparse, args)
                prefix = f'__macd_{line}'
                for name, value in [(prefix+'_fast',f'ema({price}, {fast})'),(prefix+'_slow',f'ema({price}, {slow})'),
                                    (a,f'{prefix}_fast - {prefix}_slow'),(b,f'ema({a}, {signal})'),(c,f'{a} - {b}')]:
                    rows.append({'kind':'assign','name':name,'value':value,'_line':line,'_type':'float'})
                index += 1; continue
            row = assignment(text, line)
            if row: rows.append(row)
            index += 1
        return rows, index
    def block_one_if(index, level):
        # Bound parsing to this single if/else chain rather than later peers.
        end = index + 1
        while end < len(lines) and (not lines[end][1] or lines[end][0] > level or lines[end][0] == level and lines[end][1].startswith('else')): end += 1
        sentinel = lines[end] if end < len(lines) else None
        if sentinel: lines[end] = (-1, sentinel[1], sentinel[2])
        rows, after = block(index, level)
        if sentinel: lines[end] = sentinel
        return rows[0], after
    def assignment(text, line):
        if not legacy:
            changed = re.match(r'(\w+)\s*([+*/%\-]=)', text)
            if changed:
                name = changed.group(1)
                errors[name] = f'第{line}行：尚未支持复合赋值，请提供完整 Python 转换'
                return {'kind': 'assign', 'name': name, 'value': None, '_line': line, '_type': None}
        found = re.match(r'(?:(var)\s+)?(?:(float|int|bool)\s+)?(\w+)\s*(:=|=)\s*(.+)$', text)
        if not found: return None
        state, kind, name, operator, rhs = found.groups()
        if name in parameters or name in input_sources: return None
        try: value = convert(rhs)
        except ValueError as exc: value = None; errors[name] = f'第{line}行：{exc}'
        return {'kind': 'initialize' if state else 'assign', 'name': name, 'value': value, '_line': line, '_type': kind}
    steps, _ = block(0, 0)
    for name, rhs in reversed(list(input_sources.items())):
        steps.insert(0, {'kind': 'assign', 'name': name, 'value': rhs, '_line': 0, '_type': 'float'})
    for name, formula in reversed(list({'hl2': '(high + low) / 2', 'hlc3': '(high + low + close) / 3', 'ohlc4': '(open + high + low + close) / 4', 'hlcc4': '(high + low + close * 2) / 4'}.items())):
        if name not in known: steps.insert(0, {'kind': 'assign', 'name': name, 'value': formula, '_line': 0, '_type': 'float'})
    return steps, parameters, errors


def compile_output(code, target, output_type='numeric_series'):
    steps, parameters, errors = parse_source(code)
    return compile_parsed(steps, parameters, errors, target, output_type)


def compile_parsed(steps, parameters, errors, target, output_type):
    """Compile a selected output; share parsing when inventorying one source."""
    records = {}
    def collect(rows, conditions=()):
        for row in rows:
            if row['kind'] == 'if': collect(row['then'], (*conditions, row['test'])); collect(row['else'], (*conditions, row['test']))
            else: records.setdefault(row['name'], []).append((row, conditions))
    collect(steps)
    if target not in records: raise ValueError('源码中没有可提取的数值或条件输出：' + target)
    declared_types = {row.get('_type') for row, _ in records[target]} - {None}
    if declared_types and (('bool' in declared_types) != (output_type == 'boolean_series')):
        raise ValueError('输出类型须与源码数值/布尔声明一致')
    needed, pending = set(), [target]
    while pending:
        name = pending.pop()
        if name in needed: continue
        needed.add(name)
        for row, conditions in records.get(name, []):
            if row['value'] is None: raise ValueError(errors.get(name, '计算式无法转换'))
            if any(condition is None for condition in conditions): raise ValueError('输出依赖的条件分支尚未转换')
            for text in (row['value'], *conditions): pending.extend(references(text) - needed)
    def select(rows):
        result = []
        for row in rows:
            if row['kind'] == 'if':
                yes, no = select(row['then']), select(row['else'])
                if yes or no: result.append({'kind': 'if', 'test': row['test'], 'then': yes, 'else': no})
            elif row['name'] in needed: result.append({key: row[key] for key in ('kind', 'name', 'value')})
        return result
    externals = needed - records.keys() - parameters.keys()
    unknown = externals - {'open', 'high', 'low', 'close', 'volume'}
    if unknown: raise ValueError('源码依赖未提供实现：' + '、'.join(sorted(unknown)))
    selected_parameters = {name: row for name, row in parameters.items() if name in needed}
    program = {'op': 'program', 'version': 1, 'steps': select(steps), 'output': target, 'output_type': output_type}
    validate_program(program, set(externals), set(selected_parameters))
    return program, sorted(externals), selected_parameters
