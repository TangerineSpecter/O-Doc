"""月榜与市场维护独立于 Agent 任务开关，不触发居民自主行动；恢复本机已授权的人工配图。"""
import atexit
import sys
import logging
import threading
import time
from django.db import OperationalError, ProgrammingError, close_old_connections
from system_settings.sync_scheduler import _is_server_process, get_scheduler_initial_delay_seconds
from .settlement import recover_months

_last_attempt = 0.0
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
    except (OperationalError, ProgrammingError):
        logger.debug('Agent 世界表暂不可用，将重试', exc_info=True)
    except Exception:
        logger.exception('Agent 世界维护失败，将自动重试')
    finally:
        _lock.release()


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
