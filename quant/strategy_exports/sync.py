"""Rebuild native candidates from frozen facts; never compile, run or grant a lease."""
import hashlib
import json
from quant.models import StrategyArtifact
from quant.research.contracts import digest
from .spec import from_facts
from .generator import bundle, identity
from .service import identifiers


def validate_artifacts(rows: dict, fail) -> None:
    artifacts=rows.get('quant.strategyartifact', {})
    versions=rows.get('quant.codeversion', {})
    requests=rows.get('quant.experimentrequest', {})
    results=rows.get('quant.experimentresult', {})
    sources=rows.get('quant.sourcerevision', {})
    factors=rows.get('quant.factorcandidate', {})
    reports=rows.get('quant.researchreport', {})
    for key, fields in artifacts.items():
        data=fields.get('data', {})
        request=requests.get(str(fields.get('request')), {})
        context=data.get('context', {})
        result=results.get(str(context.get('result_id')), {})
        dataset=rows.get('quant.marketdataset', {}).get(str(request.get('dataset')), {})
        version=versions.get(str(fields.get('version')), {})
        if (not request or not result or result.get('request')!=fields.get('request') or not dataset
                or context.get('request_id')!=fields.get('request') or not version or fields.get('content_hash')!=digest(data)):
            fail('策略候选引用缺失、跨实验或哈希无效')
        expected_context=from_facts(request['plan'],result['data'],dataset['snapshot'],str(fields['request']),
            str(context['result_id']),result['content_hash'],context.get('attempt_id',''))
        if expected_context!=context or key!=identity(context): fail('策略候选实际公式、配置或身份不匹配')
        generated=bundle(context)
        implementation_id, version_id=identifiers(key)
        if (version_id!=str(fields['version']) or version.get('strategy_artifact_id')!=key
                or version.get('implementation')!=implementation_id or version.get('source_version_id') is not None
                or version.get('language')!='mql4' or version.get('code')!=generated['code']
                or version.get('content_hash')!=hashlib.sha256(generated['code'].encode()).hexdigest()
                or data!=json.loads(generated['manifest_json'])):
            fail('策略候选代码、参数清单或原生状态不能按冻结版本重建')
        implementation=rows.get('quant.implementation',{}).get(implementation_id,{})
        parent=factors.get(context['parents'][0]['id'], {})
        owner=reports.get(str(parent.get('report')),{}).get('entry')
        if implementation.get('entry')!=owner: fail('策略候选不能跨研究归档')
        linked=[row for row in sources.values() if row.get('code_version')==version_id]
        if len(linked)!=1: fail('策略候选缺少唯一代码来源快照')
    for key, version in versions.items():
        marker=version.get('strategy_artifact_id', '')
        if not isinstance(marker,str) or len(marker)>40: fail('策略产物标记无效')
        if marker and artifacts.get(marker,{}).get('version')!=key: fail('策略代码缺少完整产物记录')
    for item in StrategyArtifact.objects.filter(pk__in=artifacts):
        raw=artifacts[item.pk]
        if any(getattr(item,name)!=raw.get(name.removesuffix('_id') if name.endswith('_id') else name) for name in item.SNAPSHOT_FIELDS):
            fail('同一策略产物不可覆盖')
