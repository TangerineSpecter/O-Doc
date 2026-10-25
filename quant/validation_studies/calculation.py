"""One frozen recipe, one predeclared interval, no search or model calls."""
import time
from quant.experiments.expression import calculate
from quant.experiments.backtest import simulate as legacy_simulate
from quant.strategies.simulator import simulate as strategy_simulate
from quant.strategies.validation import validate_result_size


def evaluate(plan: dict,snapshot: dict,bounds: dict,check=None, *, replay=False) -> dict:
    deadline=time.monotonic()+(60 if replay else plan['seconds'])
    def guard():
        if time.monotonic()>=deadline: raise TimeoutError('固定验证达到时间预算')
        if check: check()
    begin,end=bounds['calculation_start'],bounds['end']
    rows=snapshot['rows'][begin:end+1]
    recipe,config=plan['recipe'],plan['config']
    values=calculate(recipe['expression'],{name:[row[column] for row in rows] for name,column in recipe['bindings'].items()},
        recipe['parameters'],expected=recipe['output_type'],check=guard,deadline=deadline)
    options={'start':bounds['start']-begin,'end':end-begin,'threshold':config['threshold'],
        'fee_bps':config['fee_bps'],'slippage_bps':config['slippage_bps'],'output_type':recipe['output_type'],'check':guard}
    if 'strategy' in config:
        options['policy']=config['strategy']; runner=strategy_simulate
    else: runner=legacy_simulate
    final=runner(rows,values,**options)
    baseline=runner(rows,values,**options,baseline=True)
    output={'engine_version':plan['engine_version'],'final':final,'baseline':baseline,
        'selection':'fixed_registered_recipe_no_search_or_test_based_selection','independent_validation':False}
    validate_result_size(output)
    return output
