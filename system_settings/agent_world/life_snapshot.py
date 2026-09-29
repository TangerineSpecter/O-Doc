"""校验合并来源，再为逐记录合并的生活数据计算派生指纹。"""
import hashlib
import json

from django.core import serializers
from django.core.serializers.json import DjangoJSONEncoder

MODELS = ('LifeConfig', 'LifeProfile', 'LifeGoal', 'LifeCycle', 'LifeItem', 'LifeRevision')
LABELS = {'system_settings.' + name.lower(): name for name in MODELS}
INTEGRITY = 'system_settings.lifeintegrity'


def snapshot_hashes(data: list[dict]) -> dict[str, dict[str, str]]:
    """恢复字段类型，使快照与数据库 values() 使用相同的指纹表示。"""
    selected = [row for row in data if row['model'] in LABELS]
    rows = {name: [] for name in MODELS}
    for restored in serializers.deserialize('json', json.dumps(selected)):
        obj = restored.object
        rows[type(obj).__name__].append({field.attname: getattr(obj, field.attname) for field in obj._meta.fields})
    item_owners = {row['id']: row['owner_id'] for row in rows['LifeItem']}
    owners = {row['id'] for row in rows['LifeConfig']}
    grouped = {}
    for name, values in rows.items():
        for row in values:
            owner = row['id'] if name == 'LifeConfig' else item_owners.get(row['item_id']) if name == 'LifeRevision' else row['owner_id']
            if owner is None:
                from utils.sync_manager import SyncError
                raise SyncError('生活调整记录缺少所属安排，拒绝合并')
            owners.add(owner)
            grouped.setdefault((owner, name), []).append(row)
    return {owner: {name: hashlib.sha256(json.dumps(
        sorted(grouped.get((owner, name), []), key=lambda row: row['id']),
        cls=DjangoJSONEncoder, sort_keys=True, separators=(',', ':'),
    ).encode()).hexdigest() for name in MODELS} for owner in owners}


def validate_source(data: list[dict]) -> None:
    from utils.sync_manager import SyncError
    expected = {row['pk']: row['fields']['hashes'] for row in data if row['model'] == INTEGRITY}
    if expected != snapshot_hashes(data):
        raise SyncError('生活来源快照缺少配置、目标、安排或调整记录，拒绝合并')


def refresh_merged_integrity(data: list[dict], revisions: dict) -> None:
    """仅在两个来源均通过完整性检查后调用；业务关联仍由恢复事务验证。"""
    from django.utils import timezone
    from utils.sync_manager import canonical_hash, get_device_id
    hashes = snapshot_hashes(data)
    checkpoints = {row['pk']: row for row in data if row['model'] == INTEGRITY}
    for owner, fingerprint in hashes.items():
        row = checkpoints.get(owner)
        if row and row['fields']['hashes'] == fingerprint:
            continue
        fields = {'hashes': fingerprint, 'updated_at': timezone.now().isoformat()}
        if row:
            row['fields'] = fields
        else:
            data.append({'model': INTEGRITY, 'pk': owner, 'fields': fields})
        key = f'{INTEGRITY}:{owner}'
        revisions[key] = {**revisions.get(key, {}), 'hash': canonical_hash(fields),
                          'revision_at': fields['updated_at'], 'origin_device': get_device_id(), 'deleted': False}
    # 合法墓碑可以删除最后一条生活配置；派生记录不能孤立保留。
    removed = set(checkpoints) - set(hashes)
    data[:] = [row for row in data if row['model'] != INTEGRITY or row['pk'] not in removed]
    for owner in removed:
        key = f'{INTEGRITY}:{owner}'
        revisions[key] = {**revisions.get(key, {}), 'deleted': True, 'revision_at': timezone.now().isoformat()}
