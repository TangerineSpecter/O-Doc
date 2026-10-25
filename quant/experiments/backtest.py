"""A deliberately explicit long/flat open-to-open simulator, engine version 1.

Closed bar i decides the position opened at i+1. The position earns the next
open-to-open return. Boundaries start flat and liquidate at the last open.
Costs apply once per unit of turnover; buy-and-hold uses identical boundaries.
No leverage, shorting, interest, corporate actions, intrabar stops or limit fills.
"""
import math
from rest_framework.exceptions import ValidationError


def simulate(rows: list[dict], values: list, *, start: int, end: int, threshold: float,
             fee_bps: float, slippage_bps: float, output_type='numeric_series', baseline=False, check=None) -> dict:
    if len(rows) != len(values) or not 1 <= start < end < len(rows) or end - start < 2:
        raise ValidationError('实验区间至少需要三根开盘价，且须留出前一根信号 K 线')
    for name, value in [('threshold', threshold), ('fee_bps', fee_bps), ('slippage_bps', slippage_bps)]:
        if type(value) not in (int, float) or not math.isfinite(value):
            raise ValidationError(f'{name} 必须为有限数值')
    if not 0 <= fee_bps <= 500 or not 0 <= slippage_bps <= 500:
        raise ValidationError('费率/滑点每侧须介于 0–500 bps')
    if output_type not in ('numeric_series', 'boolean_series'):
        raise ValidationError('实验只接收数值或布尔序列')
    cost = (fee_bps + slippage_bps) / 10000
    equity, peak, drawdown, position, turnover, entries, exposure = 1., 1., 0., 0, 0, 0, 0
    curve = [{'timestamp': rows[start]['timestamp'], 'equity': 1.}]
    returns, missing = [], 0
    for i in range(start, end):
        if check:
            check()
        signal = values[i - 1]
        if signal is not None and ((output_type == 'boolean_series' and type(signal) is not bool) or
                (output_type == 'numeric_series' and (type(signal) not in (int, float) or not math.isfinite(signal)))):
            raise ValidationError('信号类型/数值无效')
        if signal is None:
            missing += 1
        target = 1 if baseline else 0 if signal is None else int(signal) if output_type == 'boolean_series' else int(signal > threshold)
        change = abs(target - position)
        entries += int(target > position)
        turnover += change
        exposure += target
        previous = equity
        # Proportional cost reduces capital at entry/exit; price return follows.
        equity *= (1 - cost * change) * (1 + target * (rows[i + 1]['open'] / rows[i]['open'] - 1))
        if i == end - 1:
            equity *= 1 - cost * target
            turnover += target
        if not math.isfinite(equity) or equity <= 0:
            raise ValidationError('模拟净值无效或资金耗尽')
        position = target
        peak = max(peak, equity)
        drawdown = max(drawdown, 1 - equity / peak)
        returns.append(equity / previous - 1)
        curve.append({'timestamp': rows[i + 1]['timestamp'], 'equity': equity})
    return {'total_return': equity - 1, 'max_drawdown': drawdown, 'entries': entries, 'turnover': turnover,
        'exposure_fraction': exposure / (end - start), 'missing_signals': missing, 'bars': end - start,
        'start': rows[start]['timestamp'], 'end': rows[end]['timestamp'], 'curve': curve, 'returns': returns}


def partitions(size: int, *, train_fraction=.6, validation_fraction=.2, gap=1) -> dict:
    if type(size) is not int or size < 60 or type(gap) is not int or not 1 <= gap <= 2000:
        raise ValidationError('样本至少 60 根，隔离间隔为 1–2000 根')
    if (type(train_fraction) not in (int, float) or type(validation_fraction) not in (int, float)
            or not .2 <= train_fraction <= .8 or not .1 <= validation_fraction <= .4
            or train_fraction + validation_fraction > .9):
        raise ValidationError('训练、验证和留出比例无效')
    a, b = int(size * train_fraction), int(size * (train_fraction + validation_fraction))
    result = {'train': [1, a - 1], 'validation': [a + gap, b - 1], 'holdout': [b + gap, size - 1]}
    if any(end - start < 5 for start, end in result.values()):
        raise ValidationError('隔离后的各段至少保留 5 个收益区间')
    return result
