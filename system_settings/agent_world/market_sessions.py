"""进入时只结算一次体力；失效会话关闭后不会重新启动。"""
from .life_scope import allowed as life_allowed
import os
import hashlib
import uuid
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from system_settings.models import Agent, AgentTask, AgentExecutionLease, WorldAction, WorldActionRuntime, SystemSetting
from .farm_gate import guarded
from .farm_models import AgentFarm
from .market_models import MarketSession, MarketRuntime
from .market_shop import market_iso
from .execution import stamina

COST, MAX_CALLS, DURATION = 5, 20, timedelta(minutes=5)


def check_mcp():
    config = SystemSetting.objects.filter(key='system_mcp_config').first()
    if not config or not (config.value or {}).get('enabled', False):
        raise ValueError('系统 MCP 已关闭')


def owner_for(agent: Agent) -> str:
    if not agent or not Agent.objects.filter(pk=agent.pk).exists():
        raise ValueError('市场操作需要当前有效 Agent 上下文')
    from .life_models import LifeProfile
    profile=LifeProfile.objects.filter(pk=agent.pk).first()
    if profile:return profile.owner_id
    owners = set()
    for task in AgentTask.objects.filter(task_kind='market'):
        if agent.pk in (task.agent_ids or [task.agent_id]):
            owners.add(task.market_config.get('owner_id'))
    farm = AgentFarm.objects.filter(pk=agent.pk).first()
    if farm: owners.add(farm.owner_id)
    owners.discard(None)
    if len(owners) != 1:
        raise ValueError('请先在当前账号的市场任务中绑定居民，或建立所属农场')
    return owners.pop()


def validate_market_agents(owner: str, actor_ids: list[str]) -> None:
    from .investment_models import InvestmentAccount
    if InvestmentAccount.objects.filter(pk__in=actor_ids).exclude(owner_id=owner).exists():
        raise ValueError('居民投资账户属于其他账号')
    if AgentFarm.objects.filter(pk__in=actor_ids).exclude(owner_id=owner).exists():
        raise ValueError('居民的农场属于其他账号，不能绑定到此市场')
    for task in AgentTask.objects.filter(task_kind='market').exclude(market_config__owner_id=owner):
        if set(actor_ids).intersection(task.agent_ids or [task.agent_id]):
            raise ValueError('居民已绑定其他账号的市场任务')


@guarded
@transaction.atomic
def close_session(session: MarketSession, reason: str, now=None) -> MarketSession:
    now = now or timezone.now()
    session = MarketSession.objects.select_for_update().get(pk=session.pk)
    if session.status == 'active':
        session.status, session.reason, session.ended_at = 'closed', str(reason)[:500], now
        session.save(update_fields=['status', 'reason', 'ended_at'])
    runtime = MarketRuntime.objects.filter(pk=session.pk).first()
    if runtime:
        AgentExecutionLease.objects.filter(agent_id=session.actor_id, token=runtime.agent_token).update(token='', until=None)
        runtime.delete()
    return session


def invalid_reason(session, now=None):
    now = now or timezone.now()
    if session.status != 'active': return session.reason or '市场会话已结束'
    if session.expires_at <= now: return '市场会话达到五分钟上限'
    if not Agent.objects.filter(pk=session.actor_id).exists(): return '居民已删除'
    runtime = MarketRuntime.objects.filter(pk=session.pk).first()
    if not runtime or not AgentExecutionLease.objects.filter(agent_id=session.actor_id, token=runtime.agent_token, until__gt=now).exists():
        return '市场会话执行凭证失效'
    if session.mode != 'mcp' and not session.task_id: return '市场任务已删除'
    if session.task_id:
        task = AgentTask.objects.filter(pk=session.task_id).first()
        if not task or (session.mode != 'manual' and not task.enabled) or not life_allowed(task,session.actor_id):
            return '市场任务已停止或居民已解绑'
    if session.mode == 'automatic' and not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
        return '本机自动执行已关闭'
    if session.call_count >= MAX_CALLS: return '市场会话达到二十次工具调用上限'
    return None


@guarded
@transaction.atomic
def enter(owner: str, agent: Agent, key: str, *, task=None, record=None, mode='mcp', now=None) -> MarketSession:
    check_mcp()
    now = now or timezone.now()
    if not isinstance(key, str) or not key or len(key) > 64:
        raise ValueError('进入请求键无效')
    old = MarketSession.objects.filter(pk=key).first()
    if old:
        if old.owner_id != owner or old.actor_id != agent.pk or old.mode != mode or old.task_id != (task.pk if task else None):
            raise ValueError('进入请求键已用于不同会话')
        return old
    if owner_for(agent) != owner:
        raise ValueError('居民不属于此市场')
    from .travel_candidates import travelling_ids
    if agent.pk in travelling_ids(): raise ValueError('居民正在旅行')
    if MarketSession.objects.filter(actor_id=agent.pk, status='active').exists():
        raise ValueError('居民已有市场会话')
    if task and ((mode != 'manual' and not task.enabled) or not life_allowed(task,agent.pk)):
        raise ValueError('市场任务已停止或居民已解绑')
    if mode == 'automatic' and not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
        raise ValueError('本机自动执行已关闭')
    from .market_shop import config_for
    config_for(owner)
    agent = Agent.objects.select_for_update().get(pk=agent.pk)
    if stamina(agent, now) < COST: raise ValueError('体力不足')
    lease, _ = AgentExecutionLease.objects.get_or_create(agent=agent)
    if lease.until and lease.until > now: raise ValueError('居民正在执行其他任务')
    token = uuid.uuid4().hex
    lease.token, lease.until = token, now+DURATION+timedelta(seconds=5)
    lease.save(update_fields=['token', 'until'])
    session = MarketSession.objects.create(pk=key, owner_id=owner, actor_id=agent.pk, actor_name=agent.name,
        task=task, record=record, mode=mode, created_at=now, expires_at=now+DURATION)
    MarketRuntime.objects.create(pk=key, agent_token=token, process_id=os.getpid())
    WorldAction.objects.create(pk=hashlib.sha256(('market-energy:'+key).encode()).hexdigest(), actor_id=agent.pk, task=task, status='success',
        consumed_at=now, energy_cost=COST, effects_done=True, snapshot={'market_energy': True}, result={'session_id': key})
    return session


@guarded
def cleanup(*, restart=False, now=None):
    now = now or timezone.now()
    for session in MarketSession.objects.filter(status='active'):
        runtime = MarketRuntime.objects.filter(pk=session.pk).first()
        dead = False
        if restart and runtime:
            try: os.kill(runtime.process_id, 0)
            except ProcessLookupError: dead = True
            except PermissionError: pass
        reason = '进程中断，市场会话已关闭' if dead else invalid_reason(session, now)
        if reason: close_session(session, reason, now)


@guarded
@transaction.atomic
def consume_call(session, name, key, arguments, now=None):
    session = MarketSession.objects.select_for_update().get(pk=session.pk)
    reason = invalid_reason(session, now)
    if reason:
        raise ValueError(reason)
    for call in session.calls:
        if call['key'] == key:
            if call['name'] != name or call['arguments'] != arguments:
                raise ValueError('工具请求键已用于不同参数')
            # Failed retries also consume a call; committed trades are replayed before this function.
            break
    session.call_count += 1
    session.calls = [*session.calls, {'key': key, 'name': name, 'arguments': arguments, 'at': market_iso(now or timezone.now())}]
    session.save(update_fields=['call_count', 'calls'])
    return session


@guarded
@transaction.atomic
def finish_call(session, result):
    current = MarketSession.objects.select_for_update().get(pk=session.pk)
    if current.calls:
        current.calls[-1] = {**current.calls[-1], 'result':result}
        current.save(update_fields=['calls'])
