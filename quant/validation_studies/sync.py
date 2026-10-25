"""Restore immutable validation facts without queue grants, search or provider calls."""
import json
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError
from quant.models import ValidationPlan,ValidationRequest,ValidationResult
from quant.research.contracts import digest
from .contracts import PlanInput,build,bounds
from .calculation import evaluate
from .usage import LIMIT,SCOPE,audit,market_fact,record
from .criteria import FIELDS,assess

LABELS={'quant.validationplan','quant.validationrequest','quant.validationresult'}


def check_audit(value,dataset,limits,rows,anthologies,owner,excluded,fail):
    if not isinstance(value,dict) or value.get('version')!=1 or value.get('scope')!=SCOPE:
        fail('固定验证数据使用审计版本无效')
    manifest=value.get('manifest')
    totals=value.get('totals')
    if (not isinstance(manifest,list) or len(manifest)>LIMIT or not isinstance(totals,dict)
            or set(totals)!={'dataset','experiment','comparison','fixed_validation'}
            or any(type(n) is not int or n<0 for n in totals.values()) or type(value.get('complete_scan')) is not bool):
        fail('固定验证审计覆盖范围无效')
    models={'dataset':'quant.marketdataset','experiment':'quant.experimentrequest','comparison':'quant.factorcomparison','fixed_validation':'quant.validationrequest'}
    checked=[]; keys=set(); counts={kind:0 for kind in models}
    for fact in manifest:
        if not isinstance(fact,dict): fail('固定验证审计记录无效')
        kind,identity=fact.get('kind'),fact.get('id')
        raw=rows.get(models.get(kind,''),{}).get(identity,{})
        dataset_id=identity if kind=='dataset' else raw.get('dataset')
        market=rows.get('quant.marketdataset',{}).get(str(dataset_id),{})
        collection=anthologies.get(str(market.get('anthology')), {})
        if (not raw or not market or collection.get('user_id')!=owner or collection.get('type')!='quant'
                or collection.get('permission')!='private' or (kind=='fixed_validation' and identity==excluded)
                or (kind=='dataset' and identity==dataset['id'])):
            fail('固定验证审计引用缺失、越权或包含自身')
        market_data=market_fact(dataset_id,market['anthology'],parse_datetime(str(market['created_at'])),market['content_hash'],market['snapshot'])
        expected=record(kind,identity,raw['content_hash'],dataset_id,market_data,raw['data']['bounds'] if kind=='fixed_validation' else None)
        if fact!=expected or fact['key'] in keys: fail('固定验证审计记录与不可变事实不一致')
        keys.add(fact['key']);counts[kind]+=1;checked.append(expected)
    if checked!=sorted(checked,key=lambda item:item['key']) or any(counts[k]>totals[k] for k in counts):
        fail('固定验证审计排序或计数无效')
    if value['complete_scan'] and counts!=totals: fail('固定验证完整审计缺少记录')
    expected=audit(dataset['snapshot'],limits,{'manifest':checked,'totals':totals,'complete_scan':value['complete_scan']})
    if value!=expected: fail('固定验证审计结论与明细不一致')


def validate_studies(rows,anthologies,fail):
    plans=rows.get('quant.validationplan',{});requests=rows.get('quant.validationrequest',{});results=rows.get('quant.validationresult',{})
    experiments=rows.get('quant.experimentrequest',{});datasets=rows.get('quant.marketdataset',{})
    original_results={str(value['request']):(key,value) for key,value in rows.get('quant.experimentresult',{}).items()}
    keys=set()
    for identity,fields in plans.items():
        data=fields.get('data',{}); source=experiments.get(str(fields.get('source_request')),{});collection=anthologies.get(str(fields.get('anthology')), {})
        if (not source or source.get('anthology')!=fields.get('anthology') or collection.get('type')!='quant'
                or collection.get('permission')!='private' or str(fields.get('source_request')) not in original_results):
            fail('固定验证登记缺少同文集的已完成来源实验')
        key=fields.get('request_key');pair=(fields['anthology'],key)
        if pair in keys: fail('固定验证登记标识重复')
        keys.add(pair)
        try:
            incoming={'request_key':key,'source_request_id':fields['source_request'],
                'attempt_id':data.get('source',{}).get('attempt_id'),'name':data.get('name'),
                'symbol':data.get('target',{}).get('symbol'),'timeframe':data.get('target',{}).get('timeframe'),
                'intervals':data.get('intervals'),'seconds':data.get('seconds')}
            if 'criteria' in data:
                if not isinstance(data['criteria'],dict): fail('固定验证登记标准格式无效')
                incoming['criteria']={key:data['criteria'].get(key) for key in FIELDS}
            serializer=PlanInput(data=incoming)
            serializer.is_valid(raise_exception=True)
            source_id,result=original_results[str(fields['source_request'])];market=datasets[str(source['dataset'])]
            expected=build(source['plan'],result['data'],market['snapshot'],fields['source_request'],source_id,result['content_hash'],source['dataset'],serializer.validated_data)
            if expected!=data or expected.get('version')==2 and digest(expected)!=digest(data) or identity!=digest(['validation-plan-v1',fields['anthology'],key])[:40] or fields.get('content_hash')!=digest(data):
                fail('固定验证登记公式、参数、策略或来源哈希不一致')
        except ValidationError: fail('固定验证登记参数或来源无效')
    seen=set()
    for identity,fields in requests.items():
        plan=plans.get(str(fields.get('plan')),{});dataset=datasets.get(str(fields.get('dataset')),{});data=fields.get('data',{})
        if (not plan or fields['plan'] in seen or not dataset or dataset.get('anthology')!=plan.get('anthology')
                or identity!=digest(['validation-request-v1',fields['plan']])[:40] or fields.get('content_hash')!=digest(data)):
            fail('固定验证行情预约身份、唯一性或哈希无效')
        seen.add(fields['plan'])
        if set(data)!={'version','plan_hash','dataset_hash','mode','bounds','audit','imported_after_registration','fresh_allowed','claim'} or data.get('version')!=1 or data.get('mode') not in ('fresh','replication'):
            fail('固定验证预约合同无效')
        try: limits=bounds(plan['data'],dataset['snapshot'])
        except ValidationError: fail('固定验证行情无法覆盖登记的完整区间')
        after=parse_datetime(str(dataset['created_at']))>parse_datetime(str(plan['created_at']))
        owner=anthologies[str(plan['anthology'])]['user_id']
        check_audit(data['audit'],{'id':fields['dataset'],**dataset},limits,rows,anthologies,owner,identity,fail)
        fresh=after and data['audit']['complete_scan'] and not data['audit']['conflict_count']
        if (data['bounds']!=limits or data['plan_hash']!=plan['content_hash'] or data['dataset_hash']!=dataset['content_hash']
                or type(data['imported_after_registration']) is not bool or data['imported_after_registration']!=after
                or type(data['fresh_allowed']) is not bool or data['fresh_allowed']!=fresh or (data['mode']=='fresh' and not fresh)
                or data['claim']!='registration_before_binding_and_tracked_range_only_external_use_unattested'):
            fail('固定验证预约区间、时间或新数据资格不一致')
    seen=set()
    for identity,fields in results.items():
        request=requests.get(str(fields.get('request')),{}); data=fields.get('data',{})
        if (not request or fields['request'] in seen or identity!=digest(['validation-result-v1',fields['request']])[:40]
                or fields.get('content_hash')!=digest(data) or len(json.dumps(data,allow_nan=False))>6_000_000):
            fail('固定验证成果身份、唯一性或大小无效')
        seen.add(fields['request'])
        plan=plans[str(request['plan'])];dataset=datasets[str(request['dataset'])]
        version=2 if plan['data']['version']==2 else 1
        extra={'criteria_assessment'} if version==2 else set()
        if (set(data)!={'version','status','error','output','publication_audit','claim'}|extra or data.get('version')!=version
                or data.get('status') not in ('completed','cancelled','failed') or not isinstance(data.get('error'),str)
                or len(data['error'])>500 or data['claim']!='fixed_evaluation_observation_not_global_independent_validation'):
            fail('固定验证成果合同无效')
        if data['status']=='completed':
            if data['error'] or data['output']!=evaluate(plan['data'],dataset['snapshot'],request['data']['bounds'],replay=True):
                fail('固定验证收益、成本或交易账本无法从冻结方案重放')
            check_audit(data['publication_audit'],{'id':request['dataset'],**dataset},request['data']['bounds'],rows,anthologies,
                anthologies[str(plan['anthology'])]['user_id'],fields['request'],fail)
        elif data['output'] is not None or data['publication_audit'] is not None:
            fail('未完成的固定验证不能携带完整成果')
        if version==2 and (type(data.get('version')) is not int or digest(data['criteria_assessment'])!=digest(assess(plan['data']['criteria'],data['status'],data['output'],request['data'],data['publication_audit']))):
            fail('登记标准判定、实测值或验证资格与冻结事实不一致')
    for model,label in ((ValidationPlan,'quant.validationplan'),(ValidationRequest,'quant.validationrequest'),(ValidationResult,'quant.validationresult')):
        for item in model.objects.filter(pk__in=rows.get(label,{})):
            raw=rows[label][item.pk]
            if any(getattr(item,name)!=raw.get(name.removesuffix('_id') if name.endswith('_id') else name) for name in item.SNAPSHOT_FIELDS):
                fail('同一固定验证事实不可覆盖')
