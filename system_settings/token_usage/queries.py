from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from django.db.models import QuerySet
from rest_framework.request import Request
from django.db.models import BigIntegerField, Count, Max, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from .models import AgentTokenUsage
from system_settings.agent_world.life_time import local_time, storage_time

SHANGHAI = ZoneInfo('Asia/Shanghai')
PURPOSES = {'task', 'planning', 'im', 'memory', 'social', 'profile', 'learning', 'preview', 'sprout'}


def visible_usage(request: Request | None = None) -> QuerySet:
    rows = AgentTokenUsage.objects.all()
    if request is not None:
        from utils.drf_utils import get_current_user_identifier
        owner = get_current_user_identifier(request)
        rows = rows.filter(Q(owner_key='') | Q(owner_key=owner))
    return rows


def filtered_usage(request: Request) -> QuerySet:
    rows = visible_usage(request)
    params = request.query_params
    today = local_time().date()
    if params.get('all') != '1':
        start = datetime.strptime(params.get('start_date') or str(today), '%Y-%m-%d').date()
        end = datetime.strptime(params.get('end_date') or str(today), '%Y-%m-%d').date()
        if start > end:
            raise ValueError('开始日期不能晚于结束日期')
        rows = rows.filter(started_at__gte=storage_time(datetime.combine(start, time.min, SHANGHAI)),
                           started_at__lt=storage_time(datetime.combine(end + timedelta(days=1), time.min, SHANGHAI)))
    for param, field in (('agent_id', 'agent_key'), ('task_id', 'task_key'), ('record_id', 'record_key')):
        key = params.get(param)
        if key is not None:
            rows = rows.filter(**{field: key})
    purpose = params.get('purpose')
    if purpose:
        if purpose not in PURPOSES:
            raise ValueError('调用用途无效')
        rows = rows.filter(purpose=purpose)
    if params.get('other') == '1':
        rows = rows.filter(task_key='')
    return rows


def metrics() -> dict:
    return {
        'input_tokens': Coalesce(Sum('input_tokens'), 0, output_field=BigIntegerField()),
        'output_tokens': Coalesce(Sum('output_tokens'), 0, output_field=BigIntegerField()),
        'total_tokens': Coalesce(Sum('total_tokens'), 0, output_field=BigIntegerField()),
        'request_count': Count('id'),
        'incomplete_count': Count('id', filter=Q(usage_complete=False) | Q(status='running')),
        'execution_count': Count('record_key', distinct=True, filter=~Q(record_key='')),
    }


def total(rows: QuerySet) -> dict:
    result = rows.aggregate(**metrics())
    return finish_metrics(result)


def finish_metrics(result: dict) -> dict:
    result['collected'] = result['request_count'] > 0
    result['average_tokens'] = round(result['total_tokens'] / result['execution_count']) if result['execution_count'] else None
    return result


def summary(rows: QuerySet, request: Request) -> dict:
    result = total(rows)
    result['days'] = list(rows.annotate(day=TruncDate('started_at', tzinfo=SHANGHAI)).values('day')
                          .annotate(**metrics()).order_by('day'))
    accessible = visible_usage(request)
    result['agents'] = list(accessible.values('agent_key').annotate(name=Max('agent_name')).order_by('name'))
    result['tasks'] = list(accessible.exclude(task_key='').values('task_key').annotate(name=Max('task_name')).order_by('name'))
    return result


def breakdown(rows: QuerySet, group: str, page: int) -> dict:
    mapping = {'agent': ('agent_key', 'agent_name'), 'task': ('task_key', 'task_name'),
               'purpose': ('purpose', None), 'record': ('record_key', 'task_name')}
    if group not in mapping:
        raise ValueError('统计维度无效')
    key, name = mapping[group]
    if group in ('task', 'record'):
        rows = rows.exclude(**{key: ''})
    annotations = metrics()
    annotations['last_at'] = Max('started_at')
    if name:
        annotations['name'] = Max(name)
    groups = rows.values(key).annotate(**annotations).order_by('-total_tokens', key)
    count = groups.count()
    items = []
    for item in groups[(page - 1) * 30:page * 30]:
        item['last_at'] = local_time(item['last_at']).isoformat()
        item['key'] = item.pop(key)
        item.setdefault('name', item['key'])
        items.append(finish_metrics(item))
    return {'items': items, 'total': count, 'page': page, 'has_more': page * 30 < count}


def record_summaries(keys: list[str], request: Request | None = None) -> dict:
    rows = visible_usage(request).filter(record_key__in=keys)
    results = {key: {'collected': False, 'input_tokens': 0, 'output_tokens': 0, 'total_tokens': 0,
                     'request_count': 0, 'incomplete_count': 0, 'execution_count': 0, 'average_tokens': None, 'agents': []} for key in keys}
    for item in rows.values('record_key').annotate(**metrics()):
        key = item.pop('record_key')
        results[key] = {**finish_metrics(item), 'agents': []}
    for item in rows.values('record_key', 'agent_key').annotate(name=Max('agent_name'), **metrics()):
        key = item.pop('record_key')
        item['key'] = item.pop('agent_key')
        results[key]['agents'].append(finish_metrics(item))
    return results
