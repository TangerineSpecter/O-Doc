"""每瓶炼金短事务，素材、成品、经验和体力不可拆开提交。"""
import copy
import hashlib
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from system_settings.models import Agent, AgentTask, AgentExecutionLease, WorldActionRuntime, WorldAction, SystemSetting
from .farm_gate import guarded
from .alchemy_models import AlchemySkill, AlchemyOperation
from .alchemy_catalog import catalog_for, skill_progress
from .alchemy_queries import validate_actor
from .inventory_stock import add_stock
from .execution import stamina
from .alchemy_materials import consume
from .alchemy_quality import outcome
from .life_scope import allowed, check_current_authorization
from .alchemy_limits import MAX_TOTAL


@guarded
@transaction.atomic
def commit_bottle(actor_id: str, opportunity_id: str, index: int, recipe_id: str, snapshot: dict,
                  reason: str, task, agent_token: str, world_token: str, now=None) -> AlchemyOperation:
    if type(index) is not int or not 0 <= index < MAX_TOTAL:
        raise ValueError('一次炼金最多十五瓶')
    key = f'{opportunity_id}:{index}'
    previous = AlchemyOperation.objects.filter(pk=key).first()
    if previous:
        if previous.actor_id != actor_id or previous.recipe_id != recipe_id or previous.snapshot != snapshot or previous.owner_id != task.alchemy_config.get('owner_id'):
            raise ValueError('炼金键已用于其他操作')
        return previous
    now = now or timezone.now()
    check_current_authorization()
    task = AgentTask.objects.select_for_update().get(pk=task.pk)
    agent = Agent.objects.select_for_update().get(pk=actor_id)
    from system_settings.agent_availability import require_active_agent
    require_active_agent(agent)
    owner = task.alchemy_config.get('owner_id')
    if task.task_kind != 'alchemy' or not task.enabled or not owner or not allowed(task, actor_id):
        raise ValueError('炼金任务已停止或居民已解绑')
    validate_actor(owner, actor_id)
    if not AgentExecutionLease.objects.filter(agent_id=actor_id, token=agent_token, until__gt=now).exists() or not WorldActionRuntime.objects.filter(pk='world', token=world_token, until__gt=now).exists():
        raise ValueError('炼金执行锁失效')
    from .combat.schedule import occupied_ids
    from .travel_candidates import travelling_ids
    if actor_id in occupied_ids() or actor_id in travelling_ids():
        raise ValueError('居民正在旅行')
    setting = SystemSetting.objects.filter(key='system_mcp_config').first()
    if setting and not (setting.value or {}).get('enabled', True):
        raise ValueError('系统 MCP 已关闭')
    action = WorldAction.objects.select_for_update().get(pk=opportunity_id, actor_id=actor_id, task=task, status='claimed')
    plan = action.snapshot.get('plan', [])
    if index >= len(plan) or plan[index] != {'recipe_id': recipe_id, 'rule': snapshot}:
        raise ValueError('炼金不属于本次已确认计划')
    catalog_for(owner)
    skill, _ = AlchemySkill.objects.get_or_create(pk=actor_id, defaults={'owner_id': owner, 'actor_name': agent.name})
    skill = AlchemySkill.objects.select_for_update().get(pk=actor_id, owner_id=owner)
    before = skill_progress(skill.experience)
    if before['level'] < snapshot['required_level']:
        raise ValueError('炼金等级不足')
    if stamina(agent, now) < snapshot['energy_cost']:
        raise ValueError('体力不足')
    from .alchemy_plan import validate_quality_snapshot
    validate_quality_snapshot(snapshot)
    cost = consume(actor_id, owner, snapshot['materials'])
    quality = outcome(key, before['level'], snapshot['materials'], snapshot)
    price = quality['unit_price']
    gained = quality['experience_gained']
    add_stock(actor_id, owner, agent.name, 'elixir.' + recipe_id, 1, snapshot['name'], 'elixir', price, key, stars=quality['stars'])
    skill.experience += gained
    skill.actor_name, skill.updated_at = agent.name, now
    skill.save(update_fields=['experience', 'actor_name', 'updated_at'])
    after = skill_progress(skill.experience)
    WorldAction.objects.create(pk=hashlib.sha256(f'alchemy-energy:{key}'.encode()).hexdigest(),
        task=task, agent=agent, actor_id=actor_id, status='success', energy_cost=snapshot['energy_cost'],
        consumed_at=now, effects_done=True, snapshot={'alchemy_energy': True, 'owner_id': owner}, result={'operation_id': key})
    row = AlchemyOperation.objects.create(pk=key, owner_id=owner, actor_id=actor_id, actor_name=agent.name,
        opportunity_id=opportunity_id, recipe_id=recipe_id, snapshot=copy.deepcopy(snapshot), reason=reason, created_at=now,
        result={**quality, 'quantity': 1, 'ingredient_value': str(cost), 'unit_price': str(price),
                'stars': quality['stars'], 'processing_gain': str(Decimal(str(price)) - cost), 'experience_gained': gained,
                'experience_before': before['experience'], 'experience_after': after['experience'],
                'level_before': before['level'], 'level_after': after['level'], 'energy_cost': snapshot['energy_cost']})
    from .alchemy_sync import checkpoint
    checkpoint(owner)
    return row
