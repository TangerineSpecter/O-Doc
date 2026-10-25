"""Version-1 pure static policy. This policy performs no data calculation."""
import json
from rest_framework.exceptions import ValidationError
from quant.factors.expression import validate_expression, ROLLING, parameter_value
from quant.parameters.domains import kind as parameter_kind
from quant.research.contracts import digest

VERSION = 1


def qualification(data: dict) -> dict:
    checks, nodes, blockers = [], [], []
    used_inputs, used_parameters = set(), set()
    parameters = {row['name']: row for row in data['parameters']}
    inputs = {row['name']: row for row in data['inputs']}
    expression = data.get('expression')
    def check(code, status, message):
        checks.append({'code': code, 'status': status, 'message': message})
        if status != 'passed': blockers.append(code)
    if expression is None:
        check('expression', 'missing', '尚无受控表达式；保留原平台片段，需要补齐计算语义后才能检查引用和类型。')
    else:
        try:
            validate_expression(expression, set(inputs), set(parameters))
            def references(node):
                if node['op'] == 'input': used_inputs.add(node['name'])
                if node['op'] == 'parameter': used_parameters.add(node['name'])
                for child in node.get('args', []): references(child)
            references(expression)
            check('references', 'passed', '表达式输入、参数引用均有声明；内嵌树无外部执行或未声明函数调用。')
            def visit(node, path='root'):
                op = node['op']
                children = [visit(child, path + '.' + str(i)) for i, child in enumerate(node.get('args', []))]
                kind = 'number'
                if op == 'parameter':
                    category = parameter_kind(parameters[node['name']])
                    if not category: raise ValueError(path + '：参数类型未识别')
                    if category == 'string' and (parameters[node['name']].get('domain', {}).get('version') not in (3, 4)
                            or not parameters[node['name']].get('domain', {}).get('choices')):
                        raise ValueError(path + '：字符串参数缺少声明式枚举约束')
                    kind = 'boolean' if category == 'bool' else 'string' if category == 'string' else 'number'
                elif op == 'constant': kind = 'string' if isinstance(node['value'], str) else 'number'
                elif op in ROLLING:
                    window = node['args'][1]
                    if window['op'] == 'constant' and window['value'] > 2000:
                        raise ValueError(path + '：窗口超过本机受控引擎的 2000 根上限')
                    if window['op'] == 'parameter' and parameter_kind(parameters[window['name']]) != 'int':
                        raise ValueError(path + '：窗口参数须明确声明为整数')
                    if children[0] == 'string' or op != 'lag' and children[0] != 'number':
                        raise ValueError(path + '：窗口输入类型不满足算子要求')
                    kind = children[0] if op == 'lag' else 'number'
                elif op == 'gate':
                    if children[1] != 'boolean' or children[0] == 'string': raise ValueError(path + '：门控需要布尔条件及数值/布尔输出')
                    kind = children[0]
                elif op in ('and', 'or'):
                    if children != ['boolean', 'boolean']: raise ValueError(path + '：逻辑算子需要两个布尔条件')
                    kind = 'boolean'
                elif op == 'eq':
                    if children[0] != children[1]: raise ValueError(path + '：相等比较需要相同类型')
                    kind = 'boolean'
                elif op not in ('input', 'constant', 'parameter'):
                    if any(value != 'number' for value in children): raise ValueError(path + '：数值算子收到非数值输入')
                    kind = 'boolean' if op in ('gt', 'lt') else 'number'
                nodes.append({'id': path, 'op': op, 'name': node.get('name', ''), 'kind': kind,
                    'dependencies': [path + '.' + str(i) for i in range(len(children))]})
                return kind
            output_kind = visit(expression)
            expected = {'numeric_series': 'number', 'boolean_series': 'boolean'}.get(data['output_type'])
            if not expected or output_kind != expected: raise ValueError('root：声明输出与表达式实际类型不一致，或尚不支持该输出形式')
            check('types', 'passed', '数值、布尔、字符串比较、窗口及声明输出类型一致；检查不运行源码。')
        except (ValidationError, ValueError, TypeError, KeyError) as exc:
            check('types' if checks else 'references', 'blocked', str(exc)[:1000])
            nodes = []
    defaults, unknown = {}, []
    for name, row in parameters.items():
        try:
            if not row['default_value'].strip(): raise ValueError('missing')
            defaults[name] = json.loads(row['default_value'])
        except (ValueError, TypeError): unknown.append(name)
    configuration = {'status': 'needs_values', 'missing': unknown}
    if not unknown:
        try:
            from quant.parameters.domains import validate_values
            validate_values(data['parameters'], defaults)
            for name, row in parameters.items():
                kind, value = parameter_kind(row), defaults[name]
                if (not parameter_value(value) or not kind or kind == 'int' and type(value) is not int
                        or kind == 'bool' and type(value) is not bool or kind == 'string' and not isinstance(value, str)
                        or kind == 'number' and type(value) not in (int, float)):
                    raise ValueError('default type')
            if expression is not None:
                from quant.experiments.proposal_contract import validate_values as validate_defaults
                validate_defaults(data, defaults)
            configuration = {'status': 'declared_defaults_valid', 'missing': []}
        except (ValidationError, ValueError, TypeError, KeyError):
            configuration = {'status': 'invalid_declared_defaults', 'missing': []}
    unbound = [name for name in inputs if name.lower() not in {'open', 'high', 'low', 'close', 'volume'}]
    return {'version': VERSION, 'candidate_hash': digest(data), 'scope': 'portable_expression_declared_contract_only',
        'reuse_status': 'reusable' if not blockers else 'candidate', 'checks': checks, 'blockers': blockers, 'nodes': nodes,
        'configuration': configuration, 'automatic_ohlcv_mapping': not unbound, 'inputs_requiring_mapping': unbound,
        'automatic_experiment_ready': not blockers and not unbound and configuration['status'] == 'declared_defaults_valid' and data['role'] in ('factor', 'signal', 'filter'),
        'inputs': [{'name': name, 'used': name in used_inputs, 'availability': row['availability'],
            'missing_policy': row['missing_policy']} for name, row in inputs.items()],
        'parameters': [{'name': name, 'used': name in used_parameters, 'kind': parameter_kind(row) or 'unknown'} for name, row in parameters.items()],
        'external_dependencies': [{'name': name, 'status': 'declared_unverified_original_context'} for name in data['dependencies']],
        'platform_equivalence': 'unverified', 'economic_effectiveness': 'unassessed'}
