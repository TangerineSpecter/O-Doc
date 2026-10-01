import copy
import hashlib
import logging
import uuid
from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from system_settings.models import AgentTask, AgentExecutionLease, WorldActionRuntime, WorldAction
from .action_schedule import select_agent, take_due
from .execution import WorldLeaseBusy, defer_when_world_busy, execution_lease
from .travel_models import TravelJourney, TravelRuntime, TravelNode
from .travel_candidates import candidates
from .travel_config import TravelConfigSerializer
from .travel_steps import advance, record_attempt
from .travel_notifications import notify
from .travel_publication import recover_photo
from .travel_activity import start_activity, update_activity
from .run_diagnostics import failure_detail

logger = logging.getLogger(__name__)


def run_travel_opportunity(task, scheduler=None, *, key=None, manual=False, locked=False):
    if not locked:
        with execution_lease(WorldActionRuntime, {'pk': 'world'}) as token:
            if token:
                return run_travel_opportunity(task, scheduler, key=key, manual=manual, locked=token)
        if defer_when_world_busy.get():
            raise WorldLeaseBusy()
        return None
    key = key or hashlib.sha256(f'manual:{uuid.uuid4()}'.encode()).hexdigest()
    existing = TravelJourney.objects.filter(pk=key).first()
    if existing:
        return existing
    from .life_scope import CURRENT
    pinned=CURRENT.get()
    config = TravelConfigSerializer(data=task.travel_config, context={'previous': task.travel_config,
        'enabled': True, 'agent_ids': [pinned['actor_id']] if pinned else task.agent_ids or [task.agent_id]})
    config.is_valid(raise_exception=True)
    busy = set(TravelJourney.objects.filter(status__in=['active', 'waiting', 'manual', 'paused'], returned_at__isnull=True).values_list('actor_id', flat=True))
    agent = select_agent(task, cost=task.travel_config.get('energy_cost', 20), qualifies=lambda a: a.pk not in busy)
    if not agent:
        return None
    with transaction.atomic():
        journey, created = TravelJourney.objects.get_or_create(pk=key, defaults={'task': task, 'agent': agent,
            'actor_id': agent.pk, 'owner_id': task.travel_config['owner_id'], 'phase': 'preview',
            'snapshot': {'config': copy.deepcopy(task.travel_config), 'agent_name': agent.name,
                'role_prompt': f'当前 Agent：{agent.name}\n{agent.prompt}', 'extra': task.prompt,
                'candidates': candidates(agent, task.travel_config.get('recent_cities', 3))}})
        TravelRuntime.objects.update_or_create(pk=journey.pk, defaults={'authorized': True})
        start_activity(journey, manual)
    process_journey(journey)
    return journey


def process_journey(journey):
    from .life_models import LifeItem
    from .life_scope import check_item_authorization,CURRENT,life_scope
    item=LifeItem.objects.filter(pk=journey.pk).first()
    if item and journey.agent and not CURRENT.get():
        from .life_context import build_context
        with life_scope(item,build_context(item.owner_id,journey.agent,item)):
            return process_journey(journey)
    if item:
        try:check_item_authorization(item)
        except ValueError:return
    runtime, _ = TravelRuntime.objects.get_or_create(pk=journey.pk)
    if not runtime.authorized or runtime.next_at > timezone.now() or journey.status not in ['active', 'waiting']:
        return
    if not journey.agent_id:
        journey.status = 'manual'
        journey.save(update_fields=['status', 'updated_at'])
        update_activity(journey, '角色已删除，旅行历史已保留')
        notify(journey, 'missing-agent', '角色已删除，旅行历史已保留')
        return
    with execution_lease(TravelRuntime, {'pk': journey.pk}) as token:
        if not token:
            return
        with execution_lease(AgentExecutionLease, {'agent_id': journey.actor_id}) as agent_token:
            if not agent_token:
                return
            journey.refresh_from_db()
            runtime.refresh_from_db()
            if journey.status not in ['active', 'waiting'] or not runtime.authorized or runtime.next_at > timezone.now():
                return
            if not journey.agent_id:
                journey.status = 'manual'
                journey.save(update_fields=['status', 'updated_at'])
                update_activity(journey, '角色已删除，旅行历史已保留')
                notify(journey, 'missing-agent', '角色已删除，旅行历史已保留')
                return
            journey.status = 'active'
            journey.save(update_fields=['status', 'updated_at'])
            update_activity(journey)
            try:
                advance(journey)
                update_activity(journey)
                runtime.attempts = 0
                runtime.next_at = timezone.now()+timedelta(minutes=journey.snapshot['config'].get('node_minutes', 1))
            except Exception as exc:
                logger.exception('旅行节点失败 journey=%s phase=%s', journey.pk, journey.phase)
                runtime.attempts += 1
                journey.refresh_from_db()
                journey.status = 'waiting' if runtime.attempts <= 3 else 'manual'
                journey.save(update_fields=['status', 'updated_at'])
                detail = failure_detail(journey.phase, exc)
                node, _ = TravelNode.objects.get_or_create(pk=f'{journey.pk}:{journey.phase}',
                    defaults={'journey': journey, 'kind': journey.phase})
                if node:
                    record_attempt(node, 'failed', detail, node_status=journey.status)
                update_activity(journey, detail)
                runtime.next_at = timezone.now()+timedelta(minutes=[1, 5, 15][min(runtime.attempts-1, 2)])
                if journey.status == 'manual':
                    notify(journey, f'node:{journey.phase}', str(exc))
            runtime.save(update_fields=['attempts', 'next_at'])


def tick_travel(scheduler, token, *, manual_only=False):
    authorized = TravelRuntime.objects.filter(authorized=True).values_list('id', flat=True)
    from .life_models import LifeItem
    manual_trips = list(WorldAction.objects.filter(record__trigger='手动执行').values_list('id', flat=True))
    manual_trips += list(LifeItem.objects.filter(context__manual=True, activity='travel').values_list('id', flat=True))
    active_authorized = authorized.filter(id__in=manual_trips) if manual_only else authorized
    for journey in TravelJourney.objects.filter(pk__in=active_authorized, status__in=['active', 'waiting']).select_related('agent', 'task')[:20]:
        if journey.task and journey.task.enabled:
            process_journey(journey)
    photos = TravelJourney.objects.filter(pk__in=authorized, status='completed', snapshot__photo__status__in=['pending', 'generating'])
    if manual_only:
        # 补图的人工授权独立于原旅行触发方式；本机授权不会随业务记录同步。
        photo_keys = TravelRuntime.objects.filter(authorized=True, id__endswith=':photo').values_list('id', flat=True)
        photos = photos.filter(Q(pk__in=manual_trips) | Q(pk__in=[key[:-6] for key in photo_keys]))
    for journey in photos.select_related('agent')[:20]:
        with execution_lease(TravelRuntime, {'pk': journey.pk}) as photo_token:
            if photo_token and journey.agent:
                recover_photo(journey)
    if manual_only:
        return
    return
