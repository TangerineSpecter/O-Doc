"""有界生活事实输入；缺失资源标为未知，不装载同步审计链。"""
from system_settings.models import AgentRunRecord
from .life_budget_policy import allows_spending
from .life_models import LifeProfile, LifeGoal, LifeItem
from .life_schedule import OPEN
from .life_config import tasks_for
from .life_time import local_time
from .travel_models import TravelJourney


def build_social_context(owner: str, agent) -> dict:
    """Load only the bounded facts consumed by social decisions and publish evidence."""
    from .social_models import SocialOpportunity
    context = {
        'actor_id': agent.pk,
        'recent_social': list(SocialOpportunity.objects.filter(
            owner_id=owner, actor_id=agent.pk, status='completed'
        ).order_by('-created_at').values('id', 'result', 'created_at')[:5]),
        'recent_experiences': list(AgentRunRecord.objects.filter(
            agent_id=agent.pk
        ).order_by('-created_at').values('id', 'task_name', 'status', 'summary', 'created_at')[:8]),
        'ongoing_travel': list(TravelJourney.objects.filter(
            actor_id=agent.pk, returned_at__isnull=True, status__in=['active', 'waiting', 'paused', 'manual']
        ).values('phase', 'status')[:5]),
    }
    profile = LifeProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
    context['preferences'] = profile.preferences if profile else ''
    context['direction'] = profile.direction if profile else ''
    context['goals'] = list(LifeGoal.objects.filter(owner_id=owner, actor_id=agent.pk, status='active').values('id', 'title', 'condition', 'progress')[:20])
    import json
    from django.core.serializers.json import DjangoJSONEncoder
    return json.loads(json.dumps(context, cls=DjangoJSONEncoder, ensure_ascii=False))


def build_execution_context(owner: str, agent, item: LifeItem) -> dict:
    """Facts used by scoped tools after planning; do not prebuild every life domain."""
    context = {'current': {'id': item.pk, 'activity': item.activity, 'intent': item.intent}}
    if item.activity in ('market', 'farm', 'cooking', 'alchemy'):
        profile = LifeProfile.objects.filter(pk=agent.pk, owner_id=owner).only('preferences', 'direction').first()
        if profile and profile.preferences:
            context['preferences'] = profile.preferences
        if item.activity == 'market' and profile and profile.direction:
            context['direction'] = profile.direction
    if item.activity == 'market':
        from .life_config import config_for, effective_settings
        context['farm_queue_rules'] = {
            'check_minutes': 30,
            'start': '个人farm日程时间',
            'cutoff': effective_settings(config_for(owner)).get('active_end', '24:00'),
            'rule': '当天规划数量和种植顺序，市场错开采购，成熟跨日收获；后续执行不调用模型。',
        }
    return context


def build_planning_selection_context(owner: str, agent, items: list[LifeItem]) -> dict:
    """Load activity-selection facts only; defer money, farming, combat and inventory queries."""
    from .execution import stamina

    profile = LifeProfile.objects.filter(pk=agent.pk, owner_id=owner).only('preferences', 'direction').first()
    goals = list(LifeGoal.objects.filter(owner_id=owner, actor_id=agent.pk, status='active')
                 .values('id', 'title', 'condition', 'progress')[:20])
    from .social_models import SocialOpportunity
    recent_social = [
        {'result': {'action': row.get('result__action')}, 'created_at': row['created_at']}
        for row in SocialOpportunity.objects.filter(owner_id=owner, actor_id=agent.pk, status='completed')
        .order_by('-created_at').values('result__action', 'created_at')[:5]
    ]
    recent_experiences = list(AgentRunRecord.objects.filter(agent_id=agent.pk)
                              .order_by('-created_at').values('id', 'task_name', 'status', 'summary', 'created_at')[:8])
    from .travel_models import TravelJourney
    ongoing_travel = list(TravelJourney.objects.filter(
        actor_id=agent.pk, returned_at__isnull=True,
        status__in=['active', 'waiting', 'paused', 'manual'],
    ).values('phase', 'status')[:5])
    from .travel_config import bound_skill
    activities = [
        {'kind': task.task_kind, 'task_id': task.pk, 'preference': task.prompt,
         'allows_spending': allows_spending(task.task_kind)}
        for task in tasks_for(owner)
        if task.enabled and task.task_kind != 'market'
        and (task.task_kind != 'travel' or bound_skill(agent, 'odoc_travel_journal'))
    ]
    farm_rows = LifeItem.objects.filter(
        owner_id=owner, actor_id=agent.pk, status__in=OPEN, activity='farm',
    ).order_by('scheduled_at').values('id', 'scheduled_at', 'activity')[:50]
    upcoming_farm = [
        {'id': row['id'], 'time': row['scheduled_at'].isoformat(), 'activity': row['activity']}
        for row in farm_rows
    ]
    today = local_time().date()
    today_items = list(LifeItem.objects.filter(
        owner_id=owner, actor_id=agent.pk, scheduled_at__date=today,
    ).values('id', 'activity', 'status', 'intent')[:50])
    context = {
        'actor_id': agent.pk,
        'actor_name': agent.name,
        'profession': agent.profession.name if agent.profession_id else '未设置',
        'preferences': profile.preferences if profile else '',
        'direction': profile.direction if profile else '',
        'goals': goals,
        'ongoing_travel': ongoing_travel,
        'stamina': str(stamina(agent)),
        'activities': activities,
        'recent_experiences': recent_experiences,
        'recent_social': recent_social,
        'today': today_items,
        'upcoming': upcoming_farm,
        'slots': [
            {'id': item.pk, 'time': item.scheduled_at.isoformat(),
             'current_activity': item.activity, 'spent': str(item.spent)}
            for item in items
        ],
    }
    import json
    from django.core.serializers.json import DjangoJSONEncoder
    return json.loads(json.dumps(context, cls=DjangoJSONEncoder, ensure_ascii=False))


def build_planning_farm_context(owner: str, agent) -> dict:
    """Load queue, plot, seed and fertilizer facts only after farm was selected."""
    import copy
    from django.utils import timezone as django_timezone
    from .farm_models import AgentFarm
    from .farm_catalog import catalog_for
    from .farm_clock import advance_state
    from .market_visibility import visible_farm_state
    from .market_shop import shop_payload
    from .farm_bonus import yield_bonus
    from .farm_economics import planting_context
    from .farm_queue_plan import overview as queue_overview
    from .life_config import config_for, effective_settings

    farm = AgentFarm.objects.filter(pk=agent.pk, owner_id=owner).first()
    if farm:
        catalog = catalog_for(owner)
        farm_state = copy.deepcopy(farm.state)
        advance_state(farm_state, catalog.seed, django_timezone.now().timestamp())
        shop = shop_payload(owner)
        planting = planting_context(
            farm, catalog.rules, shop['supplies'], yield_bonus(agent), shop['expires_at'],
        )
        queue = queue_overview(farm)
        state = visible_farm_state(farm_state)
    else:
        from .farm_quality import skill_progress
        planting = {'skill': skill_progress(0)}
        queue, state = None, None
    settings = effective_settings(config_for(owner))
    context = {
        'farm': state,
        'planting': planting,
        'farm_queue': queue,
        'farm_queue_rules': {
            'check_minutes': 30,
            'start': '个人farm日程时间',
            'cutoff': settings.get('active_end', '24:00'),
            'rule': '当天规划数量和种植顺序，市场错开采购，成熟跨日收获；后续执行不调用模型。',
        },
        'balance': str(agent.money),
    }
    import json
    from django.core.serializers.json import DjangoJSONEncoder
    return json.loads(json.dumps(context, cls=DjangoJSONEncoder, ensure_ascii=False))
