from django.apps import AppConfig
import os
import sys
from pathlib import Path


def is_capture_process():
    if os.getenv('ODOC_ENABLE_PERFORMANCE_WORKER', 'true').lower() in {'false', '0', 'no', 'off'}:
        return False
    if 'runserver' in sys.argv:
        return '--noreload' in sys.argv or os.getenv('RUN_MAIN') == 'true'
    entry = Path(sys.argv[0]) if sys.argv else Path('')
    executable = (entry.parent.name if entry.name == '__main__.py' else entry.name).lower()
    return any(name in executable for name in ('gunicorn', 'uwsgi', 'uvicorn', 'daphne'))


class PerformanceConfig(AppConfig):
    name = 'system_performance'
    default_auto_field = 'django.db.models.BigAutoField'

    def ready(self):
        if not is_capture_process():
            return
        from .http import install
        install()
        from .collector import start
        start()
