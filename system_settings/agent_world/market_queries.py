"""市场可见性统一按账号过滤，分页避免将无限挂牌装进模型上下文。"""
from decimal import Decimal
from .market_models import MarketListing, MarketTransaction, MarketSession
from .inventory_stock import inventory_items
from .farm_models import AgentFarm
from .execution import stamina


def page_values(value):
    try: page = int(value.get('page', 1))
    except (ValueError, TypeError): raise ValueError('页码无效')
    if not 1 <= page <= 1000000: raise ValueError('页码无效')
    return page, 20


def listings(owner: str, arguments: dict) -> dict:
    page, size = page_values(arguments)
    rows = MarketListing.objects.filter(owner_id=owner)
    if arguments.get('seller_id'): rows = rows.filter(seller_id=arguments['seller_id'])
    if arguments.get('status', 'active') != 'all': rows = rows.filter(status=arguments.get('status','active'))
    if arguments.get('search'): rows = rows.filter(item__name__icontains=str(arguments['search'])[:200])
    items = list(rows.values()[size*(page-1):size*page])
    from .cooking_models import CookingCatalog
    catalog = CookingCatalog.objects.filter(pk=owner).first()
    icons = catalog.item_icons if catalog else {}
    from assets.models import Asset
    valid = set(Asset.objects.filter(pk__in=icons.values(), uploader=owner, is_valid=True).values_list('pk', flat=True))
    for row in items:
        item = row.get('item') or {}
        sku = (item.get('source') or {}).get('sku', '')
        if sku.startswith('dish.'):
            asset_id = icons.get(sku)
            item['icon_asset_id'] = asset_id if asset_id in valid else None
            item['icon_url'] = f'/api/resource/view/{asset_id}' if asset_id in valid else ''
    return {'total':rows.count(), 'page':page, 'items':items}


def history(owner: str, arguments: dict) -> dict:
    page, size = page_values(arguments)
    rows = MarketTransaction.objects.filter(owner_id=owner)
    if arguments.get('actor_id'):
        from django.db.models import Q
        rows = rows.filter(Q(actor_id=arguments['actor_id']) | Q(result__seller_id=arguments['actor_id']))
    if arguments.get('session_id'): rows = rows.filter(session_id=arguments['session_id'])
    return {'total': rows.count(), 'page': page, 'items': list(rows.values()[size*(page-1):size*page])}


def sessions(owner: str, arguments: dict) -> dict:
    page, size = page_values(arguments)
    rows = MarketSession.objects.filter(owner_id=owner)
    if arguments.get('actor_id'): rows = rows.filter(actor_id=arguments['actor_id'])
    items = list(rows.values('id','actor_id','actor_name','status','mode','call_count','calls','record_id','created_at','expires_at','ended_at','reason')[size*(page-1):size*page])
    from .market_life_history import budget_calls
    from .life_time import local_time
    adjustments = budget_calls(owner, items)
    from datetime import datetime
    for row in items:
        row.pop('record_id')
        row['calls'] = sorted([*row['calls'], *adjustments.get(row['id'], [])],
                              key=lambda call: local_time(datetime.fromisoformat(call['at'])))
    return {'total':rows.count(), 'page':page, 'items':items}


def actor_context(owner: str, agent) -> dict:
    farm = AgentFarm.objects.filter(pk=agent.pk, owner_id=owner).first()
    farm_state = None
    if farm:
        import copy
        from django.utils import timezone
        from .farm_catalog import catalog_for
        from .farm_clock import advance_state
        state = copy.deepcopy(farm.state)
        advance_state(state, catalog_for(owner).seed, timezone.now().timestamp())
        from .market_visibility import visible_farm_state
        farm_state = visible_farm_state(state)
    inventory = list(inventory_items(agent.pk, owner).values('id','name','quantity','value','source','kind','rarity'))
    # No audit chains or historical price lots in the model's demand summary.
    for row in inventory:
        row['recoverable_value'] = str(sum((Decimal(l['price']) * l['quantity'] for l in row['source'].get('lots', [])), Decimal(0))) if row['source'].get('lots') else row['value']
        row['source'] = {key:row['source'][key] for key in ('sku','quality','stars') if key in row['source']}
    from .market_spending import spending_context
    from .farm_quality import skill_progress
    from .farm_economics import planting_context
    from .market_shop import shop_payload
    from .farm_bonus import yield_bonus
    shop = shop_payload(owner)
    planting = planting_context(farm, catalog_for(owner).rules, shop['supplies'], yield_bonus(agent), shop['expires_at']) if farm else {'skill': skill_progress(0)}
    from .farm_queue_plan import overview
    from .combat.queries import market_context
    return {'combat_supplies':market_context(owner,agent), 'farm_queue': overview(farm), 'planting': planting, 'spending': spending_context(owner, agent.pk), 'balance':str(agent.money), 'stamina':str(stamina(agent)), 'farm':farm_state,
            'inventory':inventory, 'listings':listings(owner, {'seller_id':agent.pk,'status':'all'})}
