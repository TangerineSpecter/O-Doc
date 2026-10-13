"""Read-only input for the activity-choice stage; never initializes domain state."""
from system_settings.models import AgentRunRecord
from .execution import stamina
from .life_config import tasks_for
from .life_models import LifeGoal, LifeItem, LifeProfile
from .life_time import local_time
from .social_models import SocialOpportunity
from .travel_models import TravelJourney
from .travel_config import bound_skill


def readonly_proposal_context(owner: str, agent) -> dict:
    """Load the facts consumed by selection_context without market/farm setup.

    Prices, inventory and domain plans are not used by the activity-choice prompt.
    They remain the responsibility of the subsequent feasibility/planning stage.
    """
    profile = LifeProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
    return {
        'actor_id': agent.pk, 'actor_name': agent.name, 'role': agent.prompt,
        'profession_id': agent.profession_id,
        'profession': agent.profession.name if agent.profession_id else '未设置',
        'preferences': profile.preferences if profile else '',
        'direction': profile.direction if profile else '', 'stamina': str(stamina(agent)),
        'goals': list(LifeGoal.objects.filter(owner_id=owner, actor_id=agent.pk, status='active')
                      .values('id', 'title', 'condition', 'progress')[:20]),
        'ongoing_travel': list(TravelJourney.objects.filter(actor_id=agent.pk, owner_id=owner,
            returned_at__isnull=True, status__in=['active', 'waiting', 'paused', 'manual'])
            .values('id', 'phase', 'status')[:5]),
        'activities': [{'kind': task.task_kind, 'task_id': task.pk, 'preference': task.prompt}
            for task in tasks_for(owner) if task.enabled and task.task_kind != 'market'
            and (task.task_kind != 'travel' or bound_skill(agent, 'odoc_travel_journal'))],
        'recent_experiences': list(AgentRunRecord.objects.filter(agent_id=agent.pk)
            .order_by('-created_at').values('id', 'task_name', 'status', 'summary', 'created_at')[:20]),
        'recent_social': list(SocialOpportunity.objects.filter(owner_id=owner, actor_id=agent.pk, status='completed')
            .order_by('-created_at').values('id', 'result', 'created_at')[:10]),
        'today': list(LifeItem.objects.filter(owner_id=owner, actor_id=agent.pk,
            scheduled_at__date=local_time().date()).values('id', 'activity', 'status', 'intent', 'result')[:50]),
    }
