"""Freeze legacy history deletion while its sources are being backfilled."""

import logging
import os
from functools import lru_cache

PROTECTION_ENV = 'ODOC_COMBAT_BACKFILL_PROTECT'
PROTECTION_MESSAGE = '战斗历史正在进行回填保护，已暂停旧归档和同步写入；请先完成各设备的数据备份和回填。'
INVALID_PROTECTION_MESSAGE = f'{PROTECTION_ENV} 配置值无法识别，已保持回填保护；请检查进程配置并使用 1/0 或 true/false。'
ENABLED_VALUES = frozenset(('1', 'true', 'yes', 'on'))
DISABLED_VALUES = frozenset(('', '0', 'false', 'no', 'off'))
logger = logging.getLogger(__name__)


class CombatBackfillProtected(RuntimeError):
    """A legacy write could remove source facts needed by the backfill."""


class LegacyCombatArchiveDisabled(RuntimeError):
    """The legacy archive can remove non-round history and is retired."""


@lru_cache(maxsize=16)
def _warn_invalid_value(value):
    logger.warning(INVALID_PROTECTION_MESSAGE)


def _value():
    return os.getenv(PROTECTION_ENV, '').strip().lower()


def is_protected() -> bool:
    value = _value()
    if value not in ENABLED_VALUES | DISABLED_VALUES:
        _warn_invalid_value(value)
    return value not in DISABLED_VALUES


def _protection_message():
    return PROTECTION_MESSAGE if _value() in ENABLED_VALUES else INVALID_PROTECTION_MESSAGE


def reject_legacy_archive() -> None:
    if is_protected():
        raise CombatBackfillProtected(_protection_message())
    raise LegacyCombatArchiveDisabled('旧战斗归档会删除出发等非回合来源，已停用；回合清理由后台独立处理。')


def require_sync_unprotected() -> None:
    if is_protected():
        from utils.sync_policy import SyncError
        raise SyncError(_protection_message())
