"""Fair, bounded idle scheduling. Main planning always runs before this dispatcher."""
import logging
from datetime import timedelta, datetime
from types import SimpleNamespace
from django.db import transaction
from system_settings.models import Agent, WorldActionRuntime
from .farm_gate import farm_gate
from .life_models import LifeItem, LifeInterleavingState
from .life_activities import is_interleaved, main_items
from .life_config import DEFAULTS, effective_settings, task_for
from .life_time import local_time, storage_time
from .life_schedule import OPEN, stable_id, revise
from .life_occupancy import occupied
from .life_interleaving_candidates import build, selection_input, available_window
from .life_interleaving_choices import choose, checkpoint_choice
from .life_interleaving_recovery import expire_selections, finish_selection

logger = logging.getLogger(__name__)


def ready(config, agent, now, item=None):
    if not config.settings.get('interleaving_enabled', False) or agent.pk in config.paused_agents:
        return False
    if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists() or agent.archived:
        return False
    if agent.pk not in effective_settings(config, now).get('agent_ids', []):
        return False
    if LifeItem.objects.filter(actor_id=agent.pk, status__in=OPEN, context__interleaving__version=1).exclude(pk=item.pk if item else '').exists():
        return False
    if occupied(item or SimpleNamespace(pk='', actor_id=agent.pk)):
        return False
    today_end = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    rows = main_items(LifeItem.objects.filter(owner_id=config.pk, actor_id=agent.pk, status__in=OPEN))
    if rows.filter(scheduled_at__lte=storage_time(now)).exists():
        return False
    if rows.filter(scheduled_at__lt=storage_time(today_end), activity='unplanned').exists():
        return False
    # No cycle means initial planning has not run yet, not a free day.
    from .life_models import LifeCycle
    return LifeCycle.objects.filter(owner_id=config.pk, starts_at__lte=storage_time(now), ends_at__gt=storage_time(now)).exists()


def expire(item, reason):
    revise(item, reason, status='cancelled', result={'reason': reason})
    from .life_interleaving_usage import complete
    complete(item)


def prepare(item, agent):
    kind = item.activity
    if kind not in ('cooking', 'alchemy') or item.context.get(kind + '_plan'):
        return
    from .life_commitments import capacity
    if kind == 'cooking':
        from .cooking_schedule_plan import planning_facts, decide_plan
    else:
        from .alchemy_schedule_plan import planning_facts, decide_plan
    from .life_config import config_for
    task = task_for(item.owner_id, agent, kind)
    facts = planning_facts(item.owner_id, agent, exclude_ids=[item.pk])
    facts['energy'] = capacity(item.owner_id, agent, exclude_item=item.pk)['energy']
    facts['task_preference'] = task.prompt
    # Persist the domain-only input after selection. Retries replay the exact
    # selected prefix; real stock/energy is checked again by each commit service.
    from django.core.serializers.json import DjangoJSONEncoder
    import json
    saved = item.context['interleaving'].get('preparation_facts')
    if saved is None:
        item.context['interleaving']['preparation_facts'] = json.loads(json.dumps(facts, cls=DjangoJSONEncoder))
        item.save(update_fields=['context', 'updated_at'])
    else:
        facts = saved
    cursor = 0
    def decide(scene, state, choices):
        nonlocal cursor
        cursor += 1
        if not available_window(item.owner_id, agent.pk, exclude_item=item.pk):
            raise ValueError('准备期间空档已经结束')
        return checkpoint_choice(item, agent, str(cursor), scene, state, choices, task=task)
    if kind == 'cooking':
        plan = decide_plan(agent, item.owner_id, facts, key=item.pk, task=task, decide=decide)
    else:
        plan = decide_plan(agent, item.owner_id, facts, task=task, decide=decide)
    item.refresh_from_db()
    item.context[kind + '_plan'] = plan
    item.save(update_fields=['context', 'updated_at'])


def process(config, state, scheduler, now):
    agent = Agent.objects.select_related('model').filter(pk=state.pk, archived_at__isnull=True).first()
    if not agent:
        return
    settings = {**DEFAULTS, **config.settings}
    state.next_check_at = now + timedelta(minutes=settings['interleaving_check_minutes'])
    state.save(update_fields=['next_check_at', 'updated_at'])
    item = state.item
    if item:
        if item.status == 'running' or (item.status in OPEN and item.context.get('execution_started')):
            return  # Existing domain worker owns continuation, never create another run.
        if item.status not in OPEN:
            from .life_interleaving_usage import complete
            complete(item)
            state.item = None
            state.phase = 'idle'
            state.checkpoint = {}
            state.save()
            item = None
        elif local_time(datetime.fromisoformat(item.context['interleaving']['expires_at'])) <= now or not available_window(config.pk, agent.pk, now, exclude_item=item.pk):
            expire(item, '系统说明：未开始的空档穿插已过期')
            return
    if not ready(config, agent, now, item):
        return
    if state.phase == 'backoff' and now < local_time(state.next_decision_at):
        return
    if not item:
        if now < local_time(state.next_decision_at):
            return
        expires = state.checkpoint.get('expires_at')
        if expires and local_time(datetime.fromisoformat(expires)) <= now:
            if not finish_selection(state, '系统说明：未开始的空档机会已过期'):
                return
        candidates, resource, gap = build(config, agent, now)
        if not candidates:
            return
        selected_at = state.checkpoint.get('selected_at')
        if selected_at and local_time(datetime.fromisoformat(selected_at)).date() != now.date():
            if not finish_selection(state, '系统说明：空档机会已跨日失效'):
                return
        opportunity = state.checkpoint.get('opportunity_id') or stable_id('interleaving', config.pk, agent.pk, now.isoformat())
        state.phase = 'selecting'
        state.checkpoint = {**state.checkpoint, 'opportunity_id': opportunity,
                            'expires_at': state.checkpoint.get('expires_at') or (now + timedelta(seconds=gap)).isoformat()}
        state.last_decision_at = now
        state.next_decision_at = now + timedelta(minutes=settings['interleaving_decision_minutes'])
        state.save()
        from .life_interleaving_usage import root_record
        decision_record = root_record(config.pk, agent, opportunity)
        if decision_record.status != 'running':
            finish_selection(state, '系统说明：原空档选择记录已经结束')
            return
        selected = state.checkpoint.get('selected')
        if selected is None:
            selected = choose(config.pk, agent, 'life_interleaving', selection_input(config, agent, candidates, resource, gap, now),
                              {**{kind: value for kind, value in candidates.items()}, 'wait': '暂不活动'}, record=decision_record)
        now = local_time()
        if now >= local_time(datetime.fromisoformat(state.checkpoint['expires_at'])):
            finish_selection(state, '系统说明：决策返回时空档机会已过期')
            return
        state.checkpoint = {**state.checkpoint, 'selected': selected, 'selected_at': now.isoformat()}
        state.save()
        if selected == 'wait':
            from .run_diagnostics import finish_record
            finish_record(decision_record, 'success', '系统说明：本次暂不活动', '', '空档选择结束')
            state.phase = 'idle'
            state.checkpoint = {'last_choice': 'wait'}
            state.next_decision_at = now + timedelta(minutes=max(settings['interleaving_decision_minutes'], settings['interleaving_wait_minutes']))
            state.save()
            return
        with farm_gate(), transaction.atomic():
            agent.refresh_from_db()
            config.refresh_from_db()
            if not ready(config, agent, now):
                finish_selection(state, '系统说明：决策后空档或居民状态发生变化，本次机会结束')
                return
            candidates, resource, gap = build(config, agent, now)
            if selected not in candidates:
                finish_selection(state, '系统说明：选择后条件失效')
                return
            item, _ = LifeItem.objects.get_or_create(pk=opportunity, defaults={
                'owner_id': config.pk, 'actor_id': agent.pk, 'original_at': now, 'scheduled_at': now,
                'activity': selected, 'task_id': task_for(config.pk, agent, selected).pk,
                'intent': '系统说明：在日程空档内，根据可用资源选择活动',
                'context': {'planned_on': now.date().isoformat(), 'interleaving': {
                    'version': 1, 'opportunity_id': opportunity, 'choices': [], 'selection_record_id': decision_record.pk,
                    'expires_at': (now + timedelta(seconds=gap)).isoformat(),
                    'resource_basis': resource, 'selection': selected}}})
            state.item = item
            state.phase = 'preparing'
            state.save()
    if item.status == 'paused':
        revise(item, '系统说明：居民恢复，继续原穿插准备', status='pending')
    prepare(item, agent)
    now = local_time()
    config.refresh_from_db()
    if not ready(config, agent, now, item) or not available_window(config.pk, agent.pk, now, exclude_item=item.pk):
        expire(item, '系统说明：准备后空档或居民状态发生变化')
        return
    from .life_runner import execute_item
    execute_item(item, scheduler)
    item.refresh_from_db()
    from .life_interleaving_usage import complete
    if item.status not in OPEN:
        complete(item)
    state.phase = 'running' if item.status == 'running' else 'idle'
    state.save()


def tick(config, scheduler, now=None):
    from .execution import execution_lease
    now = local_time(now)
    expire_selections(now, owner=config.pk)
    # Expiration also runs while disabled: disabling must not make stale work due.
    for item in LifeItem.objects.filter(owner_id=config.pk, status__in=('pending', 'deferred'), context__interleaving__version=1):
        if not item.context.get('execution_started') and local_time(datetime.fromisoformat(item.context['interleaving']['expires_at'])) <= now:
            expire(item, '系统说明：未开始的空档穿插已过期')
    if not config.settings.get('interleaving_enabled', False):
        return
    with execution_lease(WorldActionRuntime, {'pk': 'life-planner'}) as token:
        if not token:
            return
        ids = [pk for pk in effective_settings(config, now).get('agent_ids', []) if pk not in config.paused_agents]
        for actor in ids:
            LifeInterleavingState.objects.get_or_create(pk=actor, defaults={'owner_id': config.pk})
        state = LifeInterleavingState.objects.filter(owner_id=config.pk, pk__in=ids,
            next_check_at__lte=storage_time(now)).select_related('item').order_by('next_check_at', 'id').first()
        if not state:
            return
        try:
            process(config, state, scheduler, now)
        except Exception as exc:
            from system_settings.decision.jev import DecisionUnavailable
            state.refresh_from_db()
            state.phase = 'backoff'
            state.checkpoint = {**state.checkpoint, 'error': str(exc)[:300]}
            state.next_check_at = max(local_time(state.next_decision_at), local_time() + timedelta(minutes=5))
            state.save()
            if isinstance(exc, ValueError) and not isinstance(exc, DecisionUnavailable) and state.item and state.item.status in ('pending', 'deferred'):
                expire(state.item, '系统说明：准备条件失效，' + str(exc)[:200])
            logger.warning('空档穿插等待重试 actor=%s reason=%s', state.pk, type(exc).__name__)
