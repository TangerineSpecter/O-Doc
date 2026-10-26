"""Reconstruct numeric diagnoses; never execute a search or queue a model."""
import copy
import json
from quant.models import SelectionDiagnostic
from quant.research.contracts import digest
from .calculation import compute


def validate_diagnostics(rows,fail,anthologies):
    records=rows.get('quant.selectiondiagnostic',{});seen=set()
    for identity,fields in records.items():
        source=rows.get('quant.experimentresult',{}).get(str(fields.get('result')), {})
        request=rows.get('quant.experimentrequest',{}).get(str(source.get('request')), {})
        dataset=rows.get('quant.marketdataset',{}).get(str(request.get('dataset')), {})
        data=fields.get('data')
        if (not source or not request or not dataset or source['data']['status'] not in ('completed','partial')
                or fields['result'] in seen or identity!=digest(['selection-diagnostic-v1',fields['result']])[:40]
                or not isinstance(data,dict) or type(data.get('version')) is not int or data.get('version') not in (1,2)
                or fields.get('content_hash')!=digest(data)
                or len(json.dumps(data,allow_nan=False))>(600000 if data.get('version')==2 else 300000)):
            fail('搜索选择诊断身份、唯一性或绑定无效')
        seen.add(fields['result'])
        from quant.research_memory.contract import instant
        if instant(fields['created_at'])<instant(source['created_at']):fail('搜索选择诊断不能早于来源成果')
        binding={'request_id':source['request'],'request_hash':request['content_hash'],
            'result_id':fields['result'],'result_hash':source['content_hash'],'dataset_hash':request['plan']['dataset_hash']}
        if data.get('binding')!=binding:fail('搜索选择诊断的来源哈希不一致')
        rebuilt=compute(request['plan'],dataset['snapshot'],source['data']['output'],seconds=60)
        # Historical time/cancel limits can only remove numeric claims, not invent them.
        adjusted=copy.deepcopy(rebuilt)
        if not isinstance(data.get('families'),list) or len(data['families'])!=len(rebuilt['families']):
            fail('搜索家族清单不完整')
        for old,new in zip(data['families'],adjusted['families']):
            if old.get('analysis') is None and old.get('reason') in ('budget_stopped','cancelled','development_replay_unavailable'):
                if new['reason'] in ('insufficient_distinct_candidates','insufficient_development_intervals'):
                    fail('搜索诊断缺失原因与已知数量不符')
                new.update(status='insufficient',reason=old['reason'],matrix_hash=None,analysis=None)
        complete=sum(row['status']=='completed' for row in adjusted['families'])
        adjusted['status']='completed' if complete and complete==len(adjusted['families']) else 'partial' if complete else 'insufficient'
        adjusted['binding']=binding
        if data['version']==2:
            from .history_store import validate as validate_history
            validate_history(data.get('search_history'),{'id':source['request'],**request},dataset,
                fields['created_at'],rows,anthologies,fail)
            from .history import attach
            adjusted=attach(adjusted,data['search_history'])
        if digest(data)!=digest(adjusted):fail('搜索诊断的家族、排名、歧义界或计数无法重放')
    for local in SelectionDiagnostic.objects.filter(pk__in=records):
        fields=records[local.pk]
        if fields.get('result')!=local.result_id or fields.get('data')!=local.data or fields.get('content_hash')!=local.content_hash:
            fail('已有搜索选择诊断不可覆盖')
