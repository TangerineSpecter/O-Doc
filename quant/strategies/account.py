"""Fractional fixed-quantity cash accounting, including short proceeds/deficit."""
import math
from rest_framework.exceptions import ValidationError


class Account:
    def __init__(self, fee_bps: float, slippage_bps: float, record_trades: bool):
        self.fee, self.slippage = fee_bps / 10000, slippage_bps / 10000
        self.cash, self.quantity = 1., 0.
        self.current, self.trades = None, []
        self.entries, self.turnover = 0, 0
        self.fees, self.borrow, self.realized = 0., 0., 0.
        self.reasons, self.record_trades = {}, record_trades
        self.insolvent = False

    @property
    def side(self) -> int:
        return 1 if self.quantity > 0 else -1 if self.quantity < 0 else 0

    def equity(self, price: float) -> float:
        value = self.cash + self.quantity * price
        if not math.isfinite(value): raise ValidationError('策略现金或净值溢出')
        return value

    def open(self, side: int, price: float, index: int, timestamp: str, signal, fraction: float):
        equity = self.equity(price)
        fill = price * (1 + side * self.slippage)
        notional = equity * fraction / (1 + self.fee)
        quantity = side * notional / fill
        fee = notional * self.fee
        self.cash -= quantity * fill + fee
        self.quantity = quantity
        self.entries += 1; self.turnover += 1; self.fees += fee
        self.current = {'id': f'trade-{self.entries}', 'side': 'long' if side == 1 else 'short',
            'entry_bar': index, 'entry_timestamp': timestamp, 'signal_bar': index - 1, 'entry_signal': signal,
            'entry_raw_price': price, 'entry_fill_price': fill, 'quantity': abs(quantity),
            'entry_equity': equity, 'position_fraction': fraction, 'entry_fee': fee, 'borrow_cost': 0.}

    def charge_borrow(self, price: float, bps: float):
        if self.side != -1: return
        cost = abs(self.quantity) * price * bps / 10000
        self.cash -= cost; self.borrow += cost; self.current['borrow_cost'] += cost

    def close(self, raw_price: float, index: int, timestamp: str, reason: str):
        side = self.side
        fill = raw_price * (1 - side * self.slippage)
        notional, current = abs(self.quantity) * fill, self.current
        fee = notional * self.fee
        self.cash += self.quantity * fill - fee
        gross = side * (fill - current['entry_fill_price']) * current['quantity']
        pnl = gross - current['entry_fee'] - fee - current['borrow_cost']
        closed = current | {'exit_bar': index, 'exit_timestamp': timestamp, 'exit_raw_price': raw_price,
            'exit_fill_price': fill, 'exit_fee': fee, 'gross_pnl': gross, 'net_pnl': pnl, 'exit_reason': reason}
        if self.record_trades: self.trades.append(closed)
        self.realized += pnl; self.fees += fee; self.turnover += 1
        self.reasons[reason] = self.reasons.get(reason, 0) + 1
        self.quantity, self.current = 0., None

    def observe_insolvency(self, price: float, index: int, timestamp: str, reason: str) -> bool:
        if self.equity(price) > 0: return False
        if self.side: self.close(price, index, timestamp, reason)
        self.insolvent = True
        return True
