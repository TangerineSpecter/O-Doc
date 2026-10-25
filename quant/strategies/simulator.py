"""Reference OHLC executor, explicit conservative fill order and no source execution."""
import math
from rest_framework.exceptions import ValidationError
from quant.factors.expression import finite_number
from quant.research.contracts import digest
from .policy import validate_policy, signal_side, SEMANTICS
from .account import Account


def protective_exit(account: Account, row: dict, policy: dict, *, gap: bool):
    current, side = account.current, account.side
    if not current: return None
    entry = current['entry_fill_price']
    stop = entry * (1 - side * policy['stop_loss_fraction']) if policy['stop_loss_fraction'] is not None else None
    profit = entry * (1 + side * policy['take_profit_fraction']) if policy['take_profit_fraction'] is not None else None
    adverse = row['open'] if gap else row['low'] if side == 1 else row['high']
    favorable = row['open'] if gap else row['high'] if side == 1 else row['low']
    if stop is not None and (adverse <= stop if side == 1 else adverse >= stop):
        return (row['open'] if gap else stop), 'gap_stop_loss' if gap else 'stop_loss'
    if profit is not None and (favorable >= profit if side == 1 else favorable <= profit):
        return profit, 'gap_take_profit' if gap else 'take_profit'
    return None


def validate_inputs(rows, values, start, end, output_type, fee_bps, slippage_bps):
    if type(start) is not int or type(end) is not int or len(rows) != len(values) or not 1 <= start < end < len(rows) or end - start < 2:
        raise ValidationError('策略区间须保留前一根收盘信号并至少两个收益区间')
    if output_type not in ('numeric_series', 'boolean_series'):
        raise ValidationError('策略只接收数值或布尔序列')
    if any(not finite_number(v) or not 0 <= v <= 500 for v in (fee_bps, slippage_bps)):
        raise ValidationError('策略单侧费用及滑点为0–500bps')
    for row in rows[start:end + 1]:
        if any(not finite_number(row.get(key)) or row[key] <= 0 for key in ('open', 'high', 'low', 'close')) or not row['low'] <= min(row['open'], row['close']) <= max(row['open'], row['close']) <= row['high']:
            raise ValidationError('策略需要完整、自洽且为正的OHLC价格')
    for signal in values[start - 1:end - 1]:
        if signal is not None and (type(signal) is not bool if output_type == 'boolean_series' else not finite_number(signal)):
            raise ValidationError('策略信号类型不符合声明')


def simulate(rows: list[dict], values: list, *, start: int, end: int, threshold: float, fee_bps: float,
             slippage_bps: float, policy: dict, output_type='numeric_series', baseline=False,
             check=None, record_trades=True) -> dict:
    policy = validate_policy(policy, threshold)
    validate_inputs(rows, values, start, end, output_type, fee_bps, slippage_bps)
    account = Account(fee_bps, slippage_bps, record_trades)
    equity, peak, drawdown, exposure, missing, blocked = 1., 1., 0., 0, 0, 0
    allowed_entry = start
    curve, returns = [{'timestamp': rows[start]['timestamp'], 'equity': 1.}], []
    for i in range(start, end):
        if check: check()
        row, signal, previous = rows[i], values[i - 1], equity
        missing += int(signal is None)
        skip_entry = False
        if not account.insolvent:
            account.observe_insolvency(row['open'], i, row['timestamp'], 'insolvent_open')
        if not account.insolvent and account.side and not baseline:
            exit_fill = protective_exit(account, row, policy, gap=True)
            if exit_fill:
                account.close(exit_fill[0], i, row['timestamp'], exit_fill[1]); skip_entry = True
                allowed_entry = i + policy['cooldown_bars'] + 1
            elif policy['max_holding_bars'] and i - account.current['entry_bar'] >= policy['max_holding_bars']:
                account.close(row['open'], i, row['timestamp'], 'max_holding'); skip_entry = True
                allowed_entry = i + policy['cooldown_bars'] + 1
        if not account.insolvent:
            target = 1 if baseline else signal_side(signal, output_type, policy, threshold, account.side)
            if account.side and target != account.side:
                reversing = bool(target)
                account.close(row['open'], i, row['timestamp'], 'signal_reverse' if reversing else 'missing_signal' if signal is None else 'signal_exit')
                skip_entry = reversing and not policy['same_open_reversal']
                allowed_entry = i if reversing and policy['same_open_reversal'] else i + policy['cooldown_bars'] + 1
            account.observe_insolvency(row['open'], i, row['timestamp'], 'insolvent_exit')
            if target and not account.side and not skip_entry and i >= allowed_entry and not account.insolvent:
                if account.entries >= policy['max_entries']: blocked += 1
                else: account.open(target, row['open'], i, row['timestamp'], signal, policy['position_fraction'])
            if account.side:
                exposure += 1
                account.charge_borrow(row['open'], policy['short_borrow_bps_per_bar'])
                account.observe_insolvency(row['open'], i, row['timestamp'], 'insolvent_borrow')
                if account.side and not baseline:
                    exit_fill = protective_exit(account, row, policy, gap=False)
                    if exit_fill:
                        account.close(exit_fill[0], i, row['timestamp'], exit_fill[1])
                        allowed_entry = i + policy['cooldown_bars'] + 1
        following = rows[i + 1]
        if account.side:
            account.observe_insolvency(following['open'], i + 1, following['timestamp'], 'insolvent_open')
        if i == end - 1 and account.side:
            final_fill = None if baseline else protective_exit(account, following, policy, gap=True)
            account.close(final_fill[0] if final_fill else following['open'], end, following['timestamp'], final_fill[1] if final_fill else 'boundary')
        if account.cash <= 0 and not account.side: account.insolvent = True
        equity = account.equity(following['open'])
        if not math.isfinite(equity): raise ValidationError('策略净值溢出')
        peak = max(peak, equity); drawdown = max(drawdown, 1 - equity / peak)
        returns.append(equity / previous - 1 if previous else 0.)
        curve.append({'timestamp': following['timestamp'], 'equity': equity})
    if not math.isclose(account.realized, equity - 1, rel_tol=1e-9, abs_tol=1e-10):
        raise ValidationError('策略成交账本与终值不一致')
    execution = {'version': 1, 'semantics': SEMANTICS, 'policy_hash': digest(policy),
        'baseline': baseline, 'status': 'insolvent' if account.insolvent else 'completed',
        'fees': account.fees, 'borrow_cost': account.borrow, 'realized_pnl': account.realized,
        'capital_deficit': max(0., -equity), 'entry_budget_blocked_bars': blocked,
        'exit_reasons': account.reasons, 'ledger_scope': 'full_trades' if record_trades else 'summary_only'}
    if record_trades: execution['trades'] = account.trades
    return {'total_return': equity - 1, 'max_drawdown': drawdown, 'entries': account.entries, 'turnover': account.turnover,
        'exposure_fraction': exposure / (end - start), 'missing_signals': missing, 'bars': end - start,
        'start': rows[start]['timestamp'], 'end': rows[end]['timestamp'], 'curve': curve, 'returns': returns, 'execution': execution}
