"""统一入口：已规划且到点的安排先执行，再补规划，避免后续规划拖住当前机会。"""
import logging
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from system_settings.models import Agent, AgentTask, AgentRunRecord, WorldAction, WorldActionRuntime
from .life_models import LifeConfig, LifeItem
from .life_config import tasks_for
from .life_schedule import OPEN, SHANGHAI, ensure_cycle, recover, revise, window, execution_key
from .life_scope import life_scope, CURRENT
from .life_context import build_context
from .life_planner import plan_items, check_goals
from .life_market import ensure_daily_market, execute_daily_market
from .life_time import local_time,storage_time
from .execution import WorldLeaseBusy, defer_when_world_busy, execution_lease, stamina
from .farm_gate import farm_gate

logger=logging.getLogger(__name__)


def finish_running(config, now):
    from .travel_models import TravelJourney
    for item in LifeItem.objects.filter(owner_id=config.pk,status='running'):
        key=execution_key(item)
        trip=TravelJourney.objects.filter(pk=key).first()
        if not trip and key!=item.pk:
            trip=TravelJourney.objects.filter(pk=item.pk).first()
        if trip:
            if trip.status in ('completed','skipped','failed','cancelled') or trip.phase=='done':
                action=WorldAction.objects.filter(pk=trip.pk).first() or WorldAction.objects.filter(pk=key).first()
                revise(item,'旅行工作流结束',status='completed' if trip.status=='completed' else 'rest' if trip.status=='skipped' else 'cancelled' if trip.status=='cancelled' else 'failed',record_id=action.record_id if action and action.record_id else '',result={'reason':trip.snapshot.get('skip_reason','旅行结束')})
                if trip.agent:check_goals(config.pk,trip.agent)
            elif trip.status in ('manual','paused') and item.result.get('reason')!='旅行工作流待人工处理，可在旅行面板继续或说明原因取消':
                revise(item,'旅行需要人工接续',result={'reason':'旅行工作流待人工处理，可在旅行面板继续或说明原因取消'})
            continue
        action=WorldAction.objects.filter(pk=key).first()
        if action and action.status in ('success','failed','skipped'):
            revise(item,'已核对实际执行事实',status={'success':'completed','failed':'failed','skipped':'rest'}[action.status],record_id=action.record_id or '',result=action.result)
        elif local_time(item.updated_at) < now-timedelta(minutes=15) and not action:
            revise(item,'准备阶段中断，没有业务提交，本机会结束',status='failed',result={'reason':'执行准备中断'})


def due_item(config, now):
    due = LifeItem.objects.filter(
        owner_id=config.pk, status__in=['pending', 'deferred'], scheduled_at__lte=timezone.now(),
    ).exclude(actor_id__in=config.paused_agents).order_by('scheduled_at').first()
    if not due:
        return None
    retry = due.context.get('planning_retry_at')
    if retry and local_time(timezone.datetime.fromisoformat(retry)) > now:
        return None
    return due


def world_execution_busy() -> bool:
    row = WorldActionRuntime.objects.filter(pk='world').only('token', 'until').first()
    return bool(row and row.token and row.until and row.until > timezone.now())


def ready_without_replanning(item: LifeItem, now) -> bool:
    """刚到点且今天已经规划过的安排直接执行。更早的过期安排仍先顺延，避免离线后集中补跑。"""
    today = local_time(now).date().isoformat()
    if item.activity == 'market_prepare':
        return local_time(item.original_at).date().isoformat() == today
    if item.activity in ('unplanned', '') or item.context.get('planned_on') != today:
        return False
    return local_time(item.scheduled_at) >= now - timedelta(seconds=90)


def execute_item(item: LifeItem, scheduler) -> None:
    from .life_config import config_for
    config=config_for(item.owner_id)
    agent=Agent.objects.select_related('model').filter(pk=item.actor_id).first()
    if not agent:
        revise(item,'居民已删除',status='cancelled');return
    if item.actor_id in config.paused_agents:
        revise(item,'居民暂停',status='paused');return
    if item.activity == 'market_prepare':
        execute_daily_market(config, agent, item, scheduler)
        return
    task=AgentTask.objects.filter(pk=item.task_id,enabled=True).first()
    if not task or item.activity=='unplanned':
        try:
            plan_items(config,agent,[item]);item.refresh_from_db()
            task=AgentTask.objects.filter(pk=item.task_id,enabled=True).first()
        except Exception as exc:
            revise(item,'条件已失效且无法重新规划',status='failed',result={'reason':str(exc)[:500]});return
    if item.activity=='rest':
        revise(item,'居民选择休息',status='rest',result={'reason':item.intent});check_goals(item.owner_id,agent);return
    from .travel_candidates import travelling_ids
    from system_settings.models import AgentExecutionLease
    costs={'cooking':1,'post_interaction':10,'post_publish':20,'investment':5,'farm':2,'travel':task.travel_config.get('energy_cost',20) if task else 20}
    busy=item.actor_id in travelling_ids() or AgentExecutionLease.objects.filter(agent_id=item.actor_id,until__gt=timezone.now()).exists()
    queue_farm = item.activity == 'farm' and bool(item.context.get('farm_plan_id'))
    if not queue_farm and (busy or stamina(agent)<costs.get(item.activity,2)):
        if item.attempts>=3:
            revise(item,'持续忙碌或体力不足，本机会结束',status='rest',result={'reason':'持续不可执行'});return
        item.attempts+=1
        point=local_time()+timedelta(minutes=config.settings.get('min_gap_minutes',15))
        left,right=window(config.settings,point.date())
        if point>=right:point=window(config.settings,point.date()+timedelta(days=1))[0]
        revise(item,'暂时忙碌或体力不足，顺延',status='deferred',scheduled_at=max(point,left));return
    # 即使资源变化也先给居民一次重新安排预算的机会。
    prior_status=item.status
    try:
        if not queue_farm:
            plan_items(config,agent,[item]);item.refresh_from_db()
        task=AgentTask.objects.filter(pk=item.task_id,enabled=True).first()
        if item.activity=='rest':
            revise(item,'执行前选择休息',status='rest',result={'reason':item.intent});return
        # 重新规划可能耗时，执行前再确认一次，避免把本轮记成休息或失败。
        if world_execution_busy():
            logger.warning('世界执行位忙碌，到期生活安排留到下一轮 item=%s',item.pk)
            return
        with farm_gate(), transaction.atomic():
            locked=LifeItem.objects.select_for_update().get(pk=item.pk)
            if locked.status not in ('pending','deferred'):
                return
            locked.status='running';locked.context={**locked.context,'execution_started':timezone.now().isoformat()};locked.save()
        marker=defer_when_world_busy.set(True)
        try:
            with life_scope(item,build_context(item.owner_id,agent,item)):
                from .life_budget_policy import allows_spending
                if allows_spending(item.activity) and item.context.get('needs_market'):
                    market=next((t for t in tasks_for(item.owner_id) if t.enabled and t.task_kind=='market'),None)
                    if market:
                        from .market_runner import run_market_opportunity
                        from .life_schedule import stable_id
                        run_market_opportunity(market,scheduler,key=stable_id(execution_key(item),'supplies'))
                        item.refresh_from_db();agent.refresh_from_db()
                        CURRENT.get()['context']=build_context(item.owner_id,agent,item)
                if item.activity=='cooking':
                    from .cooking_runner import run_cooking_opportunity as run
                elif item.activity=='farm':
                    if item.context.get('farm_plan_id'):
                        from .farm_queue_runner import run_queue_opportunity as run
                    else:
                        from .farm_runner import run_farm_opportunity as run
                elif item.activity=='investment':
                    from .investment_runner import run_investment_opportunity as run
                elif item.activity=='post_interaction':
                    from .action_runner import run_opportunity as run
                elif item.activity=='post_publish':
                    from .publish_runner import run_publish_opportunity as run
                elif item.activity=='travel':
                    from .travel_runner import run_travel_opportunity as run
                else:
                    raise ValueError('未支持的生活活动')
                outcome=run(task,scheduler,key=execution_key(item))
        finally:
            defer_when_world_busy.reset(marker)
        item.refresh_from_db()
        if item.activity=='travel':
            return  # 后续节点只继续本次 workflow。
        action=WorldAction.objects.filter(pk=execution_key(item)).first()
        status='failed' if outcome and outcome.status=='failed' else 'rest' if action and action.status=='skipped' else 'completed'
        if not outcome:
            status='failed'
        revise(item,'本次活动结束',status=status,record_id=outcome.pk if outcome else '',result={'reason':outcome.summary if outcome else '活动未能启动'})
        check_goals(item.owner_id,agent)
    except WorldLeaseBusy:
        item.refresh_from_db()
        if item.status=='running':
            item.status=prior_status if prior_status in ('pending','deferred') else 'pending'
            item.context={key:value for key,value in item.context.items() if key!='execution_started'}
            item.save(update_fields=['status','context','updated_at'])
        logger.warning('世界执行位忙碌，到期生活安排留到下一轮 item=%s',item.pk)
        return
    except Exception as exc:
        logger.exception('生活活动失败 item=%s',item.pk)
        item.refresh_from_db()
        revise(item,'本次活动失败，已提交业务保留',status='failed',result={'reason':str(exc)[:500]})


def tick_life(scheduler) -> None:
    configs=list(LifeConfig.objects.filter(migrated=True))
    # 核对业务事实不启动新行动，手动旅行结束时也必须释放预留。
    for config in configs:
        finish_running(config,local_time())
    if not WorldActionRuntime.objects.filter(pk='world',enabled=True).exists():
        return
    for config in configs:
        now=local_time()
        try:
            ran=False
            due=due_item(config,now)
            # 世界执行位被其他任务占用时留在原时间，下一轮再试，避免把机会记成休息或失败。
            if due and ready_without_replanning(due,now) and not world_execution_busy():
                execute_item(due,scheduler)
                ran=True
            with execution_lease(WorldActionRuntime,{'pk':'life-planner'}) as token:
                if not token:
                    logger.warning('生活规划锁被占用，本轮跳过重新规划 owner=%s',config.pk)
                else:
                    _plan_cycle(config,scheduler,now)
            if ran or world_execution_busy():
                if not ran and world_execution_busy():
                    logger.warning('世界执行位忙碌，到期生活安排留到下一轮 owner=%s',config.pk)
                continue
            due=due_item(config,now)
            if due:execute_item(due,scheduler)
        except Exception:
            logger.exception('生活周期处理失败 owner=%s',config.pk)


def _plan_cycle(config, scheduler, now):
    from .travel_models import TravelRuntime, TravelJourney
    running = LifeItem.objects.filter(owner_id=config.pk, status='running', activity='travel').exclude(actor_id__in=config.paused_agents)
    for pending in running:
        journey_id = execution_key(pending)
        trip = TravelJourney.objects.filter(pk=journey_id, status__in=['active', 'waiting']).first()
        if not trip and journey_id != pending.pk:
            trip = TravelJourney.objects.filter(pk=pending.pk, status__in=['active', 'waiting']).first()
        if trip:
            TravelRuntime.objects.update_or_create(pk=trip.pk, defaults={'authorized': True})
    # 90秒正常轮询容差内的 due 由执行器消费，不能反复向后挪。
    if LifeItem.objects.filter(owner_id=config.pk, status__in=['pending', 'deferred'], scheduled_at__lt=storage_time(now - timedelta(seconds=90))).exists():
        recover(config, now)
    ensure_cycle(config, now)
    ensure_daily_market(config, now)
    from .life_config import effective_settings
    active_ids = effective_settings(config, now).get('agent_ids', [])
    for capability in tasks_for(config.pk):
        if not capability.enabled:
            continue
        if capability.task_kind == 'farm':
            from .farm_service import ensure_farms
            ensure_farms(capability)
        elif capability.task_kind == 'investment':
            from .investment_service import validate_agents, account_for
            validate_agents(config.pk, active_ids)
            for resident in Agent.objects.filter(pk__in=active_ids):
                account_for(config.pk, resident)
    candidates = LifeItem.objects.filter(owner_id=config.pk, status__in=['pending', 'deferred']).exclude(activity='market_prepare').order_by('scheduled_at')
    today = local_time(now).date().isoformat()
    actor = None
    for entry in candidates:
        if entry.actor_id in config.paused_agents:
            continue
        retry = entry.context.get('planning_retry_at')
        if retry and local_time(timezone.datetime.fromisoformat(retry)) > now:
            continue
        if entry.activity == 'unplanned' or (local_time(entry.scheduled_at).date().isoformat() == today and entry.context.get('planned_on') != today):
            actor = entry.actor_id
            break
    if not actor:
        return
    agent = Agent.objects.select_related('model').filter(pk=actor).first()
    if not agent:
        return
    entries = [i for i in candidates if i.actor_id == actor and (i.activity == 'unplanned' or local_time(i.scheduled_at).date().isoformat() == today)]
    # 大周期分批规划，但不把剩余计划全部装进单次上下文。
    try:
        plan_items(config, agent, entries[:50])
    except Exception as exc:
        detail = str(exc)[:500]
        for entry in entries[:50]:
            entry.attempts += 1
            terminal = entry.attempts >= 3
            revise(entry, f'生活规划未通过校验：{detail}', status='failed' if terminal else 'deferred',
                   context={**entry.context, 'planning_retry_at': (now + timedelta(minutes=5)).isoformat()},
                   result={'reason': detail})
