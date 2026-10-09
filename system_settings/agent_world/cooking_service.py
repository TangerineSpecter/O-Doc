"""每份制作短事务，原料、成品、经验和体力不可拆开提交。"""
import copy
import hashlib
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from system_settings.models import Agent, AgentTask, AgentExecutionLease, WorldActionRuntime, WorldAction, SystemSetting
from .farm_gate import guarded
from .cooking_models import CookingSkill, CookingOperation
from .cooking_catalog import catalog_for, skill_progress
from .cooking_queries import validate_actor
from .inventory_stock import take_stock, add_stock
from .execution import stamina
from .cooking_materials import consume
from .cooking_quality import outcome
from .life_scope import allowed, check_current_authorization


@guarded
@transaction.atomic
def commit_portion(actor_id: str, opportunity_id: str, index: int, recipe_id: str, snapshot: dict,
                   reason: str, task, agent_token: str, world_token: str, now=None) -> CookingOperation:
    if type(index) is not int or not 0 <= index < 6:
        raise ValueError('一次制作最多六份')
    key = f'{opportunity_id}:{index}'
    previous = CookingOperation.objects.filter(pk=key).first()
    if previous:
        if previous.actor_id != actor_id or previous.recipe_id != recipe_id or previous.snapshot != snapshot or previous.owner_id != task.cooking_config.get('owner_id'):
            raise ValueError('制作键已用于其他操作')
        return previous
    now = now or timezone.now()
    check_current_authorization()
    task = AgentTask.objects.select_for_update().get(pk=task.pk)
    agent = Agent.objects.select_for_update().get(pk=actor_id)
    owner = task.cooking_config.get('owner_id')
    if task.task_kind != 'cooking' or not task.enabled or not owner or not allowed(task, actor_id):
        raise ValueError('烹饪任务已停止或居民已解绑')
    validate_actor(owner, actor_id)
    if not AgentExecutionLease.objects.filter(agent_id=actor_id, token=agent_token, until__gt=now).exists() or not WorldActionRuntime.objects.filter(pk='world', token=world_token, until__gt=now).exists():
        raise ValueError('制作执行锁失效')
    from .travel_candidates import travelling_ids
    if actor_id in travelling_ids():
        raise ValueError('居民正在旅行')
    setting = SystemSetting.objects.filter(key='system_mcp_config').first()
    if setting and not (setting.value or {}).get('enabled', True):
        raise ValueError('系统 MCP 已关闭')
    # Only the durable server-issued opportunity plan is executable, including its old rule snapshot.
    action = WorldAction.objects.select_for_update().get(pk=opportunity_id, actor_id=actor_id, task=task, status='claimed')
    plan = action.snapshot.get('plan', [])
    if index >= len(plan) or plan[index] != {'recipe_id': recipe_id, 'rule': snapshot}:
        raise ValueError('制作不属于本次已确认计划')
    catalog_for(owner)
    skill, _ = CookingSkill.objects.get_or_create(pk=actor_id, defaults={'owner_id': owner, 'actor_name': agent.name})
    skill = CookingSkill.objects.select_for_update().get(pk=actor_id, owner_id=owner)
    before = skill_progress(skill.experience)
    if before['level'] < snapshot['required_level']:
        raise ValueError('厨艺等级不足')
    if stamina(agent, now) < snapshot['energy_cost']:
        raise ValueError('体力不足')
    quality = {}
    if 'quality_rules' in snapshot:
        from .cooking_plan import validate_quality_snapshot
        validate_quality_snapshot(snapshot)
        cost = consume(actor_id, owner, snapshot['materials'])
        quality = outcome(key, before['level'], snapshot['materials'], snapshot)
    else:
        cost = sum((take_stock(actor_id, owner, row['sku'], row['quantity']) for row in snapshot['ingredients']), 0)
    price = quality.get('unit_price', snapshot['sale_price'])
    gained = quality.get('experience_gained', snapshot['experience'])
    add_stock(actor_id, owner, agent.name, 'dish.' + recipe_id, 1, snapshot['name'], 'dish', price, key, stars=quality.get('stars', 1))
    skill.experience += gained
    skill.actor_name, skill.updated_at = agent.name, now
    skill.save(update_fields=['experience', 'actor_name', 'updated_at'])
    after = skill_progress(skill.experience)
    WorldAction.objects.create(pk=hashlib.sha256(f'cooking-energy:{key}'.encode()).hexdigest(),
        task=task, agent=agent, actor_id=actor_id, status='success', energy_cost=snapshot['energy_cost'],
        consumed_at=now, effects_done=True, snapshot={'cooking_energy': True, 'owner_id': owner}, result={'operation_id': key})
    row = CookingOperation.objects.create(pk=key, owner_id=owner, actor_id=actor_id, actor_name=agent.name,
        opportunity_id=opportunity_id, recipe_id=recipe_id, snapshot=copy.deepcopy(snapshot), reason=reason, created_at=now,
        result={**quality, 'quantity': 1, 'ingredient_value': str(cost), 'unit_price': str(price),
                'stars': quality.get('stars', 1), 'processing_gain': str(Decimal(str(price)) - cost), 'experience_gained': gained,
                'experience_before': before['experience'], 'experience_after': after['experience'],
                'level_before': before['level'], 'level_after': after['level'], 'energy_cost': snapshot['energy_cost']})
    from .cooking_sync import checkpoint
    checkpoint(owner)
    return row
