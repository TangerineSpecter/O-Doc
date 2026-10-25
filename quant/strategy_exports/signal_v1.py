"""Frozen EA-v1 expression compiler; old archived code must rebuild byte-for-byte."""
from quant.factors.expression import ROLLING
from quant.exports.series import flatten, scalar
from quant.exports.categories import literal, text_node

HELPERS = '\nbool QValid(double x) { return MathIsValidNumber(x) && x != EMPTY_VALUE; }\ndouble QRoll(const double &a[], int i, int n, int kind) {\n    if(n<1 || n>2000 || i<n-1) return EMPTY_VALUE;\n    double sum=0, lo=a[i], hi=a[i];\n    for(int k=i-n+1;k<=i;k++) { if(!QValid(a[k])) return EMPTY_VALUE; sum+=a[k]; lo=MathMin(lo,a[k]); hi=MathMax(hi,a[k]); }\n    if(kind==0) return sum/n;\n    if(kind==1) return sum;\n    if(kind==3) return hi;\n    if(kind==4) return lo;\n    double mean=sum/n, sq=0;\n    for(int k=i-n+1;k<=i;k++) sq+=(a[k]-mean)*(a[k]-mean);\n    return MathSqrt(sq/n);\n}\n'
MQL_HELPER = 'double QRank(const double &a[], int i, int n) {\n    if(n<1 || n>2000 || i<n-1 || !QValid(a[i])) return EMPTY_VALUE;\n    double score=0;\n    for(int k=i-n+1;k<=i;k++) {\n        if(!QValid(a[k])) return EMPTY_VALUE;\n        score += a[k]<a[i] ? 1.0 : a[k]==a[i] ? 0.5 : 0.0;\n    }\n    return score/n;\n}\n'

def calculations(spec: dict, invalid: str = '0') -> list[str]:
    nodes, lines = flatten(spec['expression']), []
    for name in spec['windows']:
        lines.append(f'if({name}<1 || {name}>2000) return {invalid};')
    for name, values in spec.get('string_choices', {}).items():
        valid = ' || '.join(f'StringCompare({name},{literal(value)},true)==0' for value in values)
        lines.append(f'if(!({valid})) {{ Print("O-Doc: invalid choice for {name}"); return {invalid}; }}')
    for index, (node, args) in enumerate(nodes):
        if text_node(node, spec['parameters']):
            lines.append(f'string v{index}={scalar(node, spec["parameters"])};')
            continue
        lines += [f'double v{index}[]; ArrayResize(v{index},rates_total); ArrayInitialize(v{index},EMPTY_VALUE);', 'for(int i=0;i<rates_total-1;i++) {']
        op = node['op']; a = f'v{args[0]}[i]' if args else ''; b = f'v{args[1]}[i]' if len(args) > 1 else ''
        valid = 'true'
        if op == 'input': value = spec['bindings'][node['name']] + '[i]'
        elif op in ('constant', 'parameter'): value = scalar(node, spec['parameters'])
        elif op in ROLLING:
            n = scalar(node['args'][1], spec['parameters'])
            if op == 'lag': value = f'v{args[0]}[i-{n}]'; valid = f'i>={n}'
            elif op == 'ts_rank': value = f'QRank(v{args[0]},i,{n})'
            else: value = f'QRoll(v{args[0]},i,{n},{dict(sma=0,sum=1,std=2,highest=3,lowest=4)[op]})'
        elif op == 'gate':
            value = a
            valid = f'QValid({a}) && QValid({b}) && {b}==1'
        elif op in ('abs', 'neg', 'log'):
            value = f'-{a}' if op == 'neg' else f'{"MathAbs" if op == "abs" else "MathLog"}({a})'
            valid = f'QValid({a})' + (f' && {a}>0' if op == 'log' else '')
        elif op == 'eq' and text_node(node['args'][0], spec['parameters']):
            value = f'(StringCompare(v{args[0]},v{args[1]},true)==0)'
        else:
            valid = f'QValid({a}) && QValid({b})'
            if op in ('min', 'max'): value = f'{"MathMin" if op == "min" else "MathMax"}({a},{b})'
            else:
                symbol = dict(add='+',sub='-',mul='*',div='/',gt='>',lt='<',eq='==', **{'and': '&&', 'or': '||'})[op]
                value = f'({a}{symbol}{b})'
            if op == 'div': valid += f' && {b}!=0'
        lines += [f'if({valid}) {{ double x={value}; if(QValid(x)) v{index}[i]=x; }}', '}']
    return lines
