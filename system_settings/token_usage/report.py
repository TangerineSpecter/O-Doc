"""从同一次明细遍历生成报告和汇总；大文件写入临时存储而非媒体目录。"""
import json
from tempfile import SpooledTemporaryFile

from django.db.models import QuerySet
from django.http import FileResponse
from rest_framework.request import Request

from .queries import finish_metrics
from system_settings.agent_world.life_time import local_time

REPORT_FIELDS = (
    'id', 'agent_key', 'agent_name', 'task_key', 'task_name', 'record_key',
    'purpose', 'phase', 'model_key', 'model_name', 'provider_key', 'provider_name',
    'attempt', 'status', 'input_tokens', 'output_tokens', 'total_tokens',
    'cached_tokens', 'reasoning_tokens', 'usage_complete', 'started_at', 'ended_at',
)
GROUP_FIELDS = {
    'by_task': ('task_key', 'task_name'),
    'by_purpose': ('purpose',),
    'by_phase': ('purpose', 'phase'),
    'by_model_provider': ('model_key', 'model_name', 'provider_key', 'provider_name'),
}


def new_metrics() -> dict:
    return dict(input_tokens=0, output_tokens=0, total_tokens=0, request_count=0,
                incomplete_count=0, failed_count=0, running_count=0, records=set())


def add_metrics(stats: dict, row: dict) -> None:
    for field in ('input_tokens', 'output_tokens', 'total_tokens'):
        if row[field] is not None:
            stats[field] += row[field]
    stats['request_count'] += 1
    stats['incomplete_count'] += int(not row['usage_complete'] or row['status'] == 'running')
    stats['failed_count'] += int(row['status'] == 'failed')
    stats['running_count'] += int(row['status'] == 'running')
    if row['record_key']:
        stats['records'].add(row['record_key'])


def finish(stats: dict) -> dict:
    result = {key: value for key, value in stats.items() if key != 'records'}
    result['execution_count'] = len(stats['records'])
    return finish_metrics(result)


def effective_filters(request: Request, now) -> dict:
    params = request.query_params
    result = {key: params[key] for key in
              ('agent_id', 'task_id', 'record_id', 'purpose') if key in params}
    if params.get('other') == '1':
        result['other'] = '1'
    if params.get('all') == '1':
        result['all'] = '1'
    else:
        result.update(start_date=params.get('start_date') or str(now.date()),
                      end_date=params.get('end_date') or str(now.date()))
    return result


def export_report(rows: QuerySet, request: Request) -> FileResponse:
    now = local_time()
    stats = new_metrics()
    groups = {name: {} for name in GROUP_FIELDS}
    report_file = SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode='w+b')

    def write(value) -> None:
        report_file.write(json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8'))

    try:
        metadata = {
            'format_version': 1, 'generated_at': now.isoformat(), 'timezone': 'Asia/Shanghai',
            'filters': effective_filters(request, now),
            'scope': '当前账号可见且符合筛选条件的全部已采集请求，不受页面分页影响',
            'limitations': [
                '未知用量保留 null，汇总只累加已知值；未采集历史不补估算。',
                '报告不是服务商账单，不含凭据、提示词或模型响应正文。',
                '明细及汇总来自同一次遍历；运行中的状态可能在导出后更新。',
                '阶段不等于决策/生成角色，需结合任务代码分析。',
                '独立 Jev 演示未经过正式用量采集，不在此报告范围内。',
            ],
        }
        report_file.write(b'{"metadata":')
        write(metadata)
        report_file.write(b',"requests":[')
        # 单次查询按批读取，汇总使用导出的同一份请求事实，不再单独聚合查询。
        for row in rows.order_by('started_at', 'id').values(*REPORT_FIELDS).iterator(chunk_size=2000):
            if stats['request_count']:
                report_file.write(b',')
            add_metrics(stats, row)
            for name, fields in GROUP_FIELDS.items():
                key = tuple(row[field] for field in fields)
                group = groups[name].setdefault(key, new_metrics())
                add_metrics(group, row)
            start, end = row['started_at'], row['ended_at']
            row['elapsed_seconds'] = (end - start).total_seconds() if end and end >= start else None
            row['started_at'] = local_time(start).isoformat()
            row['ended_at'] = local_time(end).isoformat() if end else None
            write(row)
        report_file.write(b'],"summary":')
        write(finish(stats))
        for name, fields in GROUP_FIELDS.items():
            report_file.write((',' + json.dumps(name) + ':').encode('utf-8'))
            write([{**dict(zip(fields, key)), **finish(value)}
                   for key, value in sorted(groups[name].items(),
                                            key=lambda item: (-item[1]['total_tokens'], item[0]))])
        report_file.write(b'}')
        report_file.seek(0)
        return FileResponse(report_file, as_attachment=True,
                            filename=f'agent-token-usage-{now:%Y%m%d-%H%M%S}.json',
                            content_type='application/json; charset=utf-8')
    except Exception:
        # 构建失败时关闭临时文件，原异常继续交给现有 HTTP 错误处理。
        report_file.close()
        raise
