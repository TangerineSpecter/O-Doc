"""小时鱼饵补购：有限两题在事务外，目标和预算在资产锁内复核提交。"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum, F

from system_settings.models import Agent
from .farm_gate import guarded
from .fishing.market import needs
from .market_plan_candidates import bait_exact_quantities, bait_quantity_ranges, money
from .market_plan_models import MarketGoal, MarketPlan, stable_key
from .market_shop import current_batch


def _committed(plan: MarketPlan) -> Decimal:
    return plan.goals.filter(status='open').aggregate(
        total=Sum(F('max_unit_price') * (F('quantity') - F('filled_quantity')))
    )['total'] or Decimal(0)


def refresh_bait_needs(owner: str, agent, plan: MarketPlan, now) -> int:
    from .market_planning import _ask, _available_budget, _need_state

    batch = current_batch(owner, now)
    rows = needs(owner, agent, batch.supplies)
    if not rows:
        return 0
    row = rows[0]
    identity = stable_key('market-goal', plan.pk, 'hourly-bait', batch.pk, row['sku'])
    if MarketGoal.objects.filter(pk=identity).exists() or plan.goals.filter(
            kind='shop', sku=row['sku'], status='open').exists():
        return 0
    available = max(Decimal(0), _available_budget(owner, agent) - _committed(plan))
    if available < money(row['unit_price']):
        return 0
    ranges, bounds = bait_quantity_ranges(row['owned'], row['unit_price'], available)
    state = _need_state(row, str(available))
    prefix = f'hourly-bait:{batch.pk}:{row["sku"]}'
    selected, left = _ask(owner, agent, plan, prefix + ':range', state, ranges,
        '选择本小时补购鱼饵的数量区间；0表示不买，单种库存最多99份。', 2)
    if selected not in bounds:
        return 0
    lower, upper = bounds[selected]
    exact = bait_exact_quantities(lower, upper, row['unit_price'], row['missing'])
    count, _ = _ask(owner, agent, plan, prefix + ':quantity:' + selected,
        {**state, 'selected_range': ranges[selected]}, exact,
        '在已选区间决定准确份数；0表示不买，12份仅是缺口参考。', left)
    if count not in exact or int(count) <= 0:
        return 0
    return _commit(owner, agent.pk, plan.pk, batch.pk, identity, row['sku'], int(count), now)


@guarded
@transaction.atomic
def _commit(owner: str, actor: str, plan_id: str, batch_id: str, identity: str,
            sku: str, count: int, now) -> int:
    from .market_planning import _available_budget, _end_of_day

    agent = Agent.objects.select_for_update().get(pk=actor, archived_at__isnull=True)
    plan = MarketPlan.objects.select_for_update().get(pk=plan_id, owner_id=owner, actor_id=actor)
    if plan.status != 'active' or MarketGoal.objects.filter(pk=identity).exists():
        return 0
    if plan.goals.filter(kind='shop', sku=sku, status='open').exists():
        return 0
    batch = current_batch(owner, now)
    if batch.pk != batch_id:
        return 0
    row = next((r for r in needs(owner, agent, batch.supplies) if r['sku'] == sku), None)
    if not row:
        return 0
    committed = _committed(plan)
    available = _available_budget(owner, agent)
    price = money(row['unit_price'])
    # 选择期间资源变化只缩减采购，不能突破原选择、余额或同种库存上限。
    from .fishing.constants import MAX_BAIT_STOCK
    count = min(count, MAX_BAIT_STOCK - row['owned'],
                int(max(Decimal(0), available - committed) // price))
    if count <= 0:
        return 0
    MarketGoal.objects.create(pk=identity, owner_id=owner, actor_id=actor, plan=plan,
        kind='shop', sku=sku, quantity=count, max_unit_price=price,
        deadline=_end_of_day(now), reason='小时鱼饵补购：' + row['effect'])
    plan.budget = max(plan.budget, plan.spent + committed + price * count)
    plan.version += 1
    plan.save(update_fields=['budget', 'version', 'updated_at'])
    return 1
