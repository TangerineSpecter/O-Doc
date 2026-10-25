"""Full-row, fixed-sample output comparison without alignment or source execution."""
import time
from datetime import datetime, timezone
from decimal import Decimal, localcontext
from fractions import Fraction
from rest_framework.exceptions import ValidationError
from quant.factors.expression import finite_number
from quant.research.contracts import digest

METHOD = 'controlled-output-comparison-v1'
CLAIM = 'fixed_sample_controlled_outputs_not_platform_or_global_equivalence'
MAX_ROWS = 20000
MIN_COMMON = 30
EXAMPLES = 12
COUNT_FIELDS = ('total_rows', 'warmup_rows', 'compared_rows', 'common_valid', 'left_missing', 'right_missing',
                'both_missing', 'missing_mismatches', 'value_mismatches', 'within_tolerance')
LIMITATIONS = [
    '仅比较固定候选、实际参数、行情及容差下的受控表达式输出，不证明原平台或全局公式等价。',
    '按同一行情行号和时间戳逐行比较，只排除显式共同预热段；不自动移位或分别删除缺失值。',
    '误差文本为50位十进制摘要；容差判定使用输入十进制文本的精确分数。',
]


def validate_policy(policy: dict, size: int | None = None) -> dict:
    if (not isinstance(policy, dict) or set(policy) != {'version', 'absolute_tolerance', 'relative_tolerance', 'warmup_bars'}
            or type(policy['version']) is not int or policy['version'] != 1):
        raise ValidationError('等价比较策略版本或字段无效')
    for key in ('absolute_tolerance', 'relative_tolerance'):
        if not finite_number(policy[key]) or not 0 <= policy[key] <= .001:
            raise ValidationError('等价比较绝对及相对容差须为 0–0.001 的有限数值')
    warmup = policy['warmup_bars']
    if type(warmup) is not int or not 0 <= warmup <= 2000:
        raise ValidationError('共同预热段须为 0–2000 行的整数')
    if size is not None and (type(size) is not int or not 2 <= size <= MAX_ROWS or size - warmup < MIN_COMMON):
        raise ValidationError('等价比较最多 20000 行，共同预热后至少保留 30 行')
    return policy


def guard(check=None, deadline=None):
    if check:
        check()
    if deadline is not None and time.monotonic() >= deadline:
        raise TimeoutError('等价比较超过时间预算')


def validate_timestamps(timestamps: list, *, check=None, deadline=None) -> None:
    if not isinstance(timestamps, list):
        raise ValidationError('比较时间戳必须为数组')
    previous = None
    for index, stamp in enumerate(timestamps):
        if index % 128 == 0:
            guard(check, deadline)
        if not isinstance(stamp, str) or len(stamp) > 100:
            raise ValidationError('比较时间戳格式无效')
        try:
            value = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError('timezone missing')
            value = value.astimezone(timezone.utc)
        except (ValueError, OverflowError) as exc:
            raise ValidationError('比较时间戳须包含时区且严格递增') from exc
        if previous is not None and value <= previous:
            raise ValidationError('比较时间戳重复或未严格递增')
        previous = value


def error_text(value: Fraction | None) -> str | None:
    if value is None:
        return None
    with localcontext() as context:
        context.prec = 50
        return str((Decimal(value.numerator) / Decimal(value.denominator)).normalize())


def compare_outputs(timestamps: list[str], left_values: list, right_values: list, policy: dict, *,
                    left_output_type: str, right_output_type: str, left_units: str, right_units: str,
                    left_role: str | None = None, right_role: str | None = None,
                    check=None, deadline: float | None = None) -> dict:
    deadline = time.monotonic() + 15 if deadline is None else deadline
    guard(check, deadline)
    if not isinstance(timestamps, list):
        raise ValidationError('比较时间戳必须为数组')
    validate_policy(policy, len(timestamps))
    validate_timestamps(timestamps, check=check, deadline=deadline)
    size, warmup = len(timestamps), policy['warmup_bars']
    for values, output_type in ((left_values, left_output_type), (right_values, right_output_type)):
        if output_type not in ('numeric_series', 'boolean_series') or not isinstance(values, list) or len(values) != size:
            raise ValidationError('比较输出类型、数组长度或序列合同无效')
        for index, value in enumerate(values):
            if index % 128 == 0:
                guard(check, deadline)
            if value is not None and (not finite_number(value) if output_type == 'numeric_series' else type(value) is not bool):
                raise ValidationError('比较输出必须符合声明类型且为有限值或明确缺失')
    if not isinstance(left_units, str) or not isinstance(right_units, str):
        raise ValidationError('比较输出单位声明必须为文字')
    counts = {key: 0 for key in COUNT_FIELDS}
    counts.update(total_rows=size, warmup_rows=warmup, compared_rows=size - warmup)
    absolute, relative = (Fraction(str(policy[key])) for key in ('absolute_tolerance', 'relative_tolerance'))
    max_absolute = max_relative = None
    classifications, differences = [], []
    compatible_type = left_output_type == right_output_type
    for index in range(warmup, size):
        if index % 128 == 0:
            guard(check, deadline)
        left, right = left_values[index], right_values[index]
        counts['left_missing'] += int(left is None)
        counts['right_missing'] += int(right is None)
        if left is None and right is None:
            kind = 'both_missing'; counts['both_missing'] += 1
        elif left is None or right is None:
            kind = 'left_missing' if left is None else 'right_missing'
            counts['missing_mismatches'] += 1
        else:
            counts['common_valid'] += 1
            if not compatible_type:
                kind = 'incompatible_type'
            else:
                if left_output_type == 'numeric_series':
                    a, b = Fraction(str(left)), Fraction(str(right))
                    difference, scale = abs(a - b), max(abs(a), abs(b))
                    relative_error = difference / scale if scale else Fraction(0)
                    max_absolute = difference if max_absolute is None else max(max_absolute, difference)
                    max_relative = relative_error if max_relative is None else max(max_relative, relative_error)
                    equal = difference <= absolute + relative * scale
                else:
                    equal = left is right
                kind = 'within_tolerance' if equal else 'value_mismatch'
                counts['within_tolerance' if equal else 'value_mismatches'] += 1
        classifications.append([index, timestamps[index], kind])
        if kind in ('left_missing', 'right_missing', 'value_mismatch') and len(differences) < EXAMPLES:
            differences.append({'index': index, 'timestamp': timestamps[index], 'left': left, 'right': right, 'kind': kind})
    limitations = list(LIMITATIONS)
    unknown = {'', 'unknown', '未知', '未说明', 'none', 'null', 'n/a'}
    known_units = left_units.strip().lower() not in unknown and right_units.strip().lower() not in unknown
    compatible_units = known_units and left_units == right_units
    if counts['common_valid'] < MIN_COMMON:
        limitations.append('共同非缺失输出不足30行，不能确认当前样本的一致性。')
    if not compatible_type:
        limitations.append('两侧声明输出类型不同，共同有效行未进行数值或布尔强制转换比较。')
    if not compatible_units:
        limitations.append('两侧输出单位未知或声明不一致，数值接近不能证明同一数量含义。')
    if left_role != right_role:
        limitations.append('两侧模块用途不同，观察输出接近不证明可互换。')
    status = ('fail' if counts['missing_mismatches'] or counts['value_mismatches'] else
              'pass' if counts['common_valid'] >= MIN_COMMON and compatible_type and compatible_units and left_role == right_role else 'inconclusive')
    value = {'version': 1, 'method': METHOD, 'claim': CLAIM, 'status': status, 'evaluation_status': 'completed',
        'counts': counts, 'start': timestamps[0], 'end': timestamps[-1], 'comparison_start': timestamps[warmup],
        'output_hashes': {'left': digest(list(zip(timestamps, left_values))), 'right': digest(list(zip(timestamps, right_values)))},
        'classification_hash': digest(classifications), 'max_abs_error': error_text(max_absolute),
        'max_relative_error': error_text(max_relative), 'first_difference': differences[0] if differences else None,
        'differences': differences, 'limitations': limitations}
    guard(check, deadline)
    return value
