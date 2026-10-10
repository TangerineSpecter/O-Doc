from django.apps import AppConfig


class MemosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'memos'
    verbose_name = '闪念备忘'

    def ready(self):
        from .sprout_worker import start_worker
        start_worker()
