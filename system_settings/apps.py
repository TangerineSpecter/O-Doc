import logging

from django.apps import AppConfig
from django.db import OperationalError
from django.db.backends.signals import connection_created

logger = logging.getLogger(__name__)


def configure_sqlite_pragmas(sender, connection, **kwargs):
    if connection.vendor == 'sqlite':
        with connection.cursor() as cursor:
            cursor.execute('PRAGMA busy_timeout = 5000;')
            try:
                cursor.execute('PRAGMA journal_mode = WAL;')
            except OperationalError:
                # Existing readers/writers may prevent the initial mode switch.
                # Keep the current mode, but make the failed optimization visible.
                logger.warning('SQLite WAL 切换失败，保留当前日志模式', exc_info=True)
            cursor.execute('PRAGMA synchronous = NORMAL;')


class SystemSettingsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'system_settings'

    def ready(self):
        connection_created.connect(configure_sqlite_pragmas, dispatch_uid='odoc_sqlite_pragmas')
        from .agent_world import life_interleaving_events  # noqa: F401
        from .agent_world.market_sync import register_market_signals
        register_market_signals()
        from .agent_world.cooking_sync import register_signals
        register_signals()
        from .agent_world.alchemy_sync import register_signals as register_alchemy_signals
        register_alchemy_signals()
        from .agent_world.blacksmith_sync import register_signals as register_blacksmith_signals
        register_blacksmith_signals()
        from . import sync_signals  # noqa: F401
        from . import agent_history  # noqa: F401
        from .agent_world import history  # noqa: F401
        from .agent_world.travel_startup import start_travel_initialization
        start_travel_initialization()
        from .builtin_skills import start_builtin_skill_sync
        from .agent_task_scheduler import start_agent_task_scheduler
        from .agent_memory_scheduler import start_agent_memory_scheduler
        from .embedding_recovery_scheduler import start_embedding_recovery_scheduler
        from .article_rag_scheduler import start_article_rag_scheduler
        from .sync_scheduler import start_webdav_scheduler
        from .runtime_tracker import start_runtime_tracker
        from .feishu_im_ws import start_feishu_im_ws_manager

        from .agent_world.worker import start_world_worker
        start_world_worker()
        from .agent_world.combat.worker import start as start_combat_worker
        start_combat_worker()
        from .agent_world.fishing.worker import start as start_fishing_worker
        start_fishing_worker()
        start_builtin_skill_sync()
        start_agent_task_scheduler()
        start_agent_memory_scheduler()
        start_embedding_recovery_scheduler()
        start_article_rag_scheduler()
        start_webdav_scheduler()
        start_runtime_tracker()
        start_feishu_im_ws_manager()
