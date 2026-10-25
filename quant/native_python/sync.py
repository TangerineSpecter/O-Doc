"""Validate frozen facts without Docker, source imports, queueing or image pulls."""
import re
from types import SimpleNamespace
from rest_framework.exceptions import ValidationError
from quant.models import NativePythonRequest,NativePythonResult
from quant.research.contracts import digest
from quant.research_memory.contract import instant
from .contracts import NativeInput,build
from .calculation import portable,compare,failed,METHOD,CLAIM,REASONS
from .runtime import PROTOCOL,LIMITS


def environment(value):
    if not isinstance(value,dict) or set(value)!={'image_id','os','architecture','runtime','limits'}:
        raise ValidationError('Python运行环境快照字段无效')
    run=value['runtime']
    if (not isinstance(run,dict) or set(run)!={'protocol','python','machine','numpy','pandas','supervisor_sha256','child_sha256'}
            or not isinstance(value['image_id'],str) or not re.fullmatch(r'sha256:[0-9a-f]{64}',value['image_id'])
            or value['os']!='linux' or value['architecture'] not in ('amd64','arm64')
            or run['protocol']!=PROTOCOL or not isinstance(run['python'],str) or not re.fullmatch(r'3\.11\.[0-9]{1,3}',run['python'])
            or run['machine']!=({'amd64':'x86_64','arm64':'aarch64'}[value['architecture']])
            or run['numpy']!='2.3.4' or run['pandas']!='2.3.3' or digest(value['limits'])!=digest(LIMITS)
            or any(not isinstance(run[key],str) or not re.fullmatch(r'[0-9a-f]{64}',run[key]) for key in ('supervisor_sha256','child_sha256'))):
        raise ValidationError('Python运行环境版本或限制无效')
    # Historical hashes are retained, never interpreted as a local execution grant.


def validate_native(rows,anthologies,fail):
    requests=rows.get('quant.nativepythonrequest',{});results=rows.get('quant.nativepythonresult',{})
    seen=set()
    for identity,row in requests.items():
        coll=row.get('anthology');collection=anthologies.get(str(coll),{})
        candidate=rows.get('quant.factorcandidate',{}).get(row.get('candidate'),{})
        report=rows.get('quant.researchreport',{}).get(candidate.get('report'),{})
        entry=rows.get('quant.entry',{}).get(report.get('entry'),{})
        source=rows.get('quant.sourcerevision',{}).get(row.get('source'),{})
        dataset=rows.get('quant.marketdataset',{}).get(row.get('dataset'),{})
        if (collection.get('type')!='quant' or collection.get('permission')!='private' or not collection.get('user_id')
                or not candidate or entry.get('anthology')!=coll or report.get('source')!=row.get('source')
                or not source or dataset.get('anthology')!=coll):fail('原始Python验证缺少同文集固定来源、候选或行情')
        plan=row.get('plan',{});native=plan.get('native',{});fixed=plan.get('dataset',{});seed=plan.get('candidate',{})
        raw={'request_key':row.get('request_key'),'name':plan.get('name'),'source_id':row.get('source'),'dataset_id':row.get('dataset'),
            'bindings':[{'name':key,'column':value} for key,value in seed.get('bindings',{}).items()],
            'parameters':[{'name':key,'value':value} for key,value in seed.get('parameters',{}).items()],
            **{key:native.get(key) for key in ('entrypoint','arguments','index','output_column','seconds')},
            **{key:fixed.get(key) for key in ('offset','row_count')},
            **{key:plan.get('policy',{}).get(key) for key in ('absolute_tolerance','relative_tolerance','warmup_bars')},'analyze':plan.get('analyze')}
        form=NativeInput(data=raw);form.is_valid(raise_exception=True)
        env=plan.get('environment');environment(env)
        expected=build(SimpleNamespace(pk=row['candidate'],data=candidate['data'],content_hash=candidate['content_hash']),
            SimpleNamespace(pk=row['source'],payload=source['payload'],content_hash=source['content_hash']),
            SimpleNamespace(pk=row['dataset'],snapshot=dataset['snapshot'],content_hash=dataset['content_hash']),form.validated_data,env)
        key=(coll,row['request_key'])
        if (key in seen or identity!=digest(['native-python-request-v1',*key])[:40]
                or digest(plan)!=digest(expected) or row.get('content_hash')!=digest(expected)):
            fail('原始Python验证方案、源码或实际参数被改写')
        seen.add(key)
        if any(instant(dep['created_at'])>instant(row['created_at']) for dep in (candidate,report,source,dataset)):
            fail('原始Python验证引用未来记录')
    seen=set()
    for identity,row in results.items():
        request_id=row.get('request');request=requests.get(request_id,{})
        if not request or request_id in seen or identity!=digest(['native-python-result-v1',request_id])[:40]:
            fail('Python结果缺少唯一请求')
        seen.add(request_id);data=row.get('data',{});status=data.get('status')
        if status=='completed':
            dataset=rows['quant.marketdataset'][request['dataset']]
            sample,values=portable(request['plan'],dataset['snapshot'])
            comparison=compare(request['plan'],sample,values,data.get('native_values'))
            expected={'version':1,'method':METHOD,'status':'completed','reason':'','native_values':data['native_values'],
                'comparison':comparison,'claim':CLAIM,'independent_validation':False,'platform_equivalence':'unverified'}
        elif status in ('failed','cancelled') and data.get('reason') in REASONS and (status=='cancelled')==(data['reason']=='cancelled'):
            expected=failed(data['reason'],status)
        else:fail('Python验证结果状态或失败原因无效')
        if (digest(data)!=digest(expected) or row.get('content_hash')!=digest(expected)
                or instant(request['created_at'])>instant(row['created_at'])):
            fail('Python固定输出比较结果不一致；恢复不会执行源码')
    for model in (NativePythonRequest,NativePythonResult):
        incoming=rows.get(model._meta.label_lower,{})
        for local in model.objects.filter(pk__in=incoming).values('id',*model.SNAPSHOT_FIELDS):
            if any(digest(local[key])!=digest(incoming[local['id']].get(model._meta.get_field(key).name)) for key in model.SNAPSHOT_FIELDS):
                fail('已有Python验证事实不可覆盖')
