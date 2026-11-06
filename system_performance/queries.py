from collections import defaultdict
from datetime import datetime, timedelta, timezone as utc
from django.utils import timezone
from .metrics import summarize
from .models import PerformanceBucket, PerformanceSample


def window(hours: int):
    end = timezone.now().replace(second=0, microsecond=0) + timedelta(minutes=1)
    return end - timedelta(hours=hours), end


def buckets(start, end, kind='', operation=''):
    query = PerformanceBucket.objects.filter(minute__gte=start, minute__lt=end)
    if kind:
        query = query.filter(dimensions__kind=kind)
    if operation:
        query = query.filter(dimensions__operation=operation)
    rows = list(query.order_by('-minute').values()[:20001])
    return rows[:20000], len(rows) > 20000


def overview(hours):
    start, end = window(hours)
    rows, truncated = buckets(start, end)
    groups = defaultdict(list)
    for row in rows:
        groups[row['dimensions']['kind']].append(row)
    intervals = defaultdict(list)
    step = max(60, int(hours * 3600 / 120))
    for row in rows:
        intervals[(int(row['minute'].timestamp()) // step * step, row['dimensions']['kind'])].append(row)
    trend = [dict(at=at, kind=kind, **summarize(items)) for (at, kind), items in sorted(intervals.items())]
    return dict(start=start.isoformat(), end=end.isoformat(), truncated=truncated, trend=trend, trend_step_seconds=step,
                by_kind={kind: summarize(items) for kind, items in groups.items()})


def rankings(hours, kind):
    start, end = window(hours)
    rows, truncated = buckets(start, end, kind)
    groups = defaultdict(list)
    for row in rows:
        dimensions = row['dimensions']
        key = (dimensions['operation'], dimensions.get('method'), str(dimensions.get('build')), dimensions.get('policy_version'), dimensions.get('model_name'), dimensions.get('provider_name'), dimensions['kind'])
        groups[key].append(row)
    result = [dict(operation=key[0], method=key[1], build=items[0]['dimensions'].get('build'),
                   policy_version=key[3], model_name=key[4], provider_name=key[5], kind=key[6], **summarize(items)) for key, items in groups.items()]
    result.sort(key=lambda row: row['total_ms'], reverse=True)
    return dict(rows=result[:100], truncated=truncated or len(result) > 100)


def sample_list(hours, kind='', operation='', page=1):
    start, end = window(hours)
    query = PerformanceSample.objects.filter(created__gte=start, created__lt=end)
    if kind:
        query = query.filter(kind=kind)
    if operation:
        query = query.filter(operation=operation)
    total = query.count()
    return dict(total=total, page=page, rows=list(query.order_by('-created').values(
        'id', 'created', 'kind', 'operation', 'duration_ms', 'status')[(page - 1) * 20:page * 20]))


def baseline(event: dict):
    started = datetime.fromtimestamp(event['started'], utc.utc).replace(second=0, microsecond=0)
    rows, truncated = buckets(started - timedelta(minutes=15), started + timedelta(minutes=16), event['kind'], event['operation'])
    comparable = [r for r in rows if r['dimensions'].get('build') == event['build']
                  and r['dimensions'].get('policy_version') == event['policy_version']
                  and r['dimensions'].get('method') == event.get('method')
                  and r['dimensions'].get('model_name') == event.get('model_name')
                  and r['dimensions'].get('provider_name') == event.get('provider_name')]
    same = [r for r in comparable if r['dimensions']['status'] == event['status']]
    return dict(duration_comparison=summarize(same), all_results=summarize(comparable),
                start=(started - timedelta(minutes=15)).isoformat(), end=(started + timedelta(minutes=16)).isoformat(),
                truncated=truncated, note='目标事件可能包含于总体；耗时对照按同结果筛选，错误率以全部结果为分母')
