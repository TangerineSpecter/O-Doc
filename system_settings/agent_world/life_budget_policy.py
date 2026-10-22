"""按实际世界货币消费能力限制预算；模型服务费用不属于生活预算。"""
from decimal import Decimal

SPENDING_ACTIVITIES = frozenset({'travel', 'farm', 'market', 'market_prepare', 'investment', 'lottery'})

# Exploration itself is free. Optional potion purchases may spend unreserved cash,
# but exploration never reserves a planned life budget for them.
UNBUDGETED_PURCHASE_ACTIVITIES = frozenset({'exploration'})


def allows_spending(activity: str) -> bool:
    return activity in SPENDING_ACTIVITIES


def effective_budget(item, proposed: Decimal | None = None) -> Decimal:
    # 旧记录保留真实支出和原始预算；免费活动的多余计划额度不再冻结资金。
    if not allows_spending(item.activity):
        return item.spent
    return item.budget if proposed is None else proposed


def remaining_reservation(item, proposed: Decimal | None = None) -> Decimal:
    return max(Decimal(0), effective_budget(item, proposed) - item.spent)


def validate_activity_budget(activity: str, budget: Decimal, spent: Decimal, *, needs_market: bool = False) -> None:
    if budget < spent:
        raise ValueError('预算不能小于已发生支出')
    if not allows_spending(activity) and (budget != spent or needs_market):
        raise ValueError('阅读评论、发帖、休息等无消费活动不能预留新增预算或附带采购')


def validate_budget_adjustment(item, budget: Decimal) -> None:
    validate_activity_budget(item.activity, budget, item.spent)
    # 彩票预算对应已确认的整张票承诺，通用预算重分配不能单独更改金额。
    if item.activity == 'lottery' and item.context.get('lottery_plan') and budget != item.budget:
        raise ValueError('大乐透购票张数已确认，不能单独调整预算；请取消或重新规划购票安排')
