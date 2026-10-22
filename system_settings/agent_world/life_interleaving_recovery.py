"""Retire selection-only opportunities without changing domain worker ownership."""
from datetime import datetime

from django.db import transaction
from django.db.models import Q
from system_settings.models import AgentRunRecord
from .farm_gate import guarded
from .life_models import LifeInterleavingState, LifeItem
from .life_time import local_time


@guarded
@transaction.atomic
def finish_selection(state: LifeInterleavingState, reason: str) -> bool:
    opportunity = state.checkpoint.get('opportunity_id')
    if not opportunity:
        return False
    locked = LifeInterleavingState.objects.select_for_update().get(pk=state.pk)
    if locked.item_id or locked.checkpoint.get('opportunity_id') != opportunity:
        return False
    record_id = 'idle:' + opportunity[:35]
    # The durable domain item wins even if a restored state lacks its pointer.
    if LifeItem.objects.filter(Q(pk=opportunity) | Q(context__interleaving__selection_record_id=record_id)).exists():
        return False
    record = AgentRunRecord.objects.select_for_update().filter(pk=record_id, agent_id=locked.pk,
        trigger='系统穿插', random_context__owner_id=locked.owner_id,
        random_context__interleaving_opportunity_id=opportunity).first()
    if record and record.status == 'running':
        from .run_diagnostics import finish_record
        finish_record(record, 'failed', reason, '', '空档选择结束')
    locked.phase, locked.checkpoint = 'idle', {}
    # Ending an opportunity never grants an earlier decision or another action.
    locked.save(update_fields=['phase', 'checkpoint', 'updated_at'])
    state.refresh_from_db()
    return True


def expire_selections(now=None, *, owner: str | None = None) -> None:
    """Accounting runs independently of world switches and participant eligibility."""
    now = local_time(now)
    states = LifeInterleavingState.objects.filter(item__isnull=True).exclude(checkpoint={})
    if owner is not None:
        states = states.filter(owner_id=owner)
    for state in states:
        expires = state.checkpoint.get('expires_at')
        if expires and local_time(datetime.fromisoformat(expires)) <= now:
            finish_selection(state, '系统说明：未开始的空档机会已过期')
