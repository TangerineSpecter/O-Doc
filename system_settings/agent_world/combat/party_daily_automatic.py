"""Materialize completed statistics and safely retire old round details."""

import logging
import os
import time

from django.db import close_old_connections, connections, transaction

from ..farm_gate import guarded
from .migration_guard import DISABLED_VALUES, ENABLED_VALUES, is_protected
from .party_daily_backfill import _backfill_batch
from .solo_daily_backfill import automatic_batch as automatic_solo_batch

logger = logging.getLogger(__name__)

AUTO_ENV = 'ODOC_COMBAT_DAILY_AUTO'
INTERVAL_SECONDS = 300
PAGE_PAUSE_SECONDS = 1
ERROR_RETRY_SECONDS = 30


def enabled():
    """The normal deployment needs no configuration to build statistics."""
    value = os.getenv(AUTO_ENV, '1').strip().lower()
    if value in ENABLED_VALUES:
        return True
    if value not in DISABLED_VALUES:
        logger.warning('%s 配置值无法识别，暂不生成战斗统计', AUTO_ENV)
    return False


@guarded
@transaction.atomic
def automatic_batch(*, after='', limit=3, max_seconds=2,
                    max_source_rows=None, max_actor_rows=None):
    """Validate and add missing contributions in one short, atomic page.

    A large valid battle or resident history must not be permanently skipped
    just because it exceeds the optional manual preview limits. A page uses the same local gate as combat writes and
    snapshot imports/exports; sync validates the complete source again before
    accepting or publishing the daily and settlement records.
    """
    if is_protected():
        raise ValueError('回填保护期间暂停自动战斗统计')
    return _backfill_batch(after=after, limit=limit, max_seconds=max_seconds,
                           max_source_rows=max_source_rows, max_actor_rows=max_actor_rows, include_settlement=True)


def run_loop(stop):
    """Drain the backlog, then check again every five minutes.

    The cursor is only an optimization: after restart the query resumes from
    still-uncovered parties. Failed parties are retried in the next cycle.
    """
    try:
        _run_loop(stop)
    finally:
        # Django connections are thread-local; close this worker's connection
        # even when its configured maximum age has not yet expired.
        connections.close_all()


def _run_loop(stop):
    cursor = ''
    solo_cursor = ''
    rebuild_cursor = ''
    next_cycle_at = time.monotonic() + INTERVAL_SECONDS
    while not stop.is_set():
        # While a large backlog is draining, revisit the beginning at least
        # every five minutes so newly completed IDs before the cursor are not
        # postponed until the entire historical backlog finishes.
        now = time.monotonic()
        if now >= next_cycle_at:
            cursor = ''
            solo_cursor = ''
            next_cycle_at = now + INTERVAL_SECONDS
        if not enabled() or is_protected():
            cursor = ''
            solo_cursor = ''
            rebuild_cursor = ''
            stop.wait(INTERVAL_SECONDS)
            continue
        close_old_connections()
        try:
            result = automatic_batch(after=cursor)
            for item in result['failures']:
                logger.warning('战斗统计来源暂未覆盖 party=%s：%s', item['party_id'], item['reason'])
            if result['created']:
                logger.info('后台已固化 %s 场战斗统计，原始回合保留', result['created'])
            if result.get('settlement_created'):
                logger.info('后台已核对并保存 %s 场战斗结算摘要，原始回合保留', result['settlement_created'])
            cursor = result['next_after'] if result['has_more'] else ''
            solo = automatic_solo_batch(after=solo_cursor)
            for item in solo['failures']:
                logger.warning('旧单人战斗统计来源暂未覆盖 exploration=%s：%s', item['exploration_id'], item['reason'])
            if solo['created']:
                logger.info('后台已核对并保存 %s 场旧单人战斗结算，原始回合保留', solo['created'])
            solo_cursor = solo['next_after'] if solo['has_more'] else ''
            more = result['has_more'] or solo['has_more']
            if not more:
                from .retention_cleanup import cleanup_batch
                cleaned = cleanup_batch()
                if cleaned['blocked']:
                    logger.warning('仍有未核对的已结束战斗，暂停全部七天回合清理：%s', cleaned['backlog'])
                elif cleaned['cleaned']:
                    logger.info('已校验并压缩 %s 场旧战斗，清理个人回合 %s 条、共同回合 %s 条',
                                cleaned['cleaned'], cleaned['round_facts'], cleaned['round_events'])
                more = cleaned['has_more']
                if not more and not cleaned['cleaned']:
                    from .archived_daily_rebuild import automatic_batch as rebuild_batch
                    rebuilt = rebuild_batch(after=rebuild_cursor)
                    for item in rebuilt['failures']:
                        logger.warning('已归档战斗统计无法重建 party=%s：%s', item['party_id'], item['reason'])
                    if rebuilt['rebuilt']:
                        logger.info('已从结算重建 %s 场战斗每日统计', rebuilt['rebuilt'])
                    rebuild_cursor = rebuilt['next_after'] if rebuilt['has_more'] else ''
                    more = rebuilt['has_more'] or bool(rebuilt['rebuilt'])
            delay = PAGE_PAUSE_SECONDS if more else INTERVAL_SECONDS
        except Exception:
            logger.exception('后台战斗统计失败，将自动重试')
            delay = ERROR_RETRY_SECONDS
        finally:
            close_old_connections()
        stop.wait(delay)
