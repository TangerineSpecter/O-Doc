"""Rebuild only frozen development returns; final holdouts are never read."""
import copy
import time
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.experiments.expression import calculate
from quant.experiments.search import simulate_config
from .core import POLICY,METHOD,summarize_matrix

LIMITATIONS=[
    '只描述本次已记录且可评价的固定候选家族；失败、重复和停止尝试另计，外部或其他请求的搜索次数未知',
    '候选已由开发数据产生；分块重新排序不是重新训练、时序样本外或独立检验，不提供p值或金融有效性晋级',
    '比较每期成本后算术平均收益；与原训练Pareto及验证收益减回撤选择规则不同，不用于修改实际赢家',
    '并列的样本内赢家和样本外中位排名保留歧义；上下界仅覆盖歧义组合，不是统计置信区间',
    '使用原开发段空仓起止的逐期净收益，重组块不重新撮合；不使用最终留出期，后折允许已过去的前折数据',
]


def schedules(output):
    return [{**fold, 'calculation_start': fold['inner_windows'][-1]['calculation_start']}
        if 'inner_windows' in fold else fold for fold in output['walk_forward']['folds']] if output.get('walk_forward') else [
        {'number':None,'calculation_start':0,'partitions':output['partitions'],
         'attempt_ids':[row['id'] for row in output['attempts']]}]


def family(attempts,schedule):
    ids=set(schedule['attempt_ids']);items=[row for row in attempts if row['id'] in ids]
    eligible={};duplicates=0
    for row in items:
        if row['status']=='evaluated':
            if row['fingerprint'] in eligible:duplicates+=1
            else:eligible[row['fingerprint']]=row
    counts={status:sum(row['status']==status for row in items) for status in ('evaluated','rejected','cancelled','budget_stopped')}
    return {'fold':schedule['number'],'attempt_ids':[row['id'] for row in items],
        'attempted':len(items),'status_counts':counts,'distinct_evaluated':len(eligible),'evaluated_duplicates':duplicates,
        'evaluated_ids':[row['id'] for row in eligible.values()],
        'partitions':{key:copy.deepcopy(schedule['partitions'][key]) for key in ('train','validation')},
        'status':'insufficient','reason':'not_computed','matrix_hash':None,'analysis':None},list(eligible.values())


def compute(plan,snapshot,output,*,seconds=10,check=lambda:None):
    deadline=time.monotonic()+max(0,min(60,seconds))
    def guard():
        check()
        if time.monotonic()>=deadline:raise TimeoutError('Selection diagnostic budget exhausted')
    result={'version':1,'method':METHOD,'policy':copy.deepcopy(POLICY),
        'scope':'one_recorded_request_per_fold_fixed_development_family',
        'status':'insufficient','families':[],'final_holdout_used':False,'independent_validation':False,
        'limitations':copy.deepcopy(LIMITATIONS)}
    if not output:return result
    if 'label_target' in plan['config']:
        result['limitations'].append('本请求按标签Rank IC选择；这里仍只诊断成本后交易收益排名，不能替代标签选择、全内层或跨请求统计检验。')
    if plan['config'].get('walk_forward', {}).get('version') == 2:
        result['limitations'].append('嵌套搜索仅重放各外折最后内层窗口的固定家族；不覆盖全部内层选择过程或跨请求多重尝试，不替代嵌套外层评价。')
    for schedule in schedules(output):
        value,items=family(output['attempts'],schedule);result['families'].append(value)
        if len(items)<2:value['reason']='insufficient_distinct_candidates';continue
        if sum(b-a for a,b in value['partitions'].values())<POLICY['blocks']*POLICY['minimum_block_intervals']:
            value['reason']='insufficient_development_intervals';continue
        try:
            guard();origin=schedule['calculation_start'];end=schedule['partitions']['validation'][1]
            # This prefix deliberately ends before either purge gap or final holdout.
            rows=snapshot['rows'][origin:end+1];matrix={}
            for item in items:
                guard();recipe=item['recipe']
                signals=calculate(recipe['expression'],{key:[row[column] for row in rows] for key,column in recipe['bindings'].items()},
                    recipe['parameters'],expected=recipe['output_type'],check=guard,deadline=deadline)
                series=[]
                for part in ('train','validation'):
                    begin,finish=schedule['partitions'][part]
                    metric=simulate_config(rows,signals,plan['config'],record_trades=False,start=begin-origin,end=finish-origin,
                        threshold=plan['config']['threshold'],fee_bps=plan['config']['fee_bps'],slippage_bps=plan['config']['slippage_bps'],
                        output_type=recipe['output_type'],check=guard)
                    if digest({key:value for key,value in metric.items() if key not in ('curve','returns')})!=digest(item['metrics'][part]):
                        raise ValueError('Frozen development metric mismatch')
                    series.extend(metric['returns'])
                matrix[item['id']]=series
            guard();analysis=summarize_matrix(matrix,guard)
            matrix_hash=digest(matrix);guard()
            value.update(status=analysis['status'],reason='all_combinations_ambiguous' if analysis['status']=='insufficient' else '',
                matrix_hash=matrix_hash,analysis=analysis)
        except TimeoutError:value['reason']='budget_stopped'
        except InterruptedError:value['reason']='cancelled'
        except (ValueError,ArithmeticError,ValidationError):value['reason']='development_replay_unavailable'
    complete=sum(row['status']=='completed' for row in result['families'])
    result['status']='completed' if complete and complete==len(result['families']) else 'partial' if complete else 'insufficient'
    return result
