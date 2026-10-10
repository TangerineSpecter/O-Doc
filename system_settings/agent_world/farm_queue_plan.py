"""每日种植意图及版本依据；计划数量不等于库存或播种事实。"""
import copy
import hashlib
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from .farm_gate import guarded
from .farm_models import AgentFarm
from .farm_catalog import catalog_for
from .inventory_stock import stock_quantity
from .life_config import config_for, effective_settings
from .life_schedule import window
from .life_time import local_time


def identity(*parts: str) -> str:
    return hashlib.sha256(':'.join(parts).encode()).hexdigest()


def entries_for(value: list, rules: dict, plan_id: str) -> list[dict]:
    if not isinstance(value, list) or len(value) > 32:
        raise ValueError('种植队列须为最多32项的列表')
    result = []
    for index, entry in enumerate(value):
        if not isinstance(entry, dict):
            raise ValueError('种植项目须为对象')
        sku, count = entry.get('sku'), entry.get('quantity')
        if not isinstance(sku, str) or not sku.startswith('seed.') or sku[5:] not in rules['crops']:
            raise ValueError('种植项目必须引用现有种子SKU')
        if type(count) is not int or not 1 <= count <= 1000:
            raise ValueError('种植目标须为1至1000的整数')
        mode = entry.get('fertilizer_mode', 'none')
        fertilizer = entry.get('fertilizer')
        if mode not in ('none', 'optional', 'required') or (mode != 'none' and fertilizer not in rules['fertilizers']):
            raise ValueError('施肥策略无效')
        eid = entry.get('id') or identity(plan_id, str(index))[:32]
        if not isinstance(eid, str) or not eid or len(eid) > 64 or any(e['id'] == eid for e in result):
            raise ValueError('种植项目ID重复或无效')
        result.append({'id': eid, 'sku': sku, 'quantity': count, 'priority': index,
                       'fertilizer_mode': mode, 'fertilizer': fertilizer if mode != 'none' else None})
    return result


def event(plan: dict, code: str, detail: str, now, *, entry_id: str = '') -> None:
    key = entry_id or 'plan'
    states = plan.setdefault('wait_states', {})
    if states.get(key) == code:
        return
    states[key] = code
    plan.setdefault('events', []).append({'id': identity(plan['id'], str(len(plan.get('events', [])))),
        'at': now.timestamp(), 'code': code, 'detail': detail, 'entry_id': entry_id})


def save(farm: AgentFarm, now=None) -> None:
    farm.revision += 1
    farm.updated_at = now or timezone.now()
    farm.save(update_fields=['state', 'revision', 'updated_at'])


def snapshot(plan: dict) -> dict:
    return {key: copy.deepcopy(plan[key]) for key in ('id', 'version', 'revision', 'day', 'item_id', 'task_id', 'cutoff', 'entries', 'procurement_limit', 'reason')}


def original_source(context: dict, plan_id: str) -> dict:
    sources = context.get('farm_plan_sources', {})
    if not isinstance(sources, dict):
        raise ValueError('每日计划原始依据格式无效')
    if plan_id in sources:
        return sources[plan_id]
    # Compatibility with snapshots created before per-plan source history.
    legacy = context.get('farm_plan_source')
    if isinstance(legacy, dict) and legacy.get('id') == plan_id:
        return legacy
    raise ValueError('每日计划缺少原始日程依据')


def attach_source(item, plan: dict) -> None:
    sources = copy.deepcopy(item.context.get('farm_plan_sources', {}))
    legacy = item.context.get('farm_plan_source')
    if legacy:
        sources.setdefault(legacy['id'], copy.deepcopy(legacy))
    sources.setdefault(plan['id'], copy.deepcopy(plan['versions'][0]))
    # A deferred LifeItem can be reused on another day; retain each prior source.
    item.context = {**item.context, 'farm_plan_id': plan['id'], 'farm_plan_sources': sources,
                    'farm_plan_source': copy.deepcopy(sources[plan['id']])}


@guarded
@transaction.atomic
def install(item, task, specification: dict | None, reason: str) -> str:
    from .farm_service import ensure_farms
    ensure_farms(task)
    farm = AgentFarm.objects.select_for_update().get(pk=item.actor_id, owner_id=item.owner_id)
    day = local_time(item.scheduled_at).date().isoformat()
    pid = identity('farm-day', item.owner_id, item.actor_id, day)
    plans = farm.state.setdefault('planting_plans', {})
    existing = plans.get(pid)
    if existing:
        if existing['item_id'] != item.pk:
            raise ValueError('当天已有农场开工日程')
        # 普通日程修订只维护起点，不覆盖已固化的经营意图和事实。
        if not existing.get('activated_at'):
            existing['starts_at'] = local_time(item.scheduled_at).timestamp()
        attach_source(item, existing)
        save(farm)
        return pid
    if not isinstance(specification, dict):
        raise ValueError('农场日程须同时提供farm_plan种植意图（允许空队列）')
    from .life_budget import money
    limit = money(specification.get('procurement_limit', '0'))
    if limit < 0:
        raise ValueError('采购上限不能为负数')
    now = timezone.now()
    end = window(effective_settings(config_for(item.owner_id)), local_time(item.scheduled_at).date())[1]
    entries = entries_for(specification.get('entries'), catalog_for(item.owner_id).rules, pid)
    plan = {'id': pid, 'version': 2, 'revision': 1, 'day': day, 'item_id': item.pk, 'task_id': task.pk,
            'starts_at': local_time(item.scheduled_at).timestamp(), 'cutoff': end.timestamp(),
            'activated_at': None, 'status': 'pending', 'entries': entries,
            'progress': {e['id']: 0 for e in entries}, 'procurement_limit': str(limit),
            'purchases': [], 'reason': reason, 'events': [], 'wait_states': {}, 'requests': {}}
    from .farm_queue_estimate import estimate
    catalog = catalog_for(item.owner_id)
    plan['estimate'] = estimate(farm.state, entries, catalog.rules, catalog.seed, max(now.timestamp(), plan['starts_at']), plan['cutoff'])
    plan['versions'] = [snapshot(plan)]
    summary = '、'.join(f"{catalog.rules['crops'][e['sku'][5:]]['name']} ×{e['quantity']}" for e in entries) or '无新增播种目标'
    event(plan, 'planned', f'计划种植：{summary}；采购上限 {limit}；尚未执行。' + plan['estimate']['assumptions'], now)
    plans[pid] = plan
    farm.state['planting_plan_id'] = pid
    attach_source(item, plan)
    save(farm, now)
    return pid


def current(farm: AgentFarm, now=None) -> dict | None:
    day = local_time(now).date().isoformat()
    return next((p for p in farm.state.get('planting_plans', {}).values() if p['day'] == day), None)


def overview(farm: AgentFarm | None, now=None) -> dict | None:
    if not farm:
        return None
    plan = current(farm, now)
    if not plan:
        return None
    result = {k: copy.deepcopy(plan[k]) for k in ('id', 'revision', 'day', 'starts_at', 'cutoff', 'status', 'procurement_limit')}
    result['procurement_spent'] = str(sum((Decimal(p['amount']) for p in plan['purchases']), Decimal(0)))
    result['estimate'] = copy.deepcopy(plan.get('estimate'))
    result['entries'] = []
    stocks = {}
    for entry in plan['entries']:
        left = entry['quantity'] - plan['progress'][entry['id']]
        available = stocks.setdefault(entry['sku'], stock_quantity(farm.pk, farm.owner_id, entry['sku']))
        stocks[entry['sku']] = max(0, available-left)
        fert_sku = 'fertilizer.' + entry['fertilizer'] if entry['fertilizer'] else ''
        fert = stocks.setdefault(fert_sku, stock_quantity(farm.pk, farm.owner_id, fert_sku)) if fert_sku else 0
        if fert_sku:
            stocks[fert_sku] = max(0, fert-left)
        result['entries'].append({**entry, 'planted': plan['progress'][entry['id']], 'remaining': left,
                                 'missing_seeds': max(0, left - available),
                                 'missing_fertilizer': max(0, left-fert) if entry['fertilizer'] else 0,
                                 'wait_reason': plan['wait_states'].get(entry['id'], '')})
    return result
