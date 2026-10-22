"""Complete research snapshots. Local execution permissions are never restored."""
import hashlib
import json
from datetime import date
from django.core import serializers
from utils.sync_datetime import SyncJSONEncoder
from system_settings.sync_state import canonical_hash

SCHEMA_VERSION = 1
LABELS = {'quant.entry', 'quant.implementation', 'quant.codeversion', 'quant.backtest', 'quant.attachment', 'quant.airun'}


def manifest(data: list) -> dict:
    return {label: sorted(str(row['pk']) for row in data if row.get('model') == label)
            for label in sorted({row['model'] for row in data if row.get('model', '').startswith('quant.')})}


def metadata(data=None) -> dict:
    if data is None:
        from django.apps import apps
        data = []
        for model in apps.get_app_config('quant').get_models():
            if model._meta.model_name != 'job':
                data += json.loads(serializers.serialize('json', model.objects.all(), cls=SyncJSONEncoder))
    return {'quant_schema_version': SCHEMA_VERSION, 'quant_manifest': manifest(data),
        'quant_record_hashes': {f"{row['model']}:{row['pk']}": canonical_hash(row['fields'])
                                for row in data if row.get('model', '').startswith('quant.')}}


def validate(data: list, meta=None) -> None:
    from utils.sync_manager import SyncError
    from .models import CodeVersion, Entry, Implementation
    from .services import parse_result
    meta = meta or {}

    def fail(message='量化快照归属、版本或附件引用不完整，拒绝恢复'):
        raise SyncError(message)

    schema_version = meta.get('quant_schema_version', 0)
    if type(schema_version) is not int or schema_version < 0:
        fail('量化快照版本格式无效，拒绝恢复')
    if schema_version > SCHEMA_VERSION:
        fail('量化快照版本高于本机，请升级所有设备')
    actual = metadata(data)
    for field in ('quant_manifest', 'quant_record_hashes'):
        if field in meta and meta[field] != actual[field]:
            fail('量化快照记录或校验不完整，拒绝恢复')
    rows = {}
    for row in data:
        label = row.get('model', '')
        if label.startswith('quant.'):
            if label not in LABELS or not isinstance(row.get('fields'), dict):
                fail('量化快照包含未知类型或本机执行授权，拒绝恢复')
            identity = str(row['pk'])
            if identity in rows.setdefault(label, {}):
                fail('量化快照包含重复记录，拒绝恢复')
            rows[label][identity] = row['fields']
    anthologies = {str(row['pk']): row['fields'] for row in data if row.get('model') == 'anthology.anthology'}
    assets = {str(row['pk']): row['fields'] for row in data if row.get('model') == 'assets.asset'}
    entries, implementations, versions, backtests, runs = (rows.get('quant.' + name, {})
        for name in ('entry', 'implementation', 'codeversion', 'backtest', 'airun'))
    for anthology in anthologies.values():
        if anthology.get('type') == 'quant' and anthology.get('permission') != 'private':
            fail('量化文集必须保持私密，拒绝恢复')

    def version_entry(version_id):
        version = versions.get(str(version_id), {})
        implementation = implementations.get(str(version.get('implementation')), {})
        return str(implementation.get('entry', ''))

    for identity, fields in entries.items():
        anthology = anthologies.get(str(fields.get('anthology')), {})
        if anthology.get('type') != 'quant' or anthology.get('permission') != 'private' or not anthology.get('user_id'):
            fail()
        if fields.get('kind') not in Entry.KINDS or not isinstance(fields.get('title'), str) or not fields['title'].strip():
            fail()
        if not isinstance(fields.get('content', ''), str) or not isinstance(fields.get('tags', []), list) or any(not isinstance(tag, str) for tag in fields.get('tags', [])):
            fail()
        source_url = fields.get('source_url', '')
        if not isinstance(source_url, str) or (source_url and not source_url.lower().startswith(('https://', 'http://'))):
            fail('量化研究来源链接格式无效，拒绝恢复')
    for identity, fields in implementations.items():
        if str(fields.get('entry')) not in entries or fields.get('language') not in Implementation.LANGUAGES:
            fail()
        pointer = fields.get('current_version_id')
        version = versions.get(str(pointer), {})
        if str(version.get('implementation')) != identity:
            fail()
        if any(fields.get(field, '') != version.get(field, '') for field in ('language', 'language_version', 'dependencies', 'parameters')):
            fail('量化实现与当前代码版本快照不一致，拒绝恢复')
    local_versions = {str(item['id']): item for item in CodeVersion.objects.filter(pk__in=versions)
                      .values('id', *CodeVersion.SNAPSHOT_FIELDS)} if versions else {}
    for identity, fields in versions.items():
        implementation = implementations.get(str(fields.get('implementation')))
        code = fields.get('code')
        if not implementation or not isinstance(code, str) or hashlib.sha256(code.encode()).hexdigest() != fields.get('content_hash'):
            fail('量化代码缺失或哈希不一致，拒绝恢复')
        if fields.get('language') not in Implementation.LANGUAGES or any(fields.get(field) not in CodeVersion.CHECKS for field in ('compile_check', 'run_check', 'result_check')):
            fail()
        source = fields.get('source_version_id')
        if source and (str(source) == identity or version_entry(source) != str(implementation['entry'])):
            fail()
        local = local_versions.get(identity)
        if local:
            for field in CodeVersion.SNAPSHOT_FIELDS:
                incoming = fields.get('implementation' if field == 'implementation_id' else field)
                if local[field] != incoming:
                    fail('同一量化代码版本的不可变内容发生冲突，拒绝覆盖')
    for fields in backtests.values():
        eid = str(fields.get('entry'))
        if eid not in entries or (fields.get('version') and version_entry(fields['version']) != eid):
            fail()
        metrics = fields.get('metrics', [])
        if not isinstance(metrics, list) or any(not isinstance(metric, dict) or not all(isinstance(metric.get(key), str) for key in ('name', 'value')) for metric in metrics):
            fail('量化回测指标格式无效，拒绝恢复')
        for field in ('start_date', 'end_date'):
            value = fields.get(field, '')
            if value:
                try:
                    if date.fromisoformat(value).isoformat() != value:
                        fail()
                except (ValueError, TypeError):
                    fail()
        if fields.get('start_date') and fields.get('end_date') and fields['start_date'] > fields['end_date']:
            fail()
    for fields in rows.get('quant.attachment', {}).values():
        eid = str(fields.get('entry'))
        entry = entries.get(eid, {})
        anthology = anthologies.get(str(entry.get('anthology')), {})
        asset = assets.get(str(fields.get('asset')), {})
        if not entry or not asset or not asset.get('is_valid', True) or asset.get('uploader') != anthology.get('user_id'):
            fail('量化附件缺失或不属于文集所有者，拒绝恢复')
        implementation_id, version_id, backtest_id = (fields.get(key) for key in ('implementation', 'version', 'backtest'))
        if implementation_id and str(implementations.get(str(implementation_id), {}).get('entry')) != eid:
            fail()
        if version_id and (version_entry(version_id) != eid or (implementation_id and str(versions[str(version_id)]['implementation']) != str(implementation_id))):
            fail()
        if backtest_id and str(backtests.get(str(backtest_id), {}).get('entry')) != eid:
            fail()
        if backtest_id and version_id and backtests[str(backtest_id)].get('version') and str(backtests[str(backtest_id)]['version']) != str(version_id):
            fail()
    statuses = {'pending', 'running', 'completed', 'failed', 'cancelled', 'interrupted'}
    request_keys = set()
    for fields in runs.values():
        eid = str(fields.get('entry'))
        if eid not in entries or version_entry(fields.get('source_version')) != eid or fields.get('kind') not in ('explain', 'convert') or fields.get('status') not in statuses:
            fail()
        request_key = (eid, fields.get('request_key'))
        if not request_key[1] or request_key in request_keys:
            fail('量化任务请求标识冲突，拒绝恢复')
        request_keys.add(request_key)
        if fields.get('kind') == 'convert' and fields.get('target_language') not in Implementation.LANGUAGES:
            fail()
        if fields.get('status') == 'completed':
            try:
                parse_result(fields['kind'], json.dumps(fields.get('result', {}), ensure_ascii=False))
            except Exception as exc:
                # Snapshot validation only; no provider calls or business writes.
                raise SyncError('量化 AI 成果格式不完整，拒绝恢复') from exc
        elif fields.get('result'):
            fail('量化快照包含未完成的候选结果，拒绝恢复')
        adopted = fields.get('adopted_implementation_id')
        if adopted and (fields.get('status') != 'completed' or fields.get('kind') != 'convert' or str(implementations.get(str(adopted), {}).get('entry')) != eid):
            fail()


def reset_execution() -> None:
    from .models import AIRun, Job
    Job.objects.all().delete()
    for run in AIRun.objects.filter(status__in=['pending', 'running']):
        run.status = 'interrupted'
        run.error = '数据已恢复，请手动重试；不会自动调用模型'
        run.save(update_fields=['status', 'error', 'updated_at'])
