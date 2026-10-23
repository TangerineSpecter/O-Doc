"""Stable record identities, deterministic conflict selection and accumulated facts."""

from __future__ import annotations

from system_settings.sync_state import PERMANENT_DELETE_HASH_PREFIX, canonical_hash, sync_entity_identity

def choice_map(resolutions, resolution_default):
    chosen = {}
    if isinstance(resolutions, dict):
        pairs = resolutions.items()
    elif isinstance(resolutions, list):
        pairs = ((item.get('key'), item.get('side')) for item in resolutions if isinstance(item, dict))
    else:
        pairs = ()
    for key, side in pairs:
        if key and side in ('local', 'remote'):
            chosen[str(key)] = side
    default = resolution_default if resolution_default in ('local', 'remote') else ''
    return chosen, default


def pick_revision(local_changed, remote_changed, local_rev, remote_rev, choice):
    both_differ = bool(local_changed and remote_changed and local_rev != remote_rev)
    if both_differ and choice in ('local', 'remote'):
        return (local_rev if choice == 'local' else remote_rev), True
    if is_permanent_delete(local_rev) != is_permanent_delete(remote_rev):
        return revision_winner(local_rev, remote_rev), both_differ
    if both_differ:
        return revision_winner(local_rev, remote_rev), True
    if remote_changed:
        return remote_rev, False
    return local_rev, False


def item_label(item):
    if not item:
        return '（这一侧没有记录）'
    fields = item.get('fields') or {}
    for name in ('title', 'name', 'content', 'summary', 'username'):
        value = fields.get(name)
        if isinstance(value, str) and value.strip():
            return value.strip().replace('\n', ' ')[:80]
    return str(item.get('pk'))


def automatic_memory(item):
    if not item or item.get('model') != 'system_settings.agentlongtermmemory':
        return False
    from system_settings.agent_world.memory.sync import is_automatic
    return is_automatic(item)


def revision_key(model_label, identity):
    return f'{model_label}:{identity}'


def item_identity(item):
    """跨设备主键可能不同的内置模型使用业务稳定键。"""
    return sync_entity_identity(item.get('model'), item['pk'], item.get('fields') or {})


def item_map(data_list):
    return {
        revision_key(item['model'], item_identity(item)): item
        for item in data_list
        if item.get('model') and item.get('pk') is not None
    }


def revision_changed(base, candidate):
    return (base or {}).get('hash') != (candidate or {}).get('hash') or bool((base or {}).get('deleted')) != bool((candidate or {}).get('deleted'))


def is_permanent_delete(revision):
    return bool(revision.get('deleted')) and str(revision.get('hash', '')).startswith(PERMANENT_DELETE_HASH_PREFIX)


def revision_winner(local_revision, remote_revision):
    """Permanent purges win; normal delete/edit conflicts preserve the edit."""
    local_purged = is_permanent_delete(local_revision)
    remote_purged = is_permanent_delete(remote_revision)
    if local_purged != remote_purged:
        return local_revision if local_purged else remote_revision
    if bool(local_revision.get('deleted')) != bool(remote_revision.get('deleted')):
        return remote_revision if local_revision.get('deleted') else local_revision
    local_at = local_revision.get('revision_at', '')
    remote_at = remote_revision.get('revision_at', '')
    if remote_at > local_at:
        return remote_revision
    if remote_at < local_at:
        return local_revision
    return remote_revision if remote_revision.get('origin_device', '') > local_revision.get('origin_device', '') else local_revision


def merge_records(base, local_data, local_revisions, remote, *, resolutions=None, resolution_default=''):
    """Merge rows and cumulative facts; no ORM writes, media I/O or domain healing."""
    base_data = item_map((base or {}).get('data') or [])
    base_revisions = (base or {}).get('revisions') or {}
    local_map = item_map(local_data)
    remote_map = item_map(remote.get('data') or [])
    remote_revisions = remote.get('revisions') or {}
    chosen, choice_default = choice_map(resolutions, resolution_default)
    result, result_revisions = [], {}
    summary = {
        'created': 0, 'updated': 0, 'deleted': 0, 'conflicts': 0,
        'choice_items': [], 'choice_total': 0, 'integrity_warnings': [],
    }

    keys = set(base_revisions) | set(local_revisions) | set(remote_revisions) | set(local_map) | set(remote_map)
    for key in sorted(keys):
        base_rev = base_revisions.get(key, {'deleted': True, 'hash': ''})
        local_rev = local_revisions.get(key, {'deleted': True, 'hash': ''})
        remote_rev = remote_revisions.get(key, {'deleted': True, 'hash': ''})
        local_changed = revision_changed(base_rev, local_rev)
        remote_changed = revision_changed(base_rev, remote_rev)
        choice = chosen.get(key) or choice_default
        winner, is_conflict = pick_revision(local_changed, remote_changed, local_rev, remote_rev, choice)
        if is_conflict:
            summary['conflicts'] += 1
            local_item = local_map.get(key)
            remote_item = remote_map.get(key)
            if not (automatic_memory(local_item) or automatic_memory(remote_item)):
                summary['choice_total'] += 1
                if len(summary['choice_items']) < 200:
                    suggested = 'local' if revision_winner(local_rev, remote_rev) == local_rev else 'remote'
                    model = (local_item or remote_item or {}).get('model') or key.split(':', 1)[0]
                    summary['choice_items'].append({
                        'key': key,
                        'model': model,
                        'label': item_label(local_item),
                        'remote_label': item_label(remote_item),
                        'local_at': local_rev.get('revision_at') or '',
                        'remote_at': remote_rev.get('revision_at') or '',
                        'suggested': suggested,
                    })
        result_revisions[key] = winner
        if winner.get('deleted'):
            summary['deleted'] += 1
            continue
        item = remote_map.get(key) if winner is remote_rev else local_map.get(key)
        if item is None:
            # A legacy/v1 manifest has no per-row state; absence is never treated as deletion.
            item = local_map.get(key) or remote_map.get(key)
        if item is not None:
            if item.get('model') == 'system_settings.agenttokenusage':
                from system_settings.token_usage.sync import merge_usage_fact
                merged_usage = merge_usage_fact(item, [base_data.get(key), local_map.get(key), remote_map.get(key)])
                if merged_usage != item:
                    item = merged_usage
                    result_revisions[key] = {**winner, 'hash': canonical_hash(item.get('fields') or {})}
            # 阅读是累积事实，不能被另一设备的标题/评分更新清空。
            # 仅合并标记，其余字段及删除墓碑仍按原记录规则处理。
            if item.get('model') == 'article.article' and any(
                candidate and (candidate.get('fields') or {}).get('agent_post_has_been_read') is True
                for candidate in (base_data.get(key), local_map.get(key), remote_map.get(key))
            ) and (item.get('fields') or {}).get('agent_post_has_been_read') is not True:
                item = {**item, 'fields': {**(item.get('fields') or {}), 'agent_post_has_been_read': True}}
                # 合成记录必须有匹配的修订哈希，避免下一轮误判变化。
                result_revisions[key] = {**winner, 'hash': canonical_hash(item['fields'])}
            result.append(item)
            if key not in base_data:
                summary['created'] += 1
            elif local_changed or remote_changed:
                summary['updated'] += 1
    return result, result_revisions, summary
