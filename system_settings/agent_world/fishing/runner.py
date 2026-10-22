"""单次推进与事务结算；模型等待不持有资产锁。"""
import copy
import secrets
from datetime import timedelta
from decimal import Decimal
from django.db import transaction
from system_settings.models import Agent, WorldAction
from ..farm_gate import guarded, farm_gate
from ..execution import stamina
from ..inventory_stock import add_stock
from ..market_inventory import split_escrow
from ..life_time import local_time, storage_time
from .models import FishingTrip, FishingProfile
from .rules import candidates, encounter, capture_probability, experience_for, level_for, duel_result
from .service import authorized, append, finish


def reward(trip: FishingTrip, fish_id: str, at, rng) -> dict:
    fish = trip.rules['fish'][fish_id]
    weight = round(rng.uniform(*fish['weight_range']), 3)
    gained = experience_for(fish)
    profile = FishingProfile.objects.select_for_update().get(pk=trip.actor_id, owner_id=trip.owner_id)
    profile.experience += gained
    profile.save()
    sku = 'fish.' + fish_id
    item = add_stock(trip.actor_id, trip.owner_id, trip.actor_name, sku, 1, fish['name'],
                     'fish_king' if fish['king'] else 'fish', Decimal(fish['value']),
                     f'{trip.pk}:{trip.revision + 1}')
    if not fish['king']:
        from ..market_disposition import enqueue
        enqueue(trip.owner_id, trip.actor_id, sku, source='fishing', operation=f'{trip.pk}:{trip.revision + 1}')
    return {'fish_id': fish_id, 'name': fish['name'], 'king': fish['king'], 'weight': weight,
            'experience': gained, 'value': fish['value'], 'item_id': item.pk,
            'caught_at': at.isoformat()}


def next_bait(trip: FishingTrip, at) -> tuple[int, int] | None:
    baits = trip.state['plan']['baits']
    for offset in range(len(baits)):
        cursor = (trip.state['cursor'] + offset) % len(baits)
        bait = baits[cursor]
        if not candidates(trip.rules, trip.state['plan']['spot'], bait, at):
            continue
        for index, payload in enumerate(trip.state['carried']):
            if payload['quantity'] > 0 and payload['source']['sku'] == 'bait.' + bait:
                return cursor, index
    return None


@guarded
@transaction.atomic
def cast(identity: str, *, now=None, rng=None) -> None:
    trip = FishingTrip.objects.select_for_update().get(pk=identity)
    at, rng = local_time(now), rng or secrets.SystemRandom()
    if trip.status != 'active' or not authorized(trip):
        return
    if trip.next_tick_at and at < local_time(trip.next_tick_at):
        return
    # A small worker polling tolerance permits the final scheduled cast. No offline catch-up.
    if at > local_time(trip.deadline) + timedelta(seconds=5):
        finish(identity, '已到返程时间')
        return
    available = next_bait(trip, at)
    if available is None:
        finish(identity, '鱼饵用尽或当前时间没有适用鱼种')
        return
    agent = Agent.objects.select_for_update().get(pk=trip.actor_id)
    from ..life_commitments import require_energy, ResourceProtected
    try:
        require_energy(trip.owner_id, agent, trip.rules['energy_cost'], item_id=trip.life_item_id, now=at)
    except ResourceProtected:
        finish(trip.pk, '系统说明：本次垂钓结束，为后续日程保留体力')
        return
    if stamina(agent, storage_time(at)) < trip.rules['energy_cost']:
        finish(identity, '体力不足，结束垂钓')
        return
    cursor, index = available
    bait = trip.state['plan']['baits'][cursor]
    _, remaining = split_escrow(trip.state['carried'][index], 1)
    trip.state['carried'][index] = remaining
    trip.state['cursor'] = (cursor + 1) % len(trip.state['plan']['baits'])
    trip.state['casts'] += 1
    profile = FishingProfile.objects.get(pk=trip.actor_id, owner_id=trip.owner_id)
    level = level_for(profile.experience, trip.rules['max_level'])[0]
    outcome = encounter(trip.rules, trip.state['plan']['spot'], bait, at, rng)
    data = {'at': at.isoformat(), 'bait': bait, 'level': level, 'rod': trip.rules['rod'], 'version': trip.rules['version'],
            'outcome': outcome, 'experience': 0, 'energy': trip.rules['energy_cost'], 'cast': trip.state['casts']}
    if outcome['kind'] == 'fish':
        fish = trip.rules['fish'][outcome['fish_id']]
        probability = capture_probability(level, fish['level'], trip.rules['rod']['bonus'])
        data['probability'] = probability
        if rng.random() < probability:
            data['catch'] = reward(trip, outcome['fish_id'], at, rng)
            data['experience'] = data['catch']['experience']
        else:
            data['outcome'] = {**outcome, 'kind': 'escaped'}
            data['experience'] = 2
            profile.experience += 2
            profile.save()
    elif outcome['kind'] == 'king':
        trip.status = 'duel'
        trip.state['duel'] = {'fish_id': outcome['fish_id'], 'wins': 0, 'losses': 0, 'round': 0}
    event = append(trip, 'cast', data)
    WorldAction.objects.create(pk='fishing-energy:' + event.pk, actor_id=trip.actor_id,
        status='success', consumed_at=storage_time(at), energy_cost=trip.rules['energy_cost'], effects_done=True,
        snapshot={'fishing': True}, result={'fishing_trip_id': trip.pk, 'fishing_event_id': event.pk})
    trip.next_tick_at = at + timedelta(seconds=trip.rules['interval_seconds'])
    trip.save()
    if trip.status == 'active' and at >= local_time(trip.deadline):
        finish(identity, '已到返程时间')


def duel(identity: str, *, rng=None) -> None:
    from .decisions import choose
    trip = FishingTrip.objects.get(pk=identity)
    if trip.status != 'duel' or not authorized(trip):
        return
    state = copy.deepcopy(trip.state['duel'])
    # This round's fish move has not been generated and cannot be seen by the model.
    selected = choose(trip, 'fishing_duel', {'fish': trip.rules['fish'][state['fish_id']]['name'],
        'wins': state['wins'], 'losses': state['losses'], 'round': state['round'] + 1,
        'history': [event.data for event in trip.events.filter(kind='duel_round').order_by('-sequence')[:5]]},
        {'rock': '锤子', 'scissors': '剪刀', 'paper': '布'})
    with farm_gate(), transaction.atomic():
        locked = FishingTrip.objects.select_for_update().get(pk=identity)
        if locked.revision != trip.revision or locked.status != 'duel' or not authorized(locked):
            return
        at, rng = local_time(), rng or secrets.SystemRandom()
        king_move = rng.choice(['rock', 'scissors', 'paper'])
        result = duel_result(selected, king_move)
        state['round'] += 1
        state['wins'] += result == 'win'
        state['losses'] += result == 'loss'
        append(locked, 'duel_round', {'player': selected, 'king': king_move, 'result': result, **state})
        locked.state.update(duel=state, failures=0)
        locked.state.pop('error', None)
        if state['wins'] == 3 or state['losses'] == 3:
            data = {'fish_id': state['fish_id'], 'result': 'caught' if state['wins'] == 3 else 'escaped', 'experience': 0}
            if state['wins'] == 3:
                data['catch'] = reward(locked, state['fish_id'], at, rng)
                data['experience'] = data['catch']['experience']
            append(locked, 'duel_end', data)
            locked.state.pop('duel')
            locked.status = 'active'
        locked.next_tick_at = at + timedelta(seconds=5 if locked.status == 'duel' else locked.rules['interval_seconds'])
        locked.save()
        if locked.status == 'active' and at >= local_time(locked.deadline):
            finish(identity, '鱼王对决结束，已到返程时间')


@guarded
@transaction.atomic
def defer(identity: str, message: str) -> None:
    trip = FishingTrip.objects.select_for_update().get(pk=identity)
    if trip.ended_at or not authorized(trip):
        return
    count = trip.state.get('failures', 0) + 1
    trip.state.update(failures=count, error=message[:300])
    from ..life_models import LifeItem
    from ..life_activities import is_interleaved
    item = LifeItem.objects.filter(pk=trip.life_item_id).first()
    idle = item and is_interleaved(item)
    if count >= 3 and not idle:
        trip.status = 'paused'
    trip.next_tick_at = local_time() + timedelta(minutes=min(60, 5 * 2 ** min(count - 1, 4)) if idle else 1 if count == 1 else 5)
    trip.save()
