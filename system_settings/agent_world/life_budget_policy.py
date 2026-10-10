"""按实际世界货币消费能力限制预算；模型服务费用不属于生活预算。"""
from decimal import Decimal

SPENDING_ACTIVITIES = frozenset({'travel', 'farm', 'market', 'market_prepare', 'investment', 'exploration'})


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
