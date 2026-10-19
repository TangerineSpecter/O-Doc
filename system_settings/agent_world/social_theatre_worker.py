"""人工小剧场立即调度，独立于耗时的生活规划和普通社交循环。"""
import logging
import threading

from django.db import close_old_connections
from django.db.models import Q

logger = logging.getLogger(__name__)
_lock = threading.Lock()
_threads: dict[str, threading.Thread] = {}


def _run(owner: str) -> None:
    from system_settings.models import WorldActionRuntime
    from .social_models import SocialConfig, SocialTheatreEvent
    from .social_theatre_runner import tick_theatres

    try:
        while True:
            close_old_connections()
            if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
                return
            config = SocialConfig.objects.filter(pk=owner).first()
            pending = SocialTheatreEvent.objects.filter(Q(snapshot__manual=True) | Q(snapshot__resume=True),
                owner_id=owner,
                status__in=('scheduled', 'searching', 'running'))
            if not config or not pending.exists():
                return
            tick_theatres(config, manual_only=True)
            close_old_connections()
            threading.Event().wait(15)
    except Exception:
        logger.exception('人工小剧场调度失败，维护线程将重试 owner=%s', owner)
    finally:
        close_old_connections()


def start_manual_theatre_worker(owner: str | None = None) -> None:
    if owner is None:
        from system_settings.models import WorldActionRuntime
        from .social_models import SocialTheatreEvent
        if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
            return
        for identity in SocialTheatreEvent.objects.filter(
                Q(snapshot__manual=True) | Q(snapshot__resume=True), status__in=('scheduled', 'searching', 'running')
        ).values_list('owner_id', flat=True).distinct():
            start_manual_theatre_worker(identity)
        return
    with _lock:
        current = _threads.get(owner)
        if current and current.is_alive():
            return
        thread = threading.Thread(target=_run, args=(owner,), name='social-manual-theatre', daemon=True)
        _threads[owner] = thread
        thread.start()
