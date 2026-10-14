"""同步保留归档身份，名称校验先于写回；不猜测或合并同名居民。"""
import uuid

from .models import Agent, AgentExecutionLease, AgentMemoryLease


def validate_names(data, *, retained=None):
    from utils.sync_manager import SyncError
    names = {}
    rows = {str(row['pk']): row for row in data if row.get('model') == 'system_settings.agent'}
    final = dict(retained or {})
    for identity, row in rows.items():
        raw = row.get('fields', {}).get('name')
        if not isinstance(raw, str):
            raise SyncError(f'居民名称无效，拒绝同步；ID：{identity}')
        name = raw.strip()
        final[identity] = name
    for identity, name in final.items():
        if not name or name in names:
            raise SyncError(f'居民名称为空或重复，拒绝同步：{name!r}；ID：{names.get(name, "")}, {identity}')
        names[name] = identity
    return rows


def prepare_restore(data, *, full_overwrite, retain_extra):
    local = {agent.pk: agent for agent in Agent.objects.all()}
    rows = validate_names(data, retained={key: agent.name for key, agent in local.items()} if retain_extra else None)
    for identity, row in rows.items():
        fields = row['fields']
        fields['name'] = fields['name'].strip()
        from .agent_role import validate_profile
        from utils.sync_manager import SyncError
        if 'role_profile' not in fields:
            fields['role_profile'] = local[identity].role_profile if not full_overwrite and identity in local else {}
        try:
            fields['role_profile'] = validate_profile(fields['role_profile'])
        except ValueError as exc:
            raise SyncError('角色设定无效，拒绝同步：' + str(exc)) from exc
        if 'archived_at' not in fields:
            archived = local[identity].archived_at if not full_overwrite and identity in local else None
            fields['archived_at'] = archived.isoformat() if archived else None
    archived = {identity for identity, row in rows.items() if row['fields'].get('archived_at')}
    for row in data:
        if row.get('model') == 'system_settings.marketlisting' and row['fields'].get('status') == 'active' and row['fields'].get('seller_id') in archived:
            from utils.sync_manager import SyncError
            raise SyncError('归档居民仍有在售挂牌，快照缺少完整下架事实，拒绝恢复')
    return rows


def release_changed_names(rows, *, retain_extra):
    # 唯一约束立即检查。临时名称仅在恢复事务内使用，支持 A/B 交换名称及旧 ID 替换。
    for agent in Agent.objects.all():
        row = rows.get(agent.pk)
        if (row and row['fields']['name'] != agent.name) or (not row and not retain_extra):
            Agent.objects.filter(pk=agent.pk).update(name='__sync_' + uuid.uuid4().hex)


def revoke_archived_execution():
    from .feishu_im_ws import _feishu_im_ws_manager
    from django.db import transaction
    archived = list(Agent.objects.filter(archived_at__isnull=False).values_list('pk', flat=True))
    AgentExecutionLease.objects.filter(agent_id__in=archived).update(token='', until=None)
    AgentMemoryLease.objects.filter(pk__in=archived).update(token='', until=None)
    for identity in archived:
        transaction.on_commit(lambda key=identity: _feishu_im_ws_manager.stop_agent(key))
