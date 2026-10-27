"""Synced shopping progress in MarketPlan.context, independent of hourly ticks."""
import hashlib
import json
from copy import deepcopy
from uuid import uuid4

from django.db import transaction

from .farm_gate import guarded
from .combat.equipment_effective import snapshots
from .combat.models import CombatProfile, EquipmentInstance
from .market_equipment_candidates import SLOTS
from .market_equipment_selection import KEY, VERSION, validate
from .market_models import MarketListing
from .market_no_buy import _wearable, record
from .market_plan_models import MarketPlan


def reference(row: dict) -> dict:
    return {key: deepcopy(row[key]) for key in
            ('equipment_id', 'snapshot', 'rules', 'slots', 'price', 'listing_id', 'version')}


def include_new(state: dict, live: dict[str, dict]) -> bool:
    unseen = [row for identity, row in live.items() if identity not in state['seen']]
    if not unseen:
        return False
    state['pending'].extend(unseen)
    state['seen'].extend(row['equipment_id'] for row in unseen)
    state.update(phase='collect', selection={})
    return True


def owned(owner: str, actor_id: str) -> tuple[str, dict, list[dict]]:
    profile = CombatProfile.objects.get(pk=actor_id, owner_id=owner)
    listed = MarketListing.objects.filter(owner_id=owner, status='active',
        item__source__kind='combat_equipment').values_list('item__source__equipment_id', flat=True)
    gears = list(EquipmentInstance.objects.filter(owner_id=owner, actor_id=actor_id, sold=False)
                 .exclude(pk__in=listed).order_by('created_at', 'pk'))
    effective = snapshots(gears)
    rows = []
    for item in gears:
        snapshot = effective[item.pk]
        slots = [slot for slot in SLOTS if _wearable(snapshot, item.rules,
            profile.progression['job'], profile.progression['level'], slot)]
        if slots:
            rows.append({'equipment_id': item.pk, 'snapshot': snapshot, 'rules': item.rules,
                         'slots': slots, 'price': '0', 'listing_id': '', 'version': 0})
    by_id = {row['equipment_id']: row for row in rows}
    current = {slot: by_id[identity] for slot, identity in profile.loadout.items() if identity in by_id and slot in SLOTS}
    basis = hashlib.sha256(json.dumps([profile.progression['job'], profile.progression['level'],
        profile.loadout, rows], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return basis, current, rows


@guarded
@transaction.atomic
def save(plan: MarketPlan, state: dict, rejected=()) -> None:
    validate(state)
    live = MarketPlan.objects.select_for_update().get(pk=plan.pk, owner_id=plan.owner_id, actor_id=plan.actor_id)
    for row in rejected:
        record(plan.owner_id, plan.actor_id, row['equipment_id'], snapshot=row['snapshot'],
               price=row['price'], reason='比较暂选装备及合法组合后，不属于最终购买方案')
    live.context = {**(live.context or {}), KEY: deepcopy(state)}
    live.save(update_fields=['context', 'updated_at'])
    plan.context = live.context


def start(plan: MarketPlan, candidates: list[dict]) -> dict:
    basis, current, inventory = owned(plan.owner_id, plan.actor_id)
    # A batch may span midnight; it is business progress, not the old tick's lease.
    previous = MarketPlan.objects.filter(owner_id=plan.owner_id, actor_id=plan.actor_id,
        plan_date__lte=plan.plan_date, context__has_key=KEY).order_by('-plan_date', '-updated_at').first()
    state = deepcopy((previous.context or {})[KEY]) if previous else None
    if state:
        validate(state)
    live = {row['equipment_id']: reference(row) for row in candidates}
    if state and state['basis'] == basis:
        # Any changed/disappeared provisional quote requires a fresh comparison, never a stale purchase.
        held = [row for row in state['pools'].values() if row.get('listing_id')]
        if any(live.get(row['equipment_id']) != row for row in held):
            state = None
    else:
        state = None
    if state is None:
        pools = {('two_handed' if row['rules'].get('grip') == 'two_handed' else 'one_handed')
                 if slot == 'weapon' else slot: row for slot, row in current.items()}
        worn = {row['equipment_id'] for row in current.values()}
        state = {'version': VERSION, 'id': uuid4().hex, 'phase': 'collect', 'basis': basis,
                 'current': current, 'pools': pools, 'selection': {}, 'seen': [],
                 'pending': [row for row in inventory if row['equipment_id'] not in worn]}
    if state['phase'] == 'done':
        state.update(id=uuid4().hex, phase='collect', selection={}, seen=[], pending=[])
    include_new(state, live)
    save(plan, state)
    return state
