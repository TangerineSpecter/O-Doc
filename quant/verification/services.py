"""Publish automatic admission and direct evidence inside authorized transactions."""
from quant.models import FactorCandidate, FactorQualification, FactorEvidenceLink
from quant.research.contracts import digest
from .structure import qualification
from . import evidence


def qualify(candidate):
    value = qualification(candidate.data)
    row, _ = FactorQualification.objects.get_or_create(id=digest(['factor-qualification-1', candidate.pk])[:40], defaults={
        'candidate': candidate, 'policy_version': 1, 'data': value, 'content_hash': digest(value)})
    from quant.admissions.services import publish
    publish(candidate,row)
    return row


def link(candidate, kind, target_id, value):
    if value is None: return
    qualified=qualify(candidate)
    record=FactorEvidenceLink.objects.get_or_create(id=digest(['factor-verification-link-1', candidate.pk, kind, target_id])[:40], defaults={
        'candidate': candidate, 'kind': kind, 'target_id': target_id, 'data': value, 'content_hash': digest(value), 'admission_version':1})[0]
    from quant.admissions.services import publish
    publish(candidate,qualified,record)
    return record


def experiment(result):
    request = result.request
    ids = [row['id'] for row in request.plan['seeds']]
    candidates = FactorCandidate.objects.filter(pk__in=ids) | FactorCandidate.objects.filter(derived_checkpoint_id__in=request.checkpoints.values('id'))
    for candidate in candidates:
        value = evidence.experiment(candidate.pk, candidate.data, result.pk, result.data, request.plan, request.dataset.snapshot, request.pk)
        link(candidate, 'experiment', result.pk, value)


def comparison(record):
    for candidate in FactorCandidate.objects.filter(pk__in=(record.left_id, record.right_id)):
        value = evidence.comparison(candidate.pk, candidate.data, record.pk, record.plan, record.result, record.content_hash, record.dataset.snapshot)
        link(candidate, 'comparison', record.pk, value)


def feedback(source):
    candidate = FactorCandidate.objects.filter(pk=source.payload.get('factor_id'), report__entry_id=source.material.entry_id).first()
    if candidate:
        link(candidate, 'feedback', source.pk, evidence.feedback(candidate.pk, candidate.data, source.pk, source.payload, source.content_hash))


def native_python(result):
    from quant.native_python.evidence import verification
    request=result.request;candidate=request.candidate
    link(candidate,'native_python',result.pk,verification(candidate.pk,candidate.data,result.pk,
        request.plan,result.data,result.content_hash,request.dataset.snapshot))


def projection(candidate):
    records = list(candidate.qualifications.all())
    current = next((row for row in records if row.policy_version == 1), None)
    return {'policy_version': 1, 'qualification_id': current.pk if current else '',
        'reuse_status': current.data['reuse_status'] if current else 'unchecked',
        'automatic_experiment_ready': current.data['automatic_experiment_ready'] if current else False,
        'blockers': current.data['blockers'] if current else [], 'scope': 'portable_expression_declared_contract_only'}


def detail(candidate, offset=0, limit=20):
    import json
    from quant.repairs.presentation import detail as repair_detail
    current = candidate.qualifications.filter(policy_version=1).first()
    links = candidate.verification_evidence.order_by('-created_at', 'id')
    levels = sorted({level for values in links.values_list('data__levels', flat=True) for level in values})
    return projection(candidate) | repair_detail(candidate) | {'qualification_json': json.dumps(current.data, ensure_ascii=False) if current else '',
        'levels': levels, 'total': links.count(), 'items': [{'id': row.pk, 'kind': row.kind, 'target_id': row.target_id,
            'created_at': row.created_at.isoformat(), 'content_hash': row.content_hash, 'data_json': json.dumps(row.data, ensure_ascii=False)}
            for row in links[offset:offset + limit]],
        'independent_validation': False, 'platform_equivalence': 'unverified', 'economic_effectiveness': 'unassessed'}


def backfill(candidate, offset=0, limit=20, kind='experiment'):
    """Explicit bounded legacy indexing; never execute source, experiments or AI."""
    from django.db.models import Q
    from quant.models import ExperimentResult, FactorComparison, SourceRevision
    qualify(candidate)
    coll = candidate.report.entry.anthology_id
    if kind == 'experiment':
        experiments = ExperimentResult.objects.filter(request__anthology_id=coll).order_by('created_at', 'id')
        total = experiments.count()
        # Only read full results/datasets for an explicitly linked seed or derivation.
        for identity, seeds in experiments.values_list('id', 'request__plan__seeds')[offset:offset + limit]:
            if any(seed['id'] == candidate.pk for seed in seeds):
                result = experiments.select_related('request__dataset').get(pk=identity)
                link(candidate, 'experiment', identity, evidence.experiment(candidate.pk, candidate.data, identity,
                    result.data, result.request.plan, result.request.dataset.snapshot, result.request_id))
        if offset == 0 and candidate.derived_checkpoint_id:
            result = experiments.select_related('request__dataset').filter(request__checkpoints__id=candidate.derived_checkpoint_id).first()
            if result: link(candidate, 'experiment', result.pk, evidence.experiment(candidate.pk, candidate.data,
                result.pk, result.data, result.request.plan, result.request.dataset.snapshot, result.request_id))
    elif kind == 'comparison':
        records = FactorComparison.objects.filter(Q(left=candidate) | Q(right=candidate)).order_by('created_at', 'id')
        total = records.count()
        for record in records.select_related('dataset')[offset:offset + limit]:
            link(candidate, 'comparison', record.pk, evidence.comparison(candidate.pk, candidate.data,
                record.pk, record.plan, record.result, record.content_hash, record.dataset.snapshot))
    elif kind in ('fixed_validation','native_python'):
        from quant.models import ValidationResult,NativePythonResult
        if kind=='native_python':
            records=NativePythonResult.objects.filter(request__candidate=candidate).select_related('request__dataset')
        else:
            records=ValidationResult.objects.filter(request__plan__anthology_id=coll).select_related('request__dataset','request__plan__source_request__dataset')
        records=records.order_by('created_at','id');total=records.count()
        for result in records[offset:offset+limit]:
            if kind=='native_python':
                from quant.native_python.evidence import verification
                request=result.request
                value=verification(candidate.pk,candidate.data,result.pk,request.plan,result.data,result.content_hash,request.dataset.snapshot)
            else:
                request=result.request;plan=request.plan;source=plan.source_request
                value=evidence.fixed_validation(candidate.pk,candidate.data,result.pk,result.data,request.data,plan.data,
                    request.dataset.snapshot,source.result.data,source.plan,source.dataset.snapshot,include_incomplete=True)
            link(candidate,kind,result.pk,value)
    else:
        records = SourceRevision.objects.filter(material__entry__anthology_id=coll, payload__factor_id=candidate.pk).order_by('created_at', 'id')
        total = records.count()
        for source in records[offset:offset + limit]:
            link(candidate, 'feedback', source.pk, evidence.feedback(candidate.pk, candidate.data, source.pk, source.payload, source.content_hash))
    return {'kind': kind, 'scanned': min(limit, max(0, total - offset)), 'next_offset': min(total, offset + limit), 'total': total,
        'has_more': offset + limit < total, 'claim': 'legacy_index_only_no_execution'}


def fixed_validation(result):
    request=result.request;plan=request.plan;source=plan.source_request
    ids=[row['id'] for row in source.plan['seeds']]
    candidates=FactorCandidate.objects.filter(pk__in=ids) | FactorCandidate.objects.filter(derived_checkpoint_id__in=source.checkpoints.values('id'))
    for candidate in candidates:
        value=evidence.fixed_validation(candidate.pk,candidate.data,result.pk,result.data,request.data,plan.data,
            request.dataset.snapshot,source.result.data,source.plan,source.dataset.snapshot,include_incomplete=True)
        link(candidate,'fixed_validation',result.pk,value)
