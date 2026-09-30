"""仅处理本机明确授权的人工配图请求，不开启居民自动社交。"""
import logging
import threading
from django.db import close_old_connections

_lock = threading.Lock()
_thread = None
logger = logging.getLogger(__name__)


def _loop() -> None:
    from system_settings.models import WorldActionRuntime
    from .social_media import image_runtime_id, recover_images
    from .social_models import Moment
    from .farm_gate import farm_gate
    try:
        while True:
            close_old_connections()
            with farm_gate():
                ids = [image_runtime_id(pk) for pk in Moment.objects.filter(is_valid=True, image_state__manual=True, image_state__status__in=['pending', 'generating']).values_list('pk', flat=True)]
                permissions = WorldActionRuntime.objects.filter(pk__startswith='social-img:', enabled=True)
                permissions.exclude(pk__in=ids).update(enabled=False)
                if not permissions.exists(): return
            recover_images(manual_only=True)
            close_old_connections()
            threading.Event().wait(60)
    except Exception:
        logger.exception('人工朋友圈配图处理失败，后台维护会重新启动')
    finally:
        close_old_connections()


def start_manual_image_worker() -> None:
    global _thread
    with _lock:
        if _thread and _thread.is_alive(): return
        def run() -> None:
            close_old_connections()
            _loop()
        _thread = threading.Thread(target=run, name='social-manual-images', daemon=True)
        _thread.start()
