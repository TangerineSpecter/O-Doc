"""Frozen requests, local leases and durable per-attempt checkpoints."""
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from quant import queue_liveness
from quant.locking import collection_lock
from quant.models import ExperimentRequest, ExperimentJob, ExperimentResult, ExperimentCheckpoint, FactorCandidate, MarketDataset
from quant.research.contracts import digest
from quant.services import Conflict
from .contracts import unpack_seed, validate_frozen
from .search import engine_for


def recover(job: ExperimentJob) -> ExperimentJob:
    if job.status in ('pending', 'running') and (not job.lease_until or job.lease_until <= timezone.now()):
        if job.status == 'pending' and queue_liveness.alive(f'experiment:{job.pk}', job.lease_token):
            return job
        job.status, job.error, job.lease_until = 'interrupted', '本机实验已中断；已保存的尝试保留，重新运行须创建新实验', None
        job.save(update_fields=['status', 'error', 'lease_until', 'updated_at'])
    return job


def start(collection, data: dict) -> ExperimentRequest:
    from .worker import dispatch
    with collection_lock(collection.pk), transaction.atomic():
        collection.refresh_from_db()
        if not collection.is_valid or collection.type != 'quant' or collection.permission != 'private':
            raise ValidationError('量化文集不可用')
        dataset = MarketDataset.objects.filter(anthology=collection, pk=data['dataset_id']).first()
        if not dataset:
            raise ValidationError('行情不存在或不属于当前文集')
        seeds = []
        for raw in data['seeds']:
            if not isinstance(raw.get('candidate_id'), str) or len(raw['candidate_id']) > 40:
                raise ValidationError('父代候选标识无效')
            candidate = FactorCandidate.objects.filter(pk=raw.get('candidate_id'), report__entry__anthology=collection, report__entry__is_valid=True).first()
            if not candidate:
                raise ValidationError('候选不存在或不属于当前文集')
            seeds.append(unpack_seed(raw, candidate.data))
        plan = {'version': 1, 'engine_version': engine_for(data['config']), 'name': data['name'], 'dataset_hash': dataset.content_hash,
            'seeds': seeds, 'config': data['config']}
        from .proposals import attach
        attach(plan, data.get('proposal_id', ''), str(collection.pk))
        validate_frozen(plan, dataset.snapshot)
        fingerprint = digest(plan)
        existing = ExperimentRequest.objects.filter(anthology=collection, request_key=data['request_key']).first()
        if existing:
            if existing.dataset_id != dataset.pk or existing.content_hash != fingerprint:
                raise Conflict('请求标识已用于不同实验，请使用新标识')
            return existing  # Never recreate execution permission on replay.
        active = [recover(job) for job in ExperimentJob.objects.filter(request__anthology=collection, status__in=['pending', 'running'])]
        if sum(job.status in ('pending', 'running') for job in active) >= 4:
            raise Conflict('最多同时保留 4 个实验，请等待完成或停止现有实验')
        request = ExperimentRequest.objects.create(id=digest(['experiment-request-v1', collection.pk, data['request_key']])[:40],
            anthology=collection, dataset=dataset, request_key=data['request_key'], plan=plan, content_hash=fingerprint)
        job = ExperimentJob.objects.create(request=request, owner_id=collection.user_id, lease_until=timezone.now() + timedelta(minutes=3))
        transaction.on_commit(lambda: dispatch(job.pk))
        return request


def cancel(request: ExperimentRequest) -> None:
    job = ExperimentJob.objects.filter(request=request).first()
    if not job or recover(job).status not in ('pending', 'running'):
        return
    job.cancel_requested = True
    if job.status == 'pending':
        job.status, job.lease_until = 'cancelled', None
    job.error = '已请求停止；已完成的候选尝试会保留'
    job.save(update_fields=['status', 'cancel_requested', 'error', 'lease_until', 'updated_at'])
    if job.status == 'cancelled':
        from .outcomes import finish
        finish(request, 'cancelled', error='实验在开始前被取消')


def request_data(request: ExperimentRequest, *, detail=False) -> dict:
    job = ExperimentJob.objects.filter(request=request).first()
    if job:
        recover(job)
    result = ExperimentResult.objects.filter(request=request).first()
    status = result.data['status'] if result else job.status if job else 'interrupted'
    checkpoints = ExperimentCheckpoint.objects.filter(request=request)
    value = {'id': request.pk, 'name': request.plan['name'], 'dataset_id': request.dataset_id,
        'created_at': request.created_at.isoformat(), 'status': status, 'cancel_requested': bool(job and job.cancel_requested),
        'error': job.error if job else '' if result else '此设备没有执行权限，保存的方案与尝试仍可查看',
        'attempt_count': checkpoints.count(), 'content_hash': request.content_hash}
    from quant.models import AIRun
    review = AIRun.objects.filter(experiment_result=result, validation_result__isnull=True).first() if result else None
    if review:
        from quant.worker import recover as recover_review
        recover_review(review)
    value['review_status'] = review.status if review else None
    if detail:
        value['derived_candidates'] = [{'id': row.pk, 'name': row.data['name'],
            'attempt_id': row.data['derivation']['attempt_id']}
            for row in FactorCandidate.objects.filter(derived_checkpoint_id__in=checkpoints.values('id'))]
        from quant.presentation import run_data
        from quant.research.presentation import report_data
        from .reviews import review_source
        from .proposals import presentation as proposal_presentation
        from quant.models import ExperimentProposal
        origin = ExperimentProposal.objects.filter(pk=request.plan.get('proposal_id')).select_related('run__entry').first()
        value['origin_proposal'] = proposal_presentation(origin) if origin else None
        value['reviews'] = [{'run': run_data(row), 'report': report_data(row.report) if hasattr(row, 'report') else None,
            'proposal': proposal_presentation(row.experiment_proposal) if hasattr(row, 'experiment_proposal') else None}
            for row in AIRun.objects.filter(experiment_result=result, validation_result__isnull=True).select_related('report', 'experiment_proposal').prefetch_related('report__revisions')[:10]] if result else []
        value['review_context'] = None
        if result:
            try:
                source = review_source(result)
                value['review_context'] = {'experiment_result_id': result.pk, 'entry_id': source.material.entry_id, 'source_id': source.pk}
            except ValidationError:
                pass  # Deleted origin remains historical evidence, but cannot receive new reports.
        # Exact case-sensitive parameter names live inside JSON strings at the HTTP boundary.
        # The project response middleware otherwise camel-cases arbitrary object keys.
        import json
        from .sensitivity import analyze
        from .joint_sensitivity import analyze as joint_analysis
        from .temporal_sensitivity import analyze as temporal_analysis
        from .combination import analyze as combination_analysis
        attempts = list(checkpoints.values_list('attempt', flat=True))
        value['sensitivity_json'] = json.dumps(analyze(request.plan, attempts), ensure_ascii=False, allow_nan=False)
        value['joint_sensitivity_json'] = json.dumps(joint_analysis(request.plan, attempts), ensure_ascii=False, allow_nan=False)
        value['temporal_sensitivity_json'] = json.dumps(temporal_analysis(request.plan, attempts), ensure_ascii=False, allow_nan=False)
        value['combination_analysis_json'] = json.dumps(combination_analysis(request.plan, attempts), ensure_ascii=False, allow_nan=False)
        value.update(plan_json=json.dumps(request.plan, ensure_ascii=False, allow_nan=False),
            result_json=json.dumps(result.data, ensure_ascii=False, allow_nan=False) if result else None,
            attempts_json=json.dumps(attempts, ensure_ascii=False, allow_nan=False))
        from quant.search_diagnostics.services import presentation as diagnostic_presentation
        value['selection_diagnostic']=diagnostic_presentation(result)
    return value
