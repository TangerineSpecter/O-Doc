"""One evidence snapshot drives both human-readable and machine-readable output."""
import hashlib
import io
import json
import sqlite3
import uuid
import zipfile
from datetime import datetime, timezone
from djangorestframework_camel_case.util import camelize
from .queries import baseline


def associated_errors(event):
    # Existing logs aggregate many occurrences. Never label representative fields
    # such as task_id/duration_ms/request_id as facts of this occurrence.
    from system_logs.store import directory
    path = directory() / 'events.sqlite3'
    if not path.exists():
        return {'status': 'unavailable', 'reason': '本机尚无异常日志文件', 'rows': []}
    keys = []
    if event.get('fault_key'):
        keys.append(event['fault_key'])
    if event.get('model_call_id'):
        keys.append(f"model-call:{event['model_call_id']}:0")
    if event.get('model_request_id'):
        keys.append(f"model-request:{event['model_request_id']}")
    if event.get('request_id'):
        keys.append(f"{event['request_id']}:0")
    if not keys:
        return {'status': 'unknown', 'reason': '未采集可精确匹配的关联键', 'rows': []}
    fingerprints = [hashlib.sha256(key.encode()).hexdigest()[:16] for key in keys]
    try:
        with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=.1) as db:
            placeholders = ','.join('?' for _ in fingerprints)
            rows = db.execute(f'''SELECT DISTINCT e.id, e.detail FROM events e JOIN event_correlations c ON c.event_id=e.id
                WHERE c.fingerprint IN ({placeholders}) LIMIT 20''', fingerprints).fetchall()
        result = []
        for identity, raw in rows:
            detail = json.loads(raw)
            # No representative resource IDs, timestamp, duration, raw messages or stack.
            result.append(dict(aggregate_id=identity, scope='同日同类异常聚合；目标关联键命中，非本次独立明细',
                               error_type=detail.get('error_type'), exception_class=detail.get('exception_class'),
                               occurrence_count=detail.get('occurrence_count'), first_seen=detail.get('first_seen'),
                               last_seen=detail.get('last_seen')))
        return {'status': 'matched' if result else 'not_found', 'rows': result,
                'note': '未命中不证明没有异常，记录可能未落盘、过期或被清理'}
    except (sqlite3.Error, ValueError, OSError):
        return {'status': 'unavailable', 'reason': '只读关联日志查询失败', 'rows': []}


def make_bundle(event: dict, comparison: dict, errors: dict) -> bytes:
    identity = uuid.uuid4().hex
    evidence = dict(report_version=1, report_id=identity, exported_at=datetime.now(timezone.utc).isoformat(),
                    event=event, baseline=comparison, associated_errors=errors,
                    limitations=['SQL 仅有结构指纹，未采集 SQL 模板、参数和执行计划',
                                 '未采集 CPU、锁等待和原始业务输入，不能据此断言根因',
                                 '阶段可能嵌套或并行，子阶段耗时不能直接相加',
                                 '关联异常是已命中关联键的聚合分类，代表请求/任务/耗时不属于本次证据'])
    facts = [f"操作 `{event['operation']}`，耗时 {event['duration_ms']:.1f} ms，结果 {event['status']}。",
             f"SQL 共 {event.get('sql_count', 0)} 次，累计执行调用耗时 {event.get('sql_ms', 0):.1f} ms。"]
    hints = []
    if event.get('sql_count', 0) >= 50:
        hints.append('查询次数偏多：结合调用位置检查循环查询和批量预取机会；尚不能认定 N+1。')
    if event.get('sql_ms', 0) >= 500:
        hints.append('数据库调用累计耗时较高：核对热点 SQL 与执行计划；尚不能认定缺少索引。')
    evidence['facts'], evidence['investigation_hints'] = facts, hints
    payload = json.dumps(camelize(evidence), ensure_ascii=False, indent=2).encode()
    if len(payload) > 1024 * 1024:
        evidence['event'] = {**event, 'children': [], 'export_truncated': True}
        payload = json.dumps(camelize(evidence), ensure_ascii=False, indent=2).encode()
    report = ('# 性能诊断报告\n\n' + '\n\n'.join(facts)
              + '\n\n## 发生时构建版本\n\n```json\n' + json.dumps(event.get('build'), ensure_ascii=False, indent=2)
              + '\n```\n\n## 排查线索\n\n' + ('\n'.join(hints) or '暂无可确定的规则线索，结合下面的证据与源码核对。')
              + '\n\n## 完整诊断证据\n\n时间单位为毫秒，时间戳为 UTC 秒；缺失值不代表零。\n\n```json\n'
              + payload.decode().replace('```', '\\u0060\\u0060\\u0060') + '\n```\n').encode()
    files = {'report.md': report, 'evidence.json': payload}
    files['manifest.json'] = json.dumps(dict(reportVersion=1, reportId=identity,
        files={name: hashlib.sha256(data).hexdigest() for name, data in files.items()}), indent=2).encode()
    if sum(map(len, files.values())) > 2 * 1024 * 1024:
        raise ValueError('诊断报告超过大小上限')
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return output.getvalue()


def export_sample(sample):
    from .models import PerformanceSample
    event = dict(sample.evidence)
    if event.get('root_id') and event['root_id'] != event['id']:
        root = PerformanceSample.objects.filter(pk=event['root_id']).first()
        event['root_context'] = root.evidence if root else None
        event['root_context_status'] = 'available' if root else '未保存、未完成或已过期'
    return make_bundle(event, baseline(sample.evidence), associated_errors(sample.evidence))
