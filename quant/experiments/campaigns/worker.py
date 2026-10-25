"""One bounded coordinator per campaign; child work uses existing revocable queues."""
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from django.conf import settings
from django.db import close_old_connections, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from quant import queue_liveness
from quant.locking import collection_lock
from quant.models import ResearchCampaignJob, ResearchRound, ResearchEvaluation, ExperimentResult, ExperimentProposal
from quant.research.contracts import digest
from quant.services import Conflict, ModelUnavailable
from .contracts import experiment_input
from .services import ACTIVE, finish, recover

executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='quant-research')


def dispatch(identity):
    if getattr(settings, 'QUANT_DISABLE_WORKERS', False):
        return
    job = ResearchCampaignJob.objects.filter(pk=identity, status='pending').first()
    if not job:
        return
    lease = queue_liveness.claim(f'campaign:{job.pk}', job.lease_token)
    if not lease:
        return
    try:
        future = executor.submit(execute, identity, job.lease_token)
    except Exception:
        lease.close()
        with collection_lock(job.campaign.anthology_id), transaction.atomic():
            current = authorized(identity, job.lease_token)
            if current and current.status == 'pending':
                finish(current, 'executor_failed', stop_children=True)
        return
    future.add_done_callback(lambda _future: lease.close())


def authorized(identity, token):
    job = ResearchCampaignJob.objects.select_related('campaign__anthology', 'campaign__proposal').filter(
        pk=identity, lease_token=token, status__in=ACTIVE, campaign__anthology__is_valid=True,
        campaign__anthology__type='quant', campaign__anthology__permission='private').first()
    if not job or str(job.owner_id) != str(job.campaign.anthology.user_id):
        return None
    return job


def advance(identity, token):
    """Advance one state transition, idempotently; reads never call this."""
    from quant.experiments.jobs import start, request_data
    from quant.experiments.reviews import start_review
    from quant.worker import recover as recover_review
    job = authorized(identity, token)
    if not job:
        return False
    with collection_lock(job.campaign.anthology_id), transaction.atomic():
        job = authorized(identity, token)
        if not job or recover(job).status not in ACTIVE:
            return False
        job.status, job.lease_until = 'running', timezone.now() + timedelta(minutes=3)
        job.save(update_fields=['status', 'lease_until', 'updated_at'])
        campaign, plan = job.campaign, job.campaign.plan
        rounds = list(campaign.rounds.select_related('experiment', 'evaluation__run'))
        proposal = campaign.proposal
        if rounds:
            latest = rounds[-1]
            state = request_data(latest.experiment)['status']
            if state in ACTIVE:
                return True
            if state != 'completed':
                finish(job, 'experiment_cancelled' if state == 'cancelled' else 'experiment_failed', stop_children=True)
                return False
            if not hasattr(latest, 'evaluation'):
                try:
                    from .review_context import requirements as review_requirements
                    run = start_review(ExperimentResult.objects.get(request=latest.experiment),
                        request_key=digest(['campaign-review-v1', campaign.pk, latest.ordinal])[:40], model_id=plan['model_id'],
                        requirements=review_requirements(job, rounds))
                    ResearchEvaluation.objects.create(id=digest(['research-evaluation-v1', latest.pk])[:40], round=latest, run=run)
                except (ValidationError, Conflict, ModelUnavailable):
                    finish(job, 'review_failed')
                    return False
                return True
            run = recover_review(latest.evaluation.run)
            if run.status in ACTIVE:
                return True
            if run.status != 'completed':
                finish(job, 'review_cancelled' if run.status == 'cancelled' else 'review_failed')
                return False
            if len(rounds) >= plan['max_rounds']:
                finish(job, 'round_budget')
                return False
            proposal = ExperimentProposal.objects.filter(run=run).first()
            if not proposal:
                finish(job, 'model_stop')
                return False
        if len(rounds) >= len(plan['dataset_ids']):
            finish(job, 'datasets_exhausted')
            return False
        reserved = sum(step.experiment.plan['config']['max_candidates'] for step in rounds)
        compute = sum(step.experiment.plan['config']['seconds'] for step in rounds)
        if reserved + proposal.data['config']['max_candidates'] > plan['max_attempts']:
            finish(job, 'attempt_budget')
            return False
        if compute + proposal.data['config']['seconds'] > plan['compute_seconds']:
            finish(job, 'compute_budget')
            return False
        ordinal = len(rounds) + 1
        try:
            # Nested atomic rolls back a child if step creation fails. All dispatches
            # run only after both the child and its campaign link are committed.
            with transaction.atomic():
                request = start(campaign.anthology, experiment_input(proposal, plan['dataset_ids'][ordinal - 1],
                    digest(['campaign-experiment-v1', campaign.pk, ordinal])[:40]))
                ResearchRound.objects.create(id=digest(['research-round-v1', campaign.pk, ordinal])[:40],
                    campaign=campaign, ordinal=ordinal, experiment=request)
        except (ValidationError, Conflict):
            finish(job, 'invalid_next_plan')
            return False
        return True


def execute(identity, token):
    close_old_connections()
    try:
        while advance(identity, token):
            time.sleep(1)
    except Exception:
        job = authorized(identity, token)
        if job:
            with collection_lock(job.campaign.anthology_id), transaction.atomic():
                job = authorized(identity, token)
                if job:
                    finish(job, 'interrupted', stop_children=True)
    finally:
        close_old_connections()
