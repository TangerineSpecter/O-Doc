"""市场可见性统一按账号过滤，分页避免将无限挂牌装进模型上下文。"""
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
    return {'total':rows.count(), 'page':page, 'items':list(rows.values()[size*(page-1):size*page])}


def history(owner: str, arguments: dict) -> dict:
    page, size = page_values(arguments)
    rows = MarketTransaction.objects.filter(owner_id=owner)
    if arguments.get('actor_id'):
        from django.db.models import Q
        rows = rows.filter(Q(actor_id=arguments['actor_id']) | Q(result__seller_id=arguments['actor_id']))
    if arguments.get('session_id'): rows = rows.filter(session_id=arguments['session_id'])
    return {'total':rows.count(), 'page':page, 'items':list(rows.values()[size*(page-1):size*page])}


def sessions(owner: str, arguments: dict) -> dict:
    page, size = page_values(arguments)
    rows = MarketSession.objects.filter(owner_id=owner)
    if arguments.get('actor_id'): rows = rows.filter(actor_id=arguments['actor_id'])
    return {'total':rows.count(), 'page':page, 'items':list(rows.values('id','actor_id','actor_name','status','mode','call_count','calls','created_at','expires_at','ended_at','reason')[size*(page-1):size*page])}


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
        farm_state = {key:state[key] for key in ('plots','buildings','animals')}
    inventory = list(inventory_items(agent.pk, owner).values('id','name','quantity','value','source','kind','rarity'))
    # No audit chains or historical price lots in the model's demand summary.
    for row in inventory:
        row['source'] = {key:row['source'][key] for key in ('sku','quality') if key in row['source']}
    return {'balance':str(agent.money), 'stamina':str(stamina(agent)), 'farm':farm_state,
            'inventory':inventory, 'listings':listings(owner, {'seller_id':agent.pk,'status':'all'})}
