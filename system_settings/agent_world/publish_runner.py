from utils.token_usage import usage_scope
"""自主发帖机会、事务发布与恢复。模型流程不持有数据库长事务。"""
import copy
import hashlib
import json
import logging
import time
import uuid
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from article.annotation_service import get_agent_identity
from article.models import Article
from system_settings.agent_task_models import task_model_name
from system_settings.agent_activity import record_post_publication, update_work_activity
from system_settings.models import Agent, AgentExecutionLease, AgentRunRecord, AgentTask, WorldAction, WorldActionRuntime
from .action_schedule import select_agent
from .execution import WorldLeaseBusy, defer_when_world_busy, execution_lease, stamina
from .publish_config import PUBLISH_COST, categories_for, eligibility, own_posts
from utils.source_urls import duplicate_source_key
from .publish_workflow import SkipPublication, Workflow, validate_draft
from .publishing import publish_post

logger = logging.getLogger(__name__)
PHASE_LABELS = {'select': '正在自主选题', 'search': '正在搜索素材', 'verify': '正在核实来源', 'write': '正在写作', 'ready': '正在校验发布'}


def duplicate_source(agent, main: str) -> bool:
    recent = own_posts(agent).filter(created_at__gte=timezone.now()-timedelta(days=7)).exclude(source_url__isnull=True).values_list('source_url', flat=True)
    return any(duplicate_source_key(url or '') == duplicate_source_key(main) for url in recent)


@transaction.atomic
def commit_publication(action_id: str, token: str, world_token: str, *, manual=False):
    action = WorldAction.objects.select_for_update().get(pk=action_id)
    if action.status == 'success':
        return action
    if action.status != 'claimed':
        raise ValueError('机会已结束')
    from .life_scope import check_current_authorization
    check_current_authorization()
    task = AgentTask.objects.select_for_update().get(pk=action.task_id)
    agent = Agent.objects.select_for_update().get(pk=action.agent_id)
    if task.task_kind != 'post_publish' or (not manual and not task.enabled):
        raise SkipPublication('任务已暂停或类型发生变化')
    if not WorldActionRuntime.objects.filter(pk='world', token=world_token, until__gt=timezone.now()).exists():
        raise ValueError('世界执行锁已失效')
    if not AgentExecutionLease.objects.filter(agent=agent, token=token, until__gt=timezone.now()).exists():
        raise ValueError('Agent 执行锁已失效')
    reason = eligibility(task, agent)
    if reason:
        raise SkipPublication(reason)
    snapshot = action.snapshot
    # 规则修改后不发布依赖旧搜索边界生成的内容。
    if snapshot['config'] != task.publish_config:
        raise SkipPublication('发帖配置发生变化，请等待下次机会')
    selection = snapshot['selection']
    if selection['category_id'] not in {c.pk for c in categories_for(task.publish_config)}:
        raise SkipPublication('分类已失效或越界')
    draft = validate_draft(snapshot['draft'], snapshot)
    if duplicate_source(agent, draft['main_source_url']):
        raise SkipPublication('7天内已使用相同主要来源')
    article, _, _ = publish_post({'title': draft['title'], 'content': draft['content'], 'summary': draft['summary'],
        'coll_id': task.publish_config['collection_id'], 'category_id': selection['category_id'],
        'source_url': draft['main_source_url'], 'skip_illustration': True}, identity=get_agent_identity(agent, stable=True), agent=agent)
    snapshot['draft'] = draft
    action.status = 'success'
    action.energy_cost = PUBLISH_COST
    action.consumed_at = timezone.now()
    snapshot['materials'] = [m for m in snapshot['materials'] if m['url'] in draft['source_urls']]
    action.snapshot = {**snapshot, 'phase': 'published', 'post_id': article.pk, 'notification_pending': True}
    action.result = {'reason': '帖子已发布', 'post_id': article.pk, 'coll_id': article.coll_id,
                     'category_id': selection['category_id'], 'title': article.title, 'template_version': snapshot.get('template_version', 1)}
    action.save()
    return action


from .run_diagnostics import failure_detail, finish_record, progress as record_progress


def repair_publication(action):
    if action.status not in ('success', 'skipped', 'failed'):
        return
    from .action_activity import finish_activity
    status = 'failed' if action.status == 'failed' else 'success'
    if action.record_id:
        record = action.record
        finish_record(record, status, action.result.get('reason', ''),
                      json.dumps({'result': action.result, 'snapshot': action.snapshot}, ensure_ascii=False), '发帖机会结束')
        finish_activity(action)
    if action.status == 'success' and action.agent_id:
        post = Article.objects.filter(pk=action.result.get('post_id')).first()
        if post:
            record_post_publication(action.agent, post, post.post_summary, action.record)
    WorldAction.objects.filter(pk=action.pk).update(effects_done=True)


def preview(task, agent):
    reason = eligibility(task, agent, preview=True)
    if reason:
        return {'status': 'skipped', 'reason': reason}
    with execution_lease(WorldActionRuntime, {'pk': 'world'}) as world_token:
        if not world_token:
            return {'status': 'skipped', 'reason': '世界执行位忙碌'}
        with execution_lease(AgentExecutionLease, {'agent': agent}) as token:
            if not token:
                return {'status': 'skipped', 'reason': 'Agent 正在执行其他任务'}
            from .publish_diagnostics import logger as diagnostic_logger
            started = time.monotonic()
            def progress(phase):
                diagnostic_logger.info('发帖预览阶段 task=%s agent=%s stage=%s duration_ms=%s',
                                       task.pk, agent.pk, phase, round((time.monotonic()-started)*1000))
            flow = Workflow(task, agent, progress=progress)
            try:
                with usage_scope(agent=agent, purpose='preview', phase='publish_preview'):
                    state = flow.run()
                if duplicate_source(agent, state['draft']['main_source_url']):
                    raise SkipPublication('7天内已使用相同主要来源')
                return {'status': 'ready', 'reason': '预览完成，尚未发布', 'snapshot': state}
            except SkipPublication as exc:
                return {'status': 'skipped', 'reason': str(exc), 'snapshot': flow.state}
            except Exception as exc:
                from system_logs.capture import capture
                duration = round((time.monotonic()-started)*1000)
                capture('发帖预览阶段失败', module='agent_world', exc=exc, task_id=str(task.pk),
                        agent_id=str(agent.pk), publish_stage=flow.state.get('phase'), duration_ms=duration)
                diagnostic_logger.error('发帖预览阶段失败 task=%s agent=%s stage=%s duration_ms=%s exception=%s',
                                        task.pk, agent.pk, flow.state.get('phase'), duration, type(exc).__name__)
                raise


def run_publish_opportunity(task, scheduler, *, key=None, manual=False, locked=False):
    from .action_runner import record_busy_opportunity
    from .life_scope import CURRENT,life_scope
    from .life_models import LifeItem
    if key and not CURRENT.get():
        item=LifeItem.objects.filter(pk=key).first()
        agent=Agent.objects.filter(pk=item.actor_id).first() if item else None
        if item and agent:
            from .life_context import build_context
            with life_scope(item,build_context(item.owner_id,agent,item)):
                return run_publish_opportunity(task,scheduler,key=key,manual=manual,locked=locked)
    key = key or hashlib.sha256(f'manual:{uuid.uuid4()}'.encode()).hexdigest()
    if not locked:
        with execution_lease(WorldActionRuntime, {'pk': 'world'}) as world_token:
            if not world_token:
                if defer_when_world_busy.get():
                    raise WorldLeaseBusy()
                return record_busy_opportunity(task, scheduler, key, manual)
            return run_publish_opportunity(task, scheduler, key=key, manual=manual, locked=world_token)
    task.refresh_from_db()
    action = WorldAction.objects.select_related('agent', 'record').filter(pk=key).first()
    if action and action.status != 'claimed':
        if not action.effects_done:
            repair_publication(action)
        return action.record
    if action:
        manual = action.snapshot.get('manual', manual)
        agent, record = action.agent, action.record
        if not record:
            record = AgentRunRecord.objects.create(task=task, task_name=task.name, agent=agent, agent_name=agent.name if agent else "", trigger="恢复执行", status="running")
            action.record = record
            action.save(update_fields=["record", "updated_at"])
        if not agent:
            action.status, action.result = "skipped", {"reason": "执行 Agent 已删除，本机会结束"}
            action.save()
    else:
        reasons = {}
        def qualifies(candidate):
            reason = eligibility(task, candidate)
            if reason:
                reasons[candidate.pk] = reason
            return not reason
        agent = select_agent(task, cost=PUBLISH_COST, qualifies=qualifies)
        record = AgentRunRecord.objects.create(task=task, task_name=task.name, agent=agent, agent_name=agent.name if agent else '',
            trigger='手动执行' if manual else '系统行动', status='running', summary='正在自主选题',
            agent_runs=[{'agent': agent.pk, 'agentName': agent.name, 'agentAvatar': agent.avatar,
                         'modelName': task_model_name(task, agent), 'status': 'running', 'steps': []}] if agent else [])
        action = WorldAction.objects.create(pk=key, task=task, agent=agent, actor_id=agent.pk if agent else '', record=record,
            snapshot={'template_version': 2, 'manual': manual, 'config': copy.deepcopy(task.publish_config), 'phase': 'select', 'materials': [], 'search_count': 0})
        if not agent:
            action.status = 'skipped'
            action.result = {'reason': '；'.join(sorted(set(reasons.values()))) or '没有空闲且体力足够、已结束冷却的 Agent'}
            action.save()
    try:
        if agent and action.status == 'claimed':
            with execution_lease(AgentExecutionLease, {'agent': agent}) as token:
                if not token:
                    raise SkipPublication('Agent 正在执行其他任务')
                reason = eligibility(task, agent)
                if reason:
                    raise SkipPublication(reason)
                def save(state):
                    action.snapshot = state
                    action.save(update_fields=['snapshot', 'updated_at'])
                def progress(phase):
                    label = PHASE_LABELS[phase]
                    update_work_activity(record, agent, status='running', current_action=label)
                    scheduler._append_agent_run_step(record, agent.pk, 'info', label, '')
                with usage_scope(agent=agent, task=task, record=record, purpose='task', phase='publish'):
                    Workflow(task, agent, action.snapshot, save, progress).run()
                action = commit_publication(key, token, locked, manual=manual)
    except SkipPublication as exc:
        action.refresh_from_db()
        if action.status != 'success':
            action.status, action.result = 'skipped', {'reason': str(exc)[:255]}
            action.save()
    except Exception as exc:
        logger.exception('自主发帖流程失败 action=%s', key)
        action.refresh_from_db()
        if action.status != 'success':
            action.status, action.result = 'failed', {'reason': failure_detail(PHASE_LABELS.get(action.snapshot.get('phase'), '准备发帖'), exc)}
            action.save()
    try:
        repair_publication(action)
        if action.status == 'success':
            deliver_notification(action, scheduler)
    except Exception as exc:
        record_progress(record, '发帖后续处理待恢复', failure_detail('发帖后续处理', exc), 'failed', allow_terminal=True)
        logger.exception('发帖后续处理待恢复 action=%s', key)
    record.refresh_from_db()
    record.duration = scheduler._format_duration(int((timezone.now()-record.started_at).total_seconds()))
    record.save(update_fields=['duration', 'updated_at'])
    return record


def deliver_notification(action, scheduler):
    from .publish_search import date_value
    state = dict(action.snapshot)
    if not state.get('notification_pending'):
        return
    attempts = state.get('notification_attempts', 0)
    next_at = date_value(state.get('notification_next_at'))
    if attempts >= 3 or (next_at and next_at > timezone.now()):
        return
    ok = scheduler._send_task_notification(action.task, action.record)
    state['notification_attempts'] = attempts + 1
    state['notification_pending'] = ok is False and attempts < 2
    state['notification_next_at'] = (timezone.now() + timedelta(minutes=5)).isoformat()
    WorldAction.objects.filter(pk=action.pk).update(snapshot=state, updated_at=timezone.now())
