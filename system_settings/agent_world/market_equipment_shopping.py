"""Compare provisional equipment first; only a completed selection may trade."""
import time
from decimal import Decimal
from typing import Callable

from django.utils import timezone
from django.db import transaction
from system_settings.decision.routing import choose_scene
from system_settings.models import Agent

from .market_equipment_candidates import equipment_candidates, equipment_summary
from .farm_gate import farm_gate
from .market_equipment_progress import include_new, reference, save, start
from .market_equipment_selection import finish, group, hand_options, market_rows, options, price, replace, reserved
from .market_equipment_settlement import settle, verify
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
            instructions='根据本小时真实交易机会决定去不去市场。装备摘要统计可穿戴且未永久拒买的挂牌，包含已暂选待比较完成或待成交的实例；没有按属性优劣筛选。去后恢复进度、逐件比较暂选与候选，完整比较后才付款，不去不标记任何装备。',
            max_probability=True)
    except TimeoutError:
        return None


def shop_equipment(owner: str, agent: Agent, session: MarketSession, plan: MarketPlan,
                   tick: MarketTick, listing_ids: list[str], purchase: Callable[..., dict],
                   request_key: Callable[[str, dict], str],
                   funds: Callable[[str, str, MarketPlan], Decimal]) -> dict:
    result = {'done': [], 'failed': [], 'skipped': [], 'decisions': []}
    deadline = time.monotonic() + max(0, (session.expires_at - timezone.now()).total_seconds())
    # Refresh the whole eligible market; a pre-entry subset must never hide a competitor.
    with farm_gate():
        state = start(plan, equipment_candidates(owner, agent.pk))
    try:
        while state['phase'] != 'done':
            reason = invalid_reason(session)
            if reason or time.monotonic() >= deadline:
                raise ValueError(reason or '会话到期，保留暂选与剩余比较进度')
            if state['phase'] == 'collect':
                if not state['pending']:
                    with farm_gate():
                        if not include_new(state, verify(owner, agent.pk, state)):
                            state['phase'] = 'hands'
                        save(plan, state)
                    continue
                if len(result['decisions']) >= MAX_DECISIONS:
                    break
                _compare(owner, agent, session, plan, state, result, deadline, funds)
            elif state['phase'] == 'hands':
                alternatives = hand_options(state['pools'], state['current'])
                # Without a two-handed alternative, the per-slot comparisons suffice.
                needs_choice = bool(state['pools'].get('two_handed')) and len(alternatives) > 1
                if needs_choice and len(result['decisions']) >= MAX_DECISIONS:
                    break
                _hands(owner, agent, session, plan, state, result, deadline, funds,
                       alternatives, needs_choice)
            else:
                result['done'].extend(settle(owner, agent, session, plan, state,
                                            purchase, request_key, funds))
                if state['phase'] == 'collect':
                    break
    except (TimeoutError, ValueError) as exc:
        result['skipped'].append({'reason': str(exc)[:300]})
    except Exception as exc:  # Transactions roll back the whole selection on a failed trade.
        result['failed'].append({'operation': {'kind': 'equipment_selection'}, 'reason': str(exc)[:300]})
    return result


def _choose(owner: str, agent: Agent, state: dict, context: dict, choices: dict[str, str],
            deadline: float, suffix: str) -> str:
    selected = choose_scene(owner, agent, 'market_equipment', context, choices,
        deadline=min(deadline, time.monotonic() + 20),
        question_id=f'market-equipment:{state["id"]}:{suffix}',
        instructions='先比较暂选，全部结束才付款。当前比较基准包含已拥有但未穿戴及本轮暂选装备。根据职业、属性、价格与方案总价选择，不以属性提升硬过滤。替换或明确不选的市场实例永久拒买；自己的装备仅作比较，不卖出也不标拒买。戒指明确替换哪个位置，同一实例不能占两槽。单手与副手、双手先分别暂选，最后另问合法组合。',
        include_role=False, max_probability=True)
    if selected not in choices:
        raise ValueError('装备决策连接不可用，保留暂选与剩余比较进度')
    return selected


def _compare(owner: str, agent: Agent, session: MarketSession, plan: MarketPlan, state: dict,
             result: dict, deadline: float, funds: Callable[[str, str, MarketPlan], Decimal]) -> None:
    queued = state['pending'][0]
    if queued.get('listing_id'):
        live = equipment_candidates(owner, agent.pk, listing_ids=[queued['listing_id']])
        if not live or live[0]['equipment_id'] != queued['equipment_id']:
            state['pending'].pop(0)
            state['seen'] = [identity for identity in state['seen'] if identity != queued['equipment_id']]
            save(plan, state)
            return
        row = reference(live[0])
    else:
        row = queued
    kind = group(row)
    slots = ('ring_1', 'ring_2') if kind == 'ring_1' else (kind,)
    incumbents = {('weapon' if slot in ('one_handed', 'two_handed') else slot): state['pools'][slot]
                  for slot in slots if slot in state['pools']}
    from .combat.models import CombatProfile
    profile = CombatProfile.objects.get(pk=agent.pk, owner_id=owner)
    context = {'stage': 'compare', 'job': profile.progression['job'], 'level': profile.progression['level'],
        'slots': row['slots'], 'current_equipment': {slot: item['snapshot'] for slot, item in incumbents.items()},
        'provisional_equipment': {slot: {'equipment_id': item['equipment_id'], 'price': item['price'],
            'owned': not bool(item.get('listing_id'))} for slot, item in incumbents.items()},
        'candidate_equipment': row['snapshot'], 'candidate_equipment_id': row['equipment_id'], 'price': row['price'],
        'candidate_owned': not bool(row.get('listing_id')), 'spendable': str(funds(owner, agent.pk, plan)),
        'provisional_total': str(reserved(state['pools']))}
    choices = options(row)
    selected = _choose(owner, agent, state, context, choices, deadline, row['equipment_id'])
    with farm_gate(), transaction.atomic():
        reason = invalid_reason(session)
        if reason:
            raise ValueError(reason)
        verify(owner, agent.pk, state, [row])
        rejected = market_rows([row]) if selected == 'no' else []
        if selected != 'no':
            updated, rejected = replace(state['pools'], row, selected)
            if reserved(updated) > funds(owner, agent.pk, plan):
                raise ValueError('暂选方案超出实时可用资金，未替换也不写拒买')
            state['pools'] = updated
        state['pending'].pop(0)
        save(plan, state, rejected)
    result['decisions'].append({'equipment_id': row['equipment_id'], 'choice': selected,
                                'stage': 'compare', 'owned': not bool(row.get('listing_id'))})


def _hands(owner: str, agent: Agent, session: MarketSession, plan: MarketPlan, state: dict,
           result: dict, deadline: float, funds: Callable[[str, str, MarketPlan], Decimal],
           alternatives: dict[str, dict], needs_choice: bool) -> None:
    if needs_choice:
        from .combat.models import CombatProfile
        profile = CombatProfile.objects.get(pk=agent.pk, owner_id=owner)
        context = {'stage': 'hands', 'job': profile.progression['job'], 'level': profile.progression['level'],
            'alternatives': {key: {'equipment': rows, 'total': str(price(rows.values()))}
                             for key, rows in alternatives.items()},
            'other_equipment_total': str(price(row for slot, row in state['pools'].items()
                if slot not in ('one_handed', 'two_handed', 'offhand'))),
            'spendable': str(funds(owner, agent.pk, plan))}
        labels = {'one_handed': '选择单手武器与副手组合', 'two_handed': '选择双手武器，放弃市场副手',
                  'current': '保留身上原有主副手组合'}
        selected = _choose(owner, agent, state, context,
                           {key: labels[key] for key in alternatives}, deadline, 'hands')
    else:
        selected = next(iter(alternatives))
    with farm_gate(), transaction.atomic():
        reason = invalid_reason(session)
        if reason:
            raise ValueError(reason)
        verify(owner, agent.pk, state)
        selection, _ = finish(state['pools'], alternatives[selected])
        if price(selection.values()) > funds(owner, agent.pk, plan):
            raise ValueError('组合总价超出实时可用资金，保留暂选下次复核')
        state.update(phase='ready', selection=selection)
        # Keep hand alternatives until settlement's final market scan. A newcomer
        # may still make the other combination preferable before any money is spent.
        save(plan, state)
    if needs_choice:
        result['decisions'].append({'stage': 'hands', 'choice': selected})
