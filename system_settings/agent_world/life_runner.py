"""统一入口：已规划且到点的安排先执行，再补规划，避免后续规划拖住当前机会。"""
import logging
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from system_settings.models import Agent, AgentTask, AgentRunRecord, WorldAction, WorldActionRuntime
from .life_models import LifeConfig, LifeItem
from .life_activities import main_items, is_interleaved
from .life_config import tasks_for
from .life_schedule import OPEN, SHANGHAI, ensure_cycle, recover, revise, window, execution_key
from .life_scope import life_scope, CURRENT
from .life_context import build_execution_context
from .life_planner import plan_items, check_goals
from .life_market import ensure_daily_market, execute_daily_market
from .life_time import local_time,storage_time
from .execution import WorldLeaseBusy, defer_when_world_busy, execution_lease, stamina
from .farm_gate import farm_gate, guarded

logger=logging.getLogger(__name__)


def finish_running(config, now):
    from .travel_models import TravelJourney
    for item in LifeItem.objects.filter(owner_id=config.pk,status='running'):
        key=execution_key(item)
        if item.activity == 'fishing':
            from .fishing.models import FishingTrip
            run = FishingTrip.objects.filter(life_item_id=item.pk).first()
            if run:
                if run.ended_at:
                    revise(item, '出钓已结束', status='cancelled' if run.status == 'cancelled' else 'completed', record_id=run.record_id, result={'reason': run.state.get('reason', ''), 'fishing_trip_id': run.pk})
                continue
        if item.activity=='exploration':
            from .combat.models import Exploration
            from .combat.explorations import execution_completed
            run=Exploration.objects.filter(life_item_id=item.pk).first()
            if run:
                if run.ended_at:revise(item,'探索已结束',status='completed' if execution_completed(run.status) else 'failed',record_id=run.record_id,result={'reason':run.result.get('report',''),'exploration_id':run.pk})
                continue
        trip=TravelJourney.objects.filter(pk=key).first()
        if not trip and key!=item.pk:
            trip=TravelJourney.objects.filter(pk=item.pk).first()
        if trip:
            if trip.status in ('completed','skipped','failed','cancelled') or trip.phase=='done':
                action=WorldAction.objects.filter(pk=trip.pk).first() or WorldAction.objects.filter(pk=key).first()
                revise(item,'旅行工作流结束',status='completed' if trip.status=='completed' else 'cancelled' if trip.status=='cancelled' else 'failed',record_id=action.record_id if action and action.record_id else '',result={'reason':trip.snapshot.get('skip_reason','旅行结束')})
                if trip.agent:check_goals(config.pk,trip.agent)
            elif trip.status in ('manual','paused') and item.result.get('reason')!='旅行工作流待人工处理，可在旅行面板继续或说明原因取消':
                revise(item,'旅行需要人工接续',result={'reason':'旅行工作流待人工处理，可在旅行面板继续或说明原因取消'})
            continue
        action=WorldAction.objects.filter(pk=key).first()
        if action and action.status in ('success','failed','skipped'):
            # A forge visit can finish by registering goals without producing gear.
            if action.status == 'success' or (item.activity == 'blacksmith' and action.status == 'skipped'):
                status = 'completed'
            else:
                status = 'rest' if item.activity == 'market_prepare' and action.status == 'skipped' else 'failed'
            revise(item,'已核对实际执行事实',status=status,record_id=action.record_id or '',result=action.result)
        elif local_time(item.updated_at) < now-timedelta(minutes=15) and not action:
            revise(item,'准备阶段中断，没有业务提交，本机会结束',status='failed',result={'reason':'执行准备中断'})


def due_item(config, now):
    due = main_items(LifeItem.objects.filter(
        owner_id=config.pk, status__in=['pending', 'deferred'], scheduled_at__lte=timezone.now(), context__adventure_reservation_id__isnull=True,
    )).exclude(actor_id__in=config.paused_agents).exclude(actor_id__in=Agent.objects.filter(archived_at__isnull=False).values('pk')).order_by('scheduled_at')
    for item in due:
        retry = item.context.get('planning_retry_at')
        if not retry or local_time(timezone.datetime.fromisoformat(retry)) <= now:
            return item
    return None


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
    if agent and agent.archived:
        return
    if not agent:
        revise(item,'居民已删除',status='cancelled');return
    if item.actor_id in config.paused_agents:
        revise(item,'居民暂停',status='paused');return
    from .life_occupancy import occupied, defer_busy
    if item.activity != 'market_prepare' and occupied(item):
        defer_busy(item, config)
        return
    if item.activity == 'market_prepare':
        execute_daily_market(config, agent, item, scheduler)
        return
    if item.activity in ('unplanned', ''):
        try:
            plan_items(config,agent,[item]);item.refresh_from_db()
        except Exception as exc:
            revise(item,'条件已失效且无法重新规划',status='failed',result={'reason':str(exc)[:500]});return
        if item.status not in ('pending','deferred'):
            return
        if item.activity in ('unplanned', '') and item.status == 'deferred' and item.context.get('lottery_target'):
            return
        if item.activity in ('unplanned', ''):
            revise(item,'重新规划未生成活动意向',status='failed',
                   result={'reason':'规划器未生成新的活动意向，请检查规划条件后重试'});return
    if item.activity == 'fishing':
        from .fishing.service import request
        try:
            request(item)
        except ValueError as exc:
            revise(item, '出钓准备未能启动', status='failed', result={'reason': str(exc)})
        return
    if item.activity == 'lottery':
        from .lottery_runner import execute
        execute(item, agent)
        return
    if item.activity=='rest':
        revise(item,'居民选择休息',status='rest',result={'reason':item.intent});check_goals(item.owner_id,agent);return
    task=AgentTask.objects.filter(pk=item.task_id,enabled=True).first()
    if not task:
        revise(item,'已安排活动不可用',status='failed',result={'reason':'活动能力已停用或删除'});return
    from .travel_candidates import travelling_ids
    from system_settings.models import AgentExecutionLease
    costs={'cooking':2,'post_interaction':10,'post_publish':20,'investment':5,'farm':2,'travel':task.travel_config.get('energy_cost',20) if task else 20}
    from .combat.schedule import occupied_ids
    busy=item.actor_id in occupied_ids() or item.actor_id in travelling_ids() or AgentExecutionLease.objects.filter(agent_id=item.actor_id,until__gt=timezone.now()).exists()
    queue_farm = item.activity == 'farm' and bool(item.context.get('farm_plan_id'))
    if item.activity == 'exploration':
        from .combat.explorations import energy as exploration_energy
        required_energy = exploration_energy(30 * 60)
    elif item.activity == 'blacksmith':
        from .blacksmith_catalog import ENERGY_COST
        required_energy = ENERGY_COST
    elif item.activity == 'alchemy':
        from .alchemy_queries import minimum_start_energy
        from .alchemy_schedule_plan import validate_plan
        specification = item.context.get('alchemy_plan')
        if specification:
            required_energy = sum(entry['quantity'] * entry['rule']['energy_cost']
                                  for entry in validate_plan(specification)['entries'])
        else:
            required_energy = minimum_start_energy(item.owner_id, agent)
    else:
        required_energy = costs.get(item.activity, 2)
    energy_insufficient = stamina(agent) < required_energy
    if busy:
        defer_busy(item, config)
        return
    if not queue_farm and energy_insufficient:
        if item.attempts>=3:
            revise(item,'体力不足，顺延重试后仍无法执行',status='rest',
                   result={'reason':f'当前体力不足以启动活动，至少需要 {required_energy} 点'});return
        item.attempts+=1
        point=local_time()+timedelta(minutes=config.settings.get('min_gap_minutes',15))
        left,right=window(config.settings,point.date())
        if point>=right:point=window(config.settings,point.date()+timedelta(days=1))[0]
        revise(item,'暂时忙碌或体力不足，顺延',status='deferred',scheduled_at=max(point,left));return
    # 付费活动可按最新余额复核预算；活动类型保持原安排。未固化的农场计划只补充队列。
    prior_status=item.status
    try:
        from .life_budget_policy import allows_spending
        if not is_interleaved(item) and not queue_farm and (item.activity == 'farm' or allows_spending(item.activity)):
            plan_items(config,agent,[item],preserve_activities=True);item.refresh_from_db()
        task=AgentTask.objects.filter(pk=item.task_id,enabled=True).first()
        if not task:
            revise(item,'已安排活动不可用',status='failed',result={'reason':'活动能力已停用或删除'});return
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
            with life_scope(item,build_execution_context(item.owner_id,agent,item)):
                from .life_budget_policy import allows_spending
                if allows_spending(item.activity) and item.context.get('needs_market'):
                    market=next((t for t in tasks_for(item.owner_id) if t.enabled and t.task_kind=='market'),None)
                    if market:
                        from .market_runner import run_market_opportunity
                        from .life_schedule import stable_id
                        run_market_opportunity(market,scheduler,key=stable_id(execution_key(item),'supplies'))
                        item.refresh_from_db();agent.refresh_from_db()
                        CURRENT.get()['context']=build_execution_context(item.owner_id,agent,item)
                if item.activity=='exploration':
                    from .combat.schedule import run_opportunity as run
                elif item.activity=='cooking':
                    from .cooking_runner import run_cooking_opportunity as run
                elif item.activity=='alchemy':
                    from .alchemy_runner import run_alchemy_opportunity as run
                elif item.activity=='blacksmith':
                    from .blacksmith_runner import run_blacksmith_opportunity as run
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
        if item.activity in ('travel','exploration','blacksmith'):
            return  # 后续节点只继续本次 workflow。
        action=WorldAction.objects.filter(pk=execution_key(item)).first()
        skipped = bool(action and action.status == 'skipped')
        if item.activity == 'investment' and outcome and outcome.status == 'success' and skipped:
            status = 'rest'
        elif not outcome or outcome.status in ('failed', 'skipped') or skipped:
            status = 'failed'
        else:
            status = 'completed'
        revise(item,'本次活动结束',status=status,record_id=outcome.pk if outcome else '',result={'reason':outcome.summary if outcome else '活动未能启动'})
        from .life_goal_results import update as update_result_goals
        update_result_goals(item, agent)
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
    from .life_activity_recovery import reconcile, requeue_busy_failures
    reconcile()
    configs=list(LifeConfig.objects.filter(migrated=True))
    # 核对业务事实不启动新行动，手动旅行结束时也必须释放预留。
    for config in configs:
        requeue_busy_failures(config, local_time())
        finish_running(config,local_time())
    from .life_interleaving_recovery import expire_selections
    expire_selections()
    # Finishing accounting is safe even after local automatic execution is disabled.
    from .life_interleaving_usage import complete
    active_records = list(AgentRunRecord.objects.filter(trigger='系统穿插', status='running').values_list('pk', flat=True))
    for item in LifeItem.objects.filter(context__interleaving__selection_record_id__in=active_records).exclude(status__in=OPEN):
        complete(item)
    if not WorldActionRuntime.objects.filter(pk='world',enabled=True).exists():
        return
    from .lottery_service import tick as tick_lottery
    try:
        tick_lottery()
    except Exception:
        logger.exception('大乐透维护失败，本轮居民生活继续执行')
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
            from .combat.reservation_planning import coordinated
            from .combat.reservation_execution import tick as tick_reservations
            ready_for_idle = coordinated(config, local_time())
            tick_reservations(config, local_time())
            if ran or world_execution_busy():
                if not ran and world_execution_busy():
                    logger.warning('世界执行位忙碌，到期生活安排留到下一轮 owner=%s',config.pk)
                continue
            due=due_item(config,now)
            if due:execute_item(due,scheduler)
            from .life_interleaving import tick as tick_interleaving
            if ready_for_idle:
                tick_interleaving(config, scheduler)
            from .life_goal_results import update as update_result_goals
            completed = LifeItem.objects.filter(owner_id=config.pk, status='completed', updated_at__gte=storage_time(local_time() - timedelta(days=1))).exclude(record_id='').order_by('-updated_at')
            for finished in completed:
                if finished.context.get('goal_result_record') != finished.record_id:
                    resident = Agent.objects.filter(pk=finished.actor_id).first()
                    if resident:
                        update_result_goals(finished, resident)
                        if finished.context.get('goal_result_record') == finished.record_id:
                            break
        except Exception:
            logger.exception('生活周期处理失败 owner=%s',config.pk)


@guarded
@transaction.atomic
def _wait_for_planning(entries, now):
    from .life_activity_recovery import BUSY_REASON
    for source in entries:
        entry = LifeItem.objects.select_for_update().filter(pk=source.pk).first()
        if not entry or entry.status not in ('pending', 'deferred'):
            continue
        context = {**entry.context, 'planning_retry_at': (now + timedelta(minutes=5)).isoformat()}
        if entry.status == 'deferred' and entry.result.get('reason') == BUSY_REASON:
            entry.context = context
            entry.save(update_fields=['context', 'updated_at'])
        else:
            revise(entry, '居民暂时忙碌，保留原时段等待规划，不计失败次数', status='deferred',
                   context=context, result={'reason': BUSY_REASON})


def _plan_cycle(config, scheduler, now):
    from .lottery_models import LotteryConfig
    from .lottery_service import ensure_task
    from .fishing.models import FishingConfig
    from .fishing.service import task_for as fishing_task
    if FishingConfig.objects.filter(pk=config.pk).exists() and config.settings.get('agent_ids'):
        fishing_task(config.pk)
    lottery_config = LotteryConfig.objects.filter(pk=config.pk).first()
    if lottery_config:
        ensure_task(lottery_config)
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
    # 日规划很重，每个 tick 只补一位居民；已生成/失败的当天计划不重复调用模型。
    from .life_config import market_automation_enabled
    if market_automation_enabled(config, now):
        from .market_plan_models import MarketPlan
        from .market_planning import ensure_plan
        today = local_time(now).date()
        for actor_id in active_ids:
            if MarketPlan.objects.filter(owner_id=config.pk, actor_id=actor_id, plan_date=today,
                                         status__in=('active', 'failed', 'closed')).exists():
                continue
            try:
                ensure_plan(config.pk, actor_id, now)
            except Exception:
                logger.exception('每日市场规划失败 actor=%s', actor_id)
            break
    for capability in tasks_for(config.pk):
        if not capability.enabled:
            continue
        if capability.task_kind == 'farm':
            from .farm_service import ensure_farms
            ensure_farms(capability)
        elif capability.task_kind == 'investment':
            from .investment_service import validate_agents, account_for
            validate_agents(config.pk, active_ids)
            for resident in Agent.objects.filter(pk__in=active_ids, archived_at__isnull=True):
                account_for(config.pk, resident)
    candidates = main_items(LifeItem.objects.filter(owner_id=config.pk, status__in=['pending', 'deferred'])).exclude(activity='market_prepare').exclude(actor_id__in=Agent.objects.filter(archived_at__isnull=False).values('pk')).order_by('scheduled_at')
    today = local_time(now).date().isoformat()
    pending = [entry for entry in candidates if entry.actor_id not in config.paused_agents
               and (entry.activity == 'unplanned' or (local_time(entry.scheduled_at).date().isoformat() == today
                    and entry.context.get('planned_on') != today))]
    # A newly added slot must not pull a failed day's other slots past their backoff.
    blocked_days = {(entry.actor_id, local_time(entry.scheduled_at).date()) for entry in pending
                    if entry.context.get('planning_retry_at') and local_time(
                        timezone.datetime.fromisoformat(entry.context['planning_retry_at'])) > now}
    from .life_occupancy import occupied
    first = None
    for entry in pending:
        group = (entry.actor_id, local_time(entry.scheduled_at).date())
        if group in blocked_days:
            continue
        if occupied(entry):
            waiting = [row for row in pending if (row.actor_id, local_time(row.scheduled_at).date()) == group]
            _wait_for_planning(waiting, now)
            blocked_days.add(group)
            continue
        first = entry
        break
    if first is None:
        return
    actor = first.actor_id
    day = local_time(first.scheduled_at).date()
    agent = Agent.objects.select_related('model').filter(pk=actor).first()
    if not agent:
        return
    entries = [entry for entry in pending if entry.actor_id == actor and local_time(entry.scheduled_at).date() == day]
    # Batch by the same resident/day boundary used by the planner, without truncating a day.
    try:
        plan_items(config, agent, entries)
    except Exception as exc:
        from system_settings.agent_availability import AgentBusyError
        if isinstance(exc, AgentBusyError):
            _wait_for_planning(entries, now)
            return
        detail = str(exc)[:500]
        start = local_time(first.scheduled_at).replace(hour=0, minute=0, second=0, microsecond=0)
        affected = main_items(LifeItem.objects.filter(owner_id=config.pk, actor_id=actor, status__in=['pending', 'deferred'],
            scheduled_at__gte=storage_time(start), scheduled_at__lt=storage_time(start + timedelta(days=1)))).exclude(activity='market_prepare')
        for entry in affected:
            entry.refresh_from_db()
            if entry.status not in ('pending', 'deferred'):
                continue
            if entry.context.get('planned_on') == local_time(entry.scheduled_at).date().isoformat() and entry.activity not in ('unplanned', ''):
                continue
            entry.attempts += 1
            terminal = entry.attempts >= 3
            revise(entry, f'生活规划未通过校验：{detail}', status='failed' if terminal else 'deferred',
                   context={**entry.context, 'planning_retry_at': (now + timedelta(minutes=5)).isoformat()},
                   result={'reason': detail})
