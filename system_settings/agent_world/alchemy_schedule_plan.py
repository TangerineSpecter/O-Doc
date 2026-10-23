"""Finite alchemy decisions and soft reservations; planning never consumes inventory."""
import copy
from collections import Counter
from decimal import Decimal

from .alchemy_catalog import DEFAULT_RULES, MATERIALS, rules_for, validate_rule, skill_progress
from .alchemy_limits import MAX_RECIPES, MAX_BOTTLES
from .alchemy_materials import material_pool, allocate


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
        for entry in entries:
            recipe_id, quantity, rule = entry['recipe_id'], entry['quantity'], entry['rule']
            if (recipe_id not in DEFAULT_RULES or recipe_id in seen or type(quantity) is not int
                    or not 1 <= quantity <= MAX_BOTTLES or rule['name'] != DEFAULT_RULES[recipe_id]['name']):
                raise ValueError()
            seen.add(recipe_id)
            validate_rule({key: rule[key] for key in
                           ('ingredients', 'required_level', 'sale_price', 'experience', 'energy_cost')})
        if plan['materials'] != requirements(entries):
            raise ValueError()
    except (KeyError, TypeError, ValueError, ValidationError) as exc:
        raise ValueError('炼金日程计划缺失或无效') from exc
    return plan


def available_pool(owner: str, actor_id: str, *, exclude_ids=(), protect_goals: bool = True) -> list[dict]:
    from .crafting_materials import available_pool as shared_pool
    return shared_pool(owner, actor_id, exclude_ids=exclude_ids, protect_goals=protect_goals)


def recipe_options(rules: dict, level: int, pool: list[dict], energy, *, excluded=()) -> dict:
    quantities = Counter()
    for row in pool:
        quantities[row['sku']] += row['quantity']
    result = {}
    for key, rule in rules.items():
        if key in excluded or level < rule['required_level']:
            continue
        maximum = min(MAX_BOTTLES, int(Decimal(energy) // rule['energy_cost']),
                      *(quantities[row['sku']] // row['quantity'] for row in rule['ingredients']))
        if maximum > 0:
            result[key] = {**copy.deepcopy(rule), 'id': key, 'max_bottles': maximum}
    return result


def planning_facts(owner: str, agent, *, exclude_ids=()) -> dict:
    from .alchemy_models import AlchemySkill
    from .alchemy_queries import validate_actor
    from .execution import stamina
    from .inventory_stock import inventory_items
    from .life_models import LifeProfile
    validate_actor(owner, agent.pk)
    skill = AlchemySkill.objects.filter(pk=agent.pk, owner_id=owner).first()
    profile = LifeProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
    owned = Counter()
    for item in inventory_items(agent.pk, owner).filter(source__sku__startswith='elixir.'):
        owned[item.source['sku'][7:]] += item.quantity
    return {'rules': rules_for(owner), 'level': skill_progress(skill.experience if skill else 0)['level'],
            'pool': available_pool(owner, agent.pk, exclude_ids=exclude_ids), 'energy': stamina(agent),
            'preferences': profile.preferences if profile else '', 'owned_bottles': dict(owned)}


def decide_plan(agent, owner: str, facts: dict, *, task=None, decide=None) -> dict:
    from .life_choices import choose
    from .elixir_effects import describe, effects_for
    select = decide or (lambda scene, state, choices: choose(agent, owner, scene, state, choices, task=task))
    pool, energy = copy.deepcopy(facts['pool']), Decimal(facts['energy'])
    entries = []
    for _ in range(MAX_RECIPES):
        options = recipe_options(facts['rules'], facts['level'], pool, energy,
                                 excluded={entry['recipe_id'] for entry in entries})
        if not options:
            break
        state = {'selected': [{'recipe_id': entry['recipe_id'], 'name': entry['rule']['name'],
                              'quantity': entry['quantity']} for entry in entries],
                 'remaining_energy': str(energy), 'level': facts['level'],
                 'preferences': facts.get('preferences', ''),
                 'task_preference': task.prompt if task else facts.get('task_preference', '')}
        if entries and select('alchemy_continue', state, {'continue': '继续制作其他药水', 'finish': '结束制作计划'}) == 'finish':
            break
        quantities = Counter()
        for row in pool:
            quantities[row['sku']] += row['quantity']
        choices = {key: {'name': row['name'], 'max_bottles': row['max_bottles'],
                        'energy_per_bottle': row['energy_cost'], 'experience_per_bottle': row['experience'],
                        'one_star_sale_price': row['sale_price'],
                        'one_star_effect': describe(effects_for(key, 1)),
                        'owned_bottles': facts.get('owned_bottles', {}).get(key, 0),
                        'ingredients': [{'name': MATERIALS[i['sku']][0], 'quantity': i['quantity'],
                                         'available': quantities[i['sku']]} for i in row['ingredients']]}
                   for key, row in options.items()}
        recipe_id = select('alchemy_recipe', state, choices)
        if recipe_id not in options:
            raise ValueError('炼金配方不在合法候选中')
        row = options[recipe_id]
        counts = {str(count): f'制作{count}瓶' for count in range(1, row['max_bottles'] + 1)}
        quantity_key = select('alchemy_quantity', {**state, 'recipe': choices[recipe_id]}, counts)
        if quantity_key not in counts:
            raise ValueError('炼金瓶数不在合法候选中')
        quantity = int(quantity_key)
        allocate(pool, [{**i, 'quantity': i['quantity'] * quantity} for i in row['ingredients']])
        energy -= row['energy_cost'] * quantity
        rule = {key: copy.deepcopy(row[key]) for key in
                ('name', 'ingredients', 'required_level', 'sale_price', 'experience', 'energy_cost')}
        entries.append({'recipe_id': recipe_id, 'quantity': quantity, 'rule': rule})
    if not entries:
        raise ValueError('当前没有可制作炼金药水')
    return validate_plan({'version': 1, 'entries': entries, 'materials': requirements(entries)})


def ensure_materials(plan: dict, pool: list[dict]) -> None:
    for entry in validate_plan(plan)['entries']:
        allocate(pool, [{**i, 'quantity': i['quantity'] * entry['quantity']}
                        for i in entry['rule']['ingredients']])
