"""Freeze legacy history deletion while its sources are being backfilled."""

import os

PROTECTION_ENV = 'ODOC_COMBAT_BACKFILL_PROTECT'
PROTECTION_MESSAGE = '战斗历史正在进行回填保护，已暂停旧归档和同步写入；请先完成各设备的数据备份和回填。'


class CombatBackfillProtected(RuntimeError):
    """A legacy write could remove source facts needed by the backfill."""


class LegacyCombatArchiveDisabled(RuntimeError):
    """The legacy archive can remove non-round history and is retired."""


def is_protected() -> bool:
    value = os.getenv(PROTECTION_ENV, '').strip().lower()
    return value not in ('', '0', 'false', 'no', 'off')


def reject_legacy_archive() -> None:
    if is_protected():
        raise CombatBackfillProtected(PROTECTION_MESSAGE)
    raise LegacyCombatArchiveDisabled('旧战斗归档会删除出发等非回合来源，已停用；新的七天回合清理尚未就绪。')


def require_sync_unprotected() -> None:
    if is_protected():
        from utils.sync_policy import SyncError
        raise SyncError(PROTECTION_MESSAGE)
