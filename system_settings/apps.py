from django.apps import AppConfig


class SystemSettingsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'system_settings'

    def ready(self):
        from . import sync_signals  # noqa: F401
        from . import agent_history  # noqa: F401
        from .agent_world import history  # noqa: F401
        from .agent_world.travel_startup import start_travel_initialization
        start_travel_initialization()
        from .builtin_skills import start_builtin_skill_sync
        from .agent_task_scheduler import start_agent_task_scheduler
        from .agent_memory_scheduler import start_agent_memory_scheduler
        from .article_rag_scheduler import start_article_rag_scheduler
        from .sync_scheduler import start_webdav_scheduler
        from .runtime_tracker import start_runtime_tracker
        from .feishu_im_ws import start_feishu_im_ws_manager

        from .agent_world.worker import start_world_worker
        start_world_worker()
        start_builtin_skill_sync()
        start_agent_task_scheduler()
        start_agent_memory_scheduler()
        start_article_rag_scheduler()
        start_webdav_scheduler()
        start_runtime_tracker()
        start_feishu_im_ws_manager()
