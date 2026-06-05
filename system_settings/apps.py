from django.apps import AppConfig


class SystemSettingsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'system_settings'

    def ready(self):
        from .agent_task_scheduler import start_agent_task_scheduler
        from .article_rag_scheduler import start_article_rag_scheduler
        from .sync_scheduler import start_webdav_scheduler
        from .runtime_tracker import start_runtime_tracker

        start_agent_task_scheduler()
        start_article_rag_scheduler()
        start_webdav_scheduler()
        start_runtime_tracker()
