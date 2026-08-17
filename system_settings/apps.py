from django.apps import AppConfig


class SystemSettingsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'system_settings'

    def ready(self):
        from . import sync_signals  # noqa: F401
        from .builtin_skills import start_builtin_skill_sync
        from .agent_task_scheduler import start_agent_task_scheduler
        from .agent_memory_scheduler import start_agent_memory_scheduler
        from .article_rag_scheduler import start_article_rag_scheduler
        from .sync_scheduler import start_webdav_scheduler
        from .runtime_tracker import start_runtime_tracker
        from .feishu_im_ws import start_feishu_im_ws_manager

        start_builtin_skill_sync()
        start_agent_task_scheduler()
        start_agent_memory_scheduler()
        start_article_rag_scheduler()
        start_webdav_scheduler()
        start_runtime_tracker()
        start_feishu_im_ws_manager()
