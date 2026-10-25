from quant.models import ResearchCampaignJob
from quant.experiments.jobs import request_data
from .services import recover


def campaign_data(campaign):
    job = ResearchCampaignJob.objects.filter(campaign=campaign).first()
    if job:
        recover(job)
    outcome = campaign.outcome.data if hasattr(campaign, 'outcome') else None
    rounds = list(campaign.rounds.select_related('experiment', 'evaluation__run'))
    return {'id': campaign.pk, 'name': campaign.plan['name'], 'created_at': campaign.created_at.isoformat(),
        'status': outcome['status'] if outcome else job.status if job else 'interrupted',
        'message': outcome['message'] if outcome else '' if job else '此设备没有连续研究执行权限，记录保留；不会自动重跑',
        'reason': outcome['reason'] if outcome else '', 'plan': campaign.plan, 'outcome': outcome,
        'reserved_attempts': sum(step.experiment.plan['config']['max_candidates'] for step in rounds),
        'reserved_compute_seconds': sum(step.experiment.plan['config']['seconds'] for step in rounds),
        'model_calls': sum(hasattr(step, 'evaluation') for step in rounds),
        'rounds': [{'ordinal': step.ordinal, 'experiment': request_data(step.experiment),
            'review_status': step.evaluation.run.status if hasattr(step, 'evaluation') else None} for step in rounds]}
