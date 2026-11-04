"""Revalidate legacy solo summaries against the still-retained source."""
from collections import defaultdict

from utils.sync_policy import SyncError
from .party_daily import FACT, RUN
from .solo_settlement import ENCOUNTER, SETTLEMENT, project, record


def validate_source(data, meta=None, *, archives=None):
    stored = {}
    for row in data:
        if row['model'] != SETTLEMENT:
            continue
        identity = str(row['pk'])
        if identity in stored:
            raise SyncError('旧单人战斗结算存在重复身份')
        stored[identity] = row
    if not stored:
        return
    if meta is not None and meta.get('combat_schema_version', 0) < 19:
        raise SyncError('旧单人压缩结算需要战斗同步19')
    if archives is None:
        from .retention_sync import archive_index
        archives = archive_index(data, meta)
    slices = defaultdict(list)
    for row in data:
        model, identity, fields = row['model'], str(row['pk']), row['fields']
        run_id = identity if model == RUN else fields.get('exploration_id') if model in (FACT, ENCOUNTER) else None
        if run_id in stored:
            slices[run_id].append(row)
    try:
        for identity, row in stored.items():
            archived = archives['solos'].get(identity)
            if row != record(archived if archived else project(slices[identity], identity)):
                raise SyncError('旧单人结算与原始来源、经验或掉落不一致')
    except (KeyError, TypeError, ValueError, AttributeError, IndexError) as exc:
        raise SyncError('旧单人结算无法由完整来源核对') from exc


def validate_conflicts(local, remote):
    left = {str(row['pk']): row['fields'] for row in local if row['model'] == SETTLEMENT}
    for row in remote:
        identity = str(row['pk'])
        if row['model'] == SETTLEMENT and identity in left and left[identity] != row['fields']:
            raise SyncError('同一旧单人战斗结算的来源或结果不一致')
