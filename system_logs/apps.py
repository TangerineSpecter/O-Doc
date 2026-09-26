import logging
from django.apps import AppConfig
from django.conf import settings


class SystemLogsConfig(AppConfig):
    name = 'system_logs'

    def ready(self):
        if not getattr(settings, 'SYSTEM_LOG_ENABLED', True):
            return
        from .capture import DiagnosticHandler
        root = logging.getLogger()
        if not any(isinstance(handler, DiagnosticHandler) for handler in root.handlers):
            root.addHandler(DiagnosticHandler(level=logging.ERROR))

        # Do not start persistence or maintenance in tests/migrations/management commands.
        from system_settings.sync_scheduler import _is_server_process
        if _is_server_process():
            from .capture import start
            start()
