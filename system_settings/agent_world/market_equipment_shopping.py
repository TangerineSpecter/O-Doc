"""Entry summary first, then one equipment comparison per decision inside a session."""
import time
from decimal import Decimal
from typing import Callable

from django.utils import timezone
from system_settings.decision.routing import choose_scene
from system_settings.models import Agent

from .market_equipment_candidates import equipment_candidates, equipment_summary
from .market_no_buy import record
from .market_models import MarketSession
from .market_plan_models import MarketPlan, MarketTick
from .market_sessions import invalid_reason

MAX_DECISIONS = 20


def decide_entry(owner: str, agent: Agent, tick: MarketTick, actions: dict,
                 candidates: list[dict], funds: Decimal) -> str | None:
    state = {
        'equipment': equipment_summary(candidates), 'equipment_funds': str(funds),
        'transactions': {key: len(actions.get(key, []))
                         for key in ('dispositions', 'goals', 'reprices', 'withdraws', 'equipment')},
        'stamina_cost': 5,
    }
    try:
        return choose_scene(owner, agent, 'market', state,
            {'enter': '去市场', 'wait': '本小时不去'},
            deadline=time.monotonic() + 20, question_id=f'market-entry:{tick.pk}',
            instructions='根据本小时真实交易机会决定去不去市场。装备摘要只统计可穿戴且尚未明确拒买的实例；没有按属性优劣筛选。去后才逐件比较现装、候选和价格，不去不标记任何装备。',
            max_probability=True)
    except TimeoutError:
        return None


def shop_equipment(owner: str, agent: Agent, session: MarketSession, plan: MarketPlan,
                   tick: MarketTick, listing_ids: list[str], purchase: Callable[..., dict],
                   request_key: Callable[[str, dict], str],
                   funds: Callable[[str, str, MarketPlan], Decimal]) -> dict:
    result = {'done': [], 'failed': [], 'skipped': [], 'decisions': []}
    deadline = time.monotonic() + max(0, (session.expires_at - timezone.now()).total_seconds())
    for listing_id in listing_ids:
        if len(result['decisions']) >= MAX_DECISIONS or time.monotonic() >= deadline:
            break
        reason = invalid_reason(session)
        if reason:
            result['skipped'].append({'reason': reason})
            break
        rows = equipment_candidates(owner, agent.pk, listing_ids=[listing_id])
        if not rows:
            continue
        row = rows[0]
        available = funds(owner, agent.pk, plan)
        state = {'job': row['job'], 'level': row['level'], 'slots': row['slots'],
                 'current_equipment': row['current'],
                 'candidate_equipment': row['snapshot'], 'price': row['price'],
                 'spendable': str(available)}
        try:
            selected = choose_scene(owner, agent, 'market_equipment', state,
                {'buy': '买下这件装备', 'no': '不买这件'},
                deadline=min(deadline, time.monotonic() + 20),
                question_id=f'market-equipment:{tick.pk}:{row["equipment_id"]}',
                instructions='只比较这一件可穿戴挂牌装备与对应部位现装，根据职业、属性、价格和可用资金决定买或不买。候选未按属性提升筛选。戒指只决策一次，可对照两个戒指位。不买会按实例永久记住，买入成功后不再作为他人挂牌候选；买后仍需探索准备换装。',
                include_role=False, max_probability=True)
        except TimeoutError:
            selected = None
        reason = invalid_reason(session)
        if reason or selected not in ('buy', 'no'):
            result['skipped'].append({'equipment_id': row['equipment_id'],
                                      'reason': reason or '装备决策连接不可用，留待下次'})
            break
        result['decisions'].append({'equipment_id': row['equipment_id'], 'choice': selected})
        if selected == 'no':
            record(owner, agent.pk, row['equipment_id'], snapshot=row['snapshot'],
                   price=Decimal(row['price']), reason='居民逐件比较后明确不买')
            continue
        operation = {'kind': 'buy_listing', 'listing_id': row['listing_id'],
                     'version': row['version'], 'quantity': 1, 'unit_price': row['price']}
        try:
            purchase(session, agent, plan, request_key(tick.pk, operation), operation, '',
                     timezone.now(), equipment=True)
            result['done'].append(operation)
        except Exception as exc:  # A failed trade is not a permanent rejection.
            result['failed'].append({'operation': operation, 'reason': str(exc)[:300]})
    return result
