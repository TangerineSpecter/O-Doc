from django.apps import AppConfig


class ArticleConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'article'

    def ready(self):
        from .image_search_scheduler import start_scheduler
        from .video_notes.scheduler import start_worker
        start_scheduler()
        start_worker()
