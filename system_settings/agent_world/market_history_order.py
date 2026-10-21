"""批量会话共用调度时间，展示顺序优先读取本机保存的实际完成次序。"""
import json
from collections.abc import Iterable

from .market_plan_models import MarketTick


def operation_key(operation: dict) -> str:
    return json.dumps(operation, sort_keys=True, ensure_ascii=False, default=str)


def batch_operation_orders(owner: str, session_ids: Iterable[str]) -> dict[str, dict[str, int]]:
    orders = {}
    ticks = MarketTick.objects.filter(
        owner_id=owner, session_id__in=list(session_ids)
    ).values('session_id', 'hits')
    for tick in ticks:
        hits = tick['hits'] if isinstance(tick['hits'], dict) else {}
        outcome = hits.get('outcome', {})
        done = outcome.get('done', []) if isinstance(outcome, dict) else []
        if not isinstance(done, list):
            done = []
        orders[tick['session_id']] = {
            operation_key(operation): index
            for index, operation in enumerate(done)
            if isinstance(operation, dict)
        }
    return orders
