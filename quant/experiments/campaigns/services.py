from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from quant.locking import collection_lock
from quant.models import ResearchCampaign, ResearchCampaignJob, ResearchOutcome, ExperimentProposal, MarketDataset, Job
from quant.research.contracts import digest
from quant.services import Conflict, model_config
from quant import queue_liveness
from .contracts import validate_plan

ACTIVE = ('pending', 'running')
REASONS = {'round_budget': '达到轮数预算', 'attempt_budget': '剩余候选预算不足以执行下一方案',
    'compute_budget': '剩余计算时间预算不足', 'wall_budget': '达到总耗时上限', 'datasets_exhausted': '预选行情已用完',
    'model_stop': 'AI 未提出下一轮方案', 'experiment_failed': '实验失败或中断', 'experiment_cancelled': '实验已被停止',
    'review_failed': '解读失败或中断', 'review_cancelled': '解读已被停止', 'invalid_next_plan': '下一方案或行情无法执行',
    'cancelled': '用户停止连续研究', 'interrupted': '本机协调任务已中断', 'executor_failed': '本机协调执行器不可用'}


def start(collection, data):
    from .worker import dispatch
    with collection_lock(collection.pk), transaction.atomic():
        collection.refresh_from_db()
        if not collection.is_valid or collection.type != 'quant' or collection.permission != 'private':
            raise ValidationError('量化文集不可用')
        proposal = ExperimentProposal.objects.filter(pk=data['proposal_id'], run__entry__anthology=collection).first()
        if not proposal:
            raise ValidationError('连续研究起点方案不属于当前文集')
        plan = {'version': 1, **{key: value for key, value in data.items() if key != 'request_key'}}
        existing = ResearchCampaign.objects.filter(anthology=collection, request_key=data['request_key']).first()
        if existing:
            if not plan['model_id']:
                plan['model_id'] = existing.plan['model_id']
            if digest(plan) != existing.content_hash:
                raise Conflict('请求标识已用于其他连续研究')
            return existing
        config = model_config(plan['model_id'])
        plan['model_id'] = str(config.get('model_id') or plan['model_id'])
        validate_plan(plan)
        if MarketDataset.objects.filter(pk__in=plan['dataset_ids'], anthology=collection).count() != len(plan['dataset_ids']):
            raise ValidationError('行情不存在或不属于当前文集')
        if proposal.data['config']['max_candidates'] > plan['max_attempts'] or proposal.data['config']['seconds'] > plan['compute_seconds']:
            raise ValidationError('总预算不足以执行第一轮方案')
        for job in ResearchCampaignJob.objects.filter(campaign__anthology=collection, status__in=ACTIVE):
            recover(job)
        if ResearchCampaignJob.objects.filter(campaign__anthology=collection, status__in=ACTIVE).count() >= 2:
            raise Conflict('最多同时执行 2 项连续研究')
        campaign = ResearchCampaign.objects.create(id=digest(['research-campaign-v1', collection.pk, data['request_key']])[:40],
            anthology=collection, proposal=proposal, request_key=data['request_key'], plan=plan, content_hash=digest(plan))
        job = ResearchCampaignJob.objects.create(campaign=campaign, owner_id=collection.user_id,
            lease_until=timezone.now() + timedelta(minutes=3), deadline=timezone.now() + timedelta(seconds=plan['wall_seconds']))
        transaction.on_commit(lambda: dispatch(job.pk))
        return campaign


def cancel_children(campaign):
    from quant.experiments.jobs import cancel
    from quant.worker import interrupt
    for step in campaign.rounds.select_related('experiment', 'evaluation__run'):
        cancel(step.experiment)
        if hasattr(step, 'evaluation'):
            run = step.evaluation.run
            if run.status in ACTIVE:
                Job.objects.filter(run=run).update(cancelled=True, stage='连续研究已停止', lease_until=None)
                run.status, run.error = 'cancelled', '连续研究已停止'
                run.save(update_fields=['status', 'error', 'updated_at'])
                interrupt(run.pk)


def finish(job, reason, *, stop_children=False):
    if stop_children:
        cancel_children(job.campaign)
    status = 'completed' if reason in ('round_budget', 'model_stop') else 'cancelled' if reason == 'cancelled' else 'interrupted' if reason == 'interrupted' else 'stopped'
    data = {'version': 1, 'status': status, 'reason': reason, 'message': REASONS[reason],
        'round_count': job.campaign.rounds.count(), 'independent_validation_proven': False}
    ResearchOutcome.objects.get_or_create(id=digest(['research-outcome-v1', job.campaign_id])[:40],
        defaults={'campaign': job.campaign, 'data': data, 'content_hash': digest(data)})
    job.status, job.lease_until = status, None
    job.save(update_fields=['status', 'lease_until', 'updated_at'])


def recover(job):
    if job.status not in ACTIVE:
        return job
    with collection_lock(job.campaign.anthology_id), transaction.atomic():
        job.refresh_from_db()
        if job.status not in ACTIVE:
            return job
        if timezone.now() >= job.deadline:
            finish(job, 'wall_budget', stop_children=True)
        elif not job.lease_until or job.lease_until <= timezone.now():
            if not queue_liveness.alive(f'campaign:{job.pk}', job.lease_token):
                finish(job, 'interrupted', stop_children=True)
    return job


def cancel(campaign):
    with collection_lock(campaign.anthology_id), transaction.atomic():
        job = ResearchCampaignJob.objects.filter(campaign=campaign, status__in=ACTIVE).first()
        if job:
            finish(job, 'cancelled', stop_children=True)
