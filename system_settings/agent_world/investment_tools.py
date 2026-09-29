"""仅供投资机会使用；所有交易依赖当前居民执行凭证。"""
from .investment_data import stock_directory, boards, members, analyze, QUERY_DEADLINE
from .investment_queries import page, overview, positions
from .investment_models import InvestmentAccount
from .investment_news import news
from .investment_service import trade, check_authorization


def tool(name, description, properties=None, required=None):
    return {'type':'function','function':{'name':name,'description':description,'parameters':{'type':'object','properties':properties or {},'required':required or [],'additionalProperties':False}}}


TEXT={'type':'string'}
INTEGER={'type':'integer','minimum':1}
TOOLS=[
    tool('account','查看余额和第一页持仓，不自动分析指标'),
    tool('positions','分页查看持仓',{'page':INTEGER}),
    tool('market_news','只在寻找新股票方向时使用；账号每天最多搜索一次，持仓检查不搜索'),
    tool('find_stocks','按名称或代码查询真实A股目录',{'query':TEXT,'page':INTEGER}),
    tool('find_boards','搜索真实行业分类',{'kind':{'type':'string','enum':['industry']},'query':TEXT,'page':INTEGER},['kind']),
    tool('board_stocks','查询真实行业成分股，不自动计算指标',{'kind':{'type':'string','enum':['industry']},'code':TEXT,'page':INTEGER},['kind','code']),
    tool('analyze_stock','按需查看MACD RSI均线及参考收盘价；每次最多3只',{'code':TEXT},['code']),
    tool('buy_stock','按冻结参考日收盘价模拟买入，整数股，最少1股',{'code':TEXT,'quantity':INTEGER,'reason':TEXT},['code','quantity','reason']),
    tool('sell_stock','按冻结参考日收盘价模拟卖出；T+1，支持部分卖出',{'code':TEXT,'quantity':INTEGER,'reason':TEXT},['code','quantity','reason']),
    tool('finish','结束本次投资机会，说明持有或观望理由',{'reason':TEXT},['reason']),
]


class Finished(Exception):
    pass


class InvestmentTools:
    def __init__(self,decision,agent,token,manual,deadline):
        self.decision,self.agent,self.token,self.manual,self.deadline=decision,agent,token,manual,deadline
        self.analyses={}; self.analyzed=set(); self.call_count=0

    def execute(self,name,args):
        import time
        from django.db import transaction
        from .farm_gate import farm_gate
        self.call_count+=1
        if self.call_count>20 or time.monotonic()>=self.deadline:
            raise Finished('投资机会达到时间或工具调用上限')
        check_authorization(self.decision,self.agent,self.token,self.manual)
        query_token = QUERY_DEADLINE.set(self.deadline)
        try:
            try:
                result=self.dispatch(name,args)
            except (ValueError,KeyError,TypeError) as exc:
                result={'error':str(exc)[:500]}
        finally:
            QUERY_DEADLINE.reset(query_token)
        with farm_gate(), transaction.atomic():
            self.decision.refresh_from_db()
            audit_result = result
            if name == 'market_news':
                audit_result = {**result, 'items': [{k:v for k,v in r.items() if k != 'summary'} for r in result.get('items', [])]}
            self.decision.calls.append({'tool':name,'arguments':args,'result':audit_result})
            self.decision.save(update_fields=['calls','updated_at'])
        return result

    def dispatch(self,name,args):
        d=self.decision
        if name=='account':return overview(d.owner_id,self.agent.pk)
        if name=='positions':return page(positions(InvestmentAccount.objects.get(pk=self.agent.pk,owner_id=d.owner_id)),args.get('page',1))
        if name=='market_news':return news(d.owner_id,d.task.investment_config,self.deadline)
        if name=='find_stocks':
            q=str(args.get('query','')).strip().lower()
            return page([r for r in stock_directory() if q in r['name'].lower() or q in r['code']],args.get('page',1))
        if name=='find_boards':
            q=str(args.get('query','')).strip().lower()
            return page([r for r in boards(args['kind']) if q in r['name'].lower() or q in r['code'].lower()],args.get('page',1))
        if name=='board_stocks':return page(members(args['kind'],args['code']),args.get('page',1))
        if name=='analyze_stock':
            code=args['code']
            if code not in self.analyzed and len(self.analyzed)>=3:raise ValueError('本次最多分析3只股票')
            self.analyzed.add(code)
            self.analyses[code]=analyze(code,d.reference_date)
            return self.analyses[code]
        if name in ('buy_stock','sell_stock'):
            return trade(d,self.agent,str(self.call_count),'buy' if name=='buy_stock' else 'sell',args['code'],args['quantity'],args['reason'],self.token,self.manual,self.analyses.get(args['code']))
        if name=='finish':raise Finished(str(args.get('reason','本次观望'))[:2000])
        raise ValueError('未知投资工具')
