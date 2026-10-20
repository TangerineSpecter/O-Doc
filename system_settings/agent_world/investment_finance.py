"""把投资成交账本折算为已实现盈亏，避免买卖本金被当成收支。"""
from copy import copy
from decimal import Decimal

from .investment_models import InvestmentTrade


def settle_investment_entries(entries, owner: str | None = None, notes: set | None = None):
    """买入是现金转为持仓，不计收支；卖出只记已实现盈亏。以副本改写金额，账本原值保持不变。"""
    ids = sorted({entry.snapshot.get('trade_id') for entry in entries
                  if entry.kind == 'investment' and isinstance(entry.snapshot, dict)} - {None, ''})
    by_id = {}
    for index in range(0, len(ids), 500):
        trades = InvestmentTrade.objects.filter(pk__in=ids[index:index + 500])
        if owner is not None:
            trades = trades.filter(owner_id=owner)
        by_id.update({row.pk: row for row in trades})
    kept = []
    for entry in entries:
        if entry.kind != 'investment':
            kept.append(entry)
            continue
        snapshot = entry.snapshot if isinstance(entry.snapshot, dict) else {}
        trade = by_id.get(snapshot.get('trade_id'))
        if trade is not None and trade.actor_id != entry.agent_id:
            trade = None
        operation = trade.operation if trade and isinstance(trade.operation, dict) else {}
        if (operation.get('side') or snapshot.get('side')) != 'sell':
            continue
        result = trade.result if trade and isinstance(trade.result, dict) else {}
        raw = result.get('realized_profit')
        try:
            profit = Decimal(str(raw)) if raw is not None else None
        except (ArithmeticError, TypeError, ValueError):
            profit = None
        if profit is None:
            if notes is not None:
                notes.add('部分投资卖出缺少可核对的已实现盈亏，未计入收支。')
            continue
        if not profit:
            continue
        shadow = copy(entry)
        shadow.amount = profit
        kept.append(shadow)
    return kept
