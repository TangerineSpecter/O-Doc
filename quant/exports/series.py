"""Emit explicit value/validity series, preserving full-window missing propagation."""
from quant.factors.expression import ROLLING
from .ranking import PINE_HELPER, tdx_rank
from .categories import literal, text_node


def flatten(node):
    nodes = []
    def visit(value):
        args = [visit(child) for child in value.get('args', [])]
        nodes.append((value, args))
        return len(nodes) - 1
    visit(node)
    return nodes


def scalar(node, parameters):
    if node['op'] == 'parameter':
        return node['name']
    value = node['value']
    return literal(value) if isinstance(value, str) else str(int(value) if type(value) is bool else value)


def emit(spec: dict, target: str) -> str:
    pine = target == 'pine'
    lines = ['//@version=6', 'indicator("O-Doc candidate (unverified)", overlay=false, max_bars_back=5000)'] if pine else ['{ O-Doc candidate; platform compilation and equivalence pending. }']
    for name, value in spec['parameters'].items():
        if pine:
            kind = 'string' if isinstance(value, str) else 'bool' if type(value) is bool else 'int' if type(value) is int else 'float'
            limit = ', minval=1, maxval=2000' if name in spec['windows'] else ''
            if kind == 'string': limit = ', options=' + literal(spec['string_choices'][name])
            lines.append(f'{name} = input.{kind}({literal(value)}, "{name}"{limit})')
        else:
            lines.append(f'{name.upper()}:={int(value) if type(value) is bool else value};')
    if not pine and spec.get('category_choices'):
        lines.append('{ Text choices use integer codes. See categorical_encoding in the manifest; codes are not ordered quantities. }')
        checks = ['(' + ' OR '.join(f'{name}={code}' for code in values) + ')' for name, values in spec['category_choices'].items()]
        lines.append('QCAT:=' + ' AND '.join(checks) + ';')
    nodes = flatten(spec['expression'])
    if pine and any(node['op'] == 'ts_rank' for node, _ in nodes):
        lines.append(PINE_HELPER)
    for index, (node, args) in enumerate(nodes):
        op = node['op']; valid = 'true' if pine else '1'
        a = f'v{args[0]}' if args else ''; qa = f'q{args[0]}' if args else ''
        b = f'v{args[1]}' if len(args) > 1 else ''; qb = f'q{args[1]}' if len(args) > 1 else ''
        if op == 'input':
            value = spec['bindings'][node['name']]
            if pine: valid = f'not na({value})'
            else: value = 'VOL' if value == 'volume' else value.upper()
        elif op in ('constant', 'parameter'):
            value = scalar(node, spec['parameters'])
            if op == 'parameter' and type(spec['parameters'][value]) is bool and pine:
                value = f'({value} ? 1.0 : 0.0)'
        elif op in ROLLING:
            n = scalar(node['args'][1], spec['parameters'])
            if op == 'lag':
                value = f'{a}[{n}]' if pine else f'REF({a},{n})'
                valid = f'bar_index >= {n} and {qa}[{n}]' if pine else f'BARSCOUNT(CLOSE)>{n} AND REF({qa},{n})'
            elif op == 'ts_rank':
                if pine:
                    value = f'qRank({a},{qa},{n})'
                else:
                    value = tdx_rank(lines, index, a, n, node['args'][1])
                    valid = f'{n}>=1 AND {n}<=2000 AND BARSCOUNT(CLOSE)>={n} AND COUNT({qa},{n})={n}'
            else:
                fn = {'sma': 'ta.sma' if pine else 'MA', 'sum': 'math.sum' if pine else 'SUM', 'std': 'ta.stdev' if pine else 'STDP', 'highest': 'ta.highest' if pine else 'HHV', 'lowest': 'ta.lowest' if pine else 'LLV'}[op]
                value = f'{fn}({a},{n}' + (',true)' if pine and op == 'std' else ')')
                if pine:
                    lines.append(f'float c{index} = math.sum({qa} ? 1.0 : 0.0,{n})')
                valid = f'bar_index >= {n}-1 and c{index} == {n}' if pine else f'BARSCOUNT(CLOSE)>={n} AND COUNT({qa},{n})={n}'
        elif op == 'gate':
            value = a
            valid = f'{qa} and {qb} and {b} == 1' if pine else f'{qa} AND {qb} AND {b}=1'
        elif op in ('abs', 'neg', 'log'):
            value = f'-{a}' if op == 'neg' else f'{("math.abs" if pine else "ABS") if op == "abs" else ("math.log" if pine else "LN")}({a})'
            valid = qa + (f' {"and" if pine else "AND"} {a}>0' if op == 'log' else '')
        else:
            valid = f'{qa} {"and" if pine else "AND"} {qb}'
            symbols = {'add': '+', 'sub': '-', 'mul': '*', 'div': '/', 'gt': '>', 'lt': '<', 'eq': '==' if pine else '=', 'and': 'and' if pine else 'AND', 'or': 'or' if pine else 'OR'}
            if op in ('min', 'max'):
                value = f'{"math." + op if pine else op.upper()}({a},{b})'
            elif op in ('and', 'or'):
                value = f'({a}==1 {symbols[op]} {b}==1)' if pine else f'({a}=1 {symbols[op]} {b}=1)'
            else: value = f'({a}{symbols[op]}{b})'
            if op in ('gt', 'lt', 'eq', 'and', 'or') and pine: value = f'({value} ? 1.0 : 0.0)'
            if op == 'div': valid += f' {"and" if pine else "AND"} {b}!=0' if pine else f' AND {b}<>0'
            if op == 'div' and not pine: value = f'({a}/IF({b}<>0,{b},1))'
        if op == 'log' and not pine: value = f'LN(IF({a}>0,{a},1))'
        if pine:
            if text_node(node, spec['parameters']):
                lines += [f'string v{index} = {value}', f'bool q{index} = true']
                continue
            # Evaluate rolling functions every bar, outside a conditional branch.
            lines += [f'float r{index} = {value}', f'bool q{index} = ({valid}) and not na(r{index})', f'float v{index} = q{index} ? r{index} : 0.0']
        else:
            lines += [f'q{index}:={valid};', f'v{index}:=IF(q{index},{value},0);']
    last = len(nodes) - 1
    category_guard = ' AND QCAT' if spec.get('category_choices') else ''
    lines.append(f'plot(barstate.isconfirmed and q{last} ? v{last} : na, "Factor")' if pine else f'FACTOR:IF(q{last}{category_guard} AND NOT(ISLASTBAR),v{last},DRAWNULL);')
    return '\n'.join(lines) + '\n'
