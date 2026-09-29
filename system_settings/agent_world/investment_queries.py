"""只读账户与估值；列表不会触发外部行情或技术分析。"""
from decimal import Decimal
from system_settings.models import Agent
from .investment_models import InvestmentAccount, InvestmentTrade, InvestmentDecision, InvestmentCache
from .investment_data import local_day


def page(items, number=1):
    number = int(number)
    if number < 1:
        raise ValueError('页码必须为正整数')
    return {'items':items[(number-1)*20:number*20], 'total':len(items), 'page':number}


def positions(account):
    rows = []
    day = local_day().isoformat()
    quotes = {c.pk.removeprefix('investment-value:'):c.payload for c in InvestmentCache.objects.filter(pk__in=['investment-value:'+code for code in account.positions])}
    pending = set(account.positions)
    if pending:
        prices = InvestmentTrade.objects.filter(actor_id=account.pk, owner_id=account.owner_id, operation__code__in=pending).order_by('-result__price_date','-created_at','-pk').values_list('operation__code','result__price','result__price_date')
        for code, price, price_date in prices.iterator():
            if code not in pending:
                continue
            if code not in quotes or price_date > quotes[code]['date']:
                quotes[code] = {'price':str(price), 'date':price_date}
            pending.discard(code)
            if not pending:break
    for code, p in account.positions.items():
        q = quotes.get(code)
        cost = Decimal(p['cost'])
        close = Decimal(q['price']) if q else None
        market = close*p['quantity'] if close is not None else None
        unrealized = market-cost if market is not None else None
        rows.append({'code':code, **p, 'available_quantity':sum(l['quantity'] for l in p['lots'] if l['available_on']<=day),
                     'average_cost':str(cost/p['quantity']), 'close_price':q['price'] if q else None, 'price_date':q['date'] if q else None,
                     'market_value':str(market) if market is not None else None, 'unrealized_profit':str(unrealized) if unrealized is not None else None,
                     'return_percent':str(unrealized/cost*100) if unrealized is not None and cost else None})
    return sorted(rows, key=lambda r:r['code'])


def overview(owner, actor):
    account = InvestmentAccount.objects.filter(pk=actor,owner_id=owner).first()
    if not account:
        raise ValueError('当前账号没有该居民的投资账户，请先配置投资任务')
    rows = positions(account)
    agent = Agent.objects.filter(pk=actor).first()
    realized = sum((Decimal(str(profit)) for profit in InvestmentTrade.objects.filter(actor_id=actor,owner_id=owner).values_list('result__realized_profit',flat=True)),Decimal(0))
    return {'actor_id':actor,'actor_name':agent.name if agent else account.actor_name,'balance':str(agent.money) if agent else None,
            'realized_profit':str(realized), 'unrealized_profit':str(sum((Decimal(r['unrealized_profit'] or '0') for r in rows),Decimal(0))),
            'market_value':str(sum((Decimal(r['market_value'] or '0') for r in rows),Decimal(0))), 'position_count':len(rows),
            'positions':page(rows)}


def records(owner, actor, kind, number):
    number = int(number)
    if number < 1:
        raise ValueError('页码必须为正整数')
    model = InvestmentTrade if kind == 'trades' else InvestmentDecision
    qs = model.objects.filter(owner_id=owner, actor_id=actor).order_by('-created_at', '-pk')
    total = qs.count()
    selected = qs[(number-1)*20:number*20]
    if kind == 'trades':
        items = [{'id':t.pk, 'created_at':t.created_at, 'operation':t.operation,
                  'result':{k:v for k,v in t.result.items() if k != 'positions_after'}} for t in selected]
    else:
        items = [{'id':d.pk, 'created_at':d.created_at, 'status':d.status, 'reason':d.reason,
                  'reference_date':d.reference_date, 'calls':d.calls} for d in selected]
    return {'items':items, 'total':total, 'page':number}
