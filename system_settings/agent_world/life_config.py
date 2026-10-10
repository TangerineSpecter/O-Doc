"""配置校验及活动归属；周期快照让配置变更不改写已分配身份。"""
from django.utils import timezone
from system_settings.models import Agent, AgentTask
from .life_time import storage_time
from .life_models import LifeConfig, LifeProfile, LifeCycle

KINDS = ('post_interaction', 'post_publish', 'travel', 'farm', 'market', 'investment', 'cooking', 'exploration')
DEFAULTS = {'agent_ids': [], 'mode': 'fixed', 'period': 'daily', 'count': 12,
            'interval_minutes': 60, 'active_start': '00:00', 'active_end': '24:00',
            'min_gap_minutes': 15, 'min_remaining_minutes': 240}


def task_owner(task: AgentTask) -> str | None:
    if task.task_kind == 'memo_capture':
        return task.memo_config.get('owner_id')
    if task.task_kind == 'post_interaction':
        return (task.world_state or {}).get('owner_id')
    field = 'publish_config' if task.task_kind == 'post_publish' else task.task_kind + '_config'
    return (getattr(task, field, {}) or {}).get('owner_id')


def tasks_for(owner: str) -> list[AgentTask]:
    return [t for t in AgentTask.objects.filter(task_kind__in=KINDS) if task_owner(t) == owner]


def validate_settings(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError('生活配置必须为对象')
    value = {**DEFAULTS, **{k: v for k, v in data.items() if k in DEFAULTS}}
    if value['mode'] not in ('fixed', 'random') or value['period'] not in ('daily', 'weekly', 'monthly', 'yearly'):
        raise ValueError('无效的生活周期')
    for key, upper in (('count', 10000), ('interval_minutes', 10080), ('min_gap_minutes', 1440), ('min_remaining_minutes', 1440)):
        if type(value[key]) is not int or not 1 <= value[key] <= upper:
            raise ValueError(f'{key} 超出允许范围')
    def minutes(text):
        if not isinstance(text, str) or len(text) != 5 or text[2] != ':':
            raise ValueError('活动时间须为 HH:mm')
        h, m = map(int, text.split(':'))
        if not (0 <= h <= 24 and 0 <= m < 60 and (h < 24 or m == 0)):
            raise ValueError('活动时间无效')
        return h * 60 + m
    if minutes(value['active_start']) >= minutes(value['active_end']):
        raise ValueError('活动结束时间必须晚于开始时间')
    if value['min_remaining_minutes']>minutes(value['active_end'])-minutes(value['active_start']):
        raise ValueError('新规划最少剩余时间不能超过每日活动窗口')
    ids = value['agent_ids']
    if not isinstance(ids, list) or any(not isinstance(x, str) for x in ids) or len(ids) != len(set(ids)):
        raise ValueError('参与居民列表无效')
    if Agent.objects.filter(pk__in=ids).count() != len(ids):
        raise ValueError('参与居民不存在')
    if ids:
        from .life_schedule import allocation_times
        allocation_times(value, timezone.now(), full_period=True)
    return value


def config_for(owner: str) -> LifeConfig:
    config, _ = LifeConfig.objects.get_or_create(pk=owner, defaults={'settings': dict(DEFAULTS)})
    return config


def effective_settings(config: LifeConfig, now=None) -> dict:
    now = now or timezone.now()
    cycle = LifeCycle.objects.filter(owner_id=config.pk, starts_at__lte=storage_time(now), ends_at__gt=storage_time(now)).order_by('-starts_at').first()
    if cycle:
        return {**cycle.snapshot.get('settings',config.settings),'agent_ids':cycle.snapshot.get('participants',cycle.snapshot.get('settings',{}).get('agent_ids',[]))}
    return config.settings


def owns_actor(owner: str, actor: str) -> bool:
    profile = LifeProfile.objects.filter(pk=actor).first()
    return not profile or profile.owner_id == owner


def ensure_profiles(owner: str, ids: list[str]) -> None:
    from .farm_models import AgentFarm
    from .investment_models import InvestmentAccount
    if any(not owns_actor(owner, actor) for actor in ids) or AgentFarm.objects.filter(pk__in=ids).exclude(owner_id=owner).exists() or InvestmentAccount.objects.filter(pk__in=ids).exclude(owner_id=owner).exists():
        raise ValueError('参与居民已有其他账号的生活或资产归属')
    from .cooking_queries import validate_cooking_agents
    validate_cooking_agents(owner, ids)
    for actor in ids:
        LifeProfile.objects.get_or_create(pk=actor, defaults={'owner_id': owner})
