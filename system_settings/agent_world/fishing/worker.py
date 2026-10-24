"""设备本地五秒轮询；模型任务独立线程且每趟最多一个。"""
import atexit
import logging
import sys
import threading
from django.db import close_old_connections, OperationalError, ProgrammingError
from ..execution import execution_lease
from ..farm_gate import farm_gate
from ..life_time import local_time
from .models import FishingTrip, FishingRuntime
from .service import authorized, finish

logger = logging.getLogger(__name__)
_stop = threading.Event()
_thread = None
_jobs: dict[str, threading.Thread] = {}


def advance_one(identity: str) -> None:
    from .decisions import prepare_step, StaleDecision
    from .runner import cast, duel, defer
    try:
        close_old_connections()
        with execution_lease(FishingRuntime, {'pk': identity}) as token:
            if not token:
                return
            trip = FishingTrip.objects.get(pk=identity)
            if not authorized(trip):
                return
            if trip.status == 'preparing':
                from ..life_models import LifeItem
                from ..life_activities import is_interleaved
                from datetime import datetime
                item = LifeItem.objects.get(pk=trip.life_item_id)
                if is_interleaved(item) and local_time(datetime.fromisoformat(item.context['interleaving']['expires_at'])) <= local_time():
                    finish(identity, '系统说明：未出发的穿插已过期', cancelled=True)
                    return
                prepare_step(identity)
            elif trip.status == 'duel':
                duel(identity)
            elif trip.status == 'active':
                cast(identity)
    except StaleDecision:
        return
    except ValueError as exc:
        from ..life_models import LifeItem
        from ..life_activities import is_interleaved
        from .decisions import DecisionUnavailable
        trip = FishingTrip.objects.get(pk=identity)
        item = LifeItem.objects.filter(pk=trip.life_item_id).first()
        if trip.status == 'preparing' and item and is_interleaved(item) and not isinstance(exc, DecisionUnavailable):
            finish(identity, '系统说明：准备条件失效，' + str(exc), cancelled=True)
        else:
            defer(identity, str(exc))
    except Exception:
        logger.exception('钓鱼推进失败 trip=%s', identity)
        defer(identity, '执行暂时失败，请稍后重试')
    finally:
        close_old_connections()


def advance() -> None:
    from ..life_activity_recovery import reconcile
    reconcile(domain='fishing')
    from system_settings.models import Agent, WorldActionRuntime
    from ..life_models import LifeItem
    from .models import FishingConfig
    for trip in FishingTrip.objects.filter(ended_at__isnull=True):
        if (not Agent.objects.filter(pk=trip.actor_id, archived_at__isnull=True).exists()
                or not LifeItem.objects.filter(pk=trip.life_item_id, status='running').exists()
                or not FishingConfig.objects.filter(pk=trip.owner_id, enabled=True).exists()):
            finish(trip.pk, '居民、日程或钓鱼能力已停止', cancelled=True)
            continue
        # On a restored device permits remain revoked until explicit retry.
        if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists() or not authorized(trip):
            continue
        if trip.next_tick_at and local_time(trip.next_tick_at) > local_time():
            continue
        if trip.status == 'paused':
            continue
        job = _jobs.get(trip.pk)
        if job and job.is_alive():
            continue
        job = threading.Thread(target=advance_one, args=(trip.pk,), name='fishing-step', daemon=True)
        _jobs[trip.pk] = job
        job.start()
    for key, job in list(_jobs.items()):
        if not job.is_alive():
            _jobs.pop(key, None)


def loop() -> None:
    while not _stop.wait(5):
        try:
            close_old_connections()
            advance()
        except (OperationalError, ProgrammingError):
            logger.debug('钓鱼表尚未可用，将重试', exc_info=True)
        except Exception:
            logger.exception('钓鱼轮询失败，将重试')
        finally:
            close_old_connections()


def start() -> None:
    global _thread
    from system_settings.sync_scheduler import _is_server_process
    if not (_is_server_process() or ('runserver' in sys.argv and '--noreload' in sys.argv)) or (_thread and _thread.is_alive()):
        return
    # Restart is not permission to continue an interrupted provider call.
    try:
        with farm_gate():
            FishingRuntime.objects.update(authorized=False, token='', until=None)
    except (OperationalError, ProgrammingError):
        logger.debug('钓鱼运行表尚未建立')
    _stop.clear()
    _thread = threading.Thread(target=loop, name='fishing-worker', daemon=True)
    _thread.start()


def stop() -> None:
    _stop.set()
    if _thread and _thread.is_alive():
        _thread.join(timeout=2)


atexit.register(stop)
