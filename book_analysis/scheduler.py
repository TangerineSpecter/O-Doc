import logging
import os
import threading

from django.db import OperationalError, ProgrammingError, close_old_connections

logger = logging.getLogger(__name__)
_start_lock = threading.Lock()
_thread = None


def start_scheduler():
    global _thread
    from system_settings.sync_scheduler import _is_server_process
    if os.getenv('ODOC_ENABLE_BOOK_ANALYSIS', 'true').lower() != 'true' or not _is_server_process():
        return
    with _start_lock:
        if _thread and _thread.is_alive():
            return
        _thread = threading.Thread(target=run_loop, daemon=True, name='book-analysis-worker')
        _thread.start()


def run_loop():
    from .jobs import claim_run, execute_claim
    stop = threading.Event()
    while not stop.wait(3):
        try:
            close_old_connections()
            claim = claim_run()
            if claim:
                execute_claim(claim)
        except (OperationalError, ProgrammingError):
            # Migrations/startup and temporary database contention are retried.
            logger.debug('Book worker waiting for database', exc_info=True)
        except Exception:
            logger.exception('Book analysis worker error')
        finally:
            close_old_connections()
