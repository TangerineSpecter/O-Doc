"""迁移完成和服务启动后初始化；管理命令和测试不启动后台线程。"""
import logging
import sys
import threading

from django.db import OperationalError, ProgrammingError, close_old_connections
from django.db.models.signals import post_migrate
from django.dispatch import receiver

from .travel_seed import initialize_travel_destinations

logger = logging.getLogger(__name__)
_thread = None
_lock = threading.Lock()


@receiver(post_migrate, dispatch_uid='initialize_travel_destinations')
def initialize_after_migrate(sender, using='default', **kwargs):
    if sender.name != 'system_settings' or 'test' in sys.argv or 'pytest' in sys.modules:
        return
    initialize_travel_destinations(using=using)


def _initialize_in_background():
    from django.apps import apps
    if not apps.ready_event.wait(timeout=30):
        logger.warning('应用启动未完成，旅行城市初始化未执行')
        return
    try:
        initialize_travel_destinations()
    except (OperationalError, ProgrammingError):
        logger.warning('旅行城市初始化未完成，请先运行 migrate，再重启或运行 initialize_travel_destinations', exc_info=True)
    except Exception:
        logger.exception('旅行城市初始化失败，未提交导入记录；修复文件后重试')
    finally:
        close_old_connections()


def start_travel_initialization():
    global _thread
    from system_settings.sync_scheduler import _is_server_process
    server = _is_server_process() or ('runserver' in sys.argv and '--noreload' in sys.argv)
    if not server:
        return
    with _lock:
        if _thread is not None:
            return
        _thread = threading.Thread(target=_initialize_in_background, name='travel-seed', daemon=True)
        _thread.start()
