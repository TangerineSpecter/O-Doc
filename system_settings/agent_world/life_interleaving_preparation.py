"""Revalidate the remaining window without redrawing the selected activity."""
from .life_models import LifeItem
from .life_activities import is_interleaved
from .life_interleaving_candidates import legal_durations
from .life_interleaving_choices import checkpoint_choice


def resize_exploration(run, agent, plan):
    item = LifeItem.objects.filter(pk=run.life_item_id).first()
    if not item or not is_interleaved(item):
        return plan
    legal = legal_durations(item, (1800, 3600, 7200), seconds=True)
    duration = plan['duration_seconds']
    if duration in legal:
        return plan
    # Only shorter remaining choices; at most two reductions over the lifetime.
    choices = {str(n): f'{n // 60}分钟' for n in legal if n < duration}
    if not choices:
        raise ValueError('准备后没有合法探索时长，本次准备结束')
    chosen = int(checkpoint_choice(item, agent, f'duration_resize:{duration}', 'combat_preparation',
                                  {'remaining_durations_seconds': list(map(int, choices))}, choices))
    plan = {**plan, 'duration_seconds': chosen}
    if plan.get('food'):
        from .food_effects import portions
        plan['food'] = {**plan['food'], 'quantity': portions(chosen)}
    from .combat.models import Exploration
    from .farm_gate import farm_gate
    from django.db import transaction
    with farm_gate(), transaction.atomic():
        locked = Exploration.objects.select_for_update().get(pk=run.pk)
        locked.snapshot['prepared_plan'] = plan
        locked.save()
    return plan


def fit_supply_energy(run, agent, plan):
    """Optional shopping must leave the full departure requirement affordable."""
    item = LifeItem.objects.filter(pk=run.life_item_id).first()
    if not item or not is_interleaved(item) or not plan.get('purchases'):
        return plan
    from .life_commitments import capacity
    from .combat.explorations import energy
    from .market_sessions import COST
    if capacity(item.owner_id, agent, exclude_item=item.pk)['energy'] >= energy(plan['duration_seconds']) + COST:
        return plan
    from .inventory_stock import stock_quantity
    potions = {sku: min(count, stock_quantity(agent.pk, item.owner_id, 'combat.' + sku))
               for sku, count in plan.get('potions', {}).items()}
    return {**plan, 'purchases': {}, 'potions': {sku: count for sku, count in potions.items() if count},
            'reason': '系统说明：市场入场体力会影响探索与后续日程，仅携带现有补给。'}
