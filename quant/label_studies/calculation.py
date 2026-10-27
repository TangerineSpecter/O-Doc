"""Evaluate only fully contained forward labels; no candidate selection."""
import math
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.factors.expression import finite_number
from .targets import window
from .statistics import pearson, ranks


def evaluate(rows: list[dict], values: list, target: dict, start: int, end: int, check=lambda: None, *, selection_used=False) -> dict:
    if type(selection_used) is not bool: raise ValidationError('标签选择用途无效')
    limits = window(target, start, end)
    if len(rows) != len(values) or end >= len(rows): raise ValidationError('标签行情、信号与区间不一致')
    pairs = []; missing = 0; horizon = target['horizon_bars']
    for index in range(start, limits['last_origin'] + 1):
        check()
        value = values[index]
        if value is None: missing += 1; continue
        if type(value) is bool: value = int(value)
        if not finite_number(value): raise ValidationError('标签预测值必须为有限数值或布尔')
        before, after = rows[index]['close'], rows[index + horizon]['close']
        if any(not finite_number(price) or price <= 0 for price in (before, after)):
            raise ValidationError('标签收盘价必须为正有限数值')
        label = after / before - 1
        if not math.isfinite(label): raise ValidationError('远期收益标签数值溢出')
        pairs.append({'origin': index, 'label_end': index + horizon, 'predictor': value, 'label': label})
    x = [row['predictor'] for row in pairs]; y = [row['label'] for row in pairs]
    sufficient = len(pairs) >= 5
    linear = pearson(x, y) if sufficient else None
    rank = pearson(ranks(x), ranks(y)) if sufficient else None
    return {'version': 2 if selection_used else 1, 'target': target, 'window': limits, 'start_timestamp': rows[start]['timestamp'],
        'end_timestamp': rows[end]['timestamp'], 'last_origin_timestamp': rows[limits['last_origin']]['timestamp'],
        'pairs': len(pairs), 'missing_predictors': missing, 'coverage': len(pairs) / limits['possible_pairs'],
        'pearson_ic': linear, 'spearman_ic': rank,
        'status': 'completed' if linear is not None and rank is not None else 'insufficient',
        'reason': '' if linear is not None and rank is not None else 'too_few_valid_pairs' if not sufficient else 'constant_or_near_constant_input',
        'pairs_hash': digest(pairs), 'independent_observations': None, 'p_value': None,
        'selection_used': selection_used, 'limitations': ['IC描述该公式与指定远期收益的关系，不是交易收益或参数最优证明。',
            '多期标签可能重叠，配对数量不等于独立样本量；未做显著性、多重检验或置信区间。',
            '柱数按导入行计，不假设连续日历时间；timestamp仅为行情柱标签，不证明原平台实时可得性。',
            '段末跨界的预测起点先全部剔除，再按缺失值处理；未读取评价段结束后的价格。']}
