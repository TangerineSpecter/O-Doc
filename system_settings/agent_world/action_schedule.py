"""世界机会排程，与自定义任务的成功配额补齐分开。"""
import hashlib
import random
from datetime import datetime, timedelta

from django.utils import timezone

from system_settings.agent_random_schedule import local_now, period_bounds
from system_settings.models import Agent, AgentExecutionLease, WorldAction
from .execution import INTERACTION_COST, stamina


def initialize(task, now=None):
    now = now or local_now()
    state = dict(task.world_state or {})
    config = state.get('schedule', {})
    if task.schedule_mode == 'random':
        if config.get('mode') != 'random' or datetime.fromisoformat(config['end']) <= now:
            start, end = period_bounds(task.random_period, now)
            origin = max(start, now)
            plan = hashlib.sha256(f'{task.pk}:{origin.isoformat()}:{task.random_period}:{task.random_count}'.encode()).hexdigest()
            rng = random.Random(plan)
            seconds = (end - origin).total_seconds()
            config = {'mode': 'random', 'id': plan, 'period': task.random_period, 'count': task.random_count,
                      'start': start.isoformat(), 'end': end.isoformat(), 'index': 0, 'missed': 0,
                      'slots': [(origin + timedelta(seconds=seconds * (i + rng.random()) / task.random_count)).isoformat()
                                for i in range(task.random_count)]}
    elif config.get('mode') != 'fixed' or config.get('interval') != task.interval_minutes:
        config = {'mode': 'fixed', 'interval': task.interval_minutes, 'next': (now + timedelta(minutes=task.interval_minutes)).isoformat()}
    state['schedule'] = config
    if state != task.world_state:
        task.world_state = state
        task.save(update_fields=['world_state'])
    return config


def take_due(task, now=None) -> str | None:
    now = now or local_now()
    config = initialize(task, now)
    due = None
    if config['mode'] == 'fixed':
        when = datetime.fromisoformat(config['next'])
        if when <= now:
            if (now - when).total_seconds() <= 90:
                due = hashlib.sha256(f'{task.pk}:fixed:{when.isoformat()}'.encode()).hexdigest()
            config['next'] = (now + timedelta(minutes=task.interval_minutes)).isoformat()
    else:
        while config['index'] < config['count']:
            index = config['index']
            when = datetime.fromisoformat(config['slots'][index])
            if when > now:
                break
            config['index'] += 1
            if (now - when).total_seconds() <= 90:
                if due:
                    config['missed'] += 1
                due = hashlib.sha256(f'{config["id"]}:{index}'.encode()).hexdigest()
            else:
                config['missed'] += 1
    task.world_state = {**task.world_state, 'schedule': config}
    task.save(update_fields=['world_state'])
    return due


def select_agent(task, now=None):
    now = now or timezone.now()
    ids = task.agent_ids or ([task.agent_id] if task.agent_id else [])
    agents = {a.pk: a for a in Agent.objects.select_related('model').filter(pk__in=ids)}
    busy = set(AgentExecutionLease.objects.filter(until__gt=now).values_list('agent_id', flat=True))
    eligible = {key for key, agent in agents.items() if key not in busy and stamina(agent, now) >= INTERACTION_COST}
    state = dict(task.world_state or {})
    round_state = dict(state.get('round', {}))
    remaining = set(round_state.get('remaining', [])) & eligible
    removed = set(round_state.get('remaining', [])) - remaining
    round_state['removed'] = list(set(round_state.get('removed', [])) | removed)
    if not remaining:
        remaining = eligible
        round_state = {'number': round_state.get('number', 0) + 1, 'members': list(eligible), 'removed': []}
    recent = set(WorldAction.objects.filter(actor_id__in=remaining, created_at__gt=now - timedelta(minutes=15)).values_list('actor_id', flat=True))
    available = remaining - recent
    chosen = random.choice(sorted(available)) if available else None
    round_state['remaining'] = sorted(remaining - ({chosen} if chosen else set()))
    task.world_state = {**state, 'round': round_state}
    task.save(update_fields=['world_state'])
    return agents.get(chosen)


def progress(task):
    # 状态展示不推进周期，避免刷新列表覆盖调度器正在更新的轮次。
    config = (task.world_state or {}).get('schedule', {})
    if not config:
        return {'target_count': None, 'processed_count': 0, 'missed_count': 0,
                'next_execution_at': None, 'config_pending': False}
    next_at = config.get('next') if config['mode'] == 'fixed' else next(iter(config['slots'][config['index']:]), None)
    return {'target_count': config.get('count'), 'processed_count': config.get('index', 0),
            'missed_count': config.get('missed', 0), 'next_execution_at': next_at,
            'config_pending': config['mode'] == 'random' and (config['count'] != task.random_count or config['period'] != task.random_period)}
