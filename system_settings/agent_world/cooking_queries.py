"""只读厨艺与食谱上下文，不在 GET 中建立成长或目录数据。"""
from decimal import Decimal
from django.db.models import Sum, Count
from system_settings.models import Agent
from .cooking_models import CookingSkill, CookingOperation, CookingCatalog
from .cooking_catalog import rules_for, INGREDIENTS, DESCRIPTION, skill_progress
from .inventory_stock import inventory_items, preview_cost
from .cooking_materials import material_pool, allocate
from .cooking_quality import STRATEGIES, estimate
from .cooking_plan import base_values_for
import copy
from .execution import stamina
from .farm_catalog import DEFAULT_RULES, normalized_rules
from .farm_models import FarmCatalog


def validate_cooking_agents(owner: str, actor_ids: list[str]) -> None:
    if CookingSkill.objects.filter(pk__in=actor_ids).exclude(owner_id=owner).exists():
        raise ValueError('居民厨艺属于其他账号')
    from system_settings.models import AgentTask
    ids = set(actor_ids)
    for task in AgentTask.objects.filter(task_kind='cooking'):
        # Task binding reserves ownership before the first dish creates a skill record.
        if task.cooking_config.get('owner_id') != owner and ids.intersection(task.agent_ids or [task.agent_id]):
            raise ValueError('居民已绑定其他账号的烹饪任务')


def validate_actor(owner: str, actor_id: str) -> None:
    from .investment_service import validate_agents
    from .life_config import owns_actor
    if not owns_actor(owner, actor_id):
        raise ValueError('居民厨艺属于其他账号')
    validate_agents(owner, [actor_id])


def overview(owner: str, actor_id: str) -> dict:
    validate_actor(owner, actor_id)
    skill = CookingSkill.objects.filter(pk=actor_id, owner_id=owner).first()
    return {'actor_id': actor_id, **skill_progress(skill.experience if skill else 0)}


def recipes(owner: str, agent: Agent | None = None) -> list[dict]:
    progress = overview(owner, agent.pk) if agent else skill_progress(0)
    energy = stamina(agent) if agent else Decimal(0)
    quantities = dict(inventory_items(agent.pk, owner).order_by().values('source__sku').annotate(total=Sum('quantity')).values_list('source__sku', 'total')) if agent else {}
    counts = dict(CookingOperation.objects.filter(owner_id=owner, **({'actor_id': agent.pk} if agent else {})).values('recipe_id').annotate(total=Count('pk')).values_list('recipe_id', 'total'))
    catalog = CookingCatalog.objects.filter(pk=owner).first()
    icons = catalog.item_icons if catalog else {}
    from assets.models import Asset
    valid = set(Asset.objects.filter(pk__in=icons.values(), uploader=owner, source_type='item_icon', file_type='image', is_valid=True).values_list('pk', flat=True))
    farm = FarmCatalog.objects.filter(pk=owner).first()
    farm_rules = normalized_rules(farm.rules if farm else DEFAULT_RULES)
    prices = {f'crop.{k}': Decimal(str(v['sale_price'])) for k, v in farm_rules['crops'].items()}
    prices.update({'product.chicken.normal': Decimal(str(farm_rules['animals']['chicken']['sale_price'])), 'product.cow.normal': Decimal(str(farm_rules['animals']['cow']['sale_price']))})
    pool = material_pool(agent.pk, owner) if agent else []
    base_values = base_values_for(owner)
    result = []
    for key, rule in rules_for(owner).items():
        ingredients = [{**row, 'name': INGREDIENTS[row['sku']], 'owned': quantities.get(row['sku'], 0)} for row in rule['ingredients']]
        portions = min(row['owned'] // row['quantity'] for row in ingredients)
        state = 'unselected' if not agent else 'locked' if progress['level'] < rule['required_level'] else 'missing' if not portions else 'tired' if energy < rule['energy_cost'] else 'ready'
        asset_id = icons.get('dish.' + key)
        raw_value = (sum((preview_cost(agent.pk, owner, row['sku'], row['quantity']) for row in ingredients), Decimal(0))
                     if agent and portions else sum(prices[row['sku']] * row['quantity'] for row in ingredients))
        previews = []
        if agent and portions:
            for strategy in STRATEGIES:
                simulated = copy.deepcopy(pool)
                preview_portions = [estimate(rule, progress['level'], allocate(simulated, rule['ingredients'], strategy), base_values)
                                    for _ in range(min(6, portions, int(energy // rule['energy_cost'])))]
                previews.append({'ingredient_strategy': strategy, 'portions': preview_portions})
        result.append({**rule, 'id': key, 'sku': 'dish.' + key, 'description': DESCRIPTION,
            'ingredients': ingredients, 'state': state, 'max_portions': min(6, portions, int(energy // rule['energy_cost'])) if state == 'ready' else 0,
            'quality_previews': previews, 'times_made': counts.get(key, 0), 'ingredient_value': str(raw_value), 'processing_gain': str(Decimal(rule['sale_price']) - raw_value),
            'icon_asset_id': asset_id if asset_id in valid else None,
            'icon_url': f'/api/resource/view/{asset_id}' if asset_id in valid else ''})
    return result
