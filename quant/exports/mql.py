"""MQL4 indicator only: explicit chronological arrays and closed-bar output."""
from quant.factors.expression import ROLLING
from .series import flatten, scalar
from .ranking import MQL_HELPER
from .categories import literal, text_node

HELPERS = '''
bool QValid(double x) { return MathIsValidNumber(x) && x != EMPTY_VALUE; }
double QRoll(const double &a[], int i, int n, int kind) {
    if(n<1 || n>2000 || i<n-1) return EMPTY_VALUE;
    double sum=0, lo=a[i], hi=a[i];
    for(int k=i-n+1;k<=i;k++) { if(!QValid(a[k])) return EMPTY_VALUE; sum+=a[k]; lo=MathMin(lo,a[k]); hi=MathMax(hi,a[k]); }
    if(kind==0) return sum/n;
    if(kind==1) return sum;
    if(kind==3) return hi;
    if(kind==4) return lo;
    double mean=sum/n, sq=0;
    for(int k=i-n+1;k<=i;k++) sq+=(a[k]-mean)*(a[k]-mean);
    return MathSqrt(sq/n);
}
'''


def emit(spec: dict) -> str:
    nodes = flatten(spec['expression'])
    lines = ['// O-Doc candidate indicator. Compilation and equivalence pending.', '#property strict', '#property indicator_separate_window', '#property indicator_buffers 1', '#property indicator_color1 clrOrange', 'double Output[];']
    for name, value in spec['parameters'].items():
        kind = 'string' if isinstance(value, str) else 'bool' if type(value) is bool else 'int' if type(value) is int else 'double'
        lines.append(f'input {kind} {name} = {literal(value)};')
    lines += [HELPERS + (MQL_HELPER if any(node['op'] == 'ts_rank' for node, _ in nodes) else ''), 'int OnInit() { SetIndexBuffer(0,Output); ArraySetAsSeries(Output,false); SetIndexStyle(0,DRAW_LINE); SetIndexEmptyValue(0,EMPTY_VALUE); return(INIT_SUCCEEDED); }',
              'int OnCalculate(const int rates_total,const int prev_calculated,const datetime &time[],const double &open[],const double &high[],const double &low[],const double &close[],const long &tick_volume[],const long &volume[],const int &spread[]) {',
              'ArraySetAsSeries(open,false); ArraySetAsSeries(high,false); ArraySetAsSeries(low,false); ArraySetAsSeries(close,false); ArraySetAsSeries(volume,false);',
              'ArrayInitialize(Output,EMPTY_VALUE);', 'if(rates_total<2 || rates_total>20000) { Print("O-Doc: requires 2-20000 bars"); return 0; }']
    lines += calculations(spec)
    lines += [f'for(int i=0;i<rates_total-1;i++) Output[i]=v{len(nodes)-1}[i];', 'return rates_total;', '}']
    return '\n'.join(lines) + '\n'


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
