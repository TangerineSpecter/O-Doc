"""Freeze actual evaluated hypotheses before binding a new dataset."""
import copy
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.experiments.derivation import source_parents
from quant.experiments.expression import MAX_WINDOW
from .criteria import CriteriaInput,freeze

ENGINE='quant-fixed-validation-1'


class PlanInput(serializers.Serializer):
    request_key=serializers.RegexField(r'^[A-Za-z0-9_-]{16,64}$')
    source_request_id=serializers.CharField(max_length=40)
    attempt_id=serializers.CharField(max_length=40,required=False,allow_blank=True,default='')
    name=serializers.CharField(max_length=200,required=False,allow_blank=True,default='')
    symbol=serializers.CharField(max_length=300,required=False,allow_blank=True,default='')
    timeframe=serializers.CharField(max_length=300,required=False,allow_blank=True,default='')
    intervals=serializers.IntegerField(min_value=5,max_value=2000,default=30)
    seconds=serializers.IntegerField(min_value=1,max_value=60,default=30)
    criteria=CriteriaInput(required=False)


def required_history(node: dict, parameters: dict) -> int:
    children=node.get('args',[])
    history=max((required_history(child,parameters) for child in children),default=0)
    if node['op'] in ('lag','sma','sum','std','highest','lowest','ts_rank'):
        window=children[1]
        n=window['value'] if window['op']=='constant' else parameters[window['name']]
        if type(n) is not int or not 1<=n<=MAX_WINDOW: raise ValidationError('固定验证窗口无效')
        history=required_history(children[0],parameters)+(n if node['op']=='lag' else n-1)
    if history>19990: raise ValidationError('表达式所需历史超过固定验证的数据上限')
    return history


def build(plan: dict,result: dict,dataset: dict,request_id: str,result_id: str,result_hash: str,dataset_id: str,values: dict) -> dict:
    output=result.get('output') or {}
    identity=values.get('attempt_id') or output.get('selected_id')
    item=next((row for row in output.get('attempts',[]) if row['id']==identity and row['status']=='evaluated'),None)
    if not item or result.get('status') not in ('completed','partial'):
        raise ValidationError('只能登记已发布且实际评价通过的公式；未完成或失败尝试不能当作固定方案')
    recipe=copy.deepcopy(item['recipe'])
    config={key:copy.deepcopy(plan['config'][key]) for key in ('threshold','fee_bps','slippage_bps')}
    if 'strategy' in plan['config']: config['strategy']=copy.deepcopy(plan['config']['strategy'])
    frozen={'version':1,'engine_version':ENGINE,'name':values.get('name') or f"固定新数据验证 · {plan['name']} · {identity}"[:200],
        'recipe':recipe,'config':config,'intervals':values['intervals'],'seconds':values['seconds'],
        'required_history':required_history(recipe['expression'],recipe['parameters']),
        'target':{'symbol':values.get('symbol') or dataset['symbol'],'timeframe':values.get('timeframe') or dataset['timeframe'],
            'after_timestamp':dataset['rows'][-1]['timestamp']},
        'source':{'request_id':request_id,'result_id':result_id,'result_hash':result_hash,'dataset_id':dataset_id,
            'dataset_hash':plan['dataset_hash'],'attempt_id':identity,'attempt_hash':digest(item),'fold':item.get('fold'),
            'parents':source_parents(plan,output['attempts'],item)},
        'claim':'frozen_before_dataset_binding_not_global_independence_or_profitability'}
    if 'criteria' in values:
        frozen.update(version=2,criteria=freeze(values['criteria']))
    return frozen


def bounds(plan: dict,dataset: dict) -> dict:
    target,rows=plan['target'],dataset['rows']
    if dataset['symbol']!=target['symbol'] or dataset['timeframe']!=target['timeframe']:
        raise ValidationError('验证行情必须与登记的标的和周期完全一致；别名和频率不自动等价')
    start=next((i for i,row in enumerate(rows) if row['timestamp']>target['after_timestamp']),None)
    if start is None: raise ValidationError('没有登记截止时间之后的新数据，请导入后续区间并包含所需预热')
    if start<plan['required_history']+1:
        raise ValidationError(f"需在首个新评价开盘前提供至少{plan['required_history']+1}根历史／信号柱，不能跳过前段选择更有利的起点")
    end=start+plan['intervals']
    if end>=len(rows): raise ValidationError(f"新数据不足：固定评价{plan['intervals']}个收益区间，需要{plan['intervals']+1}个新开盘")
    return {'calculation_start':start-1-plan['required_history'],'start':start,'end':end,
        'start_timestamp':rows[start]['timestamp'],'end_timestamp':rows[end]['timestamp'],
        'rule':'earliest_supplied_bar_after_frozen_cutoff_no_test_selection'}
