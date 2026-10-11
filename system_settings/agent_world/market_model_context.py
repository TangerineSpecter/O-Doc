"""Private model projections. HTTP and external MCP keep their existing contracts."""
import copy
import json
from django.core.serializers.json import DjangoJSONEncoder
from .market_queries import actor_context
from .life_scope import CURRENT
from .farm_gate import guarded

PAGE_SIZE = 20
READ_TOOLS = {'get_market_context', 'get_market_shop', 'list_market_listings',
              'get_my_market_listings', 'get_my_market_transactions', 'observe_market_detail'}
OMIT = {'icon_url', 'icon_asset_id', 'image_url', 'image_asset_id', 'avatar',
        'operation_keys', 'purchase_keys', 'hashes', 'lots', 'history', 'owner_id'}
DETAIL_TOOL = {'type': 'function', 'function': {
    'name': 'observe_market_detail',
    'description': '按需读取完整经营细节，每页20条。planting含作物概率，cooking含完整食谱，inventory含来源，inventory_lots含指定物品逐批回收成本，listing_history含指定挂牌历次改价，combat含装备，life含后续安排，experiences含历史经历。逐批详情须item_id，挂牌历史须listing_id。',
    'parameters': {'type': 'object', 'properties': {
        'topic': {'type': 'string', 'enum': ['inventory', 'inventory_lots', 'listing_history', 'planting', 'farm', 'combat', 'cooking', 'life', 'experiences']},
        'page': {'type': 'integer', 'minimum': 1}, 'search': {'type': 'string'},
        'item_id': {'type': 'string'}, 'listing_id': {'type': 'string'}},
        'required': ['topic'], 'additionalProperties': False}}}


def projection(value):
    if isinstance(value, dict):
        return {k: projection(v) for k, v in value.items() if k not in OMIT}
    if isinstance(value, list):
        return [projection(v) for v in value]
    return value


def page(items: list, number: int = 1, search: str = '') -> dict:
    if type(number) is not int or number < 1:
        raise ValueError('页码无效')
    if search:
        items = [row for row in items if search in json.dumps(row, ensure_ascii=False, cls=DjangoJSONEncoder)]
    start = (number - 1) * PAGE_SIZE
    return {'items': projection(items[start:start + PAGE_SIZE]), 'page': number,
            'total': len(items), 'has_more': start + PAGE_SIZE < len(items)}


def life_context() -> dict:
    scope = CURRENT.get()
    if not scope:
        return {}
    # Current budget and cash come from spending_context, never this cached snapshot.
    context = scope['context']
    return projection({k: context[k] for k in ('preferences', 'direction', 'goals', 'current',
        'goals_total', 'upcoming', 'upcoming_total', 'farm_queue_rules') if k in context})


@guarded
def model_context(owner: str, agent) -> dict:
    agent.refresh_from_db()
    context = actor_context(owner, agent)
    planting = context.get('planting', {})
    result = {k: context[k] for k in ('balance', 'stamina', 'spending', 'farm_queue')}
    result['resident'] = {'id': agent.pk, 'name': agent.name, 'profession_id': agent.profession_id}
    result['inventory'] = page(context['inventory'])
    result['listings'] = projection(context['listings'])
    farm = context.get('farm')
    result['farm'] = {'plots': len(farm['plots']), 'buildings': farm['buildings'],
                      'animals': len(farm['animals'])} if farm else None
    result['planting'] = projection({k: planting[k] for k in ('skill', 'fertilizers', 'next_refresh_at', 'note') if k in planting})
    result['life'] = life_context()
    if 'current' in result['life'] and 'budget' in context['spending']:
        result['life']['current'] = {**result['life']['current'],
            'budget': context['spending']['budget'], 'spent': context['spending']['spent']}
    result['detail_access'] = '库存、作物收益与概率、农场、战斗物资可用observe_market_detail分页查询；其他挂牌与成交可用原市场查询工具。'
    return result


@guarded
def observe(owner: str, agent, arguments: dict) -> dict:
    topic, number, search = arguments.get('topic'), arguments.get('page', 1), arguments.get('search', '')
    if topic not in ('inventory', 'inventory_lots', 'listing_history', 'planting', 'farm', 'combat', 'cooking', 'life', 'experiences') or set(arguments) - {'topic', 'page', 'search', 'item_id', 'listing_id'}:
        raise ValueError('市场详情查询无效')
    if not isinstance(search, str) or len(search) > 200:
        raise ValueError('搜索内容无效')
    context = actor_context(owner, agent)
    if topic == 'inventory_lots':
        from .inventory_stock import inventory_items
        item = inventory_items(agent.pk, owner).filter(pk=arguments.get('item_id')).first()
        if not item:
            raise ValueError('背包物品不存在或不属于当前居民')
        return {'item_id': item.pk, 'name': item.name,
                'price_lots': page(item.source.get('lots') or [{'quantity': item.quantity, 'price': str(item.value)}], number, search)}
    if topic == 'listing_history':
        from .market_models import MarketListing
        row = MarketListing.objects.filter(owner_id=owner, pk=arguments.get('listing_id')).first()
        if not row:
            raise ValueError('挂牌不存在或不属于当前市场')
        return {'listing_id': row.pk, 'version': row.version, 'price_history': page(row.history, number, search)}
    if topic == 'inventory':
        from .inventory_stock import inventory_items
        rows = list(inventory_items(agent.pk, owner).values('id', 'name', 'quantity', 'value', 'source', 'kind', 'rarity', 'origin_actor_id', 'origin_actor_name'))
        recoverable = {row['id']: row['recoverable_value'] for row in context['inventory']}
        return page([{**row, 'recoverable_value': recoverable[row['id']]} for row in rows], number, search)
    if topic == 'planting':
        return {**projection({k: v for k, v in context['planting'].items() if k != 'crop_comparisons'}),
                'crop_comparisons': page(context['planting'].get('crop_comparisons', []), number, search)}
    if topic == 'combat':
        from .inventory_stock import stock_quantity
        supplies = context['combat_supplies']
        return {key: page([{**row, 'owned': stock_quantity(agent.pk, owner, 'combat.' + row['id'])}
                    if key in ('potions', 'materials') else row for row in values], number, search)
                for key, values in supplies.items()}
    if topic == 'farm':
        farm = context.get('farm')
        return {'farm': {key: page(value, number, search) if isinstance(value, list) else projection(value)
                         for key, value in farm.items()} if farm else None}
    if topic == 'cooking':
        from .cooking_queries import overview, recipes
        return {'skill': overview(owner, agent.pk), 'recipes': page(recipes(owner, agent), number, search)}
    from .market_detail_queries import life_details, experiences
    if topic == 'experiences':
        return page(experiences(agent), number, search)
    fresh = life_details(owner, agent)
    return {key: page(fresh.get(key, []), number, search) for key in ('goals', 'upcoming', 'today')} | {
        'spending': context['spending'], 'preferences': fresh.get('preferences'), 'direction': fresh.get('direction')}


def compact_messages(messages: list[dict]) -> list[dict]:
    """Replace superseded read snapshots without breaking assistant/tool pairing."""
    result = copy.deepcopy(messages)
    calls = {}
    for message in result:
        if message.get('role') == 'assistant':
            for call in message.get('tool_calls') or []:
                function = call.get('function', {})
                if function.get('name') in READ_TOOLS:
                    try:
                        args = json.loads(function.get('arguments') or '{}')
                        calls[call['id']] = (function['name'], json.dumps(args, sort_keys=True))
                    except (ValueError, KeyError):
                        pass
    latest = {}
    for message in reversed(result):
        identity = message.get('tool_call_id')
        signature = calls.get(identity)
        if message.get('role') == 'tool' and signature:
            try:
                payload = json.loads(message.get('content') or '{}')
            except ValueError:
                continue
            if isinstance(payload, dict) and 'error' in payload:
                continue
            if signature in latest:
                message['content'] = json.dumps({'superseded_by': latest[signature], 'note': '同一查询的旧状态已替换，请使用最新结果。'}, ensure_ascii=False)
            else:
                latest[signature] = identity
    # The compact initial state is also superseded by a successful full refresh.
    if any(signature[0] == 'get_market_context' for signature in latest):
        for message in result:
            if message.get('role') == 'user' and message.get('content', '').startswith('{'):
                try:
                    payload = json.loads(message['content'])
                except ValueError:
                    continue
                if 'market_state' in payload:
                    payload['market_state'] = {'superseded': '使用最近get_market_context结果'}
                    message['content'] = json.dumps(payload, ensure_ascii=False, cls=DjangoJSONEncoder)
                break
    return result
