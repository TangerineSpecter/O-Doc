"""Shared sync failures, future-format guard and cancellation boundary."""

from __future__ import annotations

from collections.abc import Callable


class SyncError(Exception):
    """同步过程中的显式失败。"""


class OverwriteConfirmationRequired(SyncError):
    """当前目录存在备份，手动上传需要先确认替换。"""


class SyncChoicesRequired(SyncError):
    """两端都改过同一条记录。调用方把列表交回用户，不把这次同步记成失败。"""

    def __init__(self, conflicts, total):
        super().__init__(f'有 {total} 条记录两端都改过。请逐条选择保留本机或云端，未选择的用较新一侧。')
        self.conflicts = conflicts
        self.total = total


_SCHEMA_GUARD_MARKERS = ('版本过新', '版本高于', '请升级', '请先升级')

def schema_guard(exc: BaseException) -> bool:
    """更高的快照或目录版本仍然拒绝；单机最新代码读不了未来格式。"""
    text = str(exc)
    return any(marker in text for marker in _SCHEMA_GUARD_MARKERS)


def ensure_not_aborted(should_abort: Callable[[], bool] | None) -> None:
    if callable(should_abort) and should_abort():
        raise SyncError('同步已取消')
