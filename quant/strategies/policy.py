"""Frozen strategy-v1 policy: all thresholds and risk settings are hypotheses."""
import copy
from rest_framework.exceptions import ValidationError
from quant.factors.expression import finite_number

FIELDS = {'version', 'direction', 'boolean_side', 'short_entry_threshold', 'long_exit_threshold', 'short_exit_threshold',
    'position_fraction', 'stop_loss_fraction', 'take_profit_fraction', 'max_holding_bars', 'cooldown_bars',
    'max_entries', 'short_borrow_bps_per_bar', 'same_open_reversal'}
EXIT_REASONS = {'signal_exit', 'signal_reverse', 'missing_signal', 'stop_loss', 'take_profit', 'gap_stop_loss', 'gap_take_profit', 'max_holding', 'boundary', 'insolvent_open', 'insolvent_borrow', 'insolvent_exit'}
SEMANTICS = 'closed_signal_next_open_fixed_quantity_stop_first_gap_stop_open_gap_profit_limit_v1'
LIMITATIONS = [
    '仅验证受控表达式与显式策略假设，不执行上传脚本，不证明原平台或真实账户等价',
    '按上一根已收盘信号在下一开盘决策；同柱止损止盈同时触及按止损先行，不能从OHLC恢复真实价格路径',
    '跳空止损按开盘成交；跳空止盈保守按目标价成交，再计不利滑点和单侧手续费',
    '仓位为开仓时净值的固定比例、分数数量，持有期间不自动再平衡；未模拟手数、保证金强平、借券可用性、成交量、停牌、涨跌停或T+1',
    '做空按每根持有柱计借券费用；真实费率与平台现金流未知，不能用实验值冒充实际配置',
    '回撤按开盘净值采样，不等于真实盘中最大回撤；净值耗尽仅在开盘及模拟成交/费用时观测，停止后保留负净值和资金缺口，不假定负余额保护',
    '止损、止盈或持有期退出后，同根不再入场；冷却期继续禁止新仓；次数上限后仅管理已有仓位',
]


def validate_policy(value: dict, long_entry_threshold: float) -> dict:
    if not isinstance(value, dict) or set(value) != FIELDS or type(value.get('version')) is not int or value['version'] != 1:
        raise ValidationError('策略执行规则版本或字段不完整')
    if value['direction'] not in ('long_only', 'short_only', 'long_short') or value['boolean_side'] not in ('long', 'short'):
        raise ValidationError('策略方向和布尔信号方向须明确选择')
    if value['direction'] == 'long_only' and value['boolean_side'] != 'long' or value['direction'] == 'short_only' and value['boolean_side'] != 'short':
        raise ValidationError('布尔方向必须在允许的开仓方向内；false只代表不触发，不自动做反向')
    for key in ('short_entry_threshold', 'long_exit_threshold', 'short_exit_threshold', 'position_fraction', 'short_borrow_bps_per_bar'):
        if not finite_number(value[key]): raise ValidationError('策略阈值、仓位和费用须为有限数值')
    if not finite_number(long_entry_threshold) or not 0 < value['position_fraction'] <= 1 or not 0 <= value['short_borrow_bps_per_bar'] <= 500:
        raise ValidationError('开仓比例为(0,1]，每根做空借券费用为0–500bps')
    if value['direction'] != 'short_only' and value['long_exit_threshold'] > long_entry_threshold:
        raise ValidationError('多头退出阈值不能高于多头入场阈值')
    if value['direction'] != 'long_only' and value['short_entry_threshold'] > value['short_exit_threshold']:
        raise ValidationError('空头退出阈值不能低于空头入场阈值')
    if value['direction'] == 'long_short' and value['short_entry_threshold'] >= long_entry_threshold:
        raise ValidationError('双向入场区间不得重叠')
    for key, upper in (('stop_loss_fraction', 1), ('take_profit_fraction', 10)):
        if value[key] is not None and (not finite_number(value[key]) or not 0 < value[key] < upper):
            raise ValidationError('止损为(0,1)、止盈为(0,10)的价格比例；停用须明确为null')
    if value['direction'] != 'long_only' and value['take_profit_fraction'] is not None and value['take_profit_fraction'] >= 1:
        raise ValidationError('允许做空时，止盈比例须小于100%，以保持正的目标价格')
    for key in ('max_holding_bars', 'cooldown_bars', 'max_entries'):
        if type(value[key]) is not int or not (1 if key == 'max_entries' else 0) <= value[key] <= 2000:
            raise ValidationError('持有/冷却柱数为0–2000，开仓次数上限为1–2000')
    if type(value['same_open_reversal']) is not bool:
        raise ValidationError('同开盘反向开仓开关须为布尔值')
    if value['same_open_reversal'] and value['cooldown_bars']:
        raise ValidationError('同开盘反向开仓要求冷却期为0，避免互相冲突的规则')
    return copy.deepcopy(value)


def signal_side(signal, output_type: str, policy: dict, long_entry: float, current: int) -> int:
    if signal is None: return 0
    if output_type == 'boolean_series': return (1 if policy['boolean_side'] == 'long' else -1) if signal else 0
    if current == 1 and signal > policy['long_exit_threshold']:
        return -1 if policy['direction'] == 'long_short' and signal < policy['short_entry_threshold'] else 1
    if current == -1 and signal < policy['short_exit_threshold']:
        return 1 if policy['direction'] == 'long_short' and signal > long_entry else -1
    if policy['direction'] != 'short_only' and signal > long_entry: return 1
    if policy['direction'] != 'long_only' and signal < policy['short_entry_threshold']: return -1
    return 0
