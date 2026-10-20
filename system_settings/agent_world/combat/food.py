"""Food preparation and exact-star consumption, committed by departure's transaction."""
import copy
import json
import logging
import random
from decimal import Decimal

from .. import food_effects
from ..cooking_catalog import DEFAULT_RULES
from ..cooking_materials import split_lots
from ..inventory_stock import inventory_items

logger = logging.getLogger(__name__)

# Only settled outcomes describe how the previous trip actually went.
OUTCOMES = {'completed': '完成', 'recalled': '提前召回', 'fallen': '倒地',
            'exhausted': '资源不足', 'interrupted': '系统中断'}


def profession(run) -> str:
    from .models import CombatProfile
    from .store import current
    profile = CombatProfile.objects.filter(pk=run.actor_id, owner_id=run.owner_id).first()
    job = ((profile.progression or {}).get('job') if profile else '') or 'job.novice'
    try:
        return current(run.catalog_id).row('professions', job)['name']
    except ValueError:
        return job


def last_exploration(run) -> dict | None:
    """The previous settled trip, so a repeated choice can learn from its outcome."""
    from .models import Exploration
    row = (Exploration.objects.filter(owner_id=run.owner_id, actor_id=run.actor_id, status__in=tuple(OUTCOMES))
                               .exclude(pk=run.pk).order_by('-created_at', '-pk').first())
    if row is None:
        return None
    return {'used_food': bool((row.result or {}).get('food')), 'outcome': OUTCOMES[row.status]}


def decision_state(run, duration: int) -> dict:
    """The job and the previous trip are what tell the model whether food is worth its portions."""
    return {'profession': profession(run), 'last_exploration': last_exploration(run),
            'required_quantity': food_effects.portions(duration)}


def candidates(actor_id: str, owner: str, duration: int) -> dict[str, dict]:
    required = food_effects.portions(duration)
    counts = {}
    for item in inventory_items(actor_id, owner).filter(source__sku__startswith='dish.'):
        recipe_id = item.source['sku'][5:]
        stars = item.source.get('stars', 1)
        if recipe_id not in food_effects.BASE_EFFECTS or type(stars) is not int or not 1 <= stars <= 5:
            continue
        key = (recipe_id, stars)
        counts[key] = counts.get(key, 0) + item.quantity
    return {f'{recipe_id}:{stars}': {'recipe_id': recipe_id, 'name': DEFAULT_RULES[recipe_id]['name'],
             'stars': stars, 'owned': owned, 'quantity': required,
             'summary': food_effects.describe(food_effects.effects_for(recipe_id, stars))}
            for (recipe_id, stars), owned in sorted(counts.items()) if owned >= required}


def choose(run, agent, duration: int, *, structured: bool, planner=None, check=None) -> tuple[dict | None, dict]:
    from utils.ai_observer import check_ai_control
    options = candidates(agent.pk, run.owner_id, duration)
    choices = {'none': '不消耗', **{key: f"{row['stars']}星{row['name']}｜库存{row['owned']}份｜消耗{row['quantity']}份｜{row['summary']}"
                                   for key, row in options.items()}}
    state = decision_state(run, duration)
    instructions = '结合本人职业与上次探索结果，从本人背包候选中选择一种美食，或选择不消耗；所选美食覆盖本次冒险，不同星级不能混用。只返回候选标识。'
    if check:
        check()
    check_ai_control()
    record = {'choice': 'none', 'source': 'single_candidate', 'confidence': 1.0}
    if options:
        if structured:
            from .preparation_decision import _choice
            selected, record = _choice(run, agent, 'food', state, choices, 'none', instructions, check=check)
        else:
            from utils.token_usage import usage_scope
            try:
                with usage_scope(agent=agent, purpose='exploration_food'):
                    prompt = instructions + ' 返回JSON: {choice:候选标识}。'
                    context = {**state, 'choices': choices}
                    if planner:
                        result = planner(agent, prompt, context)
                    else:
                        from system_settings.decision.routing import complete_json
                        # This small choice needs neither role expansion nor memory retrieval.
                        def validate(value):
                            if value.get('choice') not in choices:
                                raise ValueError('美食候选标识无效')
                            return value
                        result = complete_json(agent, prompt + '\n' + json.dumps(context, ensure_ascii=False),
                                               validate, decision=True, owner=run.owner_id,
                                               scene='迷宫探索美食', check=check)
                selected = result.get('choice') if isinstance(result, dict) else None
                record = {'choice': selected, 'source': 'text_model'}
            except Exception as exc:
                logger.warning('Food decision failed for exploration %s (%s); using code fallback', run.pk, type(exc).__name__)
                selected = 'none'
                record = {'choice': 'none', 'source': 'code_fallback'}
        if not isinstance(selected, str) or selected not in choices:
            selected, record = 'none', {'choice': 'none', 'source': 'code_fallback'}
        if record.get('source') == 'code_fallback':
            # Stable per exploration: a preparation retry must not reroll its food.
            selected = random.Random(f'{run.pk}:food-fallback').choice(sorted(options))
            record = {**record, 'choice': selected}
    else:
        selected = 'none'
    if check:
        check()
    check_ai_control()
    row = options.get(selected)
    return ({key: row[key] for key in ('recipe_id', 'stars', 'quantity')} if row else None, record)


def summary(selection: dict | None) -> str:
    if not selection:
        return '不消耗'
    return food_effects.describe(food_effects.effects_for(selection['recipe_id'], selection['stars']))


def consume(run, selection: dict | None, duration: int) -> tuple[dict | None, str]:
    selection = food_effects.validate_selection(selection, duration)
    if selection is None:
        return None, ''
    sku = 'dish.' + selection['recipe_id']
    rows = [row for row in inventory_items(run.actor_id, run.owner_id).filter(source__sku=sku).select_for_update()
            if type(row.source.get('stars', 1)) is int and row.source.get('stars', 1) == selection['stars']]
    if sum(row.quantity for row in rows) < selection['quantity']:
        return None, '出发时所选美食同星库存不足，本次不消耗美食。'
    remaining, allocations = selection['quantity'], []
    for row in rows:
        used = min(remaining, row.quantity)
        if not used:
            continue
        lots = copy.deepcopy(row.source.get('lots') or [{'quantity': row.quantity, 'price': str(row.value)}])
        if (any(type(lot['quantity']) is not int or lot['quantity'] < 1 or
                not Decimal(str(lot['price'])).is_finite() or Decimal(str(lot['price'])) < 0 for lot in lots) or
                sum(lot['quantity'] for lot in lots) != row.quantity):
            raise ValueError('美食库存批次不一致')
        taken, kept = split_lots(lots, used)
        allocations.append({'inventory_id': row.pk, 'actor_id': row.actor_id, 'owner_id': row.owner_id,
                            'sku': sku, 'stars': selection['stars'], 'quantity': used, 'lots': taken})
        row.quantity -= used
        if row.quantity:
            row.source = {**row.source, 'lots': kept}
            row.value = Decimal(kept[0]['price'])
            row.save(update_fields=['quantity', 'source', 'value'])
        else:
            row.delete()
        remaining -= used
    effects = food_effects.effects_for(selection['recipe_id'], selection['stars'])
    return {**selection, 'version': food_effects.VERSION, 'name': DEFAULT_RULES[selection['recipe_id']]['name'],
            'effects': effects, 'summary': food_effects.describe(effects), 'consumed': allocations}, ''


def combat_stats(profile, catalog, snapshot: dict) -> dict:
    from .attributes import attributes
    from .profiles import wearing
    return attributes(catalog, profile.progression, wearing(profile),
                      food_effects=(snapshot.get('food') or {}).get('effects'))
