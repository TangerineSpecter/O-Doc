"""市场任务是真实工具循环，进入、离开与普通 MCP 使用相同服务。"""
from utils.token_usage import usage_scope
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
from system_settings.agent_task_models import task_model_id, task_model_name
from .run_diagnostics import failure_detail, progress, finish_record
from .action_schedule import select_agent
from .execution import WorldLeaseBusy, defer_when_world_busy, execution_lease
from .market_tools import MARKET_TOOLS, call_market_tool
from .market_queries import actor_context
from .market_sessions import owner_for, cleanup, close_session
from .market_models import MarketSession

logger = logging.getLogger(__name__)


class MarketFinished(Exception):
    expected_tool_stop = True


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
    model_calls = [0]
    phase = '读取市场与居民状态'
    progress(record, phase)
    try:
        if not agent:
            action.status, action.result = 'skipped', {'reason':'没有空闲且体力足够的居民'}
        else:
            owner = owner_for(agent)
            started = timezone.now()
            update_work_activity(record,agent,status='running',current_action='正在查看市场')
            tools = [{'type':'function','function':{'name':t['name'],'description':t['description'],'parameters':t['inputSchema']}} for t in MARKET_TOOLS]
            from .life_budget import BUDGET_TOOL,budget_tool
            from .life_scope import CURRENT
            if CURRENT.get():tools.append(BUDGET_TOOL)
            blocked_purchase = None
            def execute(name, arguments):
                nonlocal phase, blocked_purchase
                phase = f'市场工具 {name}'
                progress(record, phase)
                model_calls[0] += 1
                if model_calls[0] > 24 or (timezone.now()-started).total_seconds() >= 300:
                    raise RuntimeError('市场任务达到执行上限')
                if name=='adjust_life_budget':
                    try:
                        result = budget_tool(arguments)
                        from .market_spending import spending_context
                        return {**result, 'spending': spending_context(owner, agent.pk)}
                    except ValueError as exc:return {'error':str(exc)}
                if name == 'enter_market':
                    import hashlib
                    entry_key='opportunity:'+key
                    if len(entry_key)>64:entry_key=hashlib.sha256(entry_key.encode()).hexdigest()
                    arguments = {**arguments,'request_id':entry_key}
                try:
                    result = call_market_tool(name,arguments,agent,task=task,record=record,mode=mode)
                    update_work_activity(record,agent,status='running',current_action={'enter_market':'进入市场','leave_market':'离开市场'}.get(name,'正在市场交易'))
                    active = MarketSession.objects.filter(record=record, status='active').exists()
                    if name == 'leave_market' or (MarketSession.objects.filter(record=record).exists() and not active):
                        raise MarketFinished(result.get('reason') or '市场会话已结束')
                    return result
                except ValueError as exc:
                    from .market_spending import MarketPurchaseBlocked
                    if isinstance(exc, MarketPurchaseBlocked):
                        fingerprint = (exc.result['code'], exc.result['spending'])
                        if blocked_purchase == fingerprint:
                            reason = '采购条件未变化仍重复尝试，已停止本次市场活动：' + str(exc)
                            for session in MarketSession.objects.filter(record=record, status='active'):
                                close_session(session, reason)
                            raise MarketFinished(reason)
                        blocked_purchase = fingerprint
                        return exc.result
                    progress(record, phase + '失败', failure_detail(phase, exc), 'failed')
                    return {'error':str(exc)}
            context = actor_context(owner,agent)
            from .life_scope import enrich
            context=enrich(context)
            from .memory.recall import memory_context
            resident_memory = memory_context(agent, '市场 采购 买卖 ' + task.prompt)
            prompt = build_agent_system_prompt(f'当前 Agent：{agent.name}\n{agent.prompt}',conversation=False) + '\n' + resident_memory
            prompt += '\n当天farm_queue列出未播种需求和采购上限。相同物资采购只解除等待，不增加种植目标；无货时可在本次市场决策调用update_farm_queue明确替代作物或减少目标并说明理由，再按实时库存采购。不要将所有买来的种子自动加入队列，不额外触发第二次市场；市场早于开工也不会提前播种。\n你获得一次逛市场机会。先结合真实余额、农场需求与挂牌决定进入或不去；不去直接说明。进入固定消耗5体力，交易不另扣体力。按工具返回的真实行情自主买卖，不必花光钱。购买前检查spending.spendable及slots_remaining；预算为0或不足时先调用adjust_life_budget，预算调整成功后再买。每次交易按返回的实时额度决定下一笔，不使用旧余额。采购被拦截时应调整预算、减少数量或离场，不能在条件未变化时重复尝试；额度用尽不能继续买新商品格，饲料和两种肥料均为常驻供给、不占格。肥料每小时随机报价：根据当前报价、以往实际成交、库存采购成本和种植预期收益自行判断价格是否合适，可以备货或等待下一次机会，不保证下次降价。高星农作物可自主溢价挂牌，也可按批次价格立即回收；挂牌溢价未成交不算收入。你可以上架、改价、撤单。操作使用唯一request_id，重试复用。完成后调用leave_market，不可声称未成交的操作成功。最多5分钟20次市场调用。'
            phase = '模型市场决策'
            progress(record, phase)
            with usage_scope(agent=agent, task=task, record=record, purpose='task', phase=phase):
                summary = AIService.chat_completion_messages_with_tools(
                    [{'role':'system','content':prompt},{'role':'user','content':json.dumps(context,cls=DjangoJSONEncoder,ensure_ascii=False)+'\n经营偏好：'+task.prompt}],
                    tools,execute,model_id=task_model_id(task, agent),max_rounds=24,deadline=time.monotonic()+300) or '本次市场机会结束'
            action.status, action.result = ('success' if MarketSession.objects.filter(record=record).exists() else 'skipped'), {'reason':str(summary)[:500]}
    except MarketFinished as exc:
        action.status, action.result = 'success', {'reason':str(exc)}
    except Exception as exc:
        logger.exception('Market opportunity failed')
        action.status, action.result = 'failed', {'reason':failure_detail(phase, exc)}
    finally:
        for session in MarketSession.objects.filter(record=record,status='active'):
            close_session(session,'市场任务结束' if action.status=='success' else '市场任务中断')
        action.effects_done = True; action.save(update_fields=['status','result','effects_done'])
        sessions = list(MarketSession.objects.filter(record=record).values('id','status','reason','call_count'))
        finish_record(record, 'failed' if action.status == 'failed' else 'success', action.result['reason'],
                      json.dumps({'sessions': sessions, **action.result}, ensure_ascii=False), '市场机会结束')
        if agent: update_work_activity(record,agent,status=record.status,current_action='市场机会结束',summary=record.summary,output=record.output)
    return record
