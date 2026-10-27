"""Appointment orchestration. No model calls or paid preparation under the coordinator lock."""
from copy import deepcopy
from datetime import timedelta
import logging
from django.db import transaction
from ..farm_gate import farm_gate
from ..life_time import local_time
from ..life_models import LifeItem
from .reservation_models import AdventureReservation
from .models import Exploration, CombatRuntime
from . import explorations

logger = logging.getLogger(__name__)


def publish(row):
    row.revision += 1
    row.save()
    for member in row.snapshot['members'].values():
        item = LifeItem.objects.get(pk=member['item_id'])
        item.context = {**item.context, 'reservation_revision': row.revision}
        item.save()


def permitted(row):
    return CombatRuntime.objects.filter(pk=row.pk, owner_id=row.owner_id, authorized=True,
        requests__origin=row.snapshot['origin']).exists()


def cancel(row, reason, *, now=None):
    if row.status in ('completed', 'cancelled'):
        return
    if row.status == 'active':
        raise ValueError('预约已出发，请通过探索入口召回成员')
    for member in row.snapshot['members'].values():
        item = LifeItem.objects.filter(pk=member['item_id']).first()
        member_reason = (item.result or {}).get('reason', '') if item and item.status == 'failed' else ''
        run = Exploration.objects.filter(pk=member['run_id']).first()
        if run and run.ended_at is None:
            explorations.finish(run.pk, 'failed', reason, now)
        member['status'] = 'cancelled'
        detail = f'{reason}；该成员：{member_reason}' if member_reason and member_reason != reason else reason
        LifeItem.objects.filter(pk=member['item_id']).update(status='cancelled', result={'reason': detail})
    row.status = 'cancelled'
    row.snapshot['reason'] = reason
    CombatRuntime.objects.filter(pk=row.pk).update(authorized=False)
    publish(row)


def cancel_expired(row, *, now=None):
    """Record only facts observable at settlement, not a guessed historical cause."""
    if row.status in ('completed', 'cancelled'):
        return
    members = row.snapshot['members'].values()
    run_ids = [member['run_id'] for member in members]
    runs = list(Exploration.objects.filter(pk__in=run_ids))
    ready = sum(run.status == 'preparing' and run.phase == 'waiting_reservation' and not run.ended_at for run in runs)
    authorized = permitted(row)
    reason = (f'预约时间已过，未补打探索。收尾时本机预约授权{"有效" if authorized else "未生效"}；'
              f'已建立准备记录 {len(runs)}/{len(run_ids)} 人，等待出发 {ready}/{len(run_ids)} 人。'
              '这些是收尾时的状态，无法单凭它们确定错过出发的具体原因。')
    logger.warning('组队预约到期未出发 reservation=%s owner=%s authorized=%s preparations=%s ready=%s members=%s',
                   row.pk, row.owner_id, authorized, len(runs), ready, len(run_ids))
    cancel(row, reason, now=now)


def prepare_member(row, actor, member, now):
    from system_settings.models import Agent
    from ..life_scope import check_item_authorization
    item = LifeItem.objects.get(pk=member['item_id'])
    check_item_authorization(item)
    agent = Agent.objects.get(pk=actor)
    duration = int((row.ends_at-row.starts_at).total_seconds())
    run = explorations.request(row.owner_id, agent, member['run_id'],
        {'dungeon_id': row.dungeon_id, 'duration_seconds': duration, 'adventure_mode': 'solo'}, life_item=item, now=now)
    if not run.record_id:
        from system_settings.models import AgentRunRecord, AgentTask
        record = AgentRunRecord.objects.create(task=AgentTask.objects.get(pk=item.task_id), agent=agent, agent_name=agent.name, task_name='组队探索预约', trigger='生活安排', summary='准备组队探索')
        run.record_id = record.pk
        run.save()
        from .facts import append
        from .models import CombatProfile
        append(CombatProfile.objects.get(pk=actor), run.pk+':record', 'record', {'record_id':record.pk}, run)
    if not run.snapshot.get('reservation_id'):
        run.snapshot.update(reservation_id=row.pk, reservation_ends_at=row.ends_at.isoformat(), adventure_choice='solo')
        run.save()
        from .facts import append
        from .models import CombatProfile
        append(CombatProfile.objects.get(pk=actor), run.pk+':reservation', 'reservation', {'reservation_id': row.pk}, run)
    member['status'] = 'preparing'


def finish_member(row, member, reason, now):
    run = Exploration.objects.filter(pk=member['run_id']).first()
    if run and run.ended_at is None:
        explorations.finish(run.pk, 'failed', reason, now)
    member['status'] = 'failed'
    LifeItem.objects.filter(pk=member['item_id']).update(status='failed', result={'reason': reason})


def start(row, now):
    from ..life_scope import check_item_authorization
    from .reservation_resources import require_window, quota_remaining
    from .models import CombatProfile
    from .explorations import busy, energy
    from ..execution import stamina
    from system_settings.models import Agent
    # Admission is rechecked before spending; failed readiness never delays departure.
    ready = []
    remaining = int((local_time(row.ends_at)-now).total_seconds())
    for actor, member in row.snapshot['members'].items():
        if member.get('status') in ('failed', 'cancelled'):
            continue
        run = Exploration.objects.filter(pk=member['run_id'], status='preparing', phase='waiting_reservation').first()
        try:
            if remaining < 600 or not run or not CombatRuntime.objects.filter(pk=run.pk, authorized=True).exists():
                raise ValueError('预约准备未完成或已错过可参与时间')
            item = LifeItem.objects.get(pk=member['item_id'])
            check_item_authorization(item)
            from ..life_config import task_for
            if not task_for(row.owner_id, Agent.objects.get(pk=actor), 'exploration'):
                raise ValueError('居民已退出探索参与范围')
            require_window(row.owner_id, actor, now, remaining, exclude_item=item.pk)
            profile = CombatProfile.objects.get(pk=actor)
            from .store import current
            from . import attributes
            catalog = current(run.catalog_id)
            dungeon = catalog.row('dungeons', row.dungeon_id)
            if dungeon.get('enabled') != '1' or profile.progression['level'] < int(dungeon['recommended_level_min']) or attributes.promotion_options(catalog, profile.progression) or (profile.rest_until and local_time(profile.rest_until) > now):
                raise ValueError('出发时区域、休整或转职资格失效')
            if ready and run.catalog_id != ready[0][2].catalog_id:
                raise ValueError('组队目录版本不一致')
            from ..life_activities import main_items
            from ..life_time import storage_time
            if main_items(LifeItem.objects.filter(owner_id=row.owner_id, actor_id=actor, status__in=('pending', 'deferred', 'running'), scheduled_at__lt=storage_time(local_time(row.ends_at)))).exclude(activity='rest').exists():
                raise ValueError('主日程未完成或与探索时间冲突')
            if quota_remaining(profile, now.date(), exclude_item=item.pk) < remaining or stamina(Agent.objects.get(pk=actor)) < energy(remaining) or busy(actor, excluding=run.pk):
                raise ValueError('出发时体力、额度或空闲条件失效')
            ready.append((actor, member, run))
        except ValueError as exc:
            finish_member(row, member, str(exc), now)
    if len(ready) < 2:
        cancel(row, '就绪成员不足两人，取消本次组队预约', now=now)
        return
    # Any unexpected debit failure rolls this entire start back, never leaves a solo first wave.
    from .party_models import AdventureParty
    from .party_sessions import wave
    party = None
    for actor, member, run in ready:
        plan = deepcopy(run.snapshot['prepared_plan'])
        plan['duration_seconds'] = remaining
        # Original requested constraint is retained; late starts shorten only the actual run.
        run.snapshot['constraints']['duration_seconds'] = remaining
        run.save()
        from ..life_scope import life_scope
        with life_scope(LifeItem.objects.get(pk=member['item_id']), {}):
            explorations.depart(run.pk, plan, now=now, party=party, start_wave=False)
        run.refresh_from_db()
        party = AdventureParty.objects.get(pk=run.snapshot['party_id'])
        member['status'] = 'active'
        LifeItem.objects.filter(pk=member['item_id']).update(status='running', record_id=run.record_id)
    party.ends_at = row.ends_at
    party.save()
    wave(party, now)
    from .facts import append
    for actor, member, run in ready:
        run.refresh_from_db()
        append(CombatProfile.objects.get(pk=actor), run.pk+':reservation-departed', 'reservation_departed', {'reservation_id':row.pk,'party_id':party.pk}, run)
    row.snapshot['party_id'] = party.pk
    row.status = 'active'
    publish(row)


def tick(config, now=None):
    from system_settings.models import WorldActionRuntime
    if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
        return
    now = local_time(now)
    for identity in AdventureReservation.objects.filter(owner_id=config.pk, status__in=('reserved', 'preparing', 'active')).values_list('pk', flat=True):
        with farm_gate(), transaction.atomic():
            row = AdventureReservation.objects.select_for_update().get(pk=identity)
            if row.status == 'active':
                changed = False
                for member in row.snapshot['members'].values():
                    run = Exploration.objects.filter(pk=member['run_id']).first()
                    if run and run.ended_at and member['status'] == 'active':
                        member['status'] = 'completed'; changed = True
                        LifeItem.objects.filter(pk=member['item_id']).update(status='completed', result=run.result)
                if all(m['status'] in ('completed', 'failed', 'cancelled') for m in row.snapshot['members'].values()):
                    row.status = 'completed'; changed = True
                if changed:
                    publish(row)
                continue
            if now >= local_time(row.ends_at):
                cancel_expired(row, now=now)
            elif not permitted(row):
                continue
            elif now >= local_time(row.starts_at):
                try:
                    with transaction.atomic():
                        start(row, now)
                except ValueError as exc:
                    row.refresh_from_db()
                    cancel(row, '共同出发复核失败：'+str(exc), now=now)
            elif now >= local_time(row.prepare_at):
                for actor, member in row.snapshot['members'].items():
                    if member['status'] != 'reserved':
                        continue
                    try:
                        with transaction.atomic():
                            prepare_member(row, actor, member, now)
                    except ValueError as exc:
                        finish_member(row, member, str(exc), now)
                row.status = 'preparing'
                publish(row)
