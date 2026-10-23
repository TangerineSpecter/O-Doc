"""Durable forge intentions and live material progress."""
import hashlib
from collections import Counter
from collections.abc import Iterable

from django.db import transaction

from .blacksmith_catalog import rules_for, validate_rule
from .blacksmith_models import BlacksmithGoal
from .blacksmith_candidates import read_catalog, template_options

MAX_GOALS = 3


def eligible(owner: str, actor_id: str, *, recipe_ids: Iterable[str] | None = None) -> dict:
    from .combat.models import CombatProfile
    profile = CombatProfile.objects.filter(pk=actor_id, owner_id=owner).first()
    if not profile:
        return {}
    catalog = read_catalog(profile)
    result = {}
    rules = rules_for(owner)
    identities = rules if recipe_ids is None else dict.fromkeys(recipe_ids)
    for identity in identities:
        rule = rules.get(identity)
        if rule is None:
            continue
        try:
            validate_rule(rule)
        except ValueError:
            continue
        types = template_options(catalog, profile, rule)
        if types:
            result[identity] = {'rule': rule, 'types': types}
    return result


def _active_rows(owner: str, actor_id: str) -> list[BlacksmithGoal]:
    return list(BlacksmithGoal.objects.filter(owner_id=owner, actor_id=actor_id, status='active')
                .order_by('created_at', 'id'))


def _valid_goals(owner: str, actor_id: str, rows: list[BlacksmithGoal], choices: dict,
                 *, invalidate: bool = False) -> list[BlacksmithGoal]:
    result = []
    for goal in rows:
        option = choices.get(goal.recipe_id)
        if not option or goal.template_id not in {row['template_id'] for row in option['types']}:
            if invalidate:
                goal.status = 'invalid'
                goal.save(update_fields=['status', 'updated_at'])
                from .market_disposition import enqueue
                rule = rules_for(owner).get(goal.recipe_id, {})
                for ingredient in rule.get('ingredients', []):
                    enqueue(owner, actor_id, ingredient['sku'], 0, source='blacksmith',
                            operation=f'goal-invalid:{goal.pk}:{ingredient["sku"]}')
            continue
        result.append(goal)
    return result


def active(owner: str, actor_id: str, *, invalidate: bool = False,
           choices: dict | None = None) -> list[BlacksmithGoal]:
    rows = _active_rows(owner, actor_id)
    if not rows:
        return []
    if choices is None:
        choices = eligible(owner, actor_id, recipe_ids=(goal.recipe_id for goal in rows))
    return _valid_goals(owner, actor_id, rows, choices, invalidate=invalidate)


def requirements(owner: str, actor_id: str) -> Counter:
    needed = Counter()
    rows = _active_rows(owner, actor_id)
    if not rows:
        return needed
    # This path runs per SKU during market disposal. Only live goal recipes
    # need validation; retain one set of rules for validation and quantities.
    choices = eligible(owner, actor_id, recipe_ids=(goal.recipe_id for goal in rows))
    goals = _valid_goals(owner, actor_id, rows, choices)
    if not goals:
        return needed
    from system_settings.models import WorldAction
    committing = {action.snapshot.get('current', {}).get('goal_id') for action in
                  WorldAction.objects.filter(actor_id=actor_id, status='claimed',
                      snapshot__blacksmith=True, snapshot__owner_id=owner,
                      snapshot__version=2, snapshot__phase='commit').only('snapshot')}
    for goal in goals:
        if goal.pk in committing:
            continue  # The frozen single-piece reservation already owns these lots.
        needed.update({row['sku']: row['quantity']
                       for row in choices[goal.recipe_id]['rule']['ingredients']})
    return needed


def summary(owner: str, actor_id: str) -> dict:
    from .crafting_materials import available_pool
    from .blacksmith_catalog import material_definitions
    choices = eligible(owner, actor_id)
    all_goals = active(owner, actor_id, choices=choices)
    stock = Counter()
    for row in available_pool(owner, actor_id):
        stock[row['sku']] += row['quantity']
    names = material_definitions()
    entries = []
    for goal in all_goals:
        rule = choices[goal.recipe_id]['rule']
        kind = next(row for row in choices[goal.recipe_id]['types'] if row['template_id'] == goal.template_id)
        ingredients = [{'sku': row['sku'], 'name': names.get(row['sku'], {}).get('name', row['sku']),
                        'required': row['quantity'], 'available': stock[row['sku']],
                        'missing': max(0, row['quantity'] - stock[row['sku']])}
                       for row in rule['ingredients']]
        entries.append({'id': goal.pk, 'recipe_id': goal.recipe_id, 'template_id': goal.template_id,
                        'band_id': rule['band_id'], 'band_label': rule['band_label'],
                        'slot': rule['slot'], 'slot_name': rule['slot_name'],
                        'type_name': kind['name'], 'ingredients': ingredients,
                        'ready': all(row['missing'] == 0 for row in ingredients)})
    valid_ids = {goal.pk for goal in all_goals}
    invalid = []
    for goal in BlacksmithGoal.objects.filter(owner_id=owner, actor_id=actor_id,
            status__in=('active', 'invalid')).order_by('-updated_at', '-id'):
        if goal.status == 'invalid' or goal.pk not in valid_ids:
            invalid.append({'id': goal.pk, 'recipe_id': goal.recipe_id,
                            'template_id': goal.template_id,
                            'reason': '配方或当前职业路线已不再允许该装备，目标已失效且不占位置'})
            if len(invalid) == 3:
                break
    return {'goals': entries, 'invalid_goals': invalid, 'free_slots': MAX_GOALS - len(entries),
            'ready_count': sum(row['ready'] for row in entries),
            'can_register': bool(choices) and len(entries) < MAX_GOALS}


@transaction.atomic
def register(owner: str, actor_id: str, recipe_id: str, template_id: str, identity: str) -> BlacksmithGoal:
    from system_settings.models import Agent
    Agent.objects.select_for_update().get(pk=actor_id)
    key = hashlib.sha256(f'blacksmith-goal:{owner}:{actor_id}:{identity}'.encode()).hexdigest()
    existing = BlacksmithGoal.objects.filter(pk=key).first()
    if existing:
        if (existing.owner_id, existing.actor_id, existing.recipe_id, existing.template_id) != (
                owner, actor_id, recipe_id, template_id):
            raise ValueError('打造目标请求键已用于其他目标')
        return existing
    choices = eligible(owner, actor_id)
    current = active(owner, actor_id, invalidate=True, choices=choices)
    if len(current) >= MAX_GOALS:
        raise ValueError('最多同时登记三个打造目标')
    option = choices.get(recipe_id)
    if not option or template_id not in {row['template_id'] for row in option['types']}:
        raise ValueError('目标配方或装备类型已不属于当前职业路线')
    goal, created = BlacksmithGoal.objects.get_or_create(pk=key, defaults={
        'owner_id': owner, 'actor_id': actor_id, 'recipe_id': recipe_id, 'template_id': template_id})
    if not created and (goal.owner_id, goal.actor_id, goal.recipe_id, goal.template_id) != (
            owner, actor_id, recipe_id, template_id):
        raise ValueError('打造目标请求键已用于其他目标')
    return goal
