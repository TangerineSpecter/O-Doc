"""One forge piece commits stock, stamina, gear, provenance and cursor together."""
import copy
import hashlib

from django.utils import timezone

from .farm_gate import guarded
from .blacksmith_rolls import outcome, validate_snapshot
from .blacksmith_sync import batch_checkpoints, request_checkpoint


@guarded
@batch_checkpoints()
def commit_piece(actor_id: str, opportunity_id: str, index: int, recipe_id: str, snapshot: dict,
                 reason: str, task, agent_token: str, world_token: str, now=None):
    from system_settings.models import Agent, AgentTask, AgentExecutionLease, WorldActionRuntime, WorldAction, SystemSetting
    from system_settings.agent_availability import require_active_agent
    from .blacksmith_models import BlacksmithOperation
    from .blacksmith_catalog import catalog_for
    from .blacksmith_authorization import require_authorized
    from .blacksmith_candidates import template_options
    from .alchemy_queries import validate_actor
    from .alchemy_materials import consume
    from .crafting_materials import available_pool
    from .combat.models import CombatProfile, EquipmentInstance
    from .combat.store import current
    from .combat.equipment_snapshot import rules_for
    from .combat.facts import append
    from .combat.schedule import occupied_ids
    from .travel_candidates import travelling_ids
    from .life_scope import allowed, check_current_authorization, CURRENT
    from .life_commitments import require_energy
    from .execution import stamina

    if type(index) is not int or not 0 <= index < 3:
        raise ValueError('一次打造最多三件')
    key = f'{opportunity_id}:{index}'
    owner = (task.blacksmith_config or {}).get('owner_id')
    previous = BlacksmithOperation.objects.filter(pk=key).first()
    if previous:
        if (previous.owner_id != owner or previous.actor_id != actor_id or previous.recipe_id != recipe_id
                or previous.piece_index != index or previous.snapshot != snapshot):
            raise ValueError('打造请求键已用于其他操作')
        return previous
    validate_snapshot(snapshot, recipe_id)
    now = now or timezone.now()
    check_current_authorization()
    task = AgentTask.objects.select_for_update().get(pk=task.pk)
    agent = Agent.objects.select_for_update().get(pk=actor_id)
    # Another process can commit this same key while this transaction waits for the actor.
    previous = BlacksmithOperation.objects.filter(pk=key).first()
    if previous:
        if (previous.owner_id != owner or previous.actor_id != actor_id or previous.recipe_id != recipe_id
                or previous.piece_index != index or previous.snapshot != snapshot):
            raise ValueError('打造请求键已用于其他操作')
        return previous
    require_active_agent(agent)
    if (task.task_kind != 'blacksmith' or not task.enabled or not owner
            or task.blacksmith_config.get('owner_id') != owner or not allowed(task, actor_id)):
        raise ValueError('打造能力已停用或居民已解绑')
    validate_actor(owner, actor_id)
    if (not AgentExecutionLease.objects.filter(agent_id=actor_id, token=agent_token, until__gt=now).exists()
            or not WorldActionRuntime.objects.filter(pk='world', token=world_token, until__gt=now).exists()):
        raise ValueError('打造执行锁失效')
    if actor_id in occupied_ids() or actor_id in travelling_ids():
        raise ValueError('居民正在冒险或旅行')
    setting = SystemSetting.objects.filter(key='system_mcp_config').first()
    if setting and not (setting.value or {}).get('enabled', True):
        raise ValueError('系统 MCP 已关闭')
    action = WorldAction.objects.select_for_update().get(pk=opportunity_id, actor_id=actor_id, task=task, status='claimed')
    state = action.snapshot
    if (not state.get('blacksmith') or state.get('owner_id') != owner or state.get('version') != 1
            or state.get('cursor') != index or state.get('phase') != 'commit'
            or (state.get('current') or {}).get('snapshot') != snapshot):
        raise ValueError('打造不属于当前已确认的这一件')
    require_authorized(action.pk, manual=bool(state.get('manual')))
    if BlacksmithOperation.objects.filter(opportunity_id=opportunity_id).count() != index:
        raise ValueError('打造件序号不连续')
    profile = CombatProfile.objects.select_for_update().get(pk=actor_id, owner_id=owner)
    if profile.catalog_id != snapshot['catalog_id'] or profile.progression['job'] != snapshot['job']:
        raise ValueError('职业或装备目录发生变化，请结束本次打造后重新选择')
    catalog = current(profile.catalog_id)
    options = {row['template_id']: row for row in template_options(catalog, profile, snapshot['rule'])}
    selected = options.get(snapshot['template_id'])
    if not selected or (selected['level_min'], selected['level_max']) != (snapshot['level_min'], snapshot['level_max']):
        raise ValueError('装备类型不属于当前职业路线的合法候选')
    require_energy(owner, agent, 2, now=now)
    if stamina(agent, now) < 2:
        raise ValueError('体力不足')
    scope = CURRENT.get()
    free = {row['inventory_id']: row for row in available_pool(owner, actor_id,
        exclude_ids=[scope['item_id']] if scope else [], exclude_action_id=opportunity_id)}
    if any(free.get(row['inventory_id'], {}).get('quantity', 0) < row['quantity'] for row in snapshot['materials']):
        raise ValueError('打造材料不足或已被其他制作预留')
    catalog_for(owner)
    cost = consume(actor_id, owner, snapshot['materials'])
    item = outcome(key, snapshot, catalog)
    equipment_id = hashlib.sha256(f'blacksmith-equipment:{key}'.encode()).hexdigest()
    rules = rules_for(catalog, item['template_id'], item)
    EquipmentInstance.objects.create(pk=equipment_id, owner_id=owner, actor_id=actor_id,
        catalog_id=catalog.version, template_id=item['template_id'], snapshot=item, rules=rules,
        value=item['value'], bound=False)
    result = {'equipment_id': equipment_id, 'item': item, 'rules': rules, 'catalog_id': catalog.version,
              'quantity': 1, 'energy_cost': 2, 'ingredient_value': str(cost), 'value': item['value'],
              'level': item['level'], 'quality': item['quality']}
    operation = BlacksmithOperation.objects.create(pk=key, owner_id=owner, actor_id=actor_id,
        actor_name=agent.name, opportunity_id=opportunity_id, piece_index=index, recipe_id=recipe_id,
        snapshot=copy.deepcopy(snapshot), result=result, reason=reason[:500], created_at=now)
    WorldAction.objects.create(pk=hashlib.sha256(f'blacksmith-energy:{key}'.encode()).hexdigest(),
        task=task, agent=agent, actor_id=actor_id, status='success', energy_cost=2, consumed_at=now,
        effects_done=True, snapshot={'blacksmith_energy': True, 'owner_id': owner}, result={'operation_id': key})
    append(profile, 'blacksmith:' + key, 'forge', {'operation_id': key, 'equipment_id': equipment_id,
        'recipe_id': recipe_id, 'catalog_id': catalog.version, 'materials': copy.deepcopy(snapshot['materials'])})
    action.snapshot = {**state, 'cursor': index + 1, 'phase': 'done' if index == 2 else 'continue', 'current': {}}
    action.save(update_fields=['snapshot', 'updated_at'])
    request_checkpoint(owner)
    return operation
