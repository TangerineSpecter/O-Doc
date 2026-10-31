"""Human-readable calculations and standalone Python from one stored definition."""
import ast
import json
from pathlib import Path
from quant.algorithms.contract import expressions, expression as expression_tree


def program_text(program):
    lines = []
    def walk(steps, level=0):
        for row in steps:
            indent = '    ' * level
            if row['kind'] == 'if':
                lines.append(indent + 'if ' + row['test'] + ':'); walk(row['then'], level + 1)
                if not row['then']: lines.append(indent + '    pass')
                if row['else']: lines.append(indent + 'else:'); walk(row['else'], level + 1)
            else:
                if row['kind'] == 'initialize': lines.append(indent + '# 仅在首根初始化，随后跨 K 线保留')
                lines.append(indent + row['name'] + ' = ' + row['value'])
    walk(program['steps'])
    lines.append('return ' + program['output'])
    return '\n'.join(lines)


def python_export(data):
    if data['expression'].get('op') == 'python':
        from .python_definition import validate_python
        return validate_python(data['expression'])['code']
    runtime = Path(__file__).with_name('runtime.py').read_text(encoding='utf-8')
    defaults = {row['name']: json.loads(row['default_value']) for row in data['parameters'] if row['default_value'].strip()}
    readable = program_text(data['expression'])
    return ('# 从来源源码抽离的逐根算法。输入按时间升序；不包含订单、图形或文件访问。\n'
            '# 算法：' + ' '.join(data['name'].splitlines()) + '\n'
            '# 以下为计算步骤；其后附相同计算合同的标准库实现。\n' + '\n'.join('# ' + line for line in readable.splitlines()) + '\n\n'
            + runtime + '\n\nPROGRAM = ' + repr(data['expression']) + '\nDEFAULT_PARAMETERS = ' + repr(defaults)
            + '\n\ndef compute(inputs, parameters=None):\n'
              '    """Return one value per bar. inputs: {column: list}; parameters override source defaults."""\n'
              '    values = {**DEFAULT_PARAMETERS, **(parameters or {})}\n'
              '    required = ' + repr([row['name'] for row in data['parameters']]) + '\n'
              '    missing_parameters = [name for name in required if name not in values]\n'
              '    if missing_parameters: raise ValueError("Required parameters: " + ", ".join(missing_parameters))\n'
              '    return calculate_program(PROGRAM, inputs, values)\n')


def profile(data):
    expression = data.get('expression')
    if not expression: return None
    operations, states = set(), []
    if expression.get('op') == 'python':
        for node in ast.walk(ast.parse(expression['code'])):
            if isinstance(node, ast.Call): operations.add(ast.unparse(node.func))
            elif isinstance(node, ast.BinOp): operations.add(type(node.op).__name__.lower())
        output = 'compute'
    elif expression.get('op') == 'program':
        for text in expressions(expression['steps']):
            for node in ast.walk(expression_tree(text)):
                if isinstance(node, ast.Call): operations.add(node.func.id)
                elif isinstance(node, ast.BinOp): operations.add(type(node.op).__name__.lower())
        def collect(rows):
            for row in rows:
                if row['kind'] == 'initialize': states.append(row['name'])
                elif row['kind'] == 'if': collect(row['then']); collect(row['else'])
        collect(expression['steps'])
        output = expression['output']
    else:
        pending = [expression]
        while pending:
            node = pending.pop(); operations.add(node['op']); pending.extend(node.get('args', []))
        output = data['name']
    defaults = sum(bool(row['default_value'].strip()) for row in data['parameters'])
    return {'method': 'source-algorithm-properties-v1', 'family': data['family'], 'role': data['role'],
        'inputs': [row['name'] for row in data['inputs']], 'parameters': [row['name'] for row in data['parameters']],
        'operations': sorted(operations), 'states': states, 'output': output,
        'timeframe': data['timeframe'], 'market_scope': '价格序列通用计算' if all(row['name'].lower() in {'open', 'high', 'low', 'close', 'volume'} for row in data['inputs']) else '按声明数据输入计算',
        'definition_score': round(75 + 25 * defaults / max(1, len(data['parameters']))) if data['parameters'] else 100,
        'score_meaning': '算法定义完整度：输入与计算闭合75分，参数默认值完整度25分；不是收益评分。'}
