from django.apps import AppConfig


class BookAnalysisConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'book_analysis'

    def ready(self):
        from .scheduler import start_scheduler
        start_scheduler()
