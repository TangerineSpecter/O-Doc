"""每日市场规划：代码算候选，本地决策模型逐题选档位。

规划不再把库存、挂牌、商店快照整体交给付费文本模型，也不再解析自由 JSON。
数量、价格上限、可穿戴过滤和预算都由代码算好；决策模型只回答“选哪个档位”，
每题候选不超过 10 个，答案缓存在 ``MarketPlan.context``，重试不重复提问。
决策链按世界设置里的顺序逐个尝试（含本机暂时沿用），全部不可用时按“不新增
采购”收官，不回退到付费文本模型。
"""
import hashlib
import json
import logging
import time
from datetime import datetime, time as day_time, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from system_settings.decision.routing import choose_scene
from system_settings.models import Agent

from .life_budget_policy import remaining_reservation
from .life_models import LifeItem
from .life_schedule import OPEN
from .life_time import local_time, storage_time
from .market_plan_candidates import (MAX_QUESTIONS, equipment_rows, listing_rows,
                                     money, need_rows, price_options, quantity_options)
from .market_plan_models import MarketGoal, MarketPlan, plan_id, stable_key
from .market_shop import shop_payload

logger = logging.getLogger(__name__)

PLAN_SCENE = 'market_plan'
SEED_QUESTIONS = 2
FERTILIZER_QUESTIONS = 2
LISTING_QUESTIONS = 1
EQUIPMENT_QUESTIONS = 1
MAX_GOALS = 12
MAX_GOAL_QUANTITY = 99
SLOTS = ('weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'accessory', 'ring_1', 'ring_2')


def _end_of_day(now) -> datetime:
    local = local_time(now)
    return storage_time(datetime.combine(local.date(), day_time(23, 59, 59)))


def _equipment_context(owner: str, actor_id: str) -> tuple[dict, str]:
    from .combat.models import CombatProfile, EquipmentInstance
    profile = CombatProfile.objects.filter(pk=actor_id, owner_id=owner).first()
    job = (profile.progression or {}).get('job', '') if profile else ''
    level = int((profile.progression or {}).get('level', 1)) if profile else 1
    gear_rows = list(EquipmentInstance.objects.filter(
        owner_id=owner, actor_id=actor_id, sold=False).order_by('pk').values(
        'pk', 'template_id', 'snapshot')[:200])
    signature = hashlib.sha256(json.dumps({
        'job': job, 'level': level, 'loadout': sorted((profile.loadout or {}).items()) if profile else [],
        'gear': [(row['pk'], row['template_id'], (row['snapshot'] or {}).get('level'))
                 for row in gear_rows],
    }, sort_keys=True, default=str).encode()).hexdigest()[:64]
    return {'job': job, 'level': level, 'slots': list(SLOTS)}, signature


def _available_budget(owner: str, agent) -> Decimal:
    reserved = sum((remaining_reservation(item) for item in LifeItem.objects.filter(
        owner_id=owner, actor_id=agent.pk, status__in=OPEN)), Decimal(0))
    return max(Decimal(0), Decimal(agent.money) - reserved).quantize(Decimal('0.01'))


def _facts(owner: str, agent, now) -> dict:
    """只计算规划真正要用的数据；不构建完整市场上下文，也不序列化给模型。"""
    shop = shop_payload(owner, now)
    shop_skus = {row['sku'] for row in shop['slots']} | {row['sku'] for row in shop['supplies']} | {'feed'}
    _, signature = _equipment_context(owner, agent.pk)
    return {
        'available': str(_available_budget(owner, agent)),
        'needs': need_rows(owner, agent, now),
        'listings': listing_rows(owner, agent.pk, agent=agent),
        'equipment': equipment_rows(owner, agent.pk),
        'shop_skus': shop_skus,
        'signature': signature,
    }


def needs_signature(rows: list[dict]) -> str:
    """种子与肥料缺口的指纹；变化时才重新评估，避免每小时重复建目标。"""
    payload = [[row['kind'], row['sku'], int(row['missing'])] for row in rows]
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:32]


def queue_purchase_room(owner: str, actor_id: str, now) -> Decimal | None:
    """当天农场队列剩余的采购上限；没有可用队列时返回 None。"""
    from .farm_models import AgentFarm
    from .farm_queue_plan import current
    farm = AgentFarm.objects.filter(pk=actor_id, owner_id=owner).first()
    plan = current(farm, now) if farm else None
    if not plan or plan['status'] not in ('pending', 'active', 'completed'):
        return None
    if now.timestamp() >= plan['cutoff']:
        return None
    spent = sum((Decimal(purchase['amount']) for purchase in plan['purchases']), Decimal(0))
    return max(Decimal(0), money(plan['procurement_limit']) - spent)


def _queue_goals(owner: str, agent, plan: MarketPlan, rows: list[dict], room: Decimal,
                 now) -> tuple[int, Decimal, list[str]]:
    """按缺口生成采购目标；只补未被现有目标覆盖的部分。"""
    covered = {goal.sku: max(0, goal.quantity - goal.filled_quantity)
               for goal in plan.goals.filter(kind='shop', status='open')}
    committed = sum((goal.max_unit_price * max(0, goal.quantity - goal.filled_quantity)
                     for goal in plan.goals.filter(status='open')), Decimal(0))
    remaining = min(room, max(Decimal(0), _available_budget(owner, agent) - plan.spent - committed))
    created, added, lines = 0, Decimal(0), []
    deadline = _end_of_day(now)
    for row in rows:
        if remaining <= 0:
            break
        missing = int(row['missing']) - covered.get(row['sku'], 0)
        if missing <= 0:
            continue
        price = money(row['unit_price'])
        if price <= 0:
            continue
        count = min(missing, int(remaining // price))
        if count <= 0:
            continue
        identity = stable_key('market-goal', plan.pk, 'queue', row['sku'], length=80)
        goal = MarketGoal.objects.filter(pk=identity).first()
        if goal:
            # 早前已成交或已结束的同 sku 目标：按新缺口重新开放，不另造重复目标。
            goal.quantity, goal.filled_quantity = count, 0
            goal.max_unit_price, goal.deadline, goal.status = price, deadline, 'open'
            goal.reason = f"农场队列缺口{missing}{row['unit']}"
            goal.save(update_fields=['quantity', 'filled_quantity', 'max_unit_price',
                                     'deadline', 'status', 'reason', 'updated_at'])
        else:
            MarketGoal.objects.create(
                pk=identity, owner_id=plan.owner_id, actor_id=plan.actor_id, plan=plan,
                kind='shop', sku=row['sku'], slot='', min_stars=1, quantity=count,
                max_unit_price=price, deadline=deadline, status='open',
                reason=f"农场队列缺口{missing}{row['unit']}")
        covered[row['sku']] = covered.get(row['sku'], 0) + count
        remaining -= price * count
        added += price * count
        created += 1
        lines.append(f"{row['name']}×{count}")
    return created, added, lines


def refresh_queue_needs(owner: str, actor_id: str, now=None) -> int:
    """农场队列出现种子或肥料缺口时，按采购上限补入市场目标。

    每日市场规划可能早于当天种植计划生成，队列出现缺口后不再重问模型：
    缺口金额已由代码算好，成交仍受当日市场预算、生活预留与队列采购上限约束。
    """
    now = now or timezone.now()
    plan = MarketPlan.objects.filter(owner_id=owner, actor_id=actor_id,
                                     plan_date=local_time(now).date()).first()
    if not plan or plan.status != 'active':
        return 0
    agent = Agent.objects.filter(pk=actor_id, archived_at__isnull=True).first()
    if not agent:
        return 0
    rows = need_rows(owner, agent, now)
    signature = needs_signature(rows)
    context = dict(plan.context or {})
    if context.get('needs_signature') == signature:
        return 0
    created, added, lines = 0, Decimal(0), []
    room = queue_purchase_room(owner, actor_id, now)
    if room:
        created, added, lines = _queue_goals(owner, agent, plan, rows, room, now)
    if not created and rows:
        # 有缺口但暂时买不起或已由现有目标覆盖：不记指纹，下一小时重新评估。
        return 0
    context['needs_signature'] = signature
    fields = ['context', 'updated_at']
    if created:
        cash = _available_budget(owner, agent)
        plan.budget = min(plan.budget + added, max(plan.budget, cash)).quantize(Decimal('0.01'))
        plan.summary = (plan.summary.rstrip('。')
                        + f'；农场队列缺口补入{"、".join(lines)}，预算增至{plan.budget}。')[:1000]
        plan.version += 1
        fields.extend(['budget', 'summary', 'version'])
    plan.context = context
    plan.save(update_fields=fields)
    return created


def _ask(owner: str, agent, plan: MarketPlan, key: str, state: dict, choices: dict,
         instructions: str, questions_left: int) -> tuple[str | None, int]:
    """单题调用决策链；答案写入计划上下文，恢复或重试不重复提问。"""
    if len(choices) == 1:
        return next(iter(choices)), questions_left
    cached = (plan.context or {}).get('answers') or {}
    if cached.get(key) in choices:
        return cached[key], questions_left
    if questions_left <= 0:
        return None, questions_left
    selected = choose_scene(
        owner, agent, PLAN_SCENE, state, choices,
        deadline=time.monotonic() + 20,
        question_id=f'market-plan:{plan.pk}:{key}',
        instructions=instructions, include_role=False, max_probability=True)
    if selected not in choices:
        return None, questions_left
    context = dict(plan.context or {})
    answers = dict(context.get('answers') or {})
    answers[key] = selected
    context['answers'] = answers
    plan.context = context
    plan.save(update_fields=['context', 'updated_at'])
    return selected, questions_left - 1


def _need_state(row: dict, available: str) -> dict:
    state = {'name': row['name'], 'missing': row['missing'], 'owned': row['owned'],
             'unit_price': str(row['unit_price']), 'unit': row['unit'],
             'available_budget': available}
    if row.get('effect'):
        state['effect'] = row['effect']
    return state


def _decide(owner: str, agent, plan: MarketPlan, facts: dict) -> tuple[list[dict], Decimal, str, str]:
    """按“种子 → 肥料 → 挂牌 → 装备”顺序提问；额度用完后按缺口默认值收官。"""
    available = Decimal(facts['available'])
    answers = dict((plan.context or {}).get('answers') or {})
    questions = MAX_QUESTIONS
    fallback = ''
    goals = []

    def ask(key: str, state: dict, choices: dict, instructions: str) -> tuple[str | None, str]:
        nonlocal questions, fallback
        if not choices:
            return None, 'empty'
        if len(choices) == 1:
            return next(iter(choices)), 'single'
        if answers.get(key) in choices:
            return answers[key], 'cached'
        if fallback:
            return None, 'unavailable'
        if questions <= 0:
            return None, 'exhausted'
        selected, questions = _ask(owner, agent, plan, key, state, choices, instructions, questions)
        if selected in choices:
            return selected, 'ok'
        fallback = 'decision_unavailable'
        return None, 'unavailable'

    def committed() -> Decimal:
        return sum((Decimal(goal['max_unit_price']) * goal['quantity'] for goal in goals), Decimal(0))

    def quantity(row: dict, instructions: str) -> int:
        remaining = max(Decimal(0), available - committed())
        choices, meta = quantity_options(row['missing'], row['unit_price'], remaining,
                                         unit=row['unit'], owned=row['owned'])
        selected, reason = ask(row['key'], _need_state(row, str(remaining)), choices, instructions)
        if selected in meta:
            return int(meta[selected]['quantity'])
        return int(row['missing']) if reason == 'exhausted' else 0

    def price(key: str, state: dict, base, instructions: str) -> Decimal:
        choices, meta = price_options(base)
        selected, _ = ask(key, state, choices, instructions)
        return money(meta[selected]['price']) if selected in meta else Decimal(0)

    asked_seeds = 0
    for row in facts['needs']:
        if row['kind'] != 'seed' or asked_seeds >= SEED_QUESTIONS:
            continue
        asked_seeds += 1
        count = quantity(row, '决定今天补多少种子；金额不能超过可用预算，没有缺口就选不买。')
        if count > 0:
            goals.append({'kind': 'shop', 'sku': row['sku'], 'slot': '', 'quantity': count,
                          'min_stars': 1, 'max_unit_price': str(money(row['unit_price'])),
                          'reason': f"种植缺口{row['missing']}{row['unit']}", 'name': row['name']})

    fertilizer_rows = [row for row in facts['needs'] if row['kind'] == 'fertilizer']
    for row in fertilizer_rows[:FERTILIZER_QUESTIONS]:
        count = quantity(row, '决定今天买多少袋肥料；考虑缺口、手头库存、单价和效果。')
        if count > 0:
            goals.append({'kind': 'shop', 'sku': row['sku'], 'slot': '', 'quantity': count,
                          'min_stars': 1, 'max_unit_price': str(money(row['unit_price'])),
                          'reason': f"种植缺口{row['missing']}{row['unit']}", 'name': row['name']})

    for row in facts['listings'][:LISTING_QUESTIONS]:
        state = {'sku': row['sku'], 'name': row['name'], 'count': row['count'],
                 'min_price': str(money(row['min_price'])), 'max_stars': row['max_stars'],
                 'available_budget': facts['available']}
        ceiling = price('listing:' + row['sku'], state, row['min_price'],
                        '决定是否按价格上限求购居民挂牌；上架收入尚未到账，不能计入预算。')
        if ceiling > 0:
            goals.append({'kind': 'listing', 'sku': row['sku'], 'slot': '', 'quantity': 1,
                          'min_stars': max(1, int(row['max_stars'])),
                          'max_unit_price': str(ceiling),
                          'reason': f"挂牌最低{row['min_price']}，按{row['max_stars']}星上限求购",
                          'name': row['name']})

    for row in facts['equipment'][:EQUIPMENT_QUESTIONS]:
        state = {'slot': row['slot'], 'count': row['count'],
                 'min_price': str(money(row['min_price'])), 'available_budget': facts['available']}
        ceiling = price('equipment:' + row['slot'], state, row['min_price'],
                        '决定是否为这个空部位设定装备求购上限；买下后仍需在探索准备中换装。')
        if ceiling > 0:
            goals.append({'kind': 'equipment', 'sku': '', 'slot': row['slot'], 'quantity': 1,
                          'min_stars': 1, 'max_unit_price': str(ceiling),
                          'reason': f"空部位，候选最低{row['min_price']}"})

    fitted, spent = _fit(goals, available)
    return fitted, spent, _summary(fitted, fallback), fallback


def _fit(goals: list[dict], available: Decimal) -> tuple[list[dict], Decimal]:
    """按优先级裁剪到可用预算；超出部分减少数量或跳过，不生成负预算目标。"""
    total, kept = Decimal(0), []
    for goal in goals:
        unit_price = Decimal(goal['max_unit_price'])
        quantity = int(goal['quantity'])
        if unit_price <= 0 or quantity <= 0:
            continue
        affordable = int((available - total) / unit_price)
        quantity = min(quantity, affordable)
        if quantity <= 0:
            continue
        total += unit_price * quantity
        kept.append({**goal, 'quantity': quantity})
    return kept, total.quantize(Decimal('0.01'))


def _summary(goals: list[dict], fallback: str) -> str:
    if not goals:
        return ('决策模型不可用，今日不新增采购，先消化现有库存。' if fallback
                else '今日没有必须采购的缺口，先消化现有库存。')
    parts = []
    for goal in goals:
        if goal['kind'] == 'shop':
            unit = '份' if goal['sku'].startswith('seed.') else ('袋' if goal['sku'].startswith('fertilizer.') else '件')
            parts.append(f"补{goal.get('name') or goal['sku']}×{goal['quantity']}"
                         f"（≤{goal['max_unit_price']}/{unit}）")
        elif goal['kind'] == 'listing':
            parts.append(f"求购{goal.get('name') or goal['sku']} {goal['quantity']}件 ≤{goal['max_unit_price']}")
        else:
            parts.append(f"{goal['slot']}部位求购 ≤{goal['max_unit_price']}")
    text = '今日：' + '；'.join(parts) + '。'
    if fallback:
        text += '（决策模型不可用，未完成的项不新增采购）'
    return text[:1000]


def validate_plan(value: dict, context: dict, shop_skus: set[str]) -> dict:
    if not isinstance(value, dict):
        raise ValueError('市场规划必须是对象')
    available = Decimal(str(context['available_budget']))
    try:
        budget = Decimal(str(value.get('budget', '0')))
    except (TypeError, ValueError) as exc:
        raise ValueError('预算格式无效') from exc
    if budget < 0:
        raise ValueError('预算不能为负')
    budget = min(budget, available).quantize(Decimal('0.01'))
    summary = str(value.get('summary', '')).strip()[:1000]
    goals = value.get('goals', [])
    if not isinstance(goals, list) or len(goals) > MAX_GOALS:
        raise ValueError('采购目标数量无效')
    allowed_slots = set(context['equipment'].get('slots') or SLOTS)
    tradable = set(context.get('tradable_skus') or [])
    cleaned, seen = [], set()
    for row in goals:
        if not isinstance(row, dict):
            raise ValueError('采购目标格式无效')
        kind = row.get('kind')
        if kind not in ('shop', 'listing', 'equipment'):
            raise ValueError('采购目标类型无效')
        sku = str(row.get('sku', '')).strip()
        slot = str(row.get('slot', '')).strip()
        try:
            quantity = int(row.get('quantity', 1))
            unit_price = Decimal(str(row.get('max_unit_price', '0')))
            min_stars = int(row.get('min_stars', 1))
        except (TypeError, ValueError) as exc:
            raise ValueError('采购目标数量或价格无效') from exc
        if not 1 <= quantity <= MAX_GOAL_QUANTITY or unit_price <= 0:
            raise ValueError('采购目标数量或价格超出范围')
        if kind == 'equipment':
            if slot not in allowed_slots or quantity != 1:
                raise ValueError('装备目标部位或数量无效')
            key = ('equipment', slot)
        else:
            if sku not in shop_skus and (kind == 'shop' or sku not in tradable):
                raise ValueError('采购目标 sku 不在候选范围')
            if not 1 <= min_stars <= 5:
                raise ValueError('最低星级无效')
            key = (kind, sku)
        if key in seen:
            continue
        seen.add(key)
        cleaned.append({'kind': kind, 'sku': sku, 'slot': slot, 'quantity': quantity,
                        'min_stars': min_stars, 'max_unit_price': str(unit_price.quantize(Decimal('0.01'))),
                        'reason': str(row.get('reason', ''))[:300]})
    estimated = sum((Decimal(goal['max_unit_price']) * goal['quantity'] for goal in cleaned), Decimal(0))
    if estimated > budget:
        raise ValueError('采购目标金额超过当日预算')
    return {'budget': str(budget), 'summary': summary, 'goals': cleaned}


def _apply(plan: MarketPlan, result: dict, context: dict, now) -> None:
    deadline = _end_of_day(now)
    with transaction.atomic():
        row = MarketPlan.objects.select_for_update().get(pk=plan.pk)
        row.budget = Decimal(result['budget'])
        row.spent = Decimal('0')
        row.summary = result['summary'] or '今日市场计划已生成'
        row.equipment_signature = context['equipment_signature']
        row.status = 'active'
        row.context = {**(row.context or {}),
                       'available_budget': context['available_budget'],
                       'goal_count': len(result['goals']),
                       'needs_signature': context.get('needs_signature', '')}
        if context.get('fallback'):
            row.context['fallback'] = context['fallback']
        row.version += 1
        row.updated_at = timezone.now()
        row.save(update_fields=['budget', 'spent', 'summary', 'equipment_signature', 'status',
                                'context', 'version', 'updated_at'])
        row.goals.all().delete()
        for index, goal in enumerate(result['goals']):
            identity = stable_key('market-goal', plan.pk, goal['kind'], goal['sku'] or goal['slot'], index, length=80)
            MarketGoal.objects.create(
                pk=identity, owner_id=row.owner_id, actor_id=row.actor_id, plan=row,
                kind=goal['kind'], sku=goal['sku'], slot=goal['slot'],
                min_stars=goal['min_stars'], quantity=goal['quantity'],
                max_unit_price=Decimal(goal['max_unit_price']), deadline=deadline,
                status='open', reason=goal.get('reason', ''))
        # 装备评价输入没变时沿用昨日未完成目标，但必须落在今日剩余预算内。
        yesterday = MarketPlan.objects.filter(
            owner_id=row.owner_id, actor_id=row.actor_id,
            plan_date=row.plan_date - timedelta(days=1), status='active').first()
        if yesterday and yesterday.equipment_signature == row.equipment_signature:
            existing = {(goal.kind, goal.slot) for goal in row.goals.filter(kind='equipment')}
            room = max(Decimal(0), Decimal(context['available_budget']) - row.budget)
            carried = Decimal(0)
            for goal in yesterday.goals.filter(kind='equipment', status='open'):
                if ('equipment', goal.slot) in existing or goal.max_unit_price > room:
                    continue
                identity = stable_key('market-goal', plan.pk, 'equipment', goal.slot, 'carry', length=80)
                MarketGoal.objects.create(
                    pk=identity, owner_id=row.owner_id, actor_id=row.actor_id, plan=row,
                    kind='equipment', slot=goal.slot, min_stars=goal.min_stars,
                    quantity=1, max_unit_price=goal.max_unit_price, deadline=deadline,
                    status='open', reason='装备评价输入未变化，沿用昨日目标')
                room -= goal.max_unit_price
                carried += goal.max_unit_price
            if carried:
                row.budget += carried
                row.summary = (row.summary.rstrip('。') + f'；沿用昨日装备目标，预算增至{row.budget}。')[:1000]
                row.save(update_fields=['budget', 'summary', 'updated_at'])


def ensure_plan(owner: str, actor_id: str, now=None) -> MarketPlan | None:
    now = now or timezone.now()
    day = local_time(now).date()
    identity = plan_id(owner, actor_id, day)
    plan = MarketPlan.objects.filter(pk=identity).first()
    if plan and plan.status in ('active', 'failed', 'closed'):
        return plan
    if plan and plan.status == 'planning' and timezone.now() - plan.updated_at < timedelta(minutes=10):
        return plan
    plan, created = MarketPlan.objects.get_or_create(pk=identity, defaults={
        'owner_id': owner, 'actor_id': actor_id, 'plan_date': day, 'status': 'planning',
    })
    if not created:
        plan.status = 'planning'
        plan.save(update_fields=['status', 'updated_at'])
    agent = Agent.objects.filter(pk=actor_id, archived_at__isnull=True).first()
    if not agent:
        plan.status = 'closed'
        plan.save(update_fields=['status', 'updated_at'])
        return plan
    try:
        facts = _facts(owner, agent, now)
        goals, budget, summary, fallback = _decide(owner, agent, plan, facts)
        validation_context = {
            'available_budget': facts['available'],
            'tradable_skus': sorted({row['sku'] for row in facts['listings']}),
            'equipment': {'slots': list(SLOTS)},
        }
        result = validate_plan({'budget': str(budget), 'summary': summary, 'goals': goals},
                               validation_context, facts['shop_skus'])
        _apply(plan, result, {'available_budget': facts['available'],
                              'equipment_signature': facts['signature'],
                              'needs_signature': needs_signature(facts['needs']),
                              'fallback': fallback}, now)
        # 待复核策略重新入队，由标记 worker 补问。
        from .market_disposition_worker import enqueue_review
        enqueue_review(owner, actor_id)
    except Exception as exc:  # noqa: BLE001 - 日规划失败不能阻断生活日程
        logger.exception('每日市场规划失败 owner=%s actor=%s', owner, actor_id)
        plan.refresh_from_db()
        plan.status = 'failed'
        plan.summary = f'今日市场规划失败，沿用已有处置策略：{str(exc)[:300]}'
        plan.budget = Decimal('0')
        plan.spent = Decimal('0')
        plan.save(update_fields=['status', 'summary', 'budget', 'spent', 'updated_at'])
    return plan
