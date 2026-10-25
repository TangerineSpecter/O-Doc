"""Append scoped admissions inside existing publication transactions."""
import json
from django.db import transaction
from django.db.models import Prefetch
from rest_framework.exceptions import ValidationError
from quant.models import FactorAdmission,FactorQualification
from quant.research.contracts import digest
from .policy import assess,identity,STAGES,REVIEW_OUTCOMES,comparison_context


def publish(candidate,qualification,evidence=None):
    basis={'kind':evidence.kind if evidence else 'qualification','id':evidence.pk if evidence else qualification.pk,
        'content_hash':evidence.content_hash if evidence else qualification.content_hash,
        'data':evidence.data if evidence else qualification.data}
    if evidence and evidence.kind=='comparison':
        from quant.models import FactorComparison
        basis['context']=comparison_context(FactorComparison.objects.get(pk=evidence.target_id).result)
    value=assess(qualification.data,basis)
    record,_=FactorAdmission.objects.get_or_create(pk=identity(candidate.pk,basis['id']),defaults={
        'candidate':candidate,'qualification':qualification,'evidence':evidence,'policy_version':1,
        'stage':value['stage'],'outcome':value['outcome'],'data':value,'content_hash':digest(value)})
    if record.content_hash!=digest(value):raise ValidationError('同一分层依据的内容发生冲突，原记录保留')
    return record


def summary(candidate):
    records=list(candidate.admission_records.all())
    return {'version':1,'stage':max((row.stage for row in records),key=STAGES.index) if records else 'unrecorded',
        'record_count':len(records),'review_count':sum(row.outcome in REVIEW_OUTCOMES for row in records),
        'criteria_met_count':sum(row.outcome=='criteria_met' for row in records),
        'criteria_not_met_count':sum(row.outcome=='criteria_not_met' for row in records),
        'scope':'exact_formula_and_observation_configuration'}


def detail(candidate,offset=0,limit=20):
    records=FactorAdmission.objects.filter(candidate=candidate).select_related('evidence').order_by('-created_at','id')
    return {'summary':summary(candidate),'total':records.count(),'items':[
        {'id':row.pk,'stage':row.stage,'outcome':row.outcome,'created_at':row.created_at.isoformat(),
            'content_hash':row.content_hash,'evidence_id':row.evidence_id,'kind':row.evidence.kind if row.evidence_id else 'qualification',
            'target_id':row.evidence.target_id if row.evidence_id else row.qualification_id,
            'data_json':json.dumps(row.data,ensure_ascii=False)} for row in records[offset:offset+limit]],
        'independent_validation':False,'platform_equivalence':'unverified','economic_effectiveness':'unassessed'}


def backfill(candidate,offset=0,limit=20):
    """Explicit legacy indexing; no experiment, model, source or platform execution."""
    from quant.locking import collection_lock
    from quant.verification.services import qualify
    with collection_lock(candidate.report.entry.anthology_id),transaction.atomic():
        qualification=qualify(candidate)
        records=candidate.verification_evidence.order_by('created_at','id');total=records.count()
        for evidence in records[offset:offset+limit]:publish(candidate,qualification,evidence)
    return {'scanned':min(limit,max(0,total-offset)),'total':total,'next_offset':min(total,offset+limit),
        'has_more':offset+limit<total,'claim':'legacy_research_layer_index_only_no_execution'}


def compact_prefetch():
    return Prefetch('admission_records',queryset=FactorAdmission.objects.only('id','candidate_id','stage','outcome'))
