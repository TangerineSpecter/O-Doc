"""Versioned main-schedule input projection. Domain details load after selection."""
from datetime import timedelta
from django.db.models import Count
from .life_activities import MAIN_ACTIVITIES, main_items
from .life_time import local_time, storage_time


def build(owner, agent, items):
    from .life_models import LifeProfile, LifeGoal, LifeItem
    from .life_config import tasks_for
    from .life_scope import allowed
    from .travel_config import bound_skill
    from .life_budget_policy import allows_spending
    from .execution import stamina
    from .stamina_settings import public_settings
    profile = LifeProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
    start = local_time(items[0].scheduled_at).replace(hour=0, minute=0, second=0, microsecond=0)
    counts = dict(main_items(LifeItem.objects.filter(owner_id=owner, actor_id=agent.pk,
        scheduled_at__gte=storage_time(start), scheduled_at__lt=storage_time(start + timedelta(days=1)),
        status='completed')).values('activity').annotate(total=Count('pk')).values_list('activity', 'total'))
    tasks = [t for t in tasks_for(owner) if t.enabled and t.task_kind in MAIN_ACTIVITIES and allowed(t, agent.pk)
             and (t.task_kind != 'travel' or bound_skill(agent, 'odoc_travel_journal'))]
    goals = list(LifeGoal.objects.filter(owner_id=owner, actor_id=agent.pk, status='active')
        .values('id', 'title', 'condition'))
    from .life_commitments import commitments
    reserved = commitments(owner, agent.pk, exclude_ids=[i.pk for i in items])
    return {'energy_commitments': [{'id': c.key, 'time': c.at.isoformat(), 'energy': str(c.energy) if c.energy is not None else None} for c in reserved],
        'activity_energy': {t.task_kind: (t.travel_config or {}).get('energy_cost', 20) if t.task_kind == 'travel' else {'post_interaction': 10, 'post_publish': 20, 'investment': 5, 'farm': 2, 'lottery': 0}[t.task_kind] for t in tasks},
        'input_version': 2, 'actor_id': agent.pk,
        'personality': (agent.role_profile or {}).get('personality', ''),
        'preferences': profile.preferences if profile else '', 'direction': profile.direction if profile else '',
        'goals': [g for g in goals if g['condition'].get('kind') in ('travel', 'savings', 'subjective')],
        'stamina': str(stamina(agent)), 'recovery': public_settings(), 'completed_today': counts,
        'activities': [{'kind': t.task_kind, 'task_id': t.pk, 'allows_spending': allows_spending(t.task_kind)} for t in tasks],
        'requirements': {t.task_kind: t.prompt for t in tasks if t.prompt},
        'slots': [{'id': i.pk, 'time': local_time(i.scheduled_at).isoformat(), 'current_activity': i.activity} for i in items]}
