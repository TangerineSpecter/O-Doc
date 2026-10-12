"""居民归档保留所有业务身份，仅收回执行资格。"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import Agent, AgentActivity, AgentExecutionLease, AgentIMMessage, AgentRunRecord, AgentMemoryLease
from .agent_world.farm_gate import guarded


class AgentNameConflict(ValueError):
    def __init__(self, agent):
        self.agent = agent
        super().__init__('归档中已存在同名 Agent，请到归档列表恢复' if agent.archived else '已存在同名 Agent')


class AgentArchivedError(ValueError):
    pass


def check_name(name, exclude_id=None):
    conflict = Agent.objects.filter(name=name.strip()).exclude(pk=exclude_id).first()
    if conflict:
        raise AgentNameConflict(conflict)


def busy_reasons(agent_id):
    from prompts.models import ImageGenerationTask
    from .agent_world.combat.models import Exploration
    from .agent_world.travel_models import TravelJourney
    from .agent_world.market_models import MarketSession
    from .agent_world.life_models import LifeItem
    now = timezone.now()
    reasons = []
    checks = (
        (AgentExecutionLease.objects.filter(agent_id=agent_id, until__gt=now).exclude(token=''), '正在执行任务'),
        (AgentMemoryLease.objects.filter(pk=agent_id, until__gt=now).exclude(token=''), '正在整理记忆'),
        (Exploration.objects.filter(actor_id=agent_id, status__in=['preparing', 'active', 'paused', 'settling']), '存在未结束探索，请先召回并结算'),
        (TravelJourney.objects.filter(actor_id=agent_id, status__in=['active', 'waiting', 'paused', 'manual']), '存在未结束旅行，请先完成或取消'),
        (MarketSession.objects.filter(actor_id=agent_id, status='active', expires_at__gt=now), '存在有效市场会话，请先结束'),
        (LifeItem.objects.filter(actor_id=agent_id, status='running'), '存在执行中的生活活动'),
        (AgentActivity.objects.filter(agent_id=agent_id, status='running'), '存在执行中的动态'),
        (AgentIMMessage.objects.filter(agent_id=agent_id, status='received', updated_at__gt=now-timedelta(minutes=10)), '正在处理飞书消息'),
        (ImageGenerationTask.objects.filter(agent_key=agent_id, status__in=['submitting', 'generating', 'download_pending']), '存在未完成生图任务，请先查询并保存结果'),
    )
    for query, reason in checks:
        if query.exists():
            reasons.append(reason)
    for record in AgentRunRecord.objects.filter(status='running').only('agent_id', 'agent_runs'):
        entries = record.agent_runs or []
        if (not entries and record.agent_id == agent_id) or any(
            row.get('agent') == agent_id and row.get('status') == 'running' for row in entries
        ):
            reasons.append('存在执行中的任务记录')
            break
    return reasons


@guarded
@transaction.atomic
def archive_agent(agent_id):
    agent = Agent.objects.select_for_update().get(pk=agent_id)
    if agent.archived:
        return agent
    reasons = busy_reasons(agent_id)
    if reasons:
        raise ValueError('暂不能归档：' + '；'.join(reasons))
    now = timezone.now()
    from .agent_world.market_models import MarketSession
    from .agent_world.market_sessions import close_session
    for session in MarketSession.objects.filter(actor_id=agent_id, status='active'):
        close_session(session, '居民归档，关闭已到期市场会话', now)
    from .agent_world.market_archive import withdraw_for_archive
    withdraw_for_archive(agent, now)
    agent.archived_at = now
    agent.save(update_fields=['archived_at', 'updated_at'])
    return agent


@guarded
@transaction.atomic
def restore_agent(agent_id):
    agent = Agent.objects.select_for_update().get(pk=agent_id)
    if not agent.archived:
        return agent
    from .agent_world.life_models import LifeItem
    from .agent_world.life_schedule import revise
    now = timezone.now()
    for item in LifeItem.objects.filter(actor_id=agent_id, status__in=['pending', 'deferred', 'paused'], scheduled_at__lte=now):
        revise(item, '归档期间错过的安排不补跑', status='cancelled')
    from .agent_archive_schedule import skip_archived_slots
    skip_archived_slots(agent, now)
    from .agent_world.social_models import SocialOpportunity
    day = now.date() if timezone.is_naive(now) else timezone.localdate(now)
    SocialOpportunity.objects.filter(actor_id=agent_id, status='pending', business_date__lte=day).update(
        status='expired', result={'reason': '归档期间错过的社交机会不补做'}, updated_at=now,
    )
    agent.archived_at = None
    agent.execution_resumed_at = now
    agent.save(update_fields=['archived_at', 'execution_resumed_at', 'updated_at'])
    return agent
