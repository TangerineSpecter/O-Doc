"""只读炼金图鉴与熟练度上下文，不在 GET 中建立成长或目录数据。"""
import copy
from decimal import Decimal
from django.db.models import Sum, Count
from system_settings.models import Agent
from .alchemy_models import AlchemySkill, AlchemyOperation, AlchemyCatalog
from .alchemy_catalog import rules_for, MATERIALS, DUNGEONS, DESCRIPTION, source_for
from .inventory_stock import inventory_items
from .alchemy_limits import MAX_BOTTLES
from .alchemy_quality import estimate, skill_progress
from .alchemy_plan import tiers_for, base_values_for
from .alchemy_materials import material_pool, allocate
from .elixir_effects import previews as elixir_previews
from .execution import stamina


def validate_actor(owner: str, actor_id: str) -> None:
    from .investment_service import validate_agents
    from .life_config import owns_actor
    if not owns_actor(owner, actor_id):
        raise ValueError('居民炼金属于其他账号')
    validate_agents(owner, [actor_id])


def overview(owner: str, actor_id: str) -> dict:
    validate_actor(owner, actor_id)
    skill = AlchemySkill.objects.filter(pk=actor_id, owner_id=owner).first()
    made = AlchemyOperation.objects.filter(owner_id=owner, actor_id=actor_id).count()
    return {'actor_id': actor_id, **skill_progress(skill.experience if skill else 0), 'bottles_made': made}


def minimum_start_energy(owner: str, agent: Agent) -> int:
    """旧日程启动门槛只看等级和材料，不生成图鉴、图标或品质预览。"""
    validate_actor(owner, agent.pk)
    experience = AlchemySkill.objects.filter(pk=agent.pk, owner_id=owner).values_list('experience', flat=True).first()
    level = skill_progress(experience or 0)['level']
    quantities = dict(inventory_items(agent.pk, owner).order_by().filter(
        source__sku__startswith='combat.material.').values('source__sku').annotate(total=Sum('quantity'))
        .values_list('source__sku', 'total'))
    return min((rule['energy_cost'] for rule in rules_for(owner).values()
                if level >= rule['required_level'] and all(
                    quantities.get(row['sku'], 0) >= row['quantity'] for row in rule['ingredients'])), default=1)


def recipes(owner: str, agent: Agent | None = None) -> list[dict]:
    progress = overview(owner, agent.pk) if agent else skill_progress(0)
    energy = stamina(agent) if agent else Decimal(0)
    quantities = dict(inventory_items(agent.pk, owner).order_by().filter(
        source__sku__startswith='combat.material.').values('source__sku').annotate(total=Sum('quantity')).values_list('source__sku', 'total')) if agent else {}
    counts = dict(AlchemyOperation.objects.filter(owner_id=owner, **({'actor_id': agent.pk} if agent else {})).values('recipe_id').annotate(total=Count('pk')).values_list('recipe_id', 'total'))
    potion_owned, potion_by_stars = {}, {}
    if agent:
        for item in inventory_items(agent.pk, owner).filter(source__sku__startswith='elixir.'):
            recipe_id, stars = item.source['sku'][7:], item.source.get('stars', 1)
            potion_owned[recipe_id] = potion_owned.get(recipe_id, 0) + item.quantity
            potion_by_stars.setdefault(recipe_id, {str(star): 0 for star in range(1, 6)})[str(stars)] += item.quantity
    catalog = AlchemyCatalog.objects.filter(pk=owner).first()
    icons = catalog.item_icons if catalog else {}
    from assets.models import Asset
    valid = set(Asset.objects.filter(pk__in=icons.values(), uploader=owner, source_type='item_icon', file_type='image', is_valid=True).values_list('pk', flat=True))
    pool = material_pool(agent.pk, owner) if agent else []
    base_values, tiers = base_values_for(), tiers_for()
    result = []
    for key, rule in rules_for(owner).items():
        ingredients = [{**row, 'name': MATERIALS[row['sku']][0], 'tier': tiers.get(row['sku'], 1),
                        'source': source_for(row['sku']), 'owned': quantities.get(row['sku'], 0)}
                       for row in rule['ingredients']]
        feasible = min(row['owned'] // row['quantity'] for row in ingredients) if ingredients else 0
        state = 'unselected' if not agent else 'locked' if progress['level'] < rule['required_level'] else 'missing' if not feasible else 'tired' if energy < rule['energy_cost'] else 'ready'
        max_bottles = min(MAX_BOTTLES, feasible, int(energy // rule['energy_cost'])) if state == 'ready' else 0
        asset_id = icons.get('elixir.' + key)
        value = (sum((Decimal(str(row['price'])) * row['quantity'] for row in allocate(copy.deepcopy(pool), rule['ingredients'])), Decimal(0))
                 if agent and feasible else Decimal(0))
        previews = []
        if agent and feasible:
            previews = [estimate(rule, progress['level'], allocate(copy.deepcopy(pool), rule['ingredients']), base_values, tiers)]
        result.append({**rule, 'id': key, 'sku': 'elixir.' + key, 'description': DESCRIPTION,
            'effects': elixir_previews(key), 'ingredients': ingredients, 'state': state,
            'max_bottles': max_bottles, 'quality_previews': previews, 'times_made': counts.get(key, 0),
            'owned_bottles': potion_owned.get(key, 0), 'owned_by_stars': potion_by_stars.get(key, {str(star): 0 for star in range(1, 6)}),
            'ingredient_value': str(value), 'dungeon_labels': list(dict.fromkeys(row['source'] for row in ingredients if row['source'])),
            'icon_asset_id': asset_id if asset_id in valid else None,
            'icon_url': f'/api/resource/view/{asset_id}' if asset_id in valid else ''})
    return result


def materials(owner: str) -> list[dict]:
    return [{'sku': sku, 'name': row[0], 'level': row[1], 'sale_price': row[2], 'dungeon': DUNGEONS.get(sku.split('.')[2], '')}
            for sku, row in MATERIALS.items()]
