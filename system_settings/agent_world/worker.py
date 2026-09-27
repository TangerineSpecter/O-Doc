"""月榜维护独立于 Agent 任务开关，不触发任何 Agent 行动。"""
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
        now = time.monotonic()
        if now-_last_attempt < 60:
            return
        _last_attempt = now
        recover_months()
    except (OperationalError, ProgrammingError):
        logger.debug('Agent 世界表暂不可用，将重试', exc_info=True)
    except Exception:
        logger.exception('Agent 月榜结算失败，将自动重试')
    finally:
        _lock.release()


def _loop() -> None:
    _stop.wait(get_scheduler_initial_delay_seconds())
    while not _stop.is_set():
        close_old_connections()
        advance_world_months()
        close_old_connections()
        _stop.wait(60)


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
