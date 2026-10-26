"""Independent Decimal oracle for the captured SMA-deviation planning case.

No product expression, simulator, search or model imports. Intentionally only the
operators and long/flat 5+5 bps contract used by this fixed acceptance case.
"""
from decimal import Decimal, localcontext


def signals(recipe: dict, rows: list) -> list:
    def scalar(value):
        if type(value) not in (int,float): raise ValueError('Numeric fixed-case values required')
        return Decimal(str(value))
    def visit(node):
        operation=node['op']
        if operation=='input': return [scalar(row[recipe['bindings'][node['name']]]) for row in rows]
        if operation=='parameter': return [scalar(recipe['parameters'][node['name']])]*len(rows)
        if operation=='constant': return [scalar(node['value'])]*len(rows)
        args=[visit(child) for child in node['args']]
        if operation=='sma':
            window=int(args[1][0])
            if not 1<=window<=2000 or args[1][0]!=window: raise ValueError('Invalid fixed window')
            result=[]
            for i in range(len(rows)):
                values=args[0][max(0,i-window+1):i+1]
                result.append(sum(values)/window if len(values)==window and all(v is not None for v in values) else None)
            return result
        result=[]
        for a,b in zip(*args):
            if a is None or b is None: value=None
            elif operation=='add': value=a+b
            elif operation=='sub': value=a-b
            elif operation=='div': value=a/b if b else None
            else: raise ValueError('Unsupported fixed-case operator')
            result.append(value)
        return result
    with localcontext() as context:
        context.prec=45
        return visit(recipe['expression'])


def ledger(recipe: dict, rows: list, start: int, end: int, *, baseline=False) -> dict:
    with localcontext() as context:
        context.prec=45
        values=signals(recipe,rows);one=Decimal(1);cost=Decimal('.001')
        balance=peak=one;drawdown=Decimal(0);held=entries=turnover=exposure=missing=0
        curve=[{'timestamp':rows[start]['timestamp'],'equity':1.}];returns=[]
        for i in range(start,end):
            signal=values[i-1];missing+=int(signal is None)
            target=1 if baseline else int(signal is not None and signal>0)
            entries+=int(target>held);turnover+=abs(target-held);exposure+=target
            before=balance;balance*=one-cost*abs(target-held)
            if target: balance*=Decimal(str(rows[i+1]['open']))/Decimal(str(rows[i]['open']))
            if i+1==end and target: balance*=one-cost;turnover+=1
            peak=max(peak,balance);drawdown=max(drawdown,one-balance/peak)
            returns.append(float(balance/before-one));curve.append({'timestamp':rows[i+1]['timestamp'],'equity':float(balance)})
            held=target
        return {'total_return':float(balance-one),'max_drawdown':float(drawdown),'entries':entries,
            'turnover':turnover,'exposure_fraction':exposure/(end-start),'missing_signals':missing,
            'bars':end-start,'start':rows[start]['timestamp'],'end':rows[end]['timestamp'],'curve':curve,'returns':returns}


def verify(output: dict, dataset: dict) -> dict:
    """Check every candidate/inner segment, plus each selected outer and baseline."""
    import math
    checked=0;max_error=0.
    def compare(actual,expected):
        nonlocal checked,max_error
        for key,value in actual.items():
            if key=='curve':
                if [p['timestamp'] for p in value]!=[p['timestamp'] for p in expected[key]]:raise ValueError('Curve times differ')
                pairs=[(p['equity'],q['equity']) for p,q in zip(value,expected[key])]
            elif key=='returns':
                if len(value)!=len(expected[key]):raise ValueError('Return count differs')
                pairs=zip(value,expected[key])
            elif isinstance(value,float):pairs=[(value,expected[key])]
            else:
                if value!=expected[key]:raise ValueError('Scalar metric differs: '+key)
                continue
            for observed,wanted in pairs:
                max_error=max(max_error,abs(observed-wanted))
                if not math.isclose(observed,wanted,rel_tol=1e-9,abs_tol=2e-11):raise ValueError('Decimal metric differs: '+key)
        checked+=1
    config=output['config']
    if config['threshold']!=0 or config['fee_bps']!=5 or config['slippage_bps']!=5 or 'strategy' in config:raise ValueError('Fixed oracle does not cover this config')
    for outer in output['walk_forward']['folds']:
        attempts=[row for row in output['attempts'] if row['fold']==outer['number']]
        for attempt in attempts:
            if attempt['status']!='evaluated':raise ValueError('Captured case expected all evaluations complete')
            for record,window in zip(attempt['inner_evaluation']['folds'],outer['inner_windows']):
                origin=window['calculation_start'];rows=dataset['rows'][origin:window['partitions']['validation'][1]+1]
                for part,(a,b) in window['partitions'].items():compare(record['metrics'][part],ledger(attempt['recipe'],rows,a-origin,b-origin))
        trial=next(row['recipe'] for row in attempts if row['id']==outer['selected_id'])
        origin=outer['inner_windows'][-1]['calculation_start'];a,b=outer['partitions']['holdout']
        rows=dataset['rows'][origin:b+1]
        compare(outer['holdout'],ledger(trial,rows,a-origin,b-origin))
        compare(outer['buy_hold_baseline'],ledger(trial,rows,a-origin,b-origin,baseline=True))
    return {'checked_segments':checked,'maximum_absolute_error':max_error,'oracle':'decimal_sma_deviation_long_flat_5_plus_5_bps_v1'}
