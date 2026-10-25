"""Compute fixed candidate IR outputs; uploaded platform code is never executed."""
import time
from rest_framework.exceptions import ValidationError
from quant.experiments.search import recipe
from quant.experiments.proposal_contract import validate_values
from quant.experiments.expression import calculate
from .output_compare import CLAIM, METHOD, COUNT_FIELDS, compare_outputs, guard, validate_policy, validate_timestamps


def _timestamps(snapshot: dict) -> list[str]:
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get('rows'), list):
        raise ValidationError('等价比较需要固定行情快照')
    try:
        return [row['timestamp'] for row in snapshot['rows']]
    except (TypeError, KeyError) as exc:
        raise ValidationError('行情缺少固定时间戳') from exc


def evaluate_pair(left: dict, right: dict, snapshot: dict, policy: dict, *, check=None, deadline: float | None = None) -> dict:
    deadline = time.monotonic() + 15 if deadline is None else deadline
    guard(check, deadline)
    timestamps = _timestamps(snapshot)
    validate_policy(policy, len(timestamps))
    validate_timestamps(timestamps, check=check, deadline=deadline)
    outputs = []
    for side in (left, right):
        if not isinstance(side, dict) or set(side) != {'candidate', 'bindings', 'parameters'}:
            raise ValidationError('比较两侧必须提供固定候选、输入绑定及全部实际参数')
        candidate, bindings, parameters = side['candidate'], side['bindings'], side['parameters']
        recipe(candidate, bindings, parameters)
        validate_values(candidate, parameters)
        guard(check, deadline)
        try:
            inputs = {name: [row[column] for row in snapshot['rows']] for name, column in bindings.items()}
        except (KeyError, TypeError) as exc:
            raise ValidationError('固定行情缺少比较输入列') from exc
        outputs.append(calculate(candidate['expression'], inputs, parameters, expected=candidate['output_type'], check=check, deadline=deadline))
    return compare_outputs(timestamps, *outputs, policy,
        left_output_type=left['candidate']['output_type'], right_output_type=right['candidate']['output_type'],
        left_units=left['candidate']['units'], right_units=right['candidate']['units'],
        left_role=left['candidate']['role'], right_role=right['candidate']['role'], check=check, deadline=deadline)


def failure_result(snapshot: dict, policy: dict, reason: str = 'timeout') -> dict:
    """A fixed non-comparison result; restoration must never retry its wall clock."""
    if reason != 'timeout':
        raise ValidationError('未知等价比较中断原因')
    timestamps = _timestamps(snapshot)
    validate_policy(policy, len(timestamps))
    validate_timestamps(timestamps)
    counts = {key: None for key in COUNT_FIELDS}
    counts.update(total_rows=len(timestamps), warmup_rows=policy['warmup_bars'], compared_rows=len(timestamps) - policy['warmup_bars'])
    return {'version': 1, 'method': METHOD, 'claim': CLAIM, 'status': 'inconclusive', 'evaluation_status': 'timed_out',
        'counts': counts, 'start': timestamps[0], 'end': timestamps[-1], 'comparison_start': timestamps[policy['warmup_bars']],
        'output_hashes': {'left': '', 'right': ''}, 'classification_hash': '', 'max_abs_error': None,
        'max_relative_error': None, 'first_difference': None, 'differences': [],
        'limitations': ['计算超过15秒预算，未完成逐行比较，不可用于合并。']}
