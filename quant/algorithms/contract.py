"""A small ordered program, not uploaded Python execution.

Expressions use Python notation, validated and interpreted as an allowlisted AST.
This supports recursive indicators without treating their internal state as data.
"""
import ast
from functools import lru_cache
import math
import re
from rest_framework.exceptions import ValidationError

FUNCTIONS = {'abs', 'sqrt', 'pow', 'min', 'max', 'log', 'exp', 'is_na', 'nz', 'int', 'float',
             'history', 'sma', 'rolling_sum', 'std', 'highest', 'lowest', 'ema', 'rma', 'rsi', 'crossover', 'crossunder'}
WINDOWS = {'sma', 'rolling_sum', 'std', 'highest', 'lowest', 'ema', 'rma', 'rsi'}
IDENTIFIER = re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,79}$')
MAX_STEPS, MAX_AST, MAX_WINDOW = 256, 4096, 2000

@lru_cache(maxsize=4096)
def expression(text):
    if not isinstance(text, str) or not text.strip() or len(text) > 6000:
        raise ValidationError('算法表达式须为非空的有界 Python 计算式')
    try:
        node = ast.parse(text, mode='eval').body
    except (SyntaxError, ValueError, RecursionError) as exc:
        raise ValidationError('算法计算式语法无效') from exc
    allowed = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare, ast.IfExp, ast.Call,
               ast.Name, ast.Load, ast.Constant, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow,
               ast.USub, ast.UAdd, ast.Not, ast.And, ast.Or, ast.Gt, ast.GtE, ast.Lt, ast.LtE, ast.Eq, ast.NotEq)
    nodes = list(ast.walk(node))
    if len(nodes) > 512:
        raise ValidationError('算法单步表达式过大')
    for item in nodes:
        if not isinstance(item, allowed):
            raise ValidationError('算法只接受数值计算、条件和标准时序函数，不接受脚本、属性访问或导入')
        if isinstance(item, ast.Name) and not IDENTIFIER.fullmatch(item.id):
            raise ValidationError('算法变量名无效')
        if isinstance(item, ast.Constant) and not (item.value is None or type(item.value) is bool
                or type(item.value) in (int, float) and math.isfinite(item.value)
                or isinstance(item.value, str) and IDENTIFIER.fullmatch(item.value)):
            raise ValidationError('算法常量只允许有限数值、布尔、空值或历史变量名')
        if isinstance(item, ast.Call):
            if not isinstance(item.func, ast.Name) or item.func.id not in FUNCTIONS or item.keywords:
                raise ValidationError('算法调用必须属于统一计算函数')
            arity = {'history': (2,), 'nz': (1, 2), 'min': (2,), 'max': (2,), 'pow': (2,),
                     **{name: (2,) for name in WINDOWS | {'crossover', 'crossunder'}}}.get(item.func.id, (1,))
            if len(item.args) not in arity:
                raise ValidationError('算法函数参数数量无效')
            if item.func.id == 'history' and (not isinstance(item.args[0], ast.Constant) or not isinstance(item.args[0].value, str)):
                raise ValidationError('历史引用须明确指定变量名')
    return node


def references(text):
    node = expression(text)
    names = {item.id for item in ast.walk(node) if isinstance(item, ast.Name)} - FUNCTIONS - {'na'}
    names.update(item.args[0].value for item in ast.walk(node)
                 if isinstance(item, ast.Call) and item.func.id == 'history')
    return names


def expressions(steps):
    for row in steps:
        if row['kind'] == 'if':
            yield row['test']
            yield from expressions(row['then'])
            yield from expressions(row['else'])
        else:
            yield row['value']


def validate_program(program, inputs, parameters):
    if not isinstance(program, dict) or set(program) != {'op', 'version', 'steps', 'output', 'output_type'} or program.get('op') != 'program' or type(program.get('version')) is not int or program['version'] != 1:
        raise ValidationError('统一算法格式无效')
    if program['output_type'] not in ('numeric_series', 'boolean_series'):
        raise ValidationError('算法须输出数值或条件序列')
    count = [0]
    declared = set(inputs) | set(parameters)
    def walk(steps, depth=0):
        if not isinstance(steps, list) or depth > 12:
            raise ValidationError('算法步骤或条件层级无效')
        for row in steps:
            count[0] += 1
            if count[0] > MAX_STEPS or not isinstance(row, dict):
                raise ValidationError('算法步骤超过上限')
            if row.get('kind') == 'if' and set(row) == {'kind', 'test', 'then', 'else'}:
                expression(row['test']); walk(row['then'], depth + 1); walk(row['else'], depth + 1)
            elif row.get('kind') in ('assign', 'initialize') and set(row) == {'kind', 'name', 'value'}:
                if not isinstance(row['name'], str) or not IDENTIFIER.fullmatch(row['name']) or row['name'] in declared & (set(inputs) | set(parameters)) or row['name'] in FUNCTIONS | {'na'}:
                    raise ValidationError('算法不能覆盖数据输入、参数或标准函数')
                declared.add(row['name']); expression(row['value'])
            else:
                raise ValidationError('算法只支持初始化、顺序赋值和条件分支')
    walk(program['steps'])
    expression(program['output'])
    texts = [*expressions(program['steps']), program['output']]
    if sum(len(list(ast.walk(expression(text)))) for text in texts) > MAX_AST:
        raise ValidationError('算法计算节点超过上限')
    for text in texts:
        if references(text) - declared:
            raise ValidationError('算法引用未声明变量：' + '、'.join(sorted(references(text) - declared)))
    # Definite assignment excludes history(name, n): it intentionally reads prior bars.
    def current_refs(text):
        node = expression(text)
        return {item.id for item in ast.walk(node) if isinstance(item, ast.Name)} - FUNCTIONS - {'na'}
    def assigned(steps, known):
        known = set(known)
        for row in steps:
            text = row['test'] if row['kind'] == 'if' else row['value']
            if current_refs(text) - known:
                raise ValidationError('算法在赋值前读取变量：' + '、'.join(sorted(current_refs(text) - known)))
            if row['kind'] == 'if':
                known |= assigned(row['then'], known) & assigned(row['else'], known)
            else: known.add(row['name'])
        return known
    known = assigned(program['steps'], set(inputs) | set(parameters))
    if current_refs(program['output']) - known:
        raise ValidationError('算法输出未在所有分支中定义')
    validate_types(program, set(inputs), set(parameters))
    validate_windows(program, {})
    return program


def validate_types(program, inputs, parameters):
    types = {**{name: 'number' for name in inputs}, **{name: 'unknown' for name in parameters}}
    def infer(node):
        if isinstance(node, ast.Constant):
            return 'missing' if node.value is None else 'boolean' if type(node.value) is bool else 'string' if isinstance(node.value, str) else 'number'
        if isinstance(node, ast.Name): return 'missing' if node.id == 'na' else types.get(node.id, 'unknown')
        if isinstance(node, ast.IfExp):
            infer(node.test); a, b = infer(node.body), infer(node.orelse)
            if a == 'missing': return b
            if b == 'missing': return a
            if a != b and 'unknown' not in (a,b): raise ValidationError('算法条件分支输出类型不一致')
            return a if a == b else 'unknown'
        if isinstance(node, ast.Call):
            if node.func.id == 'history': return types.get(node.args[0].value, 'unknown')
            args = [infer(arg) for arg in node.args]
            if node.func.id in ('is_na','crossover','crossunder'): return 'boolean'
            if node.func.id == 'nz': return next((kind for kind in args if kind != 'missing'), 'number')
            if node.func.id not in ('int','float') and any(kind in ('boolean','string') for kind in args): raise ValidationError('数值计算函数不能直接接收布尔或字符串')
            return 'number'
        if isinstance(node, ast.Compare):
            kinds = [infer(node.left), *[infer(item) for item in node.comparators]]
            if any(kind == 'string' for kind in kinds): raise ValidationError('算法比较须使用数值或布尔')
            return 'boolean'
        if isinstance(node, ast.BoolOp):
            if any(infer(item) in ('number','string') for item in node.values): raise ValidationError('算法逻辑组合需要条件值')
            return 'boolean'
        if isinstance(node, ast.UnaryOp):
            kind = infer(node.operand)
            if isinstance(node.op, ast.Not): return 'boolean'
            if kind in ('boolean','string'): raise ValidationError('算法数值计算收到非数值')
            return 'number'
        if isinstance(node, ast.BinOp):
            if any(infer(item) in ('boolean','string') for item in (node.left,node.right)): raise ValidationError('算法算术收到非数值')
            return 'number'
        return 'unknown'
    def steps(rows):
        for row in rows:
            if row['kind'] == 'if':
                infer(expression(row['test'])); steps(row['then']); steps(row['else'])
            else: types[row['name']] = infer(expression(row['value']))
    steps(program['steps'])
    actual = infer(expression(program['output']))
    expected = 'boolean' if program['output_type'] == 'boolean_series' else 'number'
    if actual not in (expected,'unknown','missing'): raise ValidationError('算法实际输出类型与声明不一致')


def validate_windows(program, parameters):
    """Check known window constants/defaults; data-dependent values are bounded again at runtime."""
    values = dict(parameters)
    def scalar(node):
        if isinstance(node, ast.Constant): return node.value
        if isinstance(node, ast.Name): return values[node.id]
        if isinstance(node, ast.UnaryOp):
            value = scalar(node.operand)
            return -value if isinstance(node.op, ast.USub) else +value if isinstance(node.op, ast.UAdd) else not value
        if isinstance(node, ast.BinOp):
            a, b = scalar(node.left), scalar(node.right)
            if isinstance(node.op, ast.Add): return a+b
            if isinstance(node.op, ast.Sub): return a-b
            if isinstance(node.op, ast.Mult): return a*b
            if isinstance(node.op, ast.Div): return a/b
            if isinstance(node.op, ast.Mod): return a%b
            if isinstance(node.op, ast.Pow): return math.pow(a,b)
        if isinstance(node, ast.Call) and node.func.id in ('min','max','int','float','abs'):
            function = {'min':min,'max':max,'int':int,'float':float,'abs':abs}[node.func.id]
            return function(*[scalar(arg) for arg in node.args])
        raise KeyError('not a known scalar')
    def check(text):
        for node in ast.walk(expression(text)):
            if isinstance(node, ast.Call) and node.func.id in WINDOWS | {'history'}:
                try: value = scalar(node.args[1])
                except KeyError: continue
                except (ValueError, TypeError, ArithmeticError) as exc: raise ValidationError('时序窗口计算无效') from exc
                if type(value) is not int or not (0 if node.func.id == 'history' else 1) <= value <= MAX_WINDOW:
                    raise ValidationError('时序函数窗口须为0/1–2000范围内的整数；历史引用不能指向未来')
    def walk(rows):
        for row in rows:
            text = row['test'] if row['kind'] == 'if' else row['value']
            check(text)
            if row['kind'] == 'if':
                # Branch-dependent declarations are checked at execution time.
                before = dict(values); walk(row['then']); values.clear(); values.update(before)
                walk(row['else']); values.clear(); values.update(before)
            else:
                try: values[row['name']] = scalar(expression(row['value']))
                except (KeyError, ValueError, TypeError, ArithmeticError): values.pop(row['name'], None)
    walk(program['steps']); check(program['output'])
