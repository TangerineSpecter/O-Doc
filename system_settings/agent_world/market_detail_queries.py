"""Unbounded source queries; the private model adapter applies explicit pagination."""
from system_settings.models import AgentRunRecord
from .life_models import LifeGoal, LifeItem, LifeProfile
from .life_schedule import OPEN
from .life_time import local_time
from .life_budget_policy import effective_budget


def life_details(owner: str, agent) -> dict:
    profile = LifeProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
    goals = list(LifeGoal.objects.filter(owner_id=owner, actor_id=agent.pk, status='active')
                 .order_by('id').values('id', 'title', 'condition', 'progress'))
    upcoming = [{'id': row.pk, 'time': row.scheduled_at.isoformat(), 'activity': row.activity,
                 'intent': row.intent, 'budget': str(effective_budget(row)), 'spent': str(row.spent)}
                for row in LifeItem.objects.filter(owner_id=owner, actor_id=agent.pk, status__in=OPEN)
                .order_by('scheduled_at', 'id')]
    today = list(LifeItem.objects.filter(owner_id=owner, actor_id=agent.pk, scheduled_at__date=local_time().date())
                 .order_by('scheduled_at', 'id').values('id', 'activity', 'status', 'intent', 'result'))
    return {'goals': goals, 'upcoming': upcoming, 'today': today,
            'preferences': profile.preferences if profile else '', 'direction': profile.direction if profile else ''}


def experiences(agent) -> list[dict]:
    return list(AgentRunRecord.objects.filter(agent_id=agent.pk).order_by('-created_at', 'id')
                .values('id', 'task_name', 'status', 'summary', 'created_at'))
