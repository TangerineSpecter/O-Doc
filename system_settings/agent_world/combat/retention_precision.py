"""Reconcile archive timestamps without discarding locally retained precision."""
from copy import deepcopy
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from system_settings.sync_state import canonical_hash
from utils.sync_policy import SyncError


def _instant(value):
    if not isinstance(value, str):
        raise ValueError('归档时间格式无效')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo('Asia/Shanghai'))
    return parsed.astimezone(timezone.utc)


def reconcile_party_times(left, right):
    """Accept only the precision loss introduced by existing snapshot encoding.

    Two different sub-millisecond values are genuine conflicts, not evidence
    that one side was restored from a millisecond-precision snapshot.
    """
    try:
        a, b = deepcopy(left), deepcopy(right)
        fields_a, fields_b = a['fields'], b['fields']
        archive_a, archive_b = fields_a['content']['archive'], fields_b['content']['archive']
        times_a, times_b = archive_a.pop('exact_event_times'), archive_b.pop('exact_event_times')
        fields_a.pop('digest')
        fields_b.pop('digest')
        if a != b or not isinstance(times_a, dict) or not isinstance(times_b, dict) or set(times_a) != set(times_b):
            raise ValueError('归档内容不同')
        chosen = {}
        for identity in sorted(times_a):
            first, second = _instant(times_a[identity]), _instant(times_b[identity])
            if first == second:
                chosen[identity] = min(times_a[identity], times_b[identity])
                continue
            floor_first = first.replace(microsecond=first.microsecond // 1000 * 1000)
            floor_second = second.replace(microsecond=second.microsecond // 1000 * 1000)
            if floor_first != floor_second or first.microsecond % 1000 and second.microsecond % 1000:
                raise ValueError('事件发生时间不同')
            chosen[identity] = times_a[identity] if first.microsecond % 1000 else times_b[identity]
        result = deepcopy(left)
        result['fields']['content']['archive']['exact_event_times'] = chosen
        result['fields']['digest'] = canonical_hash(result['fields']['content'])
        return result
    except (ValueError, TypeError, KeyError, AttributeError) as exc:
        raise SyncError('同一战斗的压缩归档存在分叉，不能自动合并') from exc
