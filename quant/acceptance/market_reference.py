"""Independent Decimal ledger for the fixed price-momentum acceptance case.

This module deliberately does not import the product expression or backtest
engine. Signals compare two closed prices; trades use the following open.
"""
from decimal import Decimal, localcontext


def ledger(rows, start, end, window, *, baseline=False):
    with localcontext() as context:
        context.prec = 45
        one = Decimal(1)
        cost = Decimal('0.001')  # 5 bps fee + 5 bps slippage, each side.
        balance = peak = one
        worst = Decimal(0)
        held = entries = turnover = exposure = 0
        curve = [{'timestamp': rows[start]['timestamp'], 'equity': 1.0}]
        returns = []
        for index in range(start, end):
            closed = index - 1
            target = int(baseline or Decimal(rows[closed]['close']) > Decimal(rows[closed-window]['close']))
            change = abs(target-held)
            entries += int(target > held)
            turnover += change
            exposure += target
            previous = balance
            balance *= one-cost*change
            if target:
                balance *= Decimal(rows[index+1]['open']) / Decimal(rows[index]['open'])
            if index+1 == end and target:
                balance *= one-cost
                turnover += 1
            peak = max(peak, balance)
            worst = max(worst, one-balance/peak)
            returns.append(float(balance/previous-one))
            curve.append({'timestamp': rows[index+1]['timestamp'], 'equity': float(balance)})
            held = target
        return {'total_return': float(balance-one), 'max_drawdown': float(worst),
                'entries': entries, 'turnover': turnover, 'exposure_fraction': exposure/(end-start),
                'missing_signals': 0, 'bars': end-start, 'start': rows[start]['timestamp'],
                'end': rows[end]['timestamp'], 'curve': curve, 'returns': returns}
