"""One allocation of existing stock for commitments, forge goals and retention targets."""
from collections import Counter
from copy import deepcopy


def allocate_protection(rows: list[dict], demands: list[dict], targets: dict,
                        retain_order: str = 'high') -> dict:
    """Frozen lots first, then commitments/goals, finally target top-ups per purpose."""
    pool = deepcopy(rows)
    committed, protected_by = Counter(), Counter()
    requested = Counter()

    def take(demand: dict, quantity: int) -> int:
        candidates = [r for r in pool if r['sku'] == demand['sku']
                      and (not demand.get('inventory_id') or r['id'] == demand['inventory_id'])]
        candidates.sort(key=lambda r: ((-1 if demand.get('order') == 'high' else 1) * r['stars'],
                                       r['created_at'], r['id']))
        remaining = quantity
        for row in candidates:
            used = min(remaining, row['free'])
            row['free'] -= used
            remaining -= used
        return quantity - remaining

    for demand in sorted(demands, key=lambda d: (not bool(d.get('inventory_id')), d.get('priority', 0))):
        purpose = demand['purpose']
        key = (demand['sku'], purpose)
        committed[key] += demand['quantity']
        requested[key] += demand['quantity']
        protected_by[key] += take(demand, demand['quantity'])
    for sku, strategy in targets.items():
        for purpose, quantity in strategy.items():
            key = (sku, purpose)
            extra = max(0, quantity - committed[key])
            requested[key] += extra
            protected_by[key] += take({'sku': sku, 'order': retain_order}, extra)
    summary = {}
    for sku in {r['sku'] for r in pool} | {d['sku'] for d in demands} | set(targets):
        quantities = [r for r in pool if r['sku'] == sku]
        uses = {purpose: {'target': targets.get(sku, {}).get(purpose, 0),
                          'committed': committed[(sku, purpose)],
                          'required': requested[(sku, purpose)],
                          'protected': protected_by[(sku, purpose)],
                          'missing': requested[(sku, purpose)] - protected_by[(sku, purpose)]}
                for purpose in ('alchemy', 'cooking', 'forge', 'self_use')
                if requested[(sku, purpose)] or purpose in targets.get(sku, {})}
        free = sum(r['free'] for r in quantities)
        total = sum(r['quantity'] for r in quantities)
        missing = sum(v['missing'] for v in uses.values())
        summary[sku] = {'total': total, 'protected': total - free, 'required': sum(v['required'] for v in uses.values()),
                        'missing': missing, 'disposable': 0 if missing else free, 'uses': uses,
                        'free_rows': {r['id']: (0 if missing else r['free']) for r in quantities}}
    return summary


def commitments(owner: str, actor_id: str) -> list[dict]:
    from system_settings.models import WorldAction
    from .life_models import LifeItem
    from .life_schedule import OPEN, execution_key
    from .alchemy_models import AlchemyOperation
    from .cooking_models import CookingOperation
    from .alchemy_schedule_plan import validate_plan as validate_alchemy
    from .cooking_schedule_plan import validate_plan as validate_cooking
    from .blacksmith_goals import requirements
    from .combat.reservation_resources import appointments
    from .combat.models import Exploration

    demands = []
    actions = list(WorldAction.objects.filter(actor_id=actor_id, status='claimed', snapshot__owner_id=owner)
                   .only('id', 'snapshot'))
    for purpose, model, validator in (('alchemy', AlchemyOperation, validate_alchemy),
                                      ('cooking', CookingOperation, validate_cooking)):
        running = {a.pk: a for a in actions if a.snapshot.get(purpose)}
        done = set(model.objects.filter(owner_id=owner, actor_id=actor_id,
                                        opportunity_id__in=running).values_list('pk', flat=True))
        for action in running.values():
            for index, entry in enumerate(action.snapshot.get('plan', [])):
                if f'{action.pk}:{index}' in done:
                    continue
                for material in entry['rule']['materials']:
                    demands.append({'sku': material['sku'], 'purpose': purpose,
                                    'inventory_id': material['inventory_id'], 'quantity': material['quantity']})
        items = LifeItem.objects.filter(owner_id=owner, actor_id=actor_id, activity=purpose,
                                         status__in=OPEN).order_by('scheduled_at', 'id')
        for item in items:
            key = execution_key(item)
            if key in running or not item.context.get(purpose + '_plan'):
                continue
            plan = validator(item.context[purpose + '_plan'])
            completed = Counter(model.objects.filter(owner_id=owner, actor_id=actor_id,
                                opportunity_id=key).values_list('recipe_id', flat=True))
            for entry in plan['entries']:
                remaining = max(0, entry['quantity'] - completed[entry['recipe_id']])
                for material in entry['rule']['ingredients']:
                    demands.append({'sku': material['sku'], 'purpose': purpose,
                                    'quantity': material['quantity'] * remaining,
                                    'order': 'high' if entry.get('ingredient_strategy') == 'high_stars_first' else 'low'})
    for action in actions:
        if not action.snapshot.get('blacksmith'):
            continue
        current = action.snapshot.get('current') or {}
        if action.snapshot.get('phase') == 'commit':
            materials = current.get('snapshot', {}).get('materials')
            if not isinstance(materials, list) or not materials:
                raise ValueError('打造冻结材料无效，暂停自动处置')
            for material in materials:
                demands.append({'sku': material['sku'], 'purpose': 'forge', 'inventory_id': material['inventory_id'],
                                'quantity': material['quantity']})
        elif not current.get('goal_id'):
            for material in (current.get('reservation') or {}).get('ingredients', []):
                demands.append({'sku': material['sku'], 'purpose': 'forge', 'priority': 1,
                                'quantity': material['quantity']})
    for sku, quantity in requirements(owner, actor_id).items():
        demands.append({'sku': sku, 'purpose': 'forge', 'quantity': quantity, 'priority': 1})
    for _, member in appointments(owner, actor_id):
        run = Exploration.objects.filter(pk=member['run_id'], status='preparing', phase='waiting_reservation').first()
        if not run:
            continue
        plan = run.snapshot.get('prepared_plan', {})
        for sku, quantity in plan.get('potions', {}).items():
            demands.append({'sku': 'combat.' + sku, 'purpose': 'self_use', 'quantity': quantity})
        food = plan.get('food') or {}
        if food.get('quantity'):
            demands.append({'sku': 'dish.' + food['recipe_id'], 'purpose': 'self_use', 'quantity': food['quantity']})
        for elixir in plan.get('elixirs', []):
            demands.append({'sku': 'elixir.' + elixir['recipe_id'], 'purpose': 'self_use', 'quantity': elixir['count']})
    if any(type(d['quantity']) is not int or d['quantity'] < 0 for d in demands):
        raise ValueError('库存预留数量无效')
    return demands


def read_context(owner: str, actor_id: str, *, inventory=None) -> dict:
    from .inventory_stock import inventory_items
    inventory = inventory_items(actor_id, owner) if inventory is None else inventory
    stock = [{'id': row.pk, 'sku': (row.source or {}).get('sku', ''), 'quantity': row.quantity,
              'free': row.quantity, 'stars': int((row.source or {}).get('stars') or 1),
              'created_at': row.created_at.isoformat()} for row in inventory]
    return {'stock': stock, 'demands': commitments(owner, actor_id)}


def projection(owner: str, actor_id: str, sku: str, strategy: dict | None = None, *, context=None) -> dict:
    context = read_context(owner, actor_id) if context is None else context
    stock = [r for r in context['stock'] if r['sku'] == sku]
    demands = [r for r in context['demands'] if r['sku'] == sku]
    targets = {sku: strategy['targets']} if strategy else {}
    result = allocate_protection(stock, demands, targets, (strategy or {}).get('retain_order', 'high'))
    return result.get(sku, {'total': 0, 'protected': 0, 'required': 0, 'missing': 0,
                           'disposable': 0, 'uses': {}, 'free_rows': {}})
