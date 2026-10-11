"""市场任务是真实工具循环，进入、离开与普通 MCP 使用相同服务。"""
import json
import logging
import uuid
from system_settings.models import AgentTask, AgentRunRecord, WorldAction, WorldActionRuntime
from system_settings.agent_activity import update_work_activity
from utils.ai_service import AIService
from system_settings.agent_task_models import task_model_id, task_model_name
from .run_diagnostics import failure_detail, progress, finish_record
from .action_schedule import select_agent
from .execution import WorldLeaseBusy, defer_when_world_busy, execution_lease
from .market_sessions import cleanup, close_session
from .market_models import MarketSession
from .market_model_execution import MarketExecution, MarketFinished

logger = logging.getLogger(__name__)


def run_market_opportunity(task: AgentTask, scheduler=None, *, key=None, manual=False) -> AgentRunRecord | None:
    key = key or uuid.uuid4().hex
    cleanup(restart=True)
    old = WorldAction.objects.filter(pk=key).first()
    if old: return old.record
    # Only the opportunity claim holds the world lease, never the model loop.
    with execution_lease(WorldActionRuntime, {'pk':'world'}) as world_token:
        if not world_token:
            if defer_when_world_busy.get():
                raise WorldLeaseBusy()
            if scheduler:
                from .action_runner import record_busy_opportunity
                return record_busy_opportunity(task, scheduler, key, manual)
            return None
        task.refresh_from_db()
        if not manual and not task.enabled: return None
        agent = select_agent(task, cost=5, qualifies=lambda a:bool(task_model_id(task, a)))
        record = AgentRunRecord.objects.create(task=task,task_name=task.name,agent=agent,agent_name=agent.name if agent else '',
            trigger='手动执行' if manual else '系统行动',status='running',summary='正在考虑是否逛市场',
            agent_runs=[{'agent':agent.pk,'agentName':agent.name,'agentAvatar':agent.avatar,
                         'modelName':task_model_name(task, agent),'status':'running','steps':[]}] if agent else [])
        action = WorldAction.objects.create(pk=key,task=task,agent=agent,actor_id=agent.pk if agent else '',record=record,snapshot={'market':True})
    mode = 'manual' if manual else 'automatic'
    runtime = None
    phase = '读取市场与居民状态'
    progress(record, phase)
    try:
        if not agent:
            action.status, action.result = 'skipped', {'reason':'没有空闲且体力足够的居民'}
        else:
            runtime = MarketExecution(task, agent, record, key, mode)
            summary = runtime.run(AIService)
            action.status, action.result = ('success' if MarketSession.objects.filter(record=record).exists() else 'skipped'), {'reason':str(summary)[:500]}
    except MarketFinished as exc:
        action.status, action.result = 'success', {'reason':str(exc)}
        for session in MarketSession.objects.filter(record=record, status='active'):
            close_session(session, str(exc))
    except Exception as exc:
        logger.exception('Market opportunity failed')
        action.status, action.result = 'failed', {'reason':failure_detail(runtime.phase if runtime else phase, exc)}
    finally:
        for session in MarketSession.objects.filter(record=record,status='active'):
            close_session(session,'市场任务结束' if action.status=='success' else '市场任务中断')
        action.effects_done = True; action.save(update_fields=['status','result','effects_done'])
        sessions = list(MarketSession.objects.filter(record=record).values('id','status','reason','call_count'))
        finish_record(record, 'failed' if action.status == 'failed' else 'success', action.result['reason'],
                      json.dumps({'sessions': sessions, **action.result}, ensure_ascii=False), '市场机会结束')
        if agent: update_work_activity(record,agent,status=record.status,current_action='市场机会结束',summary=record.summary,output=record.output)
    return record
