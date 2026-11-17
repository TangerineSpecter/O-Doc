import logging
import threading
import time
from django.db import close_old_connections
from system_settings.sync_scheduler import _is_server_process


def start_worker():
    if _is_server_process() and not any(t.name == 'video-note-worker' for t in threading.enumerate()):
        threading.Thread(target=_loop, daemon=True, name='video-note-worker').start()


def _loop():
    from .jobs import tick
    last_cleanup = 0
    while True:
        time.sleep(5)
        try:
            close_old_connections()
            cleanup = time.monotonic() - last_cleanup >= 600 or last_cleanup == 0
            tick(cleanup)
            if cleanup:
                last_cleanup = time.monotonic()
        except Exception:
            logging.getLogger(__name__).exception('Video note worker unavailable')
        finally:
            close_old_connections()
