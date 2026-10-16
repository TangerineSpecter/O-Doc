"""Recipe intentions and soft material reservations, without consuming real stock."""
import copy
import random
from collections import Counter
from decimal import Decimal
from .cooking_catalog import rules_for, skill_progress, validate_rule
from .cooking_materials import material_pool, allocate
from .cooking_quality import STRATEGIES
from .cooking_limits import MAX_RECIPES, MAX_PORTIONS


def requirements(entries: list[dict]) -> list[dict]:
    amounts = Counter()
    for entry in entries:
        for ingredient in entry['rule']['ingredients']:
            amounts[ingredient['sku']] += ingredient['quantity'] * entry['quantity']
    return [{'sku': sku, 'quantity': quantity} for sku, quantity in sorted(amounts.items())]


def validate_plan(plan: dict) -> dict:
    from rest_framework.exceptions import ValidationError
    try:
        if not isinstance(plan, dict) or type(plan.get('version')) is not int or plan['version'] != 1:
            raise ValueError()
        entries = plan['entries']
        if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_RECIPES:
            raise ValueError()
        seen = set()
        for row in entries:
            if (not isinstance(row['recipe_id'], str) or not row['recipe_id'] or row['recipe_id'] in seen
                    or type(row['quantity']) is not int or not 1 <= row['quantity'] <= MAX_PORTIONS
                    or row['ingredient_strategy'] not in STRATEGIES):
                raise ValueError()
            seen.add(row['recipe_id'])
            rule = row['rule']
            if not isinstance(rule['name'], str) or not rule['name']:
                raise ValueError()
            validate_rule({key: rule[key] for key in
                           ('ingredients', 'required_level', 'sale_price', 'experience', 'energy_cost')})
        if plan['materials'] != requirements(entries):
            raise ValueError()
    except (KeyError, TypeError, ValueError, ValidationError) as exc:
        raise ValueError('美食日程计划缺失或无效') from exc
    return plan


def available_pool(owner: str, actor_id: str, *, exclude_ids=()) -> list[dict]:
    """Deduct unexecuted portions of other open plans; no inventory writes."""
    from .life_models import LifeItem
    from .life_schedule import OPEN, execution_key
    from .cooking_models import CookingOperation
    pool = material_pool(actor_id, owner)
    items = LifeItem.objects.filter(owner_id=owner, actor_id=actor_id, activity='cooking',
                                    status__in=OPEN).exclude(pk__in=exclude_ids).order_by('scheduled_at', 'id')
    for item in items:
        plan = item.context.get('cooking_plan')
        if not plan:
            continue
        validate_plan(plan)
        done = Counter(CookingOperation.objects.filter(opportunity_id=execution_key(item)).values_list('recipe_id', flat=True))
        for entry in plan['entries']:
            count = max(0, entry['quantity'] - done[entry['recipe_id']])
            for ingredient in entry['rule']['ingredients']:
                needed = ingredient['quantity'] * count
                rows = [row for row in pool if row['sku'] == ingredient['sku']]
                rows.sort(key=lambda row: ((-1 if entry['ingredient_strategy'] == 'high_stars_first' else 1)
                                          * row['stars'], row['created_at'], row['inventory_id']))
                for row in rows:
                    used = min(needed, row['quantity'])
                    if used:
                        from .cooking_materials import split_lots
                        _, row['lots'] = split_lots(row['lots'], used)
                        row['quantity'] -= used
                        needed -= used
                # External sales can invalidate a plan. Reserve whatever remains;
                # execution will report the shortage, rather than inventing stock.
    return pool


def recipe_options(rules: dict, level: int, pool: list[dict], energy, *, excluded=()) -> dict:
    quantities = Counter()
    for row in pool:
        quantities[row['sku']] += row['quantity']
    result = {}
    for key, rule in rules.items():
        if key in excluded or level < rule['required_level']:
            continue
        maximum = min(MAX_PORTIONS, int(Decimal(energy) // rule['energy_cost']),
                      *(quantities[row['sku']] // row['quantity'] for row in rule['ingredients']))
        if maximum > 0:
            result[key] = {**copy.deepcopy(rule), 'id': key, 'max_portions': maximum}
    return result


def planning_facts(owner: str, agent, *, exclude_ids=()) -> dict:
    from .cooking_models import CookingSkill
    from .execution import stamina
    skill = CookingSkill.objects.filter(pk=agent.pk, owner_id=owner).first()
    from .life_models import LifeProfile
    profile = LifeProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
    return {'rules': rules_for(owner), 'level': skill_progress(skill.experience if skill else 0)['level'],
            'pool': available_pool(owner, agent.pk, exclude_ids=exclude_ids), 'energy': stamina(agent),
            'preferences': profile.preferences if profile else ''}


def strategy_previews(owner: str, recipe: dict, quantity: int, pool: list[dict], level: int) -> dict:
    from .cooking_plan import base_values_for
    from .cooking_quality import estimate
    base_values = base_values_for(owner)
    result = {}
    for strategy in STRATEGIES:
        simulated = copy.deepcopy(pool)
        previews = [estimate(recipe, level, allocate(simulated, recipe['ingredients'], strategy), base_values)
                    for _ in range(quantity)]
        cost = sum((Decimal(row['ingredient_value']) for row in previews), Decimal(0))
        revenue = sum((Decimal(row['expected_revenue']) for row in previews), Decimal(0))
        result[strategy] = {'ingredient_value': str(cost), 'expected_revenue': str(revenue),
                            'expected_processing_gain': str(revenue - cost),
                            'level_assumption': level}
    return result


def decide_plan(agent, owner: str, facts: dict, *, key: str, task=None, decide=None) -> dict:
    from .life_choices import choose
    select = decide or (lambda scene, state, choices: choose(agent, owner, scene, state, choices, task=task))
    pool, energy = copy.deepcopy(facts['pool']), Decimal(facts['energy'])
    entries = []
    for round_index in range(MAX_RECIPES):
        options = recipe_options(facts['rules'], facts['level'], pool, energy,
                                 excluded={entry['recipe_id'] for entry in entries})
        if not options:
            break
        state = {'selected': [{**{k: entry[k] for k in ('recipe_id', 'quantity', 'ingredient_strategy')},
                               'name': entry['rule']['name']}
                              for entry in entries], 'remaining_energy': str(energy),
                 'remaining_materials': dict(Counter({sku: sum(row['quantity'] for row in pool if row['sku'] == sku)
                                                      for sku in {row['sku'] for row in pool}})),
                 'level': facts['level'], 'preferences': facts.get('preferences', ''),
                 'task_preference': task.prompt if task else facts.get('task_preference', '')}
        if entries and select('cooking_continue', state, {'continue': '继续制作其他美食', 'finish': '结束本次制作计划'}) == 'finish':
            break
        keys = sorted(options)
        if len(keys) > 10:
            keys = random.Random(f'{key}:{round_index}').sample(keys, 10)
        recipe_id = select('cooking_recipe', state, {identity: options[identity] for identity in keys})
        if recipe_id not in keys:
            raise ValueError('食谱不在可制作候选中')
        recipe = options[recipe_id]
        state = {**state, 'recipe': recipe}
        quantities = {str(count): f'制作{count}份' for count in range(1, recipe['max_portions'] + 1)}
        quantity_key = select('cooking_quantity', state, quantities)
        if quantity_key not in quantities:
            raise ValueError('制作份数不在合法候选中')
        quantity = int(quantity_key)
        ingredients = [{**row, 'quantity': row['quantity'] * quantity} for row in recipe['ingredients']]
        allocations = {strategy: allocate(copy.deepcopy(pool), ingredients, strategy) for strategy in STRATEGIES}
        strategies = {'low_stars_first': '低星材料优先', 'high_stars_first': '高星材料优先'}
        if sorted(allocations['low_stars_first'], key=lambda row: row['inventory_id']) == sorted(
                allocations['high_stars_first'], key=lambda row: row['inventory_id']):
            strategy = 'low_stars_first'
        else:
            summaries = {strategy: [{key: row[key] for key in ('sku', 'stars', 'quantity')}
                                    for row in allocation] for strategy, allocation in allocations.items()}
            strategy = select('cooking_ingredient_strategy',
                              {**state, 'quantity': quantity, 'materials': summaries,
                               'estimates': strategy_previews(owner, recipe, quantity, pool, facts['level'])}, strategies)
        if strategy not in strategies:
            raise ValueError('美食用料策略无效')
        allocate(pool, ingredients, strategy)
        energy -= recipe['energy_cost'] * quantity
        rule = {key: copy.deepcopy(recipe[key]) for key in
                ('name', 'ingredients', 'required_level', 'sale_price', 'experience', 'energy_cost')}
        entries.append({'recipe_id': recipe_id, 'quantity': quantity,
                        'ingredient_strategy': strategy, 'rule': rule})
    if not entries:
        raise ValueError('当前没有可制作美食')
    return validate_plan({'version': 1, 'entries': entries, 'materials': requirements(entries)})


def ensure_materials(plan: dict, pool: list[dict]) -> None:
    for entry in validate_plan(plan)['entries']:
        allocate(pool, [{**row, 'quantity': row['quantity'] * entry['quantity']}
                        for row in entry['rule']['ingredients']], entry['ingredient_strategy'])
