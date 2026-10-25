"""Reconstruct rule decisions and required records; restore never runs research."""
from quant.models import FactorAdmission
from quant.research.contracts import digest
from quant.research_memory.contract import instant
from .policy import assess,identity,comparison_context


def validate_admissions(rows,fail):
    candidates=rows.get('quant.factorcandidate',{});qualifications=rows.get('quant.factorqualification',{})
    evidence=rows.get('quant.factorevidencelink',{});records=rows.get('quant.factoradmission',{})
    seen=set()
    for key,row in records.items():
        candidate=qualifications.get(row.get('qualification'))
        target=evidence.get(row.get('evidence')) if row.get('evidence') else None
        if (not candidate or row.get('candidate')!=candidate['candidate'] or row.get('candidate') not in candidates
                or row.get('evidence') and (not target or target['candidate']!=row['candidate'])
                or type(row.get('policy_version')) is not int or row['policy_version']!=1):
            fail('研究分层缺少同版本的检查或直接证据')
        basis={'kind':target['kind'] if target else 'qualification','id':row['evidence'] if target else row['qualification'],
            'content_hash':target['content_hash'] if target else candidate['content_hash'],
            'data':target['data'] if target else candidate['data']}
        if target and target['kind']=='comparison':basis['context']=comparison_context(rows['quant.factorcomparison'][target['target_id']]['result'])
        expected=assess(candidate['data'],basis);unique=(row['candidate'],basis['id'])
        if (unique in seen or key!=identity(*unique) or digest(row.get('data'))!=digest(expected)
                or row.get('stage')!=expected['stage'] or row.get('outcome')!=expected['outcome']
                or row.get('content_hash')!=digest(expected)
                or instant(row['created_at'])<instant((target or candidate)['created_at'])):
            fail('研究分层的依据、范围或规则判断被改写')
        seen.add(unique)
    qualified={row['candidate']:key for key,row in qualifications.items()}
    for key,row in candidates.items():
        version=row.get('admission_version',0)
        if type(version) is not int or version not in (0,1):fail('因子研究分层版本无效')
        if version and (key,qualified.get(key)) not in seen:fail('新因子缺少规定的自动研究分层记录')
    for key,row in evidence.items():
        version=row.get('admission_version',0)
        if type(version) is not int or version not in (0,1):fail('证据分层版本无效')
        if version and (row['candidate'],key) not in seen:fail('新直接证据缺少规定的研究分层记录')
    for local in FactorAdmission.objects.filter(pk__in=records).values('id',*FactorAdmission.SNAPSHOT_FIELDS):
        incoming=records[local['id']]
        if any(digest(local[field])!=digest(incoming.get(FactorAdmission._meta.get_field(field).name)) for field in FactorAdmission.SNAPSHOT_FIELDS):
            fail('已有研究分层记录不可覆盖')
