"""模拟成交原子记账；持仓以成交链重算，不将估值记入现金。"""
from .life_scope import allowed as life_allowed
import copy
import hashlib
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from system_settings.models import Agent, AgentTask, AgentExecutionLease, WorldAction, WorldActionRuntime
from .investment_models import InvestmentAccount, InvestmentDecision, InvestmentTrade
from .investment_data import local_day, next_trade_day, quote
from .farm_gate import guarded
from .income import ensure_opening
from .models import WorldLedger
from .execution import stamina

CENT = Decimal('.01')
COST_PRECISION = Decimal('.000000000001')


def energy_action_id(decision_id: str) -> str:
    # 生活安排主键已是 64 位哈希；再加前缀会超过 WorldAction.id。短机会键保持旧格式。
    raw = 'investment-energy:' + decision_id
    return raw if len(raw) <= 64 else hashlib.sha256(raw.encode()).hexdigest()


def validate_agents(owner: str, ids: list[str]) -> None:
    for task in AgentTask.objects.filter(task_kind='investment'):
        if task.investment_config.get('owner_id') != owner and set(ids) & set(task.agent_ids or [task.agent_id]):
            raise ValueError('居民已绑定其他账号的投资任务')
    from .cooking_queries import validate_cooking_agents
    validate_cooking_agents(owner, ids)
    from .farm_models import AgentFarm
    if AgentFarm.objects.filter(pk__in=ids).exclude(owner_id=owner).exists():
        raise ValueError('居民农場属于其他账号')
    for task in AgentTask.objects.filter(task_kind='market'):
        if task.market_config.get('owner_id') != owner and set(ids) & set(task.agent_ids or [task.agent_id]):
            raise ValueError('居民市场属于其他账号')
    for account in InvestmentAccount.objects.filter(pk__in=ids):
        if account.owner_id != owner:
            raise ValueError('居民投资资产属于其他账号')


def account_for(owner: str, agent: Agent) -> InvestmentAccount:
    account, created = InvestmentAccount.objects.get_or_create(pk=agent.pk, defaults={'owner_id': owner, 'actor_name': agent.name})
    if account.owner_id != owner:
        raise ValueError('无权操作其他账号的投资资产')
    if created:
        from .investment_sync import checkpoint
        checkpoint(owner)
    return account


def apply_position(positions: dict, operation: dict, price: Decimal, available_on: str) -> tuple[dict, Decimal]:
    positions = copy.deepcopy(positions)
    code, side, quantity = operation['code'], operation['side'], operation['quantity']
    position = positions.setdefault(code, {'name': operation['name'], 'quantity': 0, 'cost': '0', 'lots': [], 'first_bought': operation['day'], 'last_bought': operation['day'], 'buy_reason': operation['reason']})
    cost = Decimal(position['cost'])
    allocated = Decimal('0')
    if side == 'buy':
        position['quantity'] += quantity
        position['cost'] = str(cost + price*quantity)
        position['lots'].append({'quantity': quantity, 'available_on': available_on})
        position['last_bought'] = operation['day']
    else:
        available = sum(l['quantity'] for l in position['lots'] if l['available_on'] <= operation['day'])
        if quantity > available:
            raise ValueError('可卖股数不足（当天买入需等待下一交易日）')
        allocated = cost if quantity == position['quantity'] else (cost*quantity/position['quantity']).quantize(COST_PRECISION)
        remaining = quantity
        for lot in position['lots']:
            if lot['available_on'] <= operation['day']:
                used = min(remaining, lot['quantity']); lot['quantity'] -= used; remaining -= used
        position['lots'] = [l for l in position['lots'] if l['quantity']]
        position['quantity'] -= quantity
        position['cost'] = str(cost-allocated)
        if not position['quantity']:
            del positions[code]
    return positions, allocated


def check_authorization(decision: InvestmentDecision, agent: Agent, token: str, manual: bool) -> None:
    decision.refresh_from_db()
    if timezone.now() >= decision.created_at + timedelta(minutes=5):
        raise ValueError('投资机会超过5分钟')
    if decision.status != 'running' or decision.actor_id != agent.pk or local_day() != decision.execution_date:
        raise ValueError('投资机会已结束或跨日，请重新执行')
    task = AgentTask.objects.filter(pk=decision.task_id, task_kind='investment').first()
    if not task or task.investment_config.get('owner_id') != decision.owner_id or not life_allowed(task,agent.pk):
        raise ValueError('居民已解绑或投资任务失效')
    if not AgentExecutionLease.objects.filter(agent_id=agent.pk, token=token, until__gt=timezone.now()).exists():
        raise ValueError('投资执行授权已失效')
    if not manual and (not task.enabled or not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists()):
        raise ValueError('自动投资已停用')


@guarded
@transaction.atomic
def commit(decision: InvestmentDecision, agent: Agent, key: str, operation: dict, q: dict, available_on: str, token: str, manual: bool = False) -> dict:
    old = InvestmentTrade.objects.filter(pk=key).first()
    if old:
        if old.operation != operation or old.actor_id != agent.pk or old.decision_id != decision.pk:
            raise ValueError('重复操作键不能使用不同参数')
        return {k:v for k,v in old.result.items() if k != 'positions_after'}
    check_authorization(decision, agent, token, manual)
    if decision.execution_date.weekday() >= 5:
        raise ValueError('周末不执行投资')
    quantity = operation.get('quantity')
    if type(quantity) is not int or not 1 <= quantity <= 1000000000 or operation.get('side') not in ('buy', 'sell'):
        raise ValueError('数量须为正整数股，方向须为buy或sell')
    if q['code'] != operation['code'] or q['date'] != decision.reference_date.isoformat():
        raise ValueError('成交报价与冻结参考日不一致')
    price = Decimal(q['price'])
    if not price.is_finite() or price <= 0:
        raise ValueError('成交价格无效')
    opposite = 'sell' if operation['side'] == 'buy' else 'buy'
    if InvestmentTrade.objects.filter(decision=decision, operation__code=operation['code'], operation__side=opposite).exists():
        raise ValueError('同一次机会不能对同一股票反向交易')
    agent = Agent.objects.select_for_update().get(pk=agent.pk)
    ensure_opening(agent)
    balance = WorldLedger.objects.filter(agent_id=agent.pk).aggregate(total=Sum('amount'))['total'] or Decimal(0)
    account = account_for(decision.owner_id, agent)
    amount = (price*quantity).quantize(CENT, rounding=ROUND_HALF_UP)
    if amount >= Decimal('100000000000000'):
        raise ValueError('交易金额超出账户范围')
    if operation['side'] == 'buy':
        from .life_budget import charge_budget
        charge_budget(agent,amount,business_key='investment:'+key)
    if operation['side'] == 'buy' and amount > balance:
        raise ValueError('可用余额不足')
    positions, allocated = apply_position(account.positions, operation, price, available_on)
    energy_key = energy_action_id(decision.pk)
    first = not WorldAction.objects.filter(pk=energy_key).exists()
    if first and stamina(agent) < 5:
        raise ValueError('体力不足')
    delta = -amount if operation['side'] == 'buy' else amount
    result = {'code': operation['code'], 'quantity': quantity, 'side': operation['side'], 'price': str(price),
              'price_date': q['date'], 'source': q['source'], 'cash_delta': str(delta), 'allocated_cost': str(allocated),
              'realized_profit': str(amount-allocated) if operation['side'] == 'sell' else '0',
              'available_on': available_on, 'positions_after': positions}
    InvestmentTrade.objects.create(pk=key, owner_id=decision.owner_id, actor_id=agent.pk, actor_name=agent.name,
                                   decision=decision, operation=operation, result=result)
    account.positions = positions; account.trade_keys.append(key); account.save()
    WorldLedger.objects.create(pk='investment:'+key, agent_id=agent.pk, agent_name=agent.name, kind='investment', amount=delta,
                               snapshot={'trade_id': key, 'code': operation['code'], 'side': operation['side'], 'price_date': q['date']})
    if first:
        WorldAction.objects.create(pk=energy_key, actor_id=agent.pk, task=decision.task, status='success',
                                   consumed_at=timezone.now(), energy_cost=5, effects_done=True, snapshot={'investment_energy': True}, result={'decision_id': decision.pk})
    agent.money = balance+delta; agent.save(update_fields=['money'])
    from .investment_sync import checkpoint
    checkpoint(decision.owner_id)
    return {k: v for k,v in result.items() if k != 'positions_after'}


def trade(decision: InvestmentDecision, agent: Agent, call_id: str, side: str, code: str, quantity: int, reason: str, token: str, manual: bool = False, analysis: dict | None = None) -> dict:
    check_authorization(decision, agent, token, manual)
    if type(quantity) is not int or not 1 <= quantity <= 1000000000 or side not in ('buy','sell'):
        raise ValueError('买卖股数须为正整数')
    q = quote(code, decision.reference_date)  # External I/O before the short asset transaction.
    operation = {'side': side, 'code': code, 'name': q['name'], 'quantity': quantity,
                 'reason': str(reason)[:2000], 'day': decision.execution_date.isoformat(), 'analysis': analysis or {}}
    available = next_trade_day(decision.execution_date) if side == 'buy' else ''
    key = hashlib.sha256(f'{decision.pk}:{call_id}'.encode()).hexdigest()
    return commit(decision, agent, key, operation, q, available, token, manual)
