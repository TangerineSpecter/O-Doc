"""悬赏的征询、执行和回收；挂在既有调度轮询中，不占用生活日程额度。"""
import json
import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from article.annotation_service import get_agent_identity
from utils.token_usage import usage_scope
from system_settings.agent_activity import record_post_publication, update_work_activity
from system_settings.agent_availability import AgentUnavailableError, agent_operation
from system_settings.models import Agent, AgentRunRecord, WorldAction

from .bounty_decision import ask_accept
from .bounty_models import Bounty, BountyInvite
from .bounty_service import (RELEASE_FAILURES, accept, deliver, release_expired, reopen,
                             validate_target)
from .bounty_workflow import BountyTaskAdapter, BountyWorkflow
from .execution import stamina
from .publish_config import PUBLISH_COST
from .publishing import publish_post
from .run_diagnostics import failure_detail, finish_record, progress as record_progress

logger = logging.getLogger(__name__)
PHASE_LABELS = {'select': '正在确定检索方向', 'search': '正在检索资料', 'verify': '正在核实资料',
                'write': '正在撰写帖子', 'ready': '正在校验交付'}
MAX_INVITES_PER_TICK = 1
MAX_EXECUTIONS_PER_TICK = 1
RETRY_MINUTES = 5


def tick(scheduler=None):
    try:
        release_expired()
    except Exception:
        logger.exception('悬赏超时回收失败')
    try:
        process_invites()
    except Exception:
        logger.exception('悬赏征询失败')
    try:
        execute_claimed()
    except Exception:
        logger.exception('悬赏执行失败')


def process_invites(now=None):
    now = now or timezone.now()
    pending = BountyInvite.objects.filter(bounty_id=OuterRef('pk'), status='pending', scheduled_at__lte=now)
    due = Bounty.objects.filter(status='open', invite_at__lte=now).filter(Exists(pending))
    for bounty in due.order_by('invite_at', 'pk')[:10]:
        invites = list(bounty.invites.filter(status='pending', scheduled_at__lte=now)
                       .select_related('agent').order_by('sort', 'id')[:MAX_INVITES_PER_TICK])
        for invite in invites:
            agent = invite.agent
            if agent is None or agent.archived_at:
                invite.status, invite.decision = 'expired', {'reason': '居民不可用'}
                invite.save(update_fields=['status', 'decision'])
                continue
            if Bounty.objects.filter(status__in=['claimed', 'delivered'], agent=agent).exclude(pk=bounty.pk).exists():
                invite.status = 'declined'
                invite.decision = {'source': 'guard', 'accept': False, 'reason': '正在处理其他悬赏'}
                invite.save(update_fields=['status', 'decision'])
                continue
            accepted, decision = ask_accept(bounty.owner_id, bounty, agent)
            invite.decision = decision
            if accepted and accept(bounty, agent, decision):
                invite.status = 'accepted'
                invite.save(update_fields=['status', 'decision'])
                break
            invite.status = 'declined' if not accepted else 'expired'
            if accepted:
                invite.decision = {**decision, 'reason': '已被其他居民先领取'}
            invite.save(update_fields=['status', 'decision'])


def execute_claimed(now=None):
    now = now or timezone.now()
    claimed = Bounty.objects.filter(status='claimed').filter(
        Q(next_try_at__isnull=True) | Q(next_try_at__lte=now)).order_by('claimed_at', 'pk')[:MAX_EXECUTIONS_PER_TICK]
    for bounty in claimed:
        if not bounty.agent_id:
            reopen(bounty, '领取居民已删除，退回待领取')
            continue
        run_bounty(bounty)


def run_bounty(bounty: Bounty) -> None:
    agent = Agent.objects.filter(pk=bounty.agent_id).first()
    if agent is None:
        reopen(bounty, '领取居民已删除，退回待领取')
        return
    try:
        with agent_operation(agent) as current:
            _execute(bounty, current)
    except AgentUnavailableError:
        # 忙碌只推迟到下一轮，不消耗失败次数。
        Bounty.objects.filter(pk=bounty.pk, status='claimed').update(
            next_try_at=timezone.now() + timedelta(minutes=RETRY_MINUTES))
    except Exception:
        logger.exception('悬赏执行异常 bounty=%s', bounty.pk)


def _execute(bounty: Bounty, agent) -> None:
    bounty.refresh_from_db()
    if bounty.status != 'claimed' or bounty.agent_id != agent.pk:
        return
    key = f'bounty:{bounty.pk}:{bounty.attempt}:{bounty.failures}:{agent.pk}'
    action = WorldAction.objects.filter(pk=key).first()
    if action and action.status == 'success':
        return
    task_name = f'悬赏：{bounty.title}'[:100]
    record = (action.record if action and action.record_id else None) or AgentRunRecord.objects.create(
        task=None, task_name=task_name, agent=agent, agent_name=agent.name, trigger='悬赏任务',
        status='running', summary='正在调研悬赏主题',
        agent_runs=[{'agent': agent.pk, 'agentName': agent.name, 'agentAvatar': agent.avatar,
                     'modelName': '', 'status': 'running', 'steps': []}])
    if action is None:
        action = WorldAction.objects.create(pk=key, agent=agent, actor_id=agent.pk, record=record,
                                            status='claimed', snapshot={'phase': 'select'})
    update_work_activity(record, agent, status='running', current_action='正在调研悬赏主题')

    def save(state):
        action.snapshot = state
        action.save(update_fields=['snapshot', 'updated_at'])

    def report(phase):
        label = PHASE_LABELS.get(phase, '正在处理悬赏')
        update_work_activity(record, agent, status='running', current_action=label)
        record_progress(record, label, '', 'info')

    try:
        adapter = BountyTaskAdapter(bounty)
        with usage_scope(agent=agent, record=record, owner_id=bounty.owner_id, purpose='task', phase='bounty'):
            state = BountyWorkflow(adapter, agent, action.snapshot, save, report).run()
        article, delivery = _commit(bounty, agent, action, state)
    except Exception as exc:
        reason = failure_detail(PHASE_LABELS.get(action.snapshot.get('phase'), '悬赏执行'), exc)
        action.status, action.result = 'failed', {'reason': reason}
        action.save()
        finish_record(record, 'failed', reason, json.dumps(action.result, ensure_ascii=False), '悬赏执行结束')
        update_work_activity(record, agent, status='failed', summary=reason, current_action='悬赏执行遇到问题')
        _record_failure(bounty, reason)
        return
    finish_record(record, 'success', f'已交付《{article.title}》',
                  json.dumps({'result': action.result, 'snapshot': action.snapshot}, ensure_ascii=False),
                  '悬赏执行结束')
    update_work_activity(record, agent, status='success', summary=f'已交付《{article.title}》',
                         current_action='已交付悬赏')
    record_post_publication(agent, article, article.post_summary, record)
    Bounty.objects.filter(pk=bounty.pk).update(next_try_at=None, last_error='', updated_at=timezone.now())


@transaction.atomic
def _commit(bounty: Bounty, agent, action: WorldAction, state: dict):
    locked = Bounty.objects.select_for_update().get(pk=bounty.pk)
    if locked.status != 'claimed' or locked.agent_id != agent.pk:
        raise ValueError('悬赏已被回收或改派')
    _, category = validate_target(locked.owner_id, locked.collection_id, locked.category_id)
    from .life_commitments import require_energy
    require_energy(bounty.owner_id, agent, PUBLISH_COST, bounty_id=bounty.pk)
    if stamina(agent) < PUBLISH_COST:
        raise ValueError('体力不足，悬赏发帖需要 20 点')
    draft = state['draft']
    article, _, _ = publish_post({
        'title': draft['title'], 'content': draft['content'], 'summary': draft['summary'],
        'coll_id': locked.collection_id, 'category_id': category.pk,
        'source_url': draft.get('main_source_url') or '', 'skip_illustration': True,
    }, identity=get_agent_identity(agent, stable=True), agent=agent)
    action = WorldAction.objects.select_for_update().get(pk=action.pk)
    action.status = 'success'
    # 交付事实与体力消耗已在同一事务内落库，无需通用恢复逻辑兜底。
    action.effects_done = True
    action.energy_cost = PUBLISH_COST
    action.consumed_at = timezone.now()
    action.snapshot = {**state, 'phase': 'delivered', 'bounty': True, 'post_id': article.pk}
    action.result = {'reason': '帖子已交付，等待验收', 'post_id': article.pk,
                     'coll_id': article.coll_id, 'category_id': category.pk, 'bounty_id': locked.pk}
    action.save()
    delivery = deliver(locked.pk, agent, article, action.record, draft.get('summary') or '')
    return article, delivery


def _record_failure(bounty: Bounty, reason: str) -> None:
    from django.db.models import F
    Bounty.objects.filter(pk=bounty.pk, status='claimed').update(
        last_error=reason[:500], failures=F('failures') + 1,
        next_try_at=timezone.now() + timedelta(minutes=RETRY_MINUTES))
    bounty.refresh_from_db()
    if bounty.failures >= RELEASE_FAILURES:
        reopen(bounty, f'连续执行失败，已退回待领取：{reason[:200]}')
