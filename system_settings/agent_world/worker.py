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
_combat_attempt_at = 0.0
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
    except (OperationalError, ProgrammingError):
        logger.debug('Agent 世界表暂不可用，将重试', exc_info=True)
    except Exception:
        logger.exception('Agent 世界维护失败，将自动重试')
    finally:
        _lock.release()


def maintain_combat_history() -> None:
    """每天追加检查点并按保留期归档；容器重启后自动补做，不需要人工进入执行。"""
    global _combat_maintenance_day, _combat_attempt_at
    try:
        retention = int(os.getenv('ODOC_COMBAT_ARCHIVE_DAYS', '7'))
    except ValueError:
        retention = 7
    if retention <= 0:
        return
    from .life_time import local_time
    today = local_time().date()
    if _combat_maintenance_day == today:
        return
    # 失败每 30 分钟重试一次，避免每分钟刷日志。
    if time.monotonic() - _combat_attempt_at < 1800:
        return
    _combat_attempt_at = time.monotonic()
    from .combat.archive import archive_owners, checkpoint_all
    try:
        created, skipped = checkpoint_all()
        for item in skipped:
            logger.warning('战斗检查点跳过 actor=%s：%s', item['actor'], item['reason'])
        results = archive_owners(None, retention, apply=True)
        archived = sum(item.get('archived', 0) for item in results)
        blocked = [item for item in results if item.get('blocked_by')]
        failed = [item for item in results if str(item.get('reason', '')).startswith('归档失败')]
        # 来源事实仍在待删区间时归档不会推进；这里按天汇总，避免被误判为保留期已生效。
        if blocked:
            logger.warning('战斗事实归档受阻 %s 位居民（来源事实在待删区间，首个 actor=%s sequence=%s）',
                           len(blocked), blocked[0]['actor'], blocked[0]['blocked_by'])
        if failed:
            logger.warning('战斗事实归档失败 %s 位居民（首个 actor=%s：%s）',
                           len(failed), failed[0]['actor'], failed[0].get('reason'))
        if created or archived:
            logger.info('战斗事实维护完成：新增 %s 个检查点，归档 %s 条，保留 %s 天', created, archived, retention)
    except Exception:
        logger.exception('战斗事实归档失败，稍后重试')
        return
    _combat_maintenance_day = today


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
