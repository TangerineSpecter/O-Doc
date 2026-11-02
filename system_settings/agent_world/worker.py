"""月榜与市场维护独立于 Agent 任务开关，不触发居民自主行动；恢复本机已授权的人工配图。"""
import atexit
import os
import sys
import logging
import threading
import time
from django.db import OperationalError, ProgrammingError, close_old_connections
from system_settings.sync_scheduler import _is_server_process, get_scheduler_initial_delay_seconds
from .settlement import recover_months

_last_attempt = 0.0
_combat_maintenance_day = None
_combat_backfill_retry_at = 0.0
_combat_backfill_cursor = ''
_combat_backfill_failed_in_cycle = False
_fishing_backfill_retry_at = 0.0
_fishing_backfill_cursor = ''
_fishing_backfill_failed_in_cycle = False
_lock = threading.Lock()
_thread = None
_stop = threading.Event()
logger = logging.getLogger(__name__)


def advance_world_months() -> None:
    global _last_attempt
    if not _lock.acquire(blocking=False):
        return
    try:
        from .social_media_worker import start_manual_image_worker
        start_manual_image_worker()
        from .social_theatre_worker import start_manual_theatre_worker
        start_manual_theatre_worker()
        now = time.monotonic()
        if now-_last_attempt >= 60:
            _last_attempt = now
            recover_months()
        from .market_models import MarketConfig
        from .market_shop import current_batch
        from .market_sessions import cleanup
        cleanup(restart=True)
        from .investment_worker import tick_values
        try:
            tick_values()
        except (OperationalError, ProgrammingError):
            logger.debug('投资估值表暂不可用，将重试', exc_info=True)
        except Exception:
            logger.exception('投资估值维护失败，将重试；继续市场维护')
        for owner in MarketConfig.objects.values_list('pk', flat=True):
            current_batch(owner)
        maintain_combat_history()
        maintain_combat_daily_backfill()
        maintain_fishing_daily_backfill()
    except (OperationalError, ProgrammingError):
        logger.debug('Agent 世界表暂不可用，将重试', exc_info=True)
    except Exception:
        logger.exception('Agent 世界维护失败，将自动重试')
    finally:
        _lock.release()


def maintain_combat_history() -> None:
    """The legacy deletion path is retired even when an old setting remains."""
    global _combat_maintenance_day
    from .combat.migration_guard import is_protected
    if is_protected():
        return
    try:
        retention = int(os.getenv('ODOC_COMBAT_ARCHIVE_DAYS', '0'))
    except ValueError:
        retention = 0
    if retention <= 0:
        return
    from .life_time import local_time
    today = local_time().date()
    if _combat_maintenance_day == today:
        return
    logger.warning('旧战斗归档已停用，ODOC_COMBAT_ARCHIVE_DAYS=%s 不会删除事实；新的七天回合清理尚未就绪', retention)
    _combat_maintenance_day = today


def maintain_combat_daily_backfill() -> None:
    """Optionally process a small party page while the migration gate is active."""
    global _combat_backfill_retry_at, _combat_backfill_cursor, _combat_backfill_failed_in_cycle
    if os.getenv('ODOC_COMBAT_DAILY_BACKFILL', '').strip().lower() not in ('1', 'true', 'yes', 'on'):
        return
    from .combat.migration_guard import is_protected
    if not is_protected() or time.monotonic() < _combat_backfill_retry_at:
        return
    from .combat.party_daily_backfill import backfill_batch
    try:
        result = backfill_batch(after=_combat_backfill_cursor, limit=3, max_seconds=10)
        _combat_backfill_failed_in_cycle |= bool(result['failures'])
        _combat_backfill_cursor = result['next_after'] if result['has_more'] else ''
        delay = 1800 if not result['has_more'] and _combat_backfill_failed_in_cycle else 60
        _combat_backfill_retry_at = time.monotonic() + delay
        if not result['has_more']:
            _combat_backfill_failed_in_cycle = False
        if result['created']:
            logger.info('已回填 %s 场组队冒险每日贡献，原始回合未删除', result['created'])
        for item in result['failures']:
            logger.warning('组队每日贡献回填受阻 party=%s：%s', item['party_id'], item['reason'])
    except Exception:
        _combat_backfill_retry_at = time.monotonic() + 1800
        logger.exception('组队每日贡献回填失败，将自动重试')


def maintain_fishing_daily_backfill() -> None:
    """Optionally process a small fishing page while migration is protected."""
    global _fishing_backfill_retry_at, _fishing_backfill_cursor, _fishing_backfill_failed_in_cycle
    if os.getenv('ODOC_FISHING_DAILY_BACKFILL', '').strip().lower() not in ('1', 'true', 'yes', 'on'):
        return
    from .combat.migration_guard import is_protected
    if not is_protected() or time.monotonic() < _fishing_backfill_retry_at:
        return
    from .fishing.daily_backfill import backfill_batch
    try:
        result = backfill_batch(after=_fishing_backfill_cursor, limit=5, max_seconds=10)
        _fishing_backfill_failed_in_cycle |= bool(result['failures'])
        _fishing_backfill_cursor = result['next_after'] if result['has_more'] else ''
        delay = 1800 if not result['has_more'] and _fishing_backfill_failed_in_cycle else 60
        _fishing_backfill_retry_at = time.monotonic() + delay
        if not result['has_more']:
            _fishing_backfill_failed_in_cycle = False
        if result['created']:
            logger.info('已回填 %s 场出钓每日贡献，原始事件未删除', result['created'])
        for item in result['failures']:
            logger.warning('钓鱼每日贡献回填受阻 trip=%s：%s', item['trip_id'], item['reason'])
    except Exception:
        _fishing_backfill_retry_at = time.monotonic() + 1800
        logger.exception('钓鱼每日贡献回填失败，将自动重试')


def _loop() -> None:
    _stop.wait(get_scheduler_initial_delay_seconds())
    while not _stop.is_set():
        close_old_connections()
        advance_world_months()
        close_old_connections()
        # Align maintenance to wall-clock minutes, including each Shanghai hour boundary.
        _stop.wait(max(0.1, 60 - time.time() % 60))


def start_world_worker() -> None:
    global _thread
    server = _is_server_process() or ('runserver' in sys.argv and '--noreload' in sys.argv)
    if not server or (_thread and _thread.is_alive()):
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name='agent-world-months', daemon=True)
    _thread.start()


def stop_world_worker() -> None:
    _stop.set()
    if _thread and _thread.is_alive():
        _thread.join(timeout=2)


atexit.register(stop_world_worker)
