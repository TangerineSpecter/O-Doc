"""按个人日程激活的种植队列；半小时检查实际状态，永不调用模型。"""
import hashlib
import logging
from contextvars import ContextVar
from django.db import transaction
from django.utils import timezone
from system_settings.models import Agent, AgentTask, AgentExecutionLease, WorldActionRuntime
from .farm_gate import guarded
from .farm_models import AgentFarm, FarmOperation
from .farm_queue_plan import current, event, save
from .inventory_stock import stock_quantity

logger = logging.getLogger(__name__)
QUEUE = ContextVar('farm_queue_operation', default=None)


def apply_progress(state: dict, operation: dict, opportunity_id: str, result: dict) -> None:
    context = QUEUE.get()
    if not context:
        return
    result['execution_mode'] = 'queue'
    if operation['kind'] == 'harvest':
        result['source_plans'] = context.get('origins', [])
        return
    pid, eid = context['plan_id'], context['entry_id']
    plan = state['planting_plans'][pid]
    result.update(planting_plan_id=pid, planting_entry_id=eid, plan_revision=plan['revision'])
    if operation['kind'] == 'plant':
        plan['progress'][eid] += len(operation['targets'])
        for plot in state['plots']:
            if plot['id'] in operation['targets']:
                plot['crop']['planting_origin'] = {'plan_id': pid, 'entry_id': eid, 'revision': plan['revision'], 'day': plan['day']}


def commit(farm, key, operation, task, agent_token, world_token, now, context):
    from .farm_service import commit_operation
    marker = QUEUE.set(context)
    try:
        index = 1 if operation['kind'] == 'fertilize' else 0
        return commit_operation(farm.pk, key, index, operation, '按队列自动执行', task, agent_token, world_token, now)
    finally:
        QUEUE.reset(marker)


@guarded
@transaction.atomic
def tend_farm(farm_id: str, world_token: str, agent_token: str, task: AgentTask, now, *, force=False) -> None:
    from .farm_service import advance_farm
    from .execution import stamina
    farm = advance_farm(farm_id, now)
    if not WorldActionRuntime.objects.filter(pk='world', token=world_token, enabled=True).exists():
        return
    from system_settings.models import SystemSetting
    setting = SystemSetting.objects.filter(key='system_mcp_config').first()
    if setting and not (setting.value or {}).get('enabled', True):
        note_wait(farm.pk, 'mcp-disabled', '系统MCP已关闭，等待恢复', now)
        return
    slot = int(now.timestamp() // 1800)
    if not force and farm.state.get('planting_last_tick') == slot:
        return
    agent = Agent.objects.get(pk=farm.pk)
    for plan in farm.state.get('planting_plans', {}).values():
        if now.timestamp() >= plan['cutoff'] and plan['status'] not in ('expired', 'completed', 'cancelled'):
            plan['status'] = 'expired'
            event(plan, 'expired', '活动时段已截止，未播种项目失效；在田作物继续生长', now)
    plan = current(farm, now)
    if plan and plan.get('activated_at') and plan['wait_states'].get('plan') in ('paused', 'travel', 'busy', 'mcp-disabled'):
        event(plan, 'recovered', '执行条件恢复，继续检查实际状态', now)
    ready = [p for p in farm.state['plots'] if p.get('crop') and p['crop']['grown'] >= p['crop']['rules']['growth_seconds']]
    while ready and stamina(agent, now) >= 2:
        batch = ready[:4]
        origins = [p['crop']['planting_origin'] for p in batch if p['crop'].get('planting_origin')]
        cycles = [p['crop'].get('cycle_id', f"{p['id']}:{p['crop']['planted_at']}") for p in batch]
        key = hashlib.sha256(('farm-harvest:' + ':'.join(sorted(cycles))).encode()).hexdigest()
        # Store expiry/activation before a commit reloads the farm aggregate.
        save(farm, now)
        commit(farm, key, {'kind': 'harvest', 'targets': [p['id'] for p in batch]}, task, agent_token, world_token, now, {'origins': origins})
        farm.refresh_from_db(); agent.refresh_from_db(); plan = current(farm, now)
        ready = [p for p in farm.state['plots'] if p.get('crop') and p['crop']['grown'] >= p['crop']['rules']['growth_seconds']]
    if ready and plan and stamina(agent, now) < 2:
        event(plan, 'stamina', '等待体力恢复后收获', now)
    if plan and plan.get('activated_at') and plan['status'] in ('active', 'completed') and now.timestamp() < plan['cutoff']:
        for entry in plan['entries']:
            while True:
                left = entry['quantity'] - plan['progress'][entry['id']]
                if left <= 0:
                    break
                empty = [p['id'] for p in farm.state['plots'] if not p.get('crop')]
                count = min(4, left, len(empty), stock_quantity(farm.pk, farm.owner_id, entry['sku']))
                fertilize = entry['fertilizer_mode'] != 'none'
                available = stock_quantity(farm.pk, farm.owner_id, 'fertilizer.' + entry['fertilizer']) if fertilize else 0
                if entry['fertilizer_mode'] == 'required':
                    count = min(count, available)
                needed_energy = 4 if fertilize and available else 2
                wait = ('land' if not empty else 'seeds' if not stock_quantity(farm.pk, farm.owner_id, entry['sku']) else
                        'fertilizer' if not count else 'stamina' if stamina(agent, now) < needed_energy else '')
                if wait:
                    event(plan, wait, {'land': '等待地块收获腾空', 'seeds': '等待市场采购种子',
                          'fertilizer': '等待指定肥料', 'stamina': '等待体力恢复'}[wait], now, entry_id=entry['id'])
                    break
                # Optional fertilizer applies to a whole batch; split the batch if only some is available.
                use_fertilizer = fertilize and available > 0
                if use_fertilizer:
                    count = min(count, available)
                targets = empty[:count]
                context = {'plan_id': plan['id'], 'entry_id': entry['id']}
                key = hashlib.sha256(f"farm-plant:{plan['id']}:{entry['id']}:{plan['progress'][entry['id']]}".encode()).hexdigest()
                event(plan, 'resumed', '条件具备，按种植队列执行', now, entry_id=entry['id'])
                save(farm, now)
                # Outer transaction includes planting, fertilizer, stamina and progress.
                commit(farm, key, {'kind': 'plant', 'crop': entry['sku'][5:], 'targets': targets}, task, agent_token, world_token, now, context)
                if use_fertilizer:
                    commit(farm, key, {'kind': 'fertilize', 'fertilizer': entry['fertilizer'], 'targets': targets}, task, agent_token, world_token, now, context)
                farm.refresh_from_db(); agent.refresh_from_db(); plan = current(farm, now)
        if all(plan['progress'][e['id']] >= e['quantity'] for e in plan['entries']):
            plan['status'] = 'completed'
            event(plan, 'completed', '当天种植队列已播种完成，等待实际成熟后收获', now)
    farm.state['planting_last_tick'] = slot
    save(farm, now)


def tick_automation(world_token: str) -> None:
    from .execution import execution_lease
    from .life_scope import allowed
    from .travel_candidates import travelling_ids
    now = timezone.now()
    travellers = travelling_ids()
    for farm in AgentFarm.objects.all():
        if farm.pk in travellers:
            note_wait(farm.pk, 'travel', '旅行中，等待返回后继续队列', now)
            continue
        # Harvesting remains available even before today's start or without a daily plan.
        task = next((t for t in AgentTask.objects.filter(task_kind='farm', enabled=True)
                     if t.farm_config.get('owner_id') == farm.owner_id and allowed(t, farm.pk)), None)
        if not task:
            note_wait(farm.pk, 'paused', '居民暂停或农场任务停用，等待恢复', now)
            continue
        with execution_lease(AgentExecutionLease, {'agent_id': farm.pk}) as token:
            if not token:
                note_wait(farm.pk, 'busy', '居民正在执行其他任务，下一轮重试', now)
            else:
                try:
                    tend_farm(farm.pk, world_token, token, task, now)
                except Exception:
                    logger.exception('农场队列事务已回滚 farm=%s', farm.pk)


def validate_plan(farm: AgentFarm) -> None:
    from .farm_queue_legacy import validate_legacy_plan
    from .farm_queue_sync import validate_queue
    validate_legacy_plan(farm)
    validate_queue(farm)


@guarded
@transaction.atomic
def note_wait(farm_id: str, code: str, detail: str, now) -> None:
    farm = AgentFarm.objects.select_for_update().get(pk=farm_id)
    plan = current(farm, now)
    if plan and plan.get('activated_at') and plan['status'] == 'active':
        before = len(plan['events'])
        event(plan, code, detail, now)
        if len(plan['events']) != before:
            save(farm, now)
