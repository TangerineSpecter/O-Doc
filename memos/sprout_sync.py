"""Versioned immutable sources/results; runtime permission never travels."""
from django.core import serializers
import json
from system_settings.sync_state import canonical_hash


def metadata(data=None):
    if data is None:
        from .models import Sprout, MemoCapture
        data = json.loads(serializers.serialize('json', Sprout.objects.all())) + json.loads(serializers.serialize('json', MemoCapture.objects.all()))
    rows = [r for r in data if r['model'] in ('memos.sprout', 'memos.memocapture')]
    return {'memo_sprout_schema_version': 1,
            'memo_sprout_hashes': {f"{r['model']}:{r['pk']}": canonical_hash(r['fields']) for r in rows}}


def validate(data, meta=None):
    from utils.sync_manager import SyncError
    if (meta or {}).get('memo_sprout_schema_version', 0) > 1:
        raise SyncError('闪念发芽快照版本过新，请升级所有设备')
    if any(r['model'] in ('memos.sproutjob', 'memos.memocaptureauthorization') for r in data):
        raise SyncError('闪念快照包含本机执行授权')
    hashes = (meta or {}).get('memo_sprout_hashes')
    if hashes is not None and hashes != metadata(data)['memo_sprout_hashes']:
        raise SyncError('闪念发芽记录缺失或内容校验失败')
    for row in data:
        fields = row.get('fields', {})
        if row['model'] == 'memos.sprout':
            sources = fields.get('sources')
            if not fields.get('owner_id') or not isinstance(sources, list) or not 2 <= len(sources) <= 5 or any(not isinstance(s, dict) or not isinstance(s.get('memo_id'), str) or not isinstance(s.get('content'), str) for s in sources):
                raise SyncError('闪念来源快照不完整')
            if fields.get('status') == 'ready':
                from .sprout_rules import validate_result
                result = fields.get('result', {})
                try:
                    validate_result({**result, 'source_urls': [r['url'] for r in result.get('references', [])]}, result.get('references', []))
                except (ValueError, KeyError, TypeError) as exc:
                    raise SyncError('发芽结果格式无效') from exc
        elif row['model'] == 'memos.memocapture':
            if not fields.get('owner_id') or not fields.get('agent_id'):
                raise SyncError('随手记机会归属不完整')


def reset_execution():
    from .models import Sprout, SproutJob
    from system_settings.agent_world.memo_capture import revoke_capture_execution
    revoke_capture_execution()
    # Importing facts revokes every local permission, including coincident local jobs.
    SproutJob.objects.all().delete()
    for row in Sprout.objects.filter(status__in=['pending', 'running']):
        row.status = 'interrupted'
        row.save(update_fields=['status', 'updated_at'])
