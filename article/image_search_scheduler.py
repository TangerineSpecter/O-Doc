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

    if os.getenv('ODOC_ENABLE_IMAGE_INDEX', 'true').lower() != 'true' or not _is_server_process():
        return
    with _start_lock:
        if _thread and _thread.is_alive():
            return
        _thread = threading.Thread(target=run_loop, daemon=True, name='image-index-worker')
        _thread.start()


def run_loop():
    from article.image_search_jobs import claim_job, execute_claim

    stop = threading.Event()
    while not stop.wait(3):
        try:
            close_old_connections()
            claim = claim_job()
            if claim:
                execute_claim(claim)
        except (OperationalError, ProgrammingError):
            logger.debug('Image index worker waiting for database', exc_info=True)
        except Exception:
            logger.exception('Image index worker error')
        finally:
            close_old_connections()
