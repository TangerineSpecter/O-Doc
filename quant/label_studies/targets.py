"""Frozen label meaning and boundary rules; no source execution or fitting."""
from rest_framework import serializers
from rest_framework.exceptions import ValidationError


class Horizon(serializers.IntegerField):
    def to_internal_value(self, value):
        if isinstance(value, bool): raise serializers.ValidationError('标签期限须为整数，不能用布尔值')
        return super().to_internal_value(value)


class TargetInput(serializers.Serializer):
    version = Horizon(min_value=1, max_value=1)
    horizon_bars = Horizon(min_value=1, max_value=2000)

    def to_internal_value(self, data):
        if not isinstance(data, dict) or set(data) != {'version', 'horizon_bars'}:
            raise serializers.ValidationError({'non_field_errors': ['标签目标须明确版本和未来柱数']})
        return super().to_internal_value(data)


def freeze(values: dict) -> dict:
    form = TargetInput(data=values); form.is_valid(raise_exception=True)
    return {**dict(form.validated_data), 'kind': 'close_to_future_close_simple_return',
        'formula': 'close[t+horizon_bars]/close[t]-1', 'predictor': 'closed_bar_factor_at_t',
        'boundary': 'purge_origins_whose_label_end_exceeds_segment_end',
        'time_unit': 'supplied_bars_not_calendar_duration', 'inference': 'descriptive_no_p_value_or_independence_claim'}


def validate(target: dict) -> None:
    from quant.research.contracts import digest
    if not isinstance(target, dict) or digest(freeze({key: target.get(key) for key in ('version', 'horizon_bars')})) != digest(target):
        raise ValidationError('标签目标含义或边界合同无效')


def window(target: dict, start: int, end: int) -> dict:
    validate(target)
    if type(start) is not int or type(end) is not int or not 0 <= start < end:
        raise ValidationError('标签评价区间无效')
    last = end - target['horizon_bars']
    if last - start + 1 < 5:
        raise ValidationError('剔除跨界标签后至少需要5个预测起点，请增加区间或缩短期限')
    return {'start': start, 'end': end, 'last_origin': last, 'possible_pairs': last - start + 1,
        'purged_origins': target['horizon_bars'], 'rule': target['boundary']}
