import copy
import hashlib
import logging
import uuid
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from system_settings.models import AgentTask, AgentExecutionLease, WorldActionRuntime
from .action_schedule import select_agent, take_due
from .execution import execution_lease
from .travel_models import TravelJourney, TravelRuntime, TravelNode
from .travel_candidates import candidates
from .travel_config import TravelConfigSerializer
from .travel_steps import advance
from .travel_notifications import notify
from .travel_publication import recover_photo
from .travel_activity import start_activity, update_activity

logger = logging.getLogger(__name__)


def run_travel_opportunity(task, scheduler=None, *, key=None, manual=False, locked=False):
    if not locked:
        with execution_lease(WorldActionRuntime, {'pk': 'world'}) as token:
            if token:
                return run_travel_opportunity(task, scheduler, key=key, manual=manual, locked=token)
        return None
    key = key or hashlib.sha256(f'manual:{uuid.uuid4()}'.encode()).hexdigest()
    existing = TravelJourney.objects.filter(pk=key).first()
    if existing:
        return existing
    config = TravelConfigSerializer(data=task.travel_config, context={'previous': task.travel_config,
        'enabled': True, 'agent_ids': task.agent_ids or [task.agent_id]})
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
    runtime, _ = TravelRuntime.objects.get_or_create(pk=journey.pk)
    if not runtime.authorized or runtime.next_at > timezone.now() or journey.status not in ['active', 'waiting']:
        return
    if not journey.agent_id:
        journey.status = 'manual'
        journey.save(update_fields=['status', 'updated_at'])
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
                TravelNode.objects.filter(pk=f'{journey.pk}:{journey.phase}').update(status=journey.status, error=str(exc)[:1000])
                update_activity(journey, str(exc))
                runtime.next_at = timezone.now()+timedelta(minutes=[1, 5, 15][min(runtime.attempts-1, 2)])
                if journey.status == 'manual':
                    notify(journey, f'node:{journey.phase}', str(exc))
            runtime.save(update_fields=['attempts', 'next_at'])


def tick_travel(scheduler, token):
    authorized = TravelRuntime.objects.filter(authorized=True).values_list('id', flat=True)
    for journey in TravelJourney.objects.filter(pk__in=authorized, status__in=['active', 'waiting']).select_related('agent', 'task')[:20]:
        if journey.task and journey.task.enabled:
            process_journey(journey)
    for journey in TravelJourney.objects.filter(pk__in=authorized, status='completed', snapshot__photo__status__in=['pending', 'generating']).select_related('agent')[:20]:
        with execution_lease(TravelRuntime, {'pk': journey.pk}) as photo_token:
            if photo_token and journey.agent:
                recover_photo(journey)
    for task in AgentTask.objects.filter(task_kind='travel', enabled=True, trigger='定时任务'):
        key = take_due(task)
        if key:
            try:
                run_travel_opportunity(task, scheduler, key=key, locked=token)
            except Exception:
                logger.exception('旅行任务配置或机会执行失败 task=%s', task.pk)
