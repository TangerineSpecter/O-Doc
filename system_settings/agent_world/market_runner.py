"""市场任务是真实工具循环，进入、离开与普通 MCP 使用相同服务。"""
import json
import logging
import uuid
import time
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone
from system_settings.models import AgentTask, AgentRunRecord, WorldAction, WorldActionRuntime
from system_settings.agent_activity import update_work_activity
from system_settings.agent_prompts import build_agent_system_prompt
from utils.ai_service import AIService
from .action_schedule import select_agent
from .execution import execution_lease
from .market_tools import MARKET_TOOLS, call_market_tool
from .market_queries import actor_context
from .market_sessions import owner_for, cleanup, close_session
from .market_models import MarketSession

logger = logging.getLogger(__name__)


class MarketFinished(Exception):
    pass


def run_market_opportunity(task: AgentTask, scheduler=None, *, key=None, manual=False) -> AgentRunRecord | None:
    key = key or uuid.uuid4().hex
    cleanup(restart=True)
    old = WorldAction.objects.filter(pk=key).first()
    if old: return old.record
    # Only the opportunity claim holds the world lease, never the model loop.
    with execution_lease(WorldActionRuntime, {'pk':'world'}) as world_token:
        if not world_token:
            if scheduler:
                from .action_runner import record_busy_opportunity
                return record_busy_opportunity(task, scheduler, key, manual)
            return None
        task.refresh_from_db()
        if not manual and not task.enabled: return None
        agent = select_agent(task, cost=5, qualifies=lambda a:bool(a.model_id))
        record = AgentRunRecord.objects.create(task=task,task_name=task.name,agent=agent,agent_name=agent.name if agent else '',
            trigger='手动执行' if manual else '系统行动',status='running',summary='正在考虑是否逛市场',
            agent_runs=[{'agent':agent.pk,'agentName':agent.name,'agentAvatar':agent.avatar,
                         'modelName':agent.model.name,'status':'running','steps':[]}] if agent else [])
        action = WorldAction.objects.create(pk=key,task=task,agent=agent,actor_id=agent.pk if agent else '',record=record,snapshot={'market':True})
    mode = 'manual' if manual else 'automatic'
    model_calls = [0]
    try:
        if not agent:
            action.status, action.result = 'skipped', {'reason':'没有空闲且体力足够的居民'}
        else:
            owner = owner_for(agent)
            started = timezone.now()
            update_work_activity(record,agent,status='running',current_action='正在查看市场')
            tools = [{'type':'function','function':{'name':t['name'],'description':t['description'],'parameters':t['inputSchema']}} for t in MARKET_TOOLS]
            def execute(name, arguments):
                model_calls[0] += 1
                if model_calls[0] > 24 or (timezone.now()-started).total_seconds() >= 300:
                    raise RuntimeError('市场任务达到执行上限')
                if name == 'enter_market': arguments = {**arguments,'request_id':'opportunity:'+key}
                try:
                    result = call_market_tool(name,arguments,agent,task=task,record=record,mode=mode)
                    update_work_activity(record,agent,status='running',current_action={'enter_market':'进入市场','leave_market':'离开市场'}.get(name,'正在市场交易'))
                    active = MarketSession.objects.filter(record=record, status='active').exists()
                    if name == 'leave_market' or (MarketSession.objects.filter(record=record).exists() and not active):
                        raise MarketFinished('Agent 已离开市场或会话达到上限')
                    return result
                except ValueError as exc:
                    return {'error':str(exc)}
            context = actor_context(owner,agent)
            prompt = build_agent_system_prompt(f'当前 Agent：{agent.name}\n{agent.prompt}',conversation=False)
            prompt += '\n你获得一次逛市场机会。先结合真实余额、农场需求与挂牌决定进入或不去；不去直接说明。进入固定消耗5体力，交易不另扣体力。按工具返回的真实行情自主买卖，不必花光钱。你可以上架、改价、撤单。操作使用唯一request_id，重试复用。完成后调用leave_market，不可声称未成交的操作成功。最多5分钟20次市场调用。'
            summary = AIService.chat_completion_messages_with_tools(
                [{'role':'system','content':prompt},{'role':'user','content':json.dumps(context,cls=DjangoJSONEncoder,ensure_ascii=False)+'\n经营偏好：'+task.prompt}],
                tools,execute,model_id=agent.model_id,max_rounds=24,deadline=time.monotonic()+300) or '本次市场机会结束'
            action.status, action.result = ('success' if MarketSession.objects.filter(record=record).exists() else 'skipped'), {'reason':str(summary)[:500]}
    except MarketFinished as exc:
        action.status, action.result = 'success', {'reason':str(exc)}
    except Exception as exc:
        logger.exception('Market opportunity failed')
        action.status, action.result = 'failed', {'reason':str(exc)[:500]}
    finally:
        for session in MarketSession.objects.filter(record=record,status='active'):
            close_session(session,'市场任务结束' if action.status=='success' else '市场任务中断')
        action.effects_done = True; action.save(update_fields=['status','result','effects_done'])
        sessions = list(MarketSession.objects.filter(record=record).values('id','status','reason','call_count'))
        record.status = 'failed' if action.status=='failed' else 'success'
        record.summary = action.result['reason']; record.output = json.dumps({'sessions':sessions,**action.result},ensure_ascii=False)
        record.agent_runs = [{**r,'status':record.status,'summary':record.summary} for r in record.agent_runs]
        record.save(update_fields=['status','summary','output','agent_runs','updated_at'])
        if agent: update_work_activity(record,agent,status=record.status,current_action='市场机会结束',summary=record.summary,output=record.output)
    return record
