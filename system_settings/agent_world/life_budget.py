"""生活资金预留不是扣款；消费与已用额度由同一个业务事务提交。"""
from decimal import Decimal, InvalidOperation
from django.db import transaction
from system_settings.models import Agent
from .life_budget_policy import allows_spending, remaining_reservation, validate_activity_budget
from .life_models import LifeItem
from .life_schedule import OPEN, revise
from .life_scope import CURRENT, check_item_authorization
from .farm_gate import guarded


def money(value: object) -> Decimal:
    if isinstance(value, bool):
        raise ValueError('金额无效')
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError('金额无效')
    if not amount.is_finite() or amount < 0 or amount > Decimal('9999999999.99') or amount != amount.quantize(Decimal('.01')):
        raise ValueError('金额须非负且最多两位小数')
    return amount


def future_allocations(rows: list[LifeItem], allocations: list[dict], reason: str) -> dict[str, Decimal]:
    """规划时允许调整其他承诺；调用方在同一事务核验总现金并保存。"""
    if not allocations:
        return {}
    if not isinstance(allocations,list) or len(allocations)>100:
        raise ValueError('后续预算调整列表无效')
    if not isinstance(reason,str) or not reason.strip() or len(reason)>1000:
        raise ValueError('后续预算调整须说明实际原因')
    available={row.pk:row for row in rows}
    changes={}
    for entry in allocations:
        if not isinstance(entry,dict) or entry.get('id') not in available or entry['id'] in changes:
            raise ValueError('只能调整本人其他未结束安排的预算')
        amount=money(entry.get('budget'))
        if amount<available[entry['id']].spent:
            raise ValueError('预算不能小于已发生支出')
        validate_activity_budget(available[entry['id']].activity, amount, available[entry['id']].spent)
        changes[entry['id']]=amount
    return changes


def charge_budget(agent: Agent, amount: Decimal, *, item_id: str | None = None, business_key: str | None = None) -> None:
    """调用方必须在持有居民/资产锁的扣款事务内；旧独立手动操作兼容。"""
    if amount <= 0:
        return
    scope = CURRENT.get()
    identity = item_id or (scope['item_id'] if scope and scope['actor_id'] == agent.pk else None)
    if not identity:
        return
    item = LifeItem.objects.select_for_update().filter(pk=identity, actor_id=agent.pk).first()
    if not item:
        if item_id and not scope:
            return
        raise ValueError('生活预算安排不存在')
    check_item_authorization(item)
    if not allows_spending(item.activity):
        raise ValueError('当前活动不支持世界货币消费')
    if item.status not in OPEN:
        raise ValueError('生活安排已结束')
    others = LifeItem.objects.select_for_update().filter(owner_id=item.owner_id, actor_id=agent.pk, status__in=OPEN).exclude(pk=item.pk)
    reserved = sum((remaining_reservation(r) for r in others), Decimal(0))
    if item.spent+amount > item.budget or agent.money-amount < reserved:
        raise ValueError('支出超出生活预算；请调用adjust_life_budget说明原因重新分配，不能动用后续活动预留')
    if business_key:
        keys=item.context.get('debit_keys',[])
        if business_key in keys:raise ValueError('生活支出业务键已经提交')
        item.context={**item.context,'debit_keys':[*keys,business_key]}
    item.spent += amount
    item.save(update_fields=['spent','context','updated_at'])


@guarded
@transaction.atomic
def adjust_budget(owner: str, actor: str, allocations: list[dict], reason: str) -> dict:
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 1000:
        raise ValueError('调整预算必须说明原因')
    if not isinstance(allocations, list) or not allocations or len(allocations) > 100:
        raise ValueError('预算分配列表无效')
    agent = Agent.objects.select_for_update().get(pk=actor)
    rows = {r.pk:r for r in LifeItem.objects.select_for_update().filter(owner_id=owner, actor_id=actor, status__in=OPEN)}
    changes = {}
    for entry in allocations:
        if not isinstance(entry,dict):raise ValueError('预算分配须为对象')
        identity = entry.get('id')
        if identity not in rows or identity in changes:
            raise ValueError('只能调整本人未结束的安排')
        amount = money(entry.get('budget'))
        if amount < rows[identity].spent:
            raise ValueError('预算不能小于已发生支出')
        validate_activity_budget(rows[identity].activity, amount, rows[identity].spent)
        changes[identity] = amount
    reserved = sum((remaining_reservation(r, changes.get(k)) for k,r in rows.items()), Decimal(0))
    if reserved > agent.money:
        raise ValueError('预留总额超出真实余额')
    for identity, amount in changes.items():
        if rows[identity].budget != amount:revise(rows[identity], reason, budget=amount)
    return {'status':'updated','reason':reason,'reserved':str(reserved)}


BUDGET_TOOL = {'type':'function','function':{'name':'adjust_life_budget','description':'超出预计费用时说明原因，重新分配本人尚未结束安排的总预算；不可小于已支出。',
    'parameters':{'type':'object','properties':{'reason':{'type':'string'},'allocations':{'type':'array','items':{'type':'object','properties':{'id':{'type':'string'},'budget':{'type':'string'}},'required':['id','budget'],'additionalProperties':False}}},'required':['reason','allocations'],'additionalProperties':False}}}


def budget_tool(arguments: dict) -> dict:
    scope = CURRENT.get()
    if not scope:
        raise ValueError('没有当前生活安排')
    item = LifeItem.objects.get(pk=scope['item_id'])
    check_item_authorization(item)
    return adjust_budget(scope['owner_id'], scope['actor_id'], arguments.get('allocations'), arguments.get('reason'))
