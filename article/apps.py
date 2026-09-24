from django.apps import AppConfig


class ArticleConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'article'

    def ready(self):
        from .image_search_scheduler import start_scheduler
        start_scheduler()
