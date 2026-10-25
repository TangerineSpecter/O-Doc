"""Reconstruct every admission and evidence scope; no model or runtime authority."""
from quant.models import FactorQualification, FactorEvidenceLink
from quant.research.contracts import digest
from .structure import qualification
from . import evidence

LABELS = {'quant.factorqualification', 'quant.factorevidencelink'}


def validate_verification(rows, fail):
    candidates = rows.get('quant.factorcandidate', {})
    records = rows.get('quant.factorqualification', {})
    qualified = set()
    for identity, row in records.items():
        candidate_id = row.get('candidate')
        candidate = candidates.get(candidate_id)
        if (not candidate or candidate_id in qualified or type(row.get('policy_version')) is not int or row['policy_version'] != 1
                or identity != digest(['factor-qualification-1', candidate_id])[:40]
                or digest(row.get('data')) != digest(qualification(candidate['data'])) or row.get('content_hash') != digest(row['data'])):
            fail('因子可复用检查缺失候选、版本或与确定性合同不一致')
        qualified.add(candidate_id)
    for identity, row in candidates.items():
        version = row.get('qualification_version', 0)
        if type(version) is not int or version not in (0, 1) or version == 1 and identity not in qualified:
            fail('新因子缺少规定的结构与声明依赖检查')
    reports, entries = rows.get('quant.researchreport', {}), rows.get('quant.entry', {})
    seen = set()
    for identity, row in rows.get('quant.factorevidencelink', {}).items():
        candidate_id, kind, target_id = row.get('candidate'), row.get('kind'), row.get('target_id')
        candidate = candidates.get(candidate_id)
        if not candidate or candidate_id not in qualified or not isinstance(target_id, str) or not 0 < len(target_id) <= 40 or kind not in ('experiment', 'comparison', 'feedback', 'fixed_validation','native_python'):
            fail('验证证据缺失候选、检查或未知目标类型')
        candidate_entry = entries[reports[candidate['report']]['entry']]
        collection = candidate_entry['anthology']
        if kind == 'experiment':
            target = rows.get('quant.experimentresult', {}).get(target_id, {})
            request = rows.get('quant.experimentrequest', {}).get(target.get('request'), {})
            dataset = rows.get('quant.marketdataset', {}).get(request.get('dataset'), {})
            if request.get('anthology') != collection: fail('验证实验缺失或跨文集')
            expected = evidence.experiment(candidate_id, candidate['data'], target_id, target['data'], request['plan'], dataset['snapshot'], target['request'])
        elif kind == 'fixed_validation':
            target=rows.get('quant.validationresult',{}).get(target_id,{})
            request=rows.get('quant.validationrequest',{}).get(str(target.get('request')), {})
            fixed=rows.get('quant.validationplan',{}).get(str(request.get('plan')), {})
            source=rows.get('quant.experimentrequest',{}).get(str(fixed.get('source_request')), {})
            origin=rows.get('quant.experimentresult',{}).get(str(fixed.get('data',{}).get('source',{}).get('result_id')), {})
            if not target or fixed.get('anthology')!=collection or not source or not origin:
                fail('固定验证证据来源缺失或跨文集')
            expected=evidence.fixed_validation(candidate_id,candidate['data'],target_id,target['data'],request['data'],fixed['data'],
                rows['quant.marketdataset'][request['dataset']]['snapshot'],origin['data'],source['plan'],rows['quant.marketdataset'][source['dataset']]['snapshot'],include_incomplete=row.get('admission_version',0)==1)
        elif kind=='native_python':
            from quant.native_python.evidence import verification
            target=rows.get('quant.nativepythonresult',{}).get(target_id,{})
            request=rows.get('quant.nativepythonrequest',{}).get(target.get('request'),{})
            if not target or request.get('anthology')!=collection:fail('Python验证缺失或跨文集')
            expected=verification(candidate_id,candidate['data'],target_id,request['plan'],target['data'],
                target['content_hash'],rows['quant.marketdataset'][request['dataset']]['snapshot'])
        elif kind == 'comparison':
            target = rows.get('quant.factorcomparison', {}).get(target_id, {})
            if target.get('anthology') != collection: fail('直接对照缺失或跨文集')
            dataset = rows['quant.marketdataset'][target['dataset']]
            expected = evidence.comparison(candidate_id, candidate['data'], target_id, target['plan'], target['result'], target['content_hash'], dataset['snapshot'])
        else:
            target = rows.get('quant.sourcerevision', {}).get(target_id, {})
            material = rows.get('quant.sourcematerial', {}).get(target.get('material'), {})
            if material.get('entry') != reports[candidate['report']]['entry'] or target.get('payload', {}).get('provenance') != 'external_feedback':
                fail('用户报告缺失或跨研究')
            expected = evidence.feedback(candidate_id, candidate['data'], target_id, target['payload'], target['content_hash'])
        key = (candidate_id, kind, target_id)
        if (key in seen or expected is None or digest(row.get('data')) != digest(expected) or row.get('content_hash') != digest(expected)
                or identity != digest(['factor-verification-link-1', candidate_id, kind, target_id])[:40]):
            fail('验证证据不是当前版本的直接证据或范围/层级被改写')
        seen.add(key)
    for model in (FactorQualification, FactorEvidenceLink):
        incoming = rows.get(model._meta.label_lower, {})
        for local in model.objects.filter(pk__in=incoming).values('id', *model.SNAPSHOT_FIELDS):
            if any(digest(local[field]) != digest(incoming[local['id']].get(model._meta.get_field(field).name,0 if field=='admission_version' else None)) for field in model.SNAPSHOT_FIELDS):
                fail('已有因子检查与验证事实不可覆盖')
