"""周期随机排程、成功配额与本机租约。外部模型调用不占用数据库事务。"""
import copy
import hashlib
import json
import logging
import random
import threading
import uuid
from datetime import datetime, timedelta

from django.db import close_old_connections
from django.db.models import Q
from django.utils import timezone

from .models import Agent, AgentActivity, AgentRandomRuntime, AgentRunRecord

logger = logging.getLogger(__name__)
PERIOD_LABELS = {'daily': '每天', 'weekly': '每周', 'monthly': '每月', 'yearly': '每年'}
RETRY_MINUTES = (5, 15, 30, 60)
LEASE_SECONDS = 600


def local_now() -> datetime:
    now = timezone.now()
    return timezone.localtime(now) if timezone.is_aware(now) else now


def period_bounds(period: str, now: datetime) -> tuple[datetime, datetime]:
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == 'daily':
        return start, start + timedelta(days=1)
    if period == 'weekly':
        start -= timedelta(days=start.weekday())
        return start, start + timedelta(days=7)
    if period == 'monthly':
        start = start.replace(day=1)
        end = start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)
        return start, end
    if period == 'yearly':
        start = start.replace(month=1, day=1)
        return start, start.replace(year=start.year + 1)
    raise ValueError('不支持的随机执行周期')


def task_config(task) -> dict:
    agents = list(task.agent_ids or [task.agent_id])
    count = task.random_count
    if task.task_kind == 'memo_capture':
        return {'period': 'weekly', 'count': count, 'mode': 'serial', 'agents': agents,
                'targets': {agent: 0 for agent in agents}, 'capture_random': True}
    if task.execution_mode == 'parallel':
        targets = {agent: count for agent in agents}
    elif task.random_allocations:
        targets = {agent: task.random_allocations.get(agent, 0) for agent in agents}
    else:
        targets = {agent: count // len(agents) + (index < count % len(agents)) for index, agent in enumerate(agents)}
    return {'period': task.random_period, 'count': count, 'mode': task.execution_mode, 'agents': agents, 'targets': targets}


def active_cycle(task, now: datetime) -> dict | None:
    snapshot = task.random_cycle_snapshot
    if snapshot and datetime.fromisoformat(snapshot['start']) <= now < datetime.fromisoformat(snapshot['end']):
        return snapshot
    return None


def save_cycle_snapshot(task, state: dict) -> None:
    """当期额度属于可同步的配置；完成进度通过执行记录重建，租约和退避仍留本机。"""
    snapshot = {key: copy.deepcopy(state[key]) for key in ('id', 'start', 'end', 'config')}
    snapshot['available_start'] = state.get('available_start', state['start'])
    if task.random_cycle_snapshot != snapshot:
        task.random_cycle_snapshot = snapshot
        # 不刷新任务的编辑时间，避免后台周期切换使前端丢弃最新进度。
        task.save(update_fields=['random_cycle_snapshot'])


def make_plan(task, now: datetime) -> dict:
    snapshot = active_cycle(task, now)
    if snapshot:
        config = copy.deepcopy(snapshot['config'])
        start, end = (datetime.fromisoformat(snapshot[key]) for key in ('start', 'end'))
        plan_id = snapshot['id']
        available_start = datetime.fromisoformat(snapshot['available_start'])
    else:
        config = task_config(task)
        start, end = period_bounds(config['period'], now)
        signature = json.dumps(config, sort_keys=True, ensure_ascii=True)
        plan_id = hashlib.sha256(f'{task.pk}:{start.isoformat()}:{signature}'.encode()).hexdigest()
        available_start = max(start, now)
    rng = random.Random(plan_id)
    groups = []
    if config.get('capture_random'):
        groups = [[rng.choice(config['agents'])] for _ in range(config['count'])] if config['agents'] else []
    elif config['mode'] == 'parallel':
        groups = [config['agents'][:] for _ in range(config['count'])]
    else:
        remaining = dict(config['targets'])
        while any(remaining.values()):
            for agent in config['agents']:
                if remaining[agent] > 0:
                    groups.append([agent])
                    remaining[agent] -= 1
    # 中途创建时只在剩余时间分散安排，不补创建之前的机会。
    seconds = (end - available_start).total_seconds()
    slots = [
        {'at': (available_start + timedelta(seconds=seconds * (index + rng.random()) / len(groups))).isoformat(), 'agents': group}
        for index, group in enumerate(groups)
    ]
    return {'id': plan_id, 'start': start.isoformat(), 'end': end.isoformat(), 'config': config,
            'available_start': available_start.isoformat(), 'slots': slots, 'completed': {},
            'unavailable': [], 'attempts': {}, 'retry_at': None, 'retry_slot': None}


def reconcile_successes(task, state: dict) -> None:
    """成功以 slot/Agent 唯一归属，失败和重复记录不会多计数。"""
    records = AgentRunRecord.objects.filter(task=task, followup_depth=0, random_context__plan_id=state['id'])
    for record in records.only('agent_runs', 'random_context'):
        unavailable = set(record.random_context.get('unavailable_agent_ids', [])) & set(state['config']['agents'])
        state['unavailable'] = sorted(set(state.get('unavailable', [])) | unavailable)
        slot = record.random_context.get('slot')
        if not isinstance(slot, int) or not 0 <= slot < len(state['slots']):
            continue
        key = str(slot)
        completed = set(state['completed'].get(key, []))
        for result in record.agent_runs:
            if result.get('status') == 'success' and result.get('agent') in state['slots'][slot]['agents']:
                completed.add(result['agent'])
        state['completed'][key] = sorted(completed)
    pending = next_slot(state)
    if not pending or state.get('retry_slot') != pending[0]:
        state['retry_at'] = None
        state['retry_slot'] = None


def next_slot(state: dict) -> tuple[int, list[str]] | None:
    for index, slot in enumerate(state['slots']):
        completed = state['completed'].get(str(index), [])
        pending = [agent for agent in slot['agents'] if agent not in completed and agent not in state.get('unavailable', [])]
        if pending:
            return index, pending
    return None


def initialize_runtime(task) -> None:
    if task.schedule_mode != 'random':
        return
    runtime, _ = AgentRandomRuntime.objects.get_or_create(task=task)
    now = local_now()
    state = runtime.state
    if not state or datetime.fromisoformat(state['end']) <= now:
        state = make_plan(task, now)
    save_cycle_snapshot(task, state)
    if not runtime.state:
        AgentRandomRuntime.objects.filter(pk=task.pk, state={}, lease_token='').update(state=state)


def progress(task) -> dict | None:
    now = local_now()
    runtime = AgentRandomRuntime.objects.filter(task=task).first()
    state = copy.deepcopy(runtime.state) if runtime else {}
    if not state or datetime.fromisoformat(state['end']) <= now:
        if task.schedule_mode != 'random' and not active_cycle(task, now):
            return None
        state = make_plan(task, now)
    reconcile_successes(task, state)
    config = state['config']
    ids = config['agents']
    names = dict(Agent.objects.filter(pk__in=ids).values_list('pk', 'name'))
    state['unavailable'] = sorted(set(state.get('unavailable', [])) | (set(ids) - set(names)))
    counts = {agent: sum(agent in values for values in state['completed'].values()) for agent in ids}
    pending = next_slot(state)
    next_at = None
    if pending:
        next_at = state['retry_at'] or state['slots'][pending[0]]['at']
    executing = bool(runtime and runtime.lease_until and runtime.lease_until > timezone.now())
    capture_counts = {'recorded': 0, 'skipped': 0}
    if config.get('capture_random'):
        seen = set()
        for record in AgentRunRecord.objects.filter(task=task, random_context__plan_id=state['id']):
            slot = record.random_context.get('slot')
            for result in record.agent_runs:
                outcome = result.get('captureOutcome')
                if result.get('status') == 'success' and outcome in capture_counts and slot not in seen:
                    capture_counts[outcome] += 1
                    seen.add(slot)
    return {'capture_counts': capture_counts if config.get('capture_random') else None,
            'period_start': state['start'], 'period_end': state['end'], 'mode': config['mode'],
            'target_count': config['count'], 'next_execution_at': next_at,
            'status': 'running' if executing else ('complete' if not pending else ('retrying' if state['retry_at'] else 'scheduled')),
            'config_pending': config != task_config(task) or task.schedule_mode != 'random',
            'agents': [{'agent_id': agent, 'agent_name': names.get(agent, '已删除 Agent'),
                        'unavailable': agent in state['unavailable'],
                        'target': sum(agent in slot['agents'] for slot in state['slots']) if config.get('capture_random') else config['targets'][agent], 'success_count': counts[agent]} for agent in ids]}


def has_active_random_period(task, now: datetime) -> bool:
    runtime = AgentRandomRuntime.objects.filter(task=task).only('state').first()
    return bool(active_cycle(task, now) or (runtime and runtime.state and datetime.fromisoformat(runtime.state['end']) > now))


def mark_unavailable_agents(task, state: dict) -> None:
    existing = set(Agent.objects.filter(pk__in=state['config']['agents']).values_list('pk', flat=True))
    missing = set(state['config']['agents']) - existing - set(state.get('unavailable', []))
    if not missing:
        return
    # 删除不等于成功，保留失败记录和原配额，跳过该 Agent 的全部剩余机会。
    summary = 'Agent 已删除，跳过本周期剩余机会'
    AgentRunRecord.objects.create(
        task=task, task_name=task.name, agent_name='已删除 Agent', trigger='定时任务', status='failed',
        summary=summary,
        agent_runs=[{'agent': agent_id, 'agentName': '已删除 Agent', 'status': 'failed', 'summary': summary} for agent_id in sorted(missing)],
        random_context={'plan_id': state['id'], 'period_start': state['start'], 'period_end': state['end'],
                        'unavailable_agent_ids': sorted(missing)},
    )
    state['unavailable'] = sorted(set(state.get('unavailable', [])) | missing)


def run_random_task(scheduler, task, now: datetime) -> None:
    runtime, _ = AgentRandomRuntime.objects.get_or_create(task=task)
    token = uuid.uuid4().hex
    acquired = AgentRandomRuntime.objects.filter(pk=task.pk).filter(
        Q(lease_until__isnull=True) | Q(lease_until__lte=timezone.now())
    ).update(lease_token=token, lease_until=timezone.now() + timedelta(seconds=LEASE_SECONDS))
    if not acquired:
        return
    stop = threading.Event()

    def heartbeat():
        try:
            while not stop.wait(30):
                close_old_connections()
                if not AgentRandomRuntime.objects.filter(pk=task.pk, lease_token=token).update(
                    lease_until=timezone.now() + timedelta(seconds=LEASE_SECONDS)
                ):
                    return
        except Exception:
            logger.exception('Random task lease heartbeat failed: task=%s', task.pk)
        finally:
            close_old_connections()

    thread = threading.Thread(target=heartbeat, name=f'agent-random-lease-{task.pk}', daemon=True)
    try:
        runtime.refresh_from_db()
        state = runtime.state
        if not state or datetime.fromisoformat(state['end']) <= now:
            if task.schedule_mode != 'random' and not active_cycle(task, now):
                return
            state = make_plan(task, now)
        save_cycle_snapshot(task, state)
        reconcile_successes(task, state)
        mark_unavailable_agents(task, state)
        reconcile_successes(task, state)
        AgentRandomRuntime.objects.filter(pk=task.pk, lease_token=token).update(state=state)
        pending = next_slot(state)
        if not pending:
            return
        index, agent_ids = pending
        due_at = max(datetime.fromisoformat(state['slots'][index]['at']),
                     datetime.fromisoformat(state['retry_at']) if state['retry_at'] else now)
        if due_at > now:
            return
        # 旧进程租约到期后，其未完成记录先收敛为失败；已成功 Agent 由上面的归并保留。
        interrupted = AgentRunRecord.objects.filter(task=task, status='running', random_context__plan_id=state['id'])
        for record in interrupted:
            record.status = 'failed'
            record.summary = '随机任务执行租约已过期，等待补执行'
            for result in record.agent_runs:
                if result.get('status') == 'running':
                    result.update(status='failed', summary=record.summary)
            record.save(update_fields=['status', 'summary', 'agent_runs', 'updated_at'])
            AgentActivity.objects.filter(run_record=record, activity_type='work', status='running').update(
                status='failed', summary=record.summary, current_action='执行已中断', updated_at=timezone.now())
        thread.start()
        agents_by_id = {agent.pk: agent for agent in Agent.objects.select_related('model').filter(pk__in=agent_ids)}
        agents = [agents_by_id[agent_id] for agent_id in agent_ids if agent_id in agents_by_id]
        snapshot_task = copy.copy(task)
        snapshot_task.execution_mode = state['config']['mode']
        try:
            scheduler._run_task(snapshot_task, trigger='定时任务', agents_override=agents,
                                random_context={'plan_id': state['id'], 'period_start': state['start'],
                                                'period_end': state['end'], 'slot': index, 'lease_token': token})
        except Exception:
            logger.exception('Random task attempt interrupted: task=%s, slot=%s', task.pk, index)
        reconcile_successes(task, state)
        remaining = [agent for agent in agent_ids if agent not in state['completed'].get(str(index), []) and agent not in state.get('unavailable', [])]
        if remaining:
            attempts = state['attempts'].get(str(index), 0)
            state['attempts'][str(index)] = attempts + 1
            state['retry_slot'] = index
            state['retry_at'] = (local_now() + timedelta(minutes=RETRY_MINUTES[min(attempts, 3)])).isoformat()
        else:
            state['retry_at'] = None
            state['retry_slot'] = None
        AgentRandomRuntime.objects.filter(pk=task.pk, lease_token=token).update(state=state)
    finally:
        stop.set()
        if thread.is_alive():
            thread.join(timeout=5)
        AgentRandomRuntime.objects.filter(pk=task.pk, lease_token=token).update(lease_token='', lease_until=None)
