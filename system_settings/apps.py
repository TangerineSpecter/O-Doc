from django.apps import AppConfig


class SystemSettingsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'system_settings'

    def ready(self):
        from .sync_scheduler import start_webdav_scheduler
        from .runtime_tracker import start_runtime_tracker

        start_webdav_scheduler()
        start_runtime_tracker()
