"""Resume only local explorations; downtime never extends their departure deadline."""
from datetime import timedelta
from .models import CombatFact, Exploration
from .permissions import local_runtime
from ..life_time import local_time


def deadline(run: Exploration):
    departure=CombatFact.objects.filter(exploration_id=run.pk,kind='depart').first()
    return local_time(departure.created_at)+timedelta(seconds=run.duration_seconds) if departure else None


def recover(now=None) -> None:
    from .explorations import finish, resume
    from ..farm_gate import farm_gate
    from django.db import transaction
    now=local_time(now)
    for identity in Exploration.objects.filter(status='paused').values_list('pk',flat=True):
        with farm_gate(),transaction.atomic():
            run=Exploration.objects.select_for_update().get(pk=identity)
            if run.status!='paused' or not local_runtime(run):continue
            end=deadline(run)
            if end and now>=end:
                finish(run.pk,'completed','已到预计返回时间；暂停期间不计探索成果',now)
                continue
            try:
                resume(run.pk,now=now)
            except ValueError as exc:
                # Release the resident rather than block all subsequent life activities.
                finish(run.pk,'recalled','自动接续条件不满足，提前返回：'+str(exc),now)
