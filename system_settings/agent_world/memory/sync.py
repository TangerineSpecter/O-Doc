"""Automatic corpus + processing cursor form one restore/merge aggregate."""
import hashlib
import json
from copy import deepcopy
from system_settings.sync_state import canonical_hash

STATE = 'system_settings.agentmemorystate'
MEMORY = 'system_settings.agentlongtermmemory'
KEY = 'resident_memory_aggregates'


def is_automatic(row):
    fields = row.get('fields', {})
    info = (fields.get('metadata') or {}).get('world_memory', {})
    return row.get('model') == MEMORY and bool(info) and not info.get('human_override') and not fields.get('is_pinned', False)


def metadata(data):
    if data is None:
        from django.core import serializers
        from .models import AgentMemoryState
        from system_settings.models import AgentLongTermMemory
        data = json.loads(serializers.serialize('json', [*AgentMemoryState.objects.all(), *AgentLongTermMemory.objects.all()]))
    states = {str(r['pk']): r for r in data if r.get('model') == STATE}
    corpora = {pk: [] for pk in states}
    for row in data:
        if is_automatic(row):
            corpora.setdefault(str(row['fields']['agent']), []).append(row)
    hashes = {pk: hashlib.sha256(json.dumps({'state': states.get(pk), 'memories': sorted(rows, key=lambda r: str(r['pk']))},
              sort_keys=True, ensure_ascii=False).encode()).hexdigest() for pk, rows in corpora.items()}
    return {'resident_memory_schema_version': 1, KEY: hashes}


def validate_source(data, info):
    from utils.sync_manager import SyncError
    expected = metadata(data)[KEY]
    if (info or {}).get('resident_memory_schema_version', 0) > 1:
        raise SyncError('居民记忆版本过新，请升级所有同步设备')
    if expected and ((info or {}).get('resident_memory_schema_version') != 1 or (info or {}).get(KEY) != expected):
        raise SyncError('居民记忆快照缺少记忆或整理进度，拒绝恢复')
    if not expected and (info or {}).get(KEY):
        raise SyncError('居民记忆快照缺少整理状态，拒绝恢复')
    states = {str(r['pk']): r['fields'] for r in data if r.get('model') == STATE}
    profiles = {str(r['pk']): r['fields']['owner_id'] for r in data if r.get('model') == 'system_settings.lifeprofile'}
    source_models = {'farm': 'farmoperation', 'cooking': 'cookingoperation', 'market': 'markettransaction',
                     'investment': 'investmenttrade', 'travel': 'traveljourney', 'relation': 'socialevent',
                     'social': 'socialopportunity', 'publication': 'agentactivity'}
    facts = {(r['model'], str(r['pk'])): r['fields'] for r in data}
    farms = {str(r['pk']): r['fields'].get('owner_id') for r in data if r.get('model') == 'system_settings.agentfarm'}
    from types import SimpleNamespace
    from django.utils.dateparse import parse_datetime
    from ..life_time import local_time, storage_time
    from .sources import project

    def validate_ref(ref, actor, state):
        if not isinstance(ref, dict):
            raise SyncError('居民记忆活动来源格式无效')
        kind, _, pk = str(ref.get('id', '')).partition(':')
        source = facts.get(('system_settings.' + source_models.get(kind, ''), pk))
        if not source:
            raise SyncError('居民记忆缺少实际活动来源')
        source_actor = str(source.get('actor_id') or source.get('agent') or source.get('farm') or '')
        owner = farms.get(str(source.get('farm'))) if kind == 'farm' else source.get('owner_id', state['owner_id'])
        if source_actor != actor or owner != state['owner_id']:
            raise SyncError('居民记忆活动来源归属不一致')
        field = 'occurred_at' if kind == 'publication' else 'updated_at' if kind in ('travel', 'social') else 'created_at'
        native_text = source.get('snapshot', {}).get('memory_completed_at', '') if kind == 'travel' else source.get(field, '')
        at, native = parse_datetime(ref.get('at', '')), parse_datetime(native_text)
        if not at or not native:
            raise SyncError('居民记忆活动时间无效')
        at, native = storage_time(at), storage_time(native)
        if at.replace(microsecond=at.microsecond//1000*1000) != native.replace(microsecond=native.microsecond//1000*1000) or str(local_time(at).date()) != ref.get('day'):
            raise SyncError('居民记忆活动日期与原始来源不一致')
        if project(kind, SimpleNamespace(pk=pk, **source)) != ref.get('facts'):
            raise SyncError('居民记忆来源内容与实际活动不一致')

    for actor, state in states.items():
        if profiles.get(actor) != state['owner_id']:
            raise SyncError('居民记忆整理进度归属不一致')
        observations = state.get('observations', {})
        if not isinstance(observations, dict) or len(observations) > 100 or any(not isinstance(refs, list) or len(refs) > 3 for refs in observations.values()):
            raise SyncError('居民记忆偏好证据超过容量')
        for refs in observations.values():
            for ref in refs:
                validate_ref(ref, actor, state)
    for row in data:
        if not is_automatic(row):
            continue
        fields = row['fields']; actor = str(fields['agent'])
        state = states.get(actor)
        if not state or fields.get('scope') != 'agent' or fields.get('sender_id') or fields.get('chat_id'):
            raise SyncError('自动角色记忆缺少所属整理状态或范围无效')
        info = fields['metadata']['world_memory']
        if info.get('version') != 1 or type(info.get('importance')) is not int or not 1 <= info['importance'] <= 5 or not isinstance(info.get('topic'), str) or not info['topic'] or len(info['topic']) > 120 or len(fields.get('content', '')) > 300:
            raise SyncError('居民自动记忆规则或摘要无效')
        refs = info.get('sources', [])
        if not refs or len(refs) > 8:
            raise SyncError('居民记忆来源数量无效')
        if fields.get('memory_type') == 'preference' and len({ref.get('day') for ref in refs}) < 3:
            raise SyncError('居民偏好缺少三天实际证据')
        for ref in refs:
            validate_ref(ref, actor, state)

    for actor in states:
        for status in ('active', 'archived'):
            rows = [row['fields'] for row in data if is_automatic(row) and str(row['fields']['agent']) == actor and row['fields']['status'] == status]
            if len(rows) > 100 or sum(len(row.get('title', '')) + len(row.get('content', '')) for row in rows) > 10000:
                raise SyncError('居民自动记忆容量超限')


def merge_aggregates(result, revisions, local, remote, local_revisions, remote_revisions):
    """Called only after both source manifests validate; human edits retain normal merge semantics."""
    from system_settings.sync_state import get_device_id
    from django.utils import timezone
    states = {str(r['pk']): r for r in result if r.get('model') == STATE}
    protected = {str(r['pk']) for r in result if r.get('model') == MEMORY and not is_automatic(r)}
    old = [r for r in result if is_automatic(r)]
    result[:] = [r for r in result if not is_automatic(r)]
    selected_ids = set()
    for actor, state in states.items():
        local_state = next((r for r in local if r.get('model') == STATE and str(r['pk']) == actor), None)
        remote_state = next((r for r in remote if r.get('model') == STATE and str(r['pk']) == actor), None)
        # 同一整理进度下，固定/取消固定等逐记录修订已经完成合并。
        if local_state == remote_state == state:
            rows = [r for r in old if str(r['fields']['agent']) == actor]
            result.extend(rows)
            selected_ids.update(str(r['pk']) for r in rows)
            continue
        use_local = local_state == state
        source, source_revisions = (local, local_revisions) if use_local else (remote, remote_revisions)
        for row in source:
            if not is_automatic(row) or str(row['fields']['agent']) != actor or str(row['pk']) in protected:
                continue
            key = MEMORY + ':' + str(row['pk'])
            current = revisions.get(key, {})
            if current.get('deleted') and str(current.get('hash', '')).startswith('!'):
                continue
            result.append(deepcopy(row)); selected_ids.add(str(row['pk']))
            revisions[key] = deepcopy(source_revisions.get(key, {'hash': canonical_hash(row['fields']), 'deleted': False}))
    for row in old:
        if str(row['pk']) not in selected_ids:
            key = MEMORY + ':' + str(row['pk'])
            revisions[key] = {**revisions.get(key, {}), 'deleted': True, 'revision_at': timezone.now().isoformat(), 'origin_device': get_device_id()}
