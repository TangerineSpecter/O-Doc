"""Validate portable day summaries; local publication proofs never travel."""
from datetime import date
from utils.sync_policy import SyncError
from system_settings.sync_state import canonical_hash
from .archive import VERSION, identity


def validate_version(meta):
    version = (meta or {}).get('resident_analytics_version', 0)
    if type(version) is not int or not 0 <= version <= VERSION:
        raise SyncError('居民每日统计版本过新，请升级后同步')


def validate(rows, meta=None):
    validate_version(meta)
    for row in rows:
        if row.get('model') != 'system_settings.residentanalyticsday':
            continue
        fields = row['fields']
        version = fields.get('version')
        if type(version) is not int or not 1 <= version <= VERSION:
            raise SyncError('居民每日统计版本不兼容，请升级后同步')
        owner, day, content = fields.get('owner_id'), fields.get('day'), fields.get('contribution')
        try:
            valid = (isinstance(owner, str) and bool(owner) and isinstance(content, dict)
                     and row['pk'] == identity(owner, date.fromisoformat(day))
                     and fields['digest'] == canonical_hash([version, owner, day, content]))
        except (TypeError, ValueError, KeyError):
            valid = False
        if not valid:
            raise SyncError('居民每日统计日期、归属或摘要不一致')
