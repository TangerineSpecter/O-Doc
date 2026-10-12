"""归档只跳过已到期的随机机会，恢复不会丢掉未来机会或补计成功。"""
import copy
import hashlib
from datetime import datetime

from .models import Agent, AgentTask, AgentRandomRuntime, AgentRunRecord


def mark_archived_slots(task, state, now, agent_ids=None):
    archived = set(agent_ids) if agent_ids is not None else set(
        Agent.objects.filter(pk__in=state['config']['agents'], archived_at__isnull=False).values_list('pk', flat=True)
    )
    for index, slot in enumerate(state['slots']):
        if datetime.fromisoformat(slot['at']) > now:
            continue
        already = set(state['completed'].get(str(index), [])) | set(state.get('skipped', {}).get(str(index), []))
        for agent_id in archived.intersection(slot['agents']) - already:
            identity = 'archive-skip:' + hashlib.sha256(f'{state["id"]}:{index}:{agent_id}'.encode()).hexdigest()[:27]
            agent = Agent.objects.get(pk=agent_id)
            summary = '居民归档，跳过本次机会，不补跑'
            AgentRunRecord.objects.get_or_create(pk=identity, defaults={
                'task': task, 'task_name': task.name, 'agent': agent, 'agent_name': agent.name,
                'trigger': '定时任务', 'status': 'failed', 'summary': summary,
                'agent_runs': [{'agent': agent_id, 'agentName': agent.name, 'status': 'failed', 'summary': summary}],
                'random_context': {'plan_id': state['id'], 'period_start': state['start'], 'period_end': state['end'],
                                   'slot': index, 'skipped_agent_ids': [agent_id], 'skip_reason': 'archived'},
            })
            state.setdefault('skipped', {}).setdefault(str(index), []).append(agent_id)


def skip_archived_slots(agent, now):
    from .agent_random_schedule import active_cycle, make_plan, reconcile_successes, local_now
    for task in AgentTask.objects.filter(task_kind__in=['custom', 'memo_capture']):
        runtime = AgentRandomRuntime.objects.filter(task=task).first()
        if not (runtime and runtime.state) and not active_cycle(task, local_now()):
            continue
        state = copy.deepcopy(runtime.state) if runtime and runtime.state else make_plan(task, local_now())
        if agent.pk not in state['config']['agents']:
            continue
        reconcile_successes(task, state)
        mark_archived_slots(task, state, now, [agent.pk])
        if runtime:
            runtime.state = state
            runtime.save(update_fields=['state'])
