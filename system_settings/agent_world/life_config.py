"""配置校验及活动归属；周期快照让配置变更不改写已分配身份。"""
from django.utils import timezone
from system_settings.models import AIModel, Agent, AgentTask
from .life_time import storage_time
from .life_models import LifeConfig, LifeProfile, LifeCycle

KINDS = ('post_interaction', 'post_publish', 'travel', 'farm', 'market', 'investment', 'cooking', 'alchemy', 'exploration')
DEFAULTS = {'agent_ids': [], 'mode': 'fixed', 'period': 'daily', 'count': 12,
            'interval_minutes': 60, 'active_start': '00:00', 'active_end': '24:00',
            'min_gap_minutes': 15, 'min_remaining_minutes': 240, 'decision_model_id': '',
            'decision_connection_id': '', 'decision_connection_ids': [],
            'decision_sticky_ttl_seconds': 7200, 'jev_enabled': False, 'jev_excluded_scenes': [],
            'market_automation_v2': False}


def task_owner(task: AgentTask) -> str | None:
    if task.task_kind == 'memo_capture':
        return task.memo_config.get('owner_id')
    if task.task_kind == 'post_interaction':
        return (task.world_state or {}).get('owner_id')
    field = 'publish_config' if task.task_kind == 'post_publish' else task.task_kind + '_config'
    return (getattr(task, field, {}) or {}).get('owner_id')


def tasks_for(owner: str) -> list[AgentTask]:
    return [t for t in AgentTask.objects.filter(task_kind__in=KINDS) if task_owner(t) == owner]


def task_for(owner: str, agent, kind: str, tasks: list[AgentTask] | None = None) -> AgentTask | None:
    """The single enabled task this agent may use for the activity, else no attribution."""
    from .life_scope import allowed

    rows = [row for row in (tasks_for(owner) if tasks is None else tasks)
            if row.enabled and row.task_kind == kind and task_owner(row) == owner
            and allowed(row, agent.pk)]
    return rows[0] if len(rows) == 1 else None


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
    model_id = value['decision_model_id']
    if not isinstance(model_id, str) or len(model_id) > 40:
        raise ValueError('世界决策模型无效')
    if model_id and not AIModel.objects.filter(pk=model_id, type='chat').exists():
        raise ValueError('世界决策模型不存在或不是对话模型')
    from system_settings.decision.failover import ALLOWED_STICKY_TTLS, CONNECTION_ID, MAX_FAILOVER
    connection_id = value['decision_connection_id']
    if connection_id in ('', None):
        value['decision_connection_id'] = ''
    elif not isinstance(connection_id, str) or CONNECTION_ID.fullmatch(connection_id) is None:
        raise ValueError('结构化决策连接无效')
    connection_ids = value['decision_connection_ids']
    if (not isinstance(connection_ids, list) or len(connection_ids) > MAX_FAILOVER
            or len(set(connection_ids)) != len(connection_ids)
            or any(not isinstance(item, str) or CONNECTION_ID.fullmatch(item) is None for item in connection_ids)):
        raise ValueError('决策故障转移顺序无效')
    ttl = value['decision_sticky_ttl_seconds']
    if type(ttl) is not int or ttl not in ALLOWED_STICKY_TTLS:
        raise ValueError('决策模型暂时沿用时间无效，可选 1 小时、2 小时或 4 小时')
    from system_settings.decision.routing import SCENES
    if type(value['jev_enabled']) is not bool:
        raise ValueError('结构化决策开关无效')
    if type(value['market_automation_v2']) is not bool:
        raise ValueError('市场自动化开关无效')
    excluded = value['jev_excluded_scenes']
    if not isinstance(excluded, list) or any(not isinstance(key, str) or key not in SCENES for key in excluded) or len(set(excluded)) != len(excluded):
        raise ValueError('结构化决策排除场景无效')
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
        value = {**cycle.snapshot.get('settings',config.settings),'agent_ids':cycle.snapshot.get('participants',cycle.snapshot.get('settings',{}).get('agent_ids',[]))}
    else:
        value = dict(config.settings)
    archived = set(Agent.objects.filter(pk__in=value.get('agent_ids', []), archived_at__isnull=False).values_list('pk', flat=True))
    return {**value, 'agent_ids': [key for key in value.get('agent_ids', []) if key not in archived]}


def market_automation_enabled(config: LifeConfig, now=None) -> bool:
    """灰度开关；旧配置没有该字段时按关闭处理。"""
    return bool(effective_settings(config, now).get('market_automation_v2', False))


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
