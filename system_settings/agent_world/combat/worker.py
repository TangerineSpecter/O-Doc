"""Five-second independent polling; no offline catch-up or world-slot ownership while waiting."""
import atexit
import logging
import os
import sys
import threading
from django.db import close_old_connections
from .models import Exploration, CombatRuntime
from .explorations import tick, finish
from ..execution import execution_lease
from ..life_time import storage_time, local_time
from ..farm_gate import farm_gate

_thread=None
_stop=threading.Event()
_preparations={}
logger=logging.getLogger(__name__)


def recover_stopped_process():
    """A hard stop may skip atexit. Revoke permits before a new process advances."""
    with farm_gate():
        runtime=CombatRuntime.objects.filter(pk='combat-worker').first()
        pid=runtime.requests.get('process_id') if runtime else None
        if not pid or pid==os.getpid():return
        try:os.kill(pid,0)
        except ProcessLookupError:
            from .sync import revoke
            from django.db import transaction
            with transaction.atomic():
                revoke(disable_auto=False)
                runtime.requests={};runtime.save(update_fields=['requests'])
        except PermissionError:return


def prepare_one(identity):
    try:
        close_old_connections()
        with execution_lease(CombatRuntime,{'pk':identity}) as token:
            if token:
                from .preparation import prepare
                prepare(identity)
    except Exception:
        logger.exception('探索准备失败 run=%s',identity)
    finally:close_old_connections()


def promote_one(identity):
    try:
        close_old_connections()
        from .preparation import promotion
        promotion(identity,require_permit=True)
    except Exception:logger.exception('探索转职判断失败，档案保留可转职分支 run=%s',identity)
    finally:
        with farm_gate():
            runtime=CombatRuntime.objects.filter(pk=identity).first()
            if runtime:
                runtime.requests.pop('promotion_allowed',None);runtime.save(update_fields=['requests'])
        close_old_connections()


def advance():
    recover_stopped_process()
    with execution_lease(CombatRuntime,{'pk':'combat-worker'}) as token:
        if not token:return
        CombatRuntime.objects.filter(pk='combat-worker',token=token).update(requests={'process_id':os.getpid()})
        from .recovery import recover
        recover()
        for row in Exploration.objects.filter(status='active',next_tick_at__lte=storage_time(local_time())).values('id','revision'):
            tick(row['id'],row['revision'])
        for identity in Exploration.objects.filter(status='preparing',id__in=CombatRuntime.objects.filter(authorized=True).values('id')).values_list('id',flat=True):
            existing=_preparations.get(identity)
            if existing and existing.is_alive():continue
            worker=threading.Thread(target=prepare_one,args=(identity,),name='combat-prepare',daemon=True)
            _preparations[identity]=worker;worker.start()
        from .models import CombatFact, CombatProfile
        from .facts import append
        from django.db import transaction
        for run in Exploration.objects.filter(ended_at__isnull=False,id__in=CombatRuntime.objects.filter(promotion_pending=True).values('id')).exclude(id__in=CombatFact.objects.filter(kind='promotion_attempt').values('exploration_id')):
            with farm_gate(),transaction.atomic():
                append(CombatProfile.objects.get(pk=run.actor_id),run.pk+':promotion_attempt','promotion_attempt',{},run)
                CombatRuntime.objects.filter(pk=run.pk).update(promotion_pending=False)
                runtime=CombatRuntime.objects.get(pk=run.pk)
                runtime.requests={**runtime.requests,'promotion_allowed':True};runtime.save(update_fields=['requests'])
            threading.Thread(target=promote_one,args=(run.pk,),name='combat-promotion',daemon=True).start()
        for key,worker in list(_preparations.items()):
            if not worker.is_alive():_preparations.pop(key,None)


def loop():
    from .store import install
    while not _stop.is_set():
        try:
            close_old_connections()
            install()
            advance()
        except Exception:logger.exception('探索推进暂不可用，将重试')
        finally:close_old_connections()
        _stop.wait(5)


def start():
    global _thread
    from system_settings.sync_scheduler import _is_server_process
    if os.getenv('ODOC_DISABLE_COMBAT_WORKER')=='1' or not (_is_server_process() or ('runserver' in sys.argv and '--noreload' in sys.argv)) or (_thread and _thread.is_alive()):return
    _stop.clear();_thread=threading.Thread(target=loop,name='combat-ticks',daemon=True);_thread.start()


def stop():
    _stop.set()
    if _thread and _thread.is_alive():_thread.join(timeout=2)
    if not _thread:return
    try:
        from .sync import revoke
        with farm_gate():revoke(disable_auto=False)
    except Exception:logger.exception('关闭探索授权失败')


atexit.register(stop)
