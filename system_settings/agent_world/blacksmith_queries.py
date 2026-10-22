"""Read-only recipe availability and paginated, complete forging activities."""
import copy
from collections import Counter, defaultdict
from decimal import Decimal

from django.db.models import Count
from system_settings.models import WorldAction
from .blacksmith_catalog import BANDS, QUALITY_PROBABILITIES, ENERGY_COST, MAX_PIECES, material_definitions, rules_for, validate_rule
from .blacksmith_candidates import planning_facts, read_catalog, template_options
from .blacksmith_models import BlacksmithOperation
from .inventory_stock import inventory_items


def overview(owner: str, agent=None) -> dict:
    facts = planning_facts(owner, agent) if agent else None
    profile = facts['profile'] if facts else None
    catalog = facts['catalog'] if facts else read_catalog()
    rules = facts['rules'] if facts else rules_for(owner)
    energy = facts['energy'] if facts else Decimal(0)
    definitions = material_definitions(catalog)
    available, owned = Counter(), Counter()
    for row in facts['pool'] if facts else []:
        available[row['sku']] += row['quantity']
    if agent:
        for row in inventory_items(agent.pk, owner):
            owned[row.source.get('sku', '')] += row.quantity
    counts = dict(BlacksmithOperation.objects.filter(owner_id=owner,
        **({'actor_id': agent.pk} if agent else {})).order_by().values('recipe_id').annotate(total=Count('pk'))
        .values_list('recipe_id', 'total'))
    recipes = []
    for identity, rule in rules.items():
        try:
            validate_rule(rule)
            valid_materials = True
        except ValueError:
            valid_materials = False
        types = template_options(catalog, profile, rule)
        ingredients = []
        for ingredient in rule['ingredients']:
            sku = ingredient['sku']
            ingredients.append({**ingredient, 'owned': owned[sku], 'available': available[sku],
                'reserved': max(0, owned[sku] - available[sku]), 'source': definitions.get(sku, {}).get('source', '')})
        possible = min((available[row['sku']] // row['quantity'] for row in ingredients), default=0)
        state, reason = ('unselected', '请先选择居民') if agent is None else (
            ('unavailable', '尚未建立冒险档案') if profile is None else
            ('unavailable', '配方材料来源已调整，请编辑配方后再制作') if not valid_materials else
            ('unavailable', '当前职业路线在本档没有可打造类型') if not types else
            ('missing', '可用材料不足') if possible < 1 else
            ('tired', '体力不足') if energy < rule['energy_cost'] else ('ready', ''))
        recipes.append({**copy.deepcopy(rule), 'ingredients': ingredients, 'types': types, 'state': state,
            'disabled_reason': reason, 'max_pieces': min(MAX_PIECES, possible, int(energy // rule['energy_cost']))
                if state == 'ready' else 0,
            'ingredient_value': str(sum((Decimal(str(row['price'])) * row['quantity'] for row in ingredients), Decimal(0))),
            'times_made': counts.get(identity, 0)})
    actor = None
    if agent:
        progression = profile.progression if profile else {'level': 1, 'job': 'job.novice'}
        actor = {'id': agent.pk, 'name': agent.name, 'initialized': profile is not None,
            'level': progression['level'], 'job_id': progression['job'],
            'job_name': catalog.row('professions', progression['job'])['name'], 'energy': str(energy)}
    return {'recipes': recipes, 'materials': [row for row in definitions.values()
        if any(source['rank'] != 'boss' for source in row['sources'])],
        'bands': copy.deepcopy(BANDS), 'quality_probabilities': copy.deepcopy(QUALITY_PROBABILITIES),
        'energy_cost': ENERGY_COST, 'max_pieces': MAX_PIECES, 'actor': actor}


def history(owner: str, actor_id: str, page: int = 1) -> dict:
    if type(page) is not int or not 1 <= page <= 100000:
        raise ValueError('页码须为 1 至 100000 的整数')
    rows = WorldAction.objects.filter(actor_id=actor_id, snapshot__blacksmith=True,
        snapshot__owner_id=owner).order_by('-created_at', '-id')
    activities = list(rows[(page - 1) * 20:page * 20])
    operations = defaultdict(list)
    for operation in BlacksmithOperation.objects.filter(owner_id=owner, actor_id=actor_id,
            opportunity_id__in=[row.pk for row in activities]).order_by('piece_index').values():
        operations[operation['opportunity_id']].append(operation)
    result = []
    for action in activities:
        stages = action.result.get('stages', action.snapshot.get('stages', action.snapshot.get('decisions', [])))
        pieces = operations[action.pk]
        result.append({'id': action.pk, 'actor_id': actor_id,
            'actor_name': pieces[0]['actor_name'] if pieces else action.snapshot.get('actor_name', ''),
            'status': action.status, 'created_at': action.created_at, 'updated_at': action.updated_at,
            'record_id': action.record_id, 'snapshot': action.snapshot, 'result': action.result,
            'stages': stages if isinstance(stages, list) else [], 'operations': pieces})
    return {'list': result, 'total': rows.count(), 'page': page, 'page_size': 20}
