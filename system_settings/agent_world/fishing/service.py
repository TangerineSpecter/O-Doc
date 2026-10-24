"""出发、返程与资产事务；任何模型请求均在事务外。"""
import copy
import hashlib
from datetime import timedelta
from django.db import transaction
from system_settings.models import Agent, AgentTask, AgentRunRecord
from ..farm_gate import guarded
from ..life_models import LifeItem
from ..life_schedule import execution_key, revise
from ..life_time import local_time
from ..market_inventory import split_item, deliver
from ..inventory_stock import stock_rows
from .models import FishingConfig, FishingProfile, FishingTrip, FishingEvent, FishingRuntime
from .catalog import install, upgrade_config
from .rules import level_for, bait_facts

OPEN = ('preparing', 'active', 'duel', 'paused')


def task_for(owner: str) -> AgentTask | None:
    from ..life_config import config_for
    ids = config_for(owner).settings.get('agent_ids', [])
    actors = list(Agent.objects.filter(pk__in=ids, archived_at__isnull=True).values_list('pk', flat=True))
    if not actors:
        return None  # 空参与范围及全部归档是正常状态，等待后续配置恢复。
    config = FishingConfig.objects.get(pk=owner)
    key = 'builtin-fish:' + hashlib.sha256(owner.encode()).hexdigest()[:24]
    values = {'task_kind': 'fishing', 'name': '钓鱼', 'fishing_config': {'owner_id': owner},
              'agent_id': actors[0], 'agent_ids': actors, 'enabled': config.enabled, 'execution_mode': 'serial'}
    task, created = AgentTask.objects.get_or_create(pk=key, defaults=values)
    changed = [field for field, value in values.items() if getattr(task, field) != value]
    if changed and not created:
        for field in changed:
            setattr(task, field, values[field])
        task.save(update_fields=[*changed, 'updated_at'])
    return task


@guarded
@transaction.atomic
def configure(owner: str, enabled: bool):
    if type(enabled) is not bool:
        raise ValueError('启用状态须为布尔值')
    row, _ = FishingConfig.objects.get_or_create(pk=owner, defaults={'catalog': install()})
    upgrade_config(row)
    row.enabled = enabled
    row.save()
    from ..life_config import config_for
    if config_for(owner).settings.get('agent_ids'):
        task_for(owner)
    if not enabled:
        for trip in FishingTrip.objects.filter(owner_id=owner, ended_at__isnull=True):
            finish(trip.pk, '钓鱼能力已停用')
    return row


def inventory(owner: str, actor: str) -> dict:
    from ..inventory_stock import inventory_items
    result = {}
    for row in inventory_items(actor, owner):
        sku = row.source.get('sku', '')
        if sku.startswith('bait.'):
            bait = sku[5:]
            result[bait] = result.get(bait, 0) + row.quantity
    return result


def durations(owner: str, at, rules: dict) -> list[int]:
    from ..life_config import config_for, effective_settings
    from ..life_schedule import window
    end = window(effective_settings(config_for(owner), at), local_time(at).date())[1]
    return [minutes for minutes in rules['durations'] if local_time(at) + timedelta(minutes=minutes) <= end]


def spots(owner: str, actor: str, at, rules: dict) -> dict:
    profile = FishingProfile.objects.filter(pk=actor, owner_id=owner).first()
    level = level_for(profile.experience if profile else 0, rules['max_level'])[0]
    choices = durations(owner, at, rules)
    stock = inventory(owner, actor)
    return {key: value for key, value in rules['spots'].items() if level >= value['required_level']
            and choices and bait_facts(rules, stock, key, at, max(choices))}


def eligibility(owner: str, agent, at) -> str:
    from .decisions import enabled
    from ..execution import stamina
    from .catalog import current
    config = FishingConfig.objects.filter(pk=owner, enabled=True).first()
    if not config:
        return '钓鱼能力尚未启用'
    if not enabled(owner):
        return '请先启用钓鱼所需决策连接'
    rules = current(owner)
    if stamina(agent) < rules['energy_cost']:
        return '体力不足以抛竿'
    if not inventory(owner, agent.pk):
        return '背包没有鱼饵，请先在市场购买'
    if not spots(owner, agent.pk, at, rules):
        return '该时段没有满足等级、鱼饵和时间条件的钓点'
    return ''


def append(trip: FishingTrip, kind: str, data: dict) -> FishingEvent:
    trip.revision += 1
    return FishingEvent.objects.create(pk=f'{trip.pk}:{trip.revision}', trip=trip,
        sequence=trip.revision, kind=kind, data=copy.deepcopy(data))


@guarded
@transaction.atomic
def request(item: LifeItem) -> FishingTrip:
    from ..life_scope import check_item_authorization
    item = LifeItem.objects.select_for_update().get(pk=item.pk)
    check_item_authorization(item)
    old = FishingTrip.objects.filter(life_item_id=item.pk).first()
    if old:
        return old
    agent = Agent.objects.get(pk=item.actor_id)
    reason = eligibility(item.owner_id, agent, local_time())
    if reason:
        raise ValueError(reason)
    if FishingTrip.objects.filter(actor_id=agent.pk, ended_at__isnull=True).exists():
        raise ValueError('居民已有未结束的出钓')
    from ..life_occupancy import occupied
    if occupied(item):
        raise ValueError('居民正忙于其他活动')
    from .catalog import current
    upgrade_config(FishingConfig.objects.select_for_update().get(pk=item.owner_id))
    rules = current(item.owner_id)
    profile, _ = FishingProfile.objects.get_or_create(pk=agent.pk, defaults={'owner_id': item.owner_id})
    if profile.owner_id != item.owner_id:
        raise ValueError('居民钓鱼档案归属不一致')
    key = hashlib.sha256(('fishing:' + execution_key(item)).encode()).hexdigest()
    record = AgentRunRecord.objects.create(task_id=item.task_id, agent=agent, agent_name=agent.name,
        task_name='钓鱼', trigger='生活安排', summary='正在准备出钓')
    trip = FishingTrip.objects.create(pk=key, owner_id=item.owner_id, actor_id=agent.pk,
        actor_name=agent.name, life_item_id=item.pk, record_id=record.pk, rules=rules,
        state={'plan': {'baits': []}, 'carried': [], 'cursor': 0, 'casts': 0, 'failures': 0})
    FishingRuntime.objects.create(pk=key, authorized=True)
    revise(item, '开始准备出钓', status='running', record_id=record.pk, result={'fishing_trip_id': key})
    return trip


def authorized(trip: FishingTrip) -> bool:
    from system_settings.models import WorldActionRuntime
    from ..life_config import config_for
    return (FishingRuntime.objects.filter(pk=trip.pk, authorized=True).exists()
        and Agent.objects.filter(pk=trip.actor_id, archived_at__isnull=True).exists()
        and FishingConfig.objects.filter(pk=trip.owner_id, enabled=True).exists()
        and WorldActionRuntime.objects.filter(pk='world', enabled=True).exists()
        and trip.actor_id not in config_for(trip.owner_id).paused_agents
        and LifeItem.objects.filter(pk=trip.life_item_id, status='running').exists())


def authorized_trip_ids(trips, owner: str) -> set[str]:
    """Batch the same six authorization checks for an account's read-only feed.

    Execution still uses authorized() at each transaction boundary so it reads
    current permissions rather than reusing a feed snapshot.
    """
    from system_settings.models import WorldActionRuntime
    from ..life_config import config_for

    trips = [trip for trip in trips if trip.owner_id == owner]
    if not trips:
        return set()
    runtime_ids = set(FishingRuntime.objects.filter(
        pk__in=[trip.pk for trip in trips], authorized=True,
    ).values_list('pk', flat=True))
    if not runtime_ids:
        return set()
    candidates = [trip for trip in trips if trip.pk in runtime_ids]
    actors = set(Agent.objects.filter(
        pk__in={trip.actor_id for trip in candidates}, archived_at__isnull=True,
    ).values_list('pk', flat=True))
    if not actors or not FishingConfig.objects.filter(pk=owner, enabled=True).exists():
        return set()
    if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
        return set()
    paused = config_for(owner).paused_agents
    running_items = set(LifeItem.objects.filter(
        pk__in={trip.life_item_id for trip in candidates}, status='running',
    ).values_list('pk', flat=True))
    return {trip.pk for trip in candidates
            if trip.actor_id in actors and trip.actor_id not in paused
            and trip.life_item_id in running_items}


@guarded
@transaction.atomic
def depart(identity: str) -> None:
    from ..execution import stamina
    trip = FishingTrip.objects.select_for_update().get(pk=identity)
    if trip.status != 'preparing' or not authorized(trip):
        return
    plan = trip.state['plan']
    now = local_time()
    stock = inventory(trip.owner_id, trip.actor_id)
    from ..life_interleaving_candidates import legal_durations
    item = LifeItem.objects.get(pk=trip.life_item_id)
    legal = legal_durations(item, durations(trip.owner_id, now, trip.rules), now=now)
    if plan.get('complete') and plan['minutes'] not in legal and legal:
        # Keep the confirmed plan replayable until prepare_step records a shorter
        # duration choice. Clearing it would reopen already-finished bait choices.
        return
    if not plan.get('complete') or plan['minutes'] not in legal:
        raise ValueError('准备耗时后已无足够出钓时间')
    if plan['spot'] not in spots(trip.owner_id, trip.actor_id, now, trip.rules):
        raise ValueError('钓点或鱼饵已不可用')
    agent = Agent.objects.get(pk=trip.actor_id)
    if stamina(agent) < trip.rules['energy_cost']:
        raise ValueError('体力不足以抛竿')
    from ..life_occupancy import occupied
    if occupied(LifeItem.objects.get(pk=trip.life_item_id)):
        raise ValueError('居民正忙于其他活动')
    valid = bait_facts(trip.rules, stock, plan['spot'], now, plan['minutes'])
    carried = []
    for bait in plan['baits']:
        if bait not in valid:
            raise ValueError('已选鱼饵不足或不适用，请重新准备')
        for row in stock_rows(trip.actor_id, trip.owner_id, 'bait.' + bait).select_for_update():
            carried.append(split_item(row, row.quantity))
    if not carried:
        raise ValueError('没有可携带鱼饵')
    trip.state.update(carried=carried, initial_carried=copy.deepcopy(carried), failures=0)
    trip.status = 'active'
    trip.departed_at, trip.deadline = now, now + timedelta(minutes=plan['minutes'])
    trip.next_tick_at = now + timedelta(seconds=trip.rules['interval_seconds'])
    append(trip, 'depart', {'plan': plan, 'carried': carried, 'rod': trip.rules['rod']})
    trip.save()
    record = AgentRunRecord.objects.get(pk=trip.record_id)
    record.summary = '已出发，正在等待鱼群'
    record.save(update_fields=['summary', 'updated_at'])


@guarded
@transaction.atomic
def finish(identity: str, reason: str, *, cancelled: bool = False) -> FishingTrip:
    trip = FishingTrip.objects.select_for_update().get(pk=identity)
    if trip.ended_at:
        return trip
    agent = Agent.objects.filter(pk=trip.actor_id).first()
    carried = copy.deepcopy(trip.state.get('carried', []))
    if agent is None and any(p['quantity'] for p in carried):
        raise ValueError('居民已删除，无法返还鱼饵')
    for payload in carried:
        if payload['quantity']:
            deliver(trip.owner_id, agent, payload, f'fishing-return:{trip.pk}')
    append(trip, 'return', {'reason': reason, 'remaining': carried,
        'duel_abandoned': copy.deepcopy(trip.state.get('duel'))})
    trip.state.update(carried=[], reason=reason)
    trip.status = 'cancelled' if cancelled else 'completed'
    trip.ended_at = local_time()
    trip.next_tick_at = None
    trip.save()
    FishingRuntime.objects.filter(pk=trip.pk).update(authorized=False, token='', until=None)
    report = f"{trip.actor_name}出钓结束，抛竿{trip.state['casts']}次；{reason}"
    record = AgentRunRecord.objects.filter(pk=trip.record_id).first()
    if record:
        record.summary, record.status = report, 'success'
        record.save(update_fields=['summary', 'status', 'updated_at'])
    item = LifeItem.objects.filter(pk=trip.life_item_id).first()
    if item:
        revise(item, reason, status='cancelled' if cancelled else 'completed',
            record_id=trip.record_id, result={'reason': report, 'fishing_trip_id': trip.pk})
    return trip


@guarded
@transaction.atomic
def retry(identity: str) -> None:
    trip = FishingTrip.objects.select_for_update().get(pk=identity)
    if trip.ended_at:
        raise ValueError('出钓已经结束')
    if trip.status != 'paused' and FishingRuntime.objects.filter(pk=trip.pk, authorized=True).exists():
        raise ValueError('出钓正在正常运行，无需重试')
    from system_settings.models import WorldActionRuntime
    if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
        raise ValueError('请先开启本机统一生活运行')
    if not FishingConfig.objects.filter(pk=trip.owner_id, enabled=True).exists():
        raise ValueError('请先启用钓鱼能力')
    from ..life_config import config_for
    if trip.actor_id in config_for(trip.owner_id).paused_agents or not Agent.objects.filter(pk=trip.actor_id, archived_at__isnull=True).exists():
        raise ValueError('居民已暂停或归档')
    if not LifeItem.objects.filter(pk=trip.life_item_id, status='running').exists():
        raise ValueError('关联生活安排已结束')
    next_tick_at = local_time()
    if trip.status == 'active' and trip.next_tick_at:
        # 恢复本机授权不能把已经安排的下一竿提前；过期时仍只推进一次。
        next_tick_at = max(next_tick_at, local_time(trip.next_tick_at))
    trip.state.update(failures=0)
    trip.state.pop('error', None)
    trip.status = 'duel' if trip.state.get('duel') else 'active' if trip.departed_at else 'preparing'
    trip.next_tick_at = next_tick_at
    trip.save()
    FishingRuntime.objects.update_or_create(pk=trip.pk, defaults={'authorized': True})
