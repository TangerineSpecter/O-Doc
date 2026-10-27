"""Compact, read-only evidence for supply decisions; never send round logs to models."""
from decimal import Decimal

from .food import OUTCOMES
from .models import CombatFact, Exploration
from .party_models import AdventureEvent
from .store import current


def last_exploration(run) -> dict | None:
    previous = (Exploration.objects.filter(
        owner_id=run.owner_id, actor_id=run.actor_id, status__in=tuple(OUTCOMES),
        ended_at__isnull=False, snapshot__has_key='plan'
    ).exclude(pk=run.pk).order_by('-ended_at', '-created_at', '-pk').first())
    if previous is None:
        return None
    catalog = current(previous.catalog_id)
    plan = previous.snapshot['plan']
    red_ids = {row['id'] for row in catalog.tables['potions'] if row['kind'] == 'heal'}
    used = sum(count for sid, count in previous.result.get('potions_used', {}).items() if sid in red_ids)
    carried = sum(count for sid, count in plan.get('potions', {}).items() if sid in red_ids)
    restored = 0
    events_count = 0
    shared_ids = set()

    def accumulate(events, *, shared=False):
        nonlocal restored, events_count
        for event in events:
            if (event.get('kind') == 'potion' and event.get('potion_id') in red_ids
                    and (not shared or event.get('actor_id') == run.actor_id)
                    and type(event.get('restored')) is int):
                restored += event['restored']
                events_count += 1

    for payload in CombatFact.objects.filter(
        owner_id=run.owner_id, actor_id=run.actor_id, exploration_id=previous.pk, kind='round'
    ).values_list('payload', flat=True).iterator():
        shared_id = payload.get('shared_event_id')
        if shared_id:
            shared_ids.add(shared_id)
        else:
            accumulate(payload.get('events', []))
    if shared_ids:
        for payload in AdventureEvent.objects.filter(
            owner_id=run.owner_id, pk__in=shared_ids
        ).values_list('payload', flat=True).iterator():
            accumulate(payload.get('events', []), shared=True)
    return {
        'dungeon_id': plan.get('dungeon_id'),
        'planned_minutes': previous.duration_seconds / 60,
        'actual_minutes': round(previous.elapsed_seconds / 60, 1),
        'outcome': OUTCOMES[previous.status],
        'red_carried': carried,
        'red_used': used,
        # An old or incomplete log cannot establish actual healing, including overheal.
        'red_hp_restored': restored if events_count == used else None,
    }


def decision_state(run, profile, catalog) -> dict:
    from .profiles import stats
    derived = stats(profile, catalog)
    return {
        'resources': {'hp': profile.hp, 'hp_max': derived['hp_max'],
                      'mp': profile.mp, 'mp_max': derived['mp_max']},
        'last_exploration': last_exploration(run),
        'history_note': '历史仅供参考；有药仍倒地不代表携带不足；总回血为null表示未知，不按时长机械外推。',
    }


def red_tier_choices(potions: list[dict], stock: dict[str, int], count: int, funds: str) -> dict:
    """Offer only usable red tiers; cost describes this target before final revalidation."""
    choices = {}
    available_funds = Decimal(funds)
    for row in potions:
        if row['kind'] != 'heal':
            continue
        owned = stock[row['id']]
        price = Decimal(row['purchase_price'])
        obtainable = min(count, owned + int(available_funds // price))
        if obtainable <= 0:
            continue
        needed = max(0, count - owned)
        choices[row['id']] = {
            'name': row['name'], 'restore_value': int(row['restore_value']),
            'owned': owned, 'unit_price': str(price),
            'purchase_quantity': needed, 'purchase_cost': str(price * needed),
            'obtainable_count': obtainable,
        }
    return choices
