"""Commit a completed, compatible shopping selection as one asset transaction."""
from copy import deepcopy
from decimal import Decimal
from typing import Callable

from django.db import transaction
from django.utils import timezone
from system_settings.models import Agent

from .farm_gate import guarded
from .market_equipment_candidates import equipment_candidates
from .market_equipment_progress import include_new, owned, reference, save
from .market_equipment_selection import market_rows, price
from .market_sessions import invalid_reason
from .market_models import MarketSession
from .market_plan_models import MarketPlan


def verify(owner: str, actor_id: str, state: dict, extra=()) -> dict[str, dict]:
    if owned(owner, actor_id)[0] != state['basis']:
        raise ValueError('居民持有装备或穿戴条件变化，下次重新比较')
    live = {row['equipment_id']: reference(row) for row in equipment_candidates(owner, actor_id)}
    held = market_rows([*state['pools'].values(), *extra])
    if any(live.get(row['equipment_id']) != row for row in held):
        raise ValueError('暂选装备挂牌或报价变化，下次重新比较')
    return live


@guarded
@transaction.atomic
def settle(owner: str, agent: Agent, session: MarketSession, plan: MarketPlan, state: dict,
           purchase: Callable[..., dict], request_key: Callable[[str, dict], str],
           funds: Callable[[str, str, MarketPlan], Decimal]) -> list[dict]:
    reason = invalid_reason(session)
    if reason:
        raise ValueError(reason)
    live = verify(owner, agent.pk, state)
    if include_new(state, live):
        save(plan, state)
        return []
    purchases = market_rows(state['selection'].values())
    if price(purchases) > funds(owner, agent.pk, plan):
        raise ValueError('暂选组合总价超出实时可用资金，保留方案下次复核')
    done = []
    for row in purchases:
        reason = invalid_reason(session)
        if reason:
            raise ValueError(reason)
        operation = {'kind': 'buy_listing', 'listing_id': row['listing_id'],
                     'version': row['version'], 'quantity': 1, 'unit_price': row['price']}
        purchase(session, agent, plan, request_key('equipment-selection:' + state['id'], operation),
                 operation, '', timezone.now(), equipment=True)
        done.append(operation)
    # Retain purchased-but-unworn winners as the next shopping baseline.
    converted = deepcopy(state)
    selected_ids = {row['equipment_id'] for row in state['selection'].values()}
    for field in ('pools', 'selection'):
        for slot, row in list(converted[field].items()):
            if row.get('listing_id'):
                if row['equipment_id'] not in selected_ids:
                    converted[field].pop(slot)
                else:
                    row.update(listing_id='', price='0', version=0)
    converted['basis'], converted['current'], _ = owned(owner, agent.pk)
    converted.update(phase='done', pending=[])
    rejected = [row for row in market_rows(state['pools'].values())
                if row['equipment_id'] not in selected_ids]
    save(plan, converted, rejected)
    state.clear()
    state.update(converted)
    return done
