"""Shared maze-material availability for alchemy, forging and market disposition."""
from collections import Counter, defaultdict

from .alchemy_materials import material_pool


def _requirements(owner: str, actor_id: str, exclude_ids=(), exclude_action_id=None) -> tuple[Counter, Counter]:
    from django.db.models import Count
    from system_settings.models import WorldAction
    from .life_models import LifeItem
    from .life_schedule import OPEN, execution_key
    from .alchemy_models import AlchemyOperation
    from .alchemy_schedule_plan import validate_plan

    reserved = Counter()
    frozen = Counter()
    plans = []
    items = LifeItem.objects.filter(owner_id=owner, actor_id=actor_id, activity='alchemy',
        status__in=OPEN).exclude(pk__in=exclude_ids).only('id', 'context').order_by('scheduled_at', 'id')
    for item in items:
        plan = item.context.get('alchemy_plan')
        if not plan:
            continue
        try:
            validate_plan(plan)
        except ValueError as exc:
            raise ValueError(f'炼金日程 {item.pk} 的预留计划无效，请取消或重新规划该日程') from exc
        plans.append((execution_key(item), plan))
    completed = defaultdict(Counter)
    if plans:
        for row in AlchemyOperation.objects.filter(opportunity_id__in=[key for key, _ in plans]).order_by().values(
                'opportunity_id', 'recipe_id').annotate(total=Count('pk')):
            completed[row['opportunity_id']][row['recipe_id']] = row['total']
    for key, plan in plans:
        for entry in plan['entries']:
            remaining = max(0, entry['quantity'] - completed[key][entry['recipe_id']])
            for ingredient in entry['rule']['ingredients']:
                reserved[ingredient['sku']] += ingredient['quantity'] * remaining

    excluded_actions = {exclude_action_id} if exclude_action_id else set()
    if exclude_ids:
        excluded_actions.update(execution_key(item) for item in LifeItem.objects.filter(pk__in=exclude_ids))
    actions = WorldAction.objects.filter(actor_id=actor_id, status='claimed', snapshot__blacksmith=True,
        snapshot__owner_id=owner).exclude(pk__in=excluded_actions).only('id', 'snapshot')
    for action in actions:
        current = action.snapshot.get('current') or {}
        reservation = current.get('reservation')
        if not reservation:
            continue
        ingredients = reservation.get('ingredients') if isinstance(reservation, dict) else None
        if not isinstance(ingredients, list) or not ingredients:
            raise ValueError(f'打造活动 {action.pk} 的材料预留无效')
        amounts = Counter()
        for row in ingredients:
            if (not isinstance(row, dict) or not isinstance(row.get('sku'), str)
                    or not row['sku'].startswith('combat.material.')
                    or type(row.get('quantity')) is not int or row['quantity'] < 1):
                raise ValueError(f'打造活动 {action.pk} 的材料预留无效')
            amounts[row['sku']] += row['quantity']
        if action.snapshot.get('phase') == 'commit':
            materials = current.get('snapshot', {}).get('materials')
            allocated = Counter()
            if not isinstance(materials, list) or not materials:
                raise ValueError(f'打造活动 {action.pk} 的冻结材料预留无效')
            for row in materials:
                if (not isinstance(row, dict) or not isinstance(row.get('inventory_id'), str)
                        or not row['inventory_id'] or not isinstance(row.get('sku'), str)
                        or type(row.get('quantity')) is not int or row['quantity'] < 1):
                    raise ValueError(f'打造活动 {action.pk} 的冻结材料预留无效')
                allocated[row['sku']] += row['quantity']
                frozen[(row['inventory_id'], row['sku'])] += row['quantity']
            if allocated != amounts:
                raise ValueError(f'打造活动 {action.pk} 的冻结材料与配方不一致')
        else:
            reserved.update(amounts)
    return reserved, frozen


def available_pool(owner: str, actor_id: str, *, exclude_ids=(), exclude_action_id=None,
                   protect_goals: bool = False) -> list[dict]:
    """Only the current uncommitted forge piece is reserved, never hypothetical pieces."""
    pool = material_pool(actor_id, owner)
    reserved, frozen = _requirements(owner, actor_id, exclude_ids, exclude_action_id)
    # A confirmed piece owns specific FIFO rows even when an earlier soft plan is cancelled.
    for row in pool:
        row['quantity'] = max(0, row['quantity'] - frozen[(row['inventory_id'], row['sku'])])
    for row in sorted(pool, key=lambda value: (value['created_at'], value['inventory_id'])):
        used = min(row['quantity'], reserved[row['sku']])
        row['quantity'] -= used
        reserved[row['sku']] -= used
    if protect_goals:
        from .blacksmith_goals import requirements
        goals = requirements(owner, actor_id)
        for row in sorted(pool, key=lambda value: (value['created_at'], value['inventory_id'])):
            used = min(row['quantity'], goals[row['sku']])
            row['quantity'] -= used
            goals[row['sku']] -= used
    return pool
