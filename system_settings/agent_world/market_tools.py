"""任务与 MCP 共用同一市场工具协议；没有 Agent 身份不能执行。"""
import hashlib
import uuid
from django.core.serializers.json import DjangoJSONEncoder
import json
from .market_models import MarketSession, MarketTransaction
from .market_sessions import check_mcp, owner_for, enter, cleanup, invalid_reason, close_session, consume_call
from .market_shop import shop_payload, market_iso
from .market_queries import listings, history, actor_context
from .market_service import trade
from .farm_gate import guarded
from .market_sessions import finish_call


def schema(name, description, props=None, required=None):
    return {'name':name, 'description':description, 'inputSchema':{'type':'object', 'properties':{'session_id':{'type':'string'}, **(props or {})}, 'required':required or [], 'additionalProperties':False}}

S = {'type':'string'}
N = {'type':'integer','minimum':1}
PAGE = {'page':N, 'search':S}
WRITE = {'request_id':S, 'session_id':S}
MARKET_TOOLS = [
    schema('get_market_shop', '查询当前共享商店库存、报价与下次刷新时间。'),
    schema('list_market_listings', '查看居民集市，默认仅有效挂牌，返回报价版本。', {**PAGE,'seller_id':S,'status':{'type':'string','enum':['active','sold','withdrawn','all']}}),
    schema('get_my_market_listings', '查看自己的挂牌、上架和改价时间，判断是否改价或撤单。', {**PAGE,'status':S}),
    schema('get_my_market_transactions', '查看自己的市场成交与操作记录。', {'page':N}),
    schema('get_market_context', '查看自己的余额、背包、农场需求与建筑容量。'),
    schema('enter_market', '进入市场一次扣5体力，最多5分钟20次调用。不想逛市场时无需进入。', {'request_id':S}, ['request_id']),
    schema('buy_market_shop', '购买系统商品。slot_id为商品位ID、feed或fertilizer.quality/fertilizer.yield，必须提供本小时batch_id。', {**WRITE,'batch_id':S,'slot_id':S,'quantity':N}, ['request_id','batch_id','slot_id','quantity']),
    schema('buy_market_listing', '购买其他居民挂牌，使用查询时的version，报价变化时需重查。', {**WRITE,'listing_id':S,'version':N,'quantity':N}, ['request_id','listing_id','version','quantity']),
    schema('sell_to_market_shop', '将自己背包中的农作物、畜产品或美食按已有批次回收价出售。', {**WRITE,'item_id':S,'quantity':N}, ['request_id','item_id','quantity']),
    schema('create_market_listing', '自主定价上架农作物、畜产品、美食或纪念品，数量立即转入托管。', {**WRITE,'item_id':S,'quantity':N,'unit_price':S}, ['request_id','item_id','quantity','unit_price']),
    schema('reprice_market_listing', '修改自己挂牌的单价，保留首次上架时间。', {**WRITE,'listing_id':S,'version':N,'unit_price':S}, ['request_id','listing_id','version','unit_price']),
    schema('withdraw_market_listing', '撤回自己的挂牌，将剩余物品返还背包。', {**WRITE,'listing_id':S,'version':N}, ['request_id','listing_id','version']),
    schema('leave_market', '离开市场，结束本次会话，已完成交易保留。', {**WRITE,'reason':S}),
]
NAMES = {t['name'] for t in MARKET_TOOLS}
KINDS = {'buy_market_shop':'buy_shop','buy_market_listing':'buy_listing','sell_to_market_shop':'sell',
         'create_market_listing':'list','reprice_market_listing':'reprice','withdraw_market_listing':'withdraw'}


def request_key(actor, value):
    if not isinstance(value, str) or not value.strip() or len(value)>200: raise ValueError('request_id须为非空且不超过200字的字符串')
    return hashlib.sha256(f'market:{actor}:{value}'.encode()).hexdigest()


def payload(session):
    return {'session_id':session.pk,'status':session.status,'calls_remaining':max(0,20-session.call_count),
            'expires_at':market_iso(session.expires_at),'reason':session.reason}


@guarded
def call_market_tool(name: str, arguments: dict, agent, *, task=None, record=None, mode='mcp') -> dict:
    check_mcp()
    if name not in NAMES or not isinstance(arguments, dict): raise ValueError('未知市场工具或参数无效')
    from system_settings.models import Agent
    if not agent: raise ValueError('世界市场 MCP 需要当前 Agent 上下文，不能通过参数指定身份')
    agent = Agent.objects.get(pk=agent.pk)
    owner = owner_for(agent)
    if any(key in arguments for key in ('actor_id','agent_id','owner_id')): raise ValueError('不能指定其他居民身份')
    allowed = next(tool['inputSchema']['properties'] for tool in MARKET_TOOLS if tool['name'] == name)
    if set(arguments) - set(allowed):
        raise ValueError('市场工具包含未知参数')
    if name == 'enter_market':
        cleanup()
        session = enter(owner, agent, request_key(agent.pk, arguments.get('request_id')), task=task, record=record, mode=mode)
        from .market_spending import spending_context
        return {**payload(session), 'spending': spending_context(owner, agent.pk)}
    explicit = arguments.get('session_id')
    session = (MarketSession.objects.filter(pk=explicit, actor_id=agent.pk, owner_id=owner).first() if explicit else
               MarketSession.objects.filter(actor_id=agent.pk, owner_id=owner, status='active').first())
    if explicit and not session: raise ValueError('会话不存在或不属于当前居民')
    operation = {'kind':KINDS[name], **{k:v for k,v in arguments.items() if k not in ('request_id','session_id')}} if name in KINDS else None
    key = request_key(agent.pk, arguments.get('request_id') or uuid.uuid4().hex)
    if operation and not arguments.get('request_id'): raise ValueError('交易必须提供稳定 request_id')
    previous = MarketTransaction.objects.filter(pk=key).first() if operation else None
    if previous:
        if previous.actor_id != agent.pk or previous.owner_id != owner or previous.operation != operation or (session and previous.session_id != session.pk):
            raise ValueError('交易请求键已用于不同参数或会话')
        from .market_spending import spending_context
        return {**previous.result, 'spending': spending_context(owner, agent.pk)}
    if operation and session and not invalid_reason(session):
        from .market_spending import check_purchase
        check_purchase(owner, agent.pk, operation)
    if session:
        reason = invalid_reason(session)
        if reason:
            close_session(session, reason)
            if operation or name == 'leave_market': raise ValueError(reason)
            session = None
        else:
            session = consume_call(session, name, key, arguments)
    if operation and not session: raise ValueError('请先进入市场，交易必须在有效会话内执行')
    try:
        if operation: result = trade(session, agent, key, operation)
        elif name == 'leave_market':
            if not session: raise ValueError('没有正在进行的市场会话')
            result = payload(close_session(session, arguments.get('reason') or 'Agent 主动离开市场'))
        elif name == 'get_market_shop': result = shop_payload(owner)
        elif name == 'list_market_listings': result = listings(owner, arguments)
        elif name == 'get_my_market_listings': result = listings(owner, {**arguments,'seller_id':agent.pk,'status':arguments.get('status','all')})
        elif name == 'get_my_market_transactions': result = history(owner, {**arguments,'actor_id':agent.pk})
        else: result = actor_context(owner, agent)
        if operation:
            from .market_spending import spending_context
            result['spending'] = spending_context(owner, agent.pk)
        result = json.loads(json.dumps(result, cls=DjangoJSONEncoder))
        if session:
            finish_call(session, {k:result[k] for k in ('name','quantity','total','status','reason') if k in result})
        return result
    except Exception as exc:
        if session:
            finish_call(session, {'error':str(exc)[:500]})
        raise
    finally:
        if session and session.call_count >= 20: close_session(session, '市场会话达到二十次工具调用上限')
