"""确定性周期分配与遗留重排；日程事实不依赖内存 job 存活。"""
import hashlib
import random
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo
from django.db import transaction
from django.utils import timezone
from system_settings.agent_random_schedule import period_bounds
from .life_models import LifeConfig, LifeCycle, LifeItem, LifeRevision
from .life_config import DEFAULTS, effective_settings, ensure_profiles, tasks_for
from .farm_gate import guarded
from .life_time import local_time,storage_time

SHANGHAI = ZoneInfo('Asia/Shanghai')
OPEN = ('pending', 'running', 'deferred', 'paused')
TERMINAL = ('completed', 'rest', 'failed', 'cancelled')


def stable_id(*parts: object) -> str:
    return hashlib.sha256(':'.join(map(str, parts)).encode()).hexdigest()


def bounds(settings: dict, now: datetime) -> tuple[datetime, datetime]:
    return period_bounds('daily' if settings['mode'] == 'fixed' else settings['period'], local_time(now))


def window(settings, day):
    midnight = datetime.combine(day, time(), SHANGHAI)
    def offset(value):
        h, m = map(int, value.split(':'))
        return timedelta(hours=h, minutes=m)
    return midnight + offset(settings['active_start']), midnight + offset(settings['active_end'])


def allocation_times(settings: dict, now: datetime, *, full_period: bool = False) -> list[tuple[datetime, str]]:
    settings = {**DEFAULTS, **settings}
    start, end = bounds(settings, now)
    origin = start if full_period else max(start, local_time(now) + (timedelta(seconds=-90) if settings['mode']=='fixed' else timedelta(minutes=5)))
    grid = []
    day = start.date()
    step = settings['interval_minutes'] if settings['mode'] == 'fixed' else 5
    while datetime.combine(day, time(), SHANGHAI) < end:
        left, right = window(settings, day)
        point = left
        while point < min(right, end):
            if point >= origin:
                grid.append(point)
            point += timedelta(minutes=step)
        day += timedelta(days=1)
    ids = list(settings['agent_ids'])
    if not ids or not grid:
        return []
    count = len(grid) if settings['mode'] == 'fixed' else settings['count']
    if count > len(grid):
        raise ValueError('剩余活动时间不足以容纳全部机会，请降低次数或扩大时间范围')
    rng = random.Random(stable_id(start.isoformat(), str(settings)))
    # 周期内保持轮转顺序，避免两轮交界随机重复同一居民。
    # 每个周期重新洗牌，余数仍随机分配且不跨周期累计。
    rng.shuffle(ids)
    actors = [ids[index % len(ids)] for index in range(count)]
    for randomized in (True, False):
        last = {}
        allocations = []
        for index, actor in enumerate(actors):
            lo = index * len(grid) // count
            hi = (index + 1) * len(grid) // count
            minimum = last.get(actor, start-timedelta(days=1)) + timedelta(minutes=settings['min_gap_minutes'])
            choices = [point for point in grid[lo:hi] if point >= minimum]
            if not choices:
                break
            point = rng.choice(choices) if randomized and settings['mode'] != 'fixed' else choices[0]
            allocations.append((point, actor))
            last[actor] = point
        else:
            return allocations
        # 随机落点可能挤占后续空间；按最早可用点重排后才判断容量。
    raise ValueError('次数和居民间隔无法同时满足，请降低次数或增加参与居民')


@guarded
@transaction.atomic
def ensure_cycle(config, now=None):
    now = local_time(now)
    existing = LifeCycle.objects.filter(owner_id=config.pk, starts_at__lte=storage_time(now), ends_at__gt=storage_time(now)).first()
    if existing:
        return existing
    settings = {**DEFAULTS, **config.settings}
    start, end = bounds(settings, now)
    today_start,today_end=window(settings,local_time(now).date())
    today_end=min(today_end,end)
    if (today_end-max(now,today_start)).total_seconds() < settings['min_remaining_minutes']*60:
        return None
    # 当前周期正常未来安排不是遗留；跨周期未结束 workflow 及逾期安排优先。
    from .life_activities import main_items
    blocked = set(main_items(LifeItem.objects.filter(owner_id=config.pk, status__in=OPEN)).exclude(activity='market_prepare').values_list('actor_id', flat=True))
    ids = [a for a in settings['agent_ids'] if a not in blocked and a not in config.paused_agents]
    settings['agent_ids'] = ids
    ensure_profiles(config.pk, ids)
    from system_settings.models import Agent
    settings['agent_ids'] = list(Agent.objects.filter(pk__in=ids, model__isnull=False, archived_at__isnull=True).values_list('pk', flat=True))
    try:
        allocations = allocation_times(settings, now)
    except ValueError:
        # 完整周期配置有效，但启动过晚不能塞满全部机会，等待下一边界。
        allocation_times(settings,now,full_period=True)
        return None
    if not allocations:
        return None
    cycle, created = LifeCycle.objects.get_or_create(pk=stable_id(config.pk, start.isoformat()), defaults={
        'owner_id': config.pk, 'starts_at': start, 'ends_at': end, 'snapshot': {'settings': settings, 'participants': config.settings.get('agent_ids', []),
        'residents':list(Agent.objects.filter(pk__in=settings['agent_ids']).values('id','name','prompt','profession_id','model_id')), 'version': 1}})
    if created:
        for index, (point, actor) in enumerate(allocations):
            LifeItem.objects.create(pk=stable_id(cycle.pk, index), owner_id=config.pk, actor_id=actor,
                                    cycle=cycle, original_at=point, scheduled_at=point)
    return cycle


def item_state(item: LifeItem) -> dict:
    return {'scheduled_at': item.scheduled_at.isoformat(), 'activity': item.activity, 'status': item.status,
            'intent': item.intent, 'budget': str(item.budget)}


@guarded
@transaction.atomic
def revise(item: LifeItem, reason: str, **changes) -> None:
    before = item_state(item)
    if not item.context.get('adventure_reservation_id') and (any(k in changes for k in ('scheduled_at', 'activity')) or changes.get('status') == 'cancelled'):
        from .combat.reservation_views import invalidate_for_item
        invalidate_for_item(item, reason)
    for key, value in changes.items():
        setattr(item, key, value)
    item.save()
    LifeRevision.objects.create(item=item, before=before, after=item_state(item), reason=reason)
    if item.context.get('farm_plan_id'):
        from .farm_queue_schedule import changed
        changed(item, reason)


def _next_free_slot(candidate: datetime, settings: dict, occupied: list[datetime]) -> datetime | None:
    """Find the next activity start that respects the day's window and minimum gap."""
    day = local_time(candidate).date()
    left, right = window(settings, day)
    point = max(local_time(candidate), left)
    gap = timedelta(minutes=settings['min_gap_minutes'])
    while point < right:
        conflicts = [at for at in occupied if abs((point - at).total_seconds()) < gap.total_seconds()]
        if not conflicts:
            return point
        point = max(conflicts) + gap
    return None


@guarded
@transaction.atomic
def reschedule_after_exploration(owner: str, actor: str, start: datetime, duration_seconds: int, *,
                                 life_item_id: str = '') -> None:
    """Move only affected open life items around an exploration reservation.

    The current day's tail moves by the exploration duration. Items pushed into the
    next day are inserted into gaps without moving that day's unaffected schedule.
    """
    start = local_time(start)
    end = start + timedelta(seconds=duration_seconds)
    config = LifeConfig.objects.filter(pk=owner).first()
    from .life_config import DEFAULTS, effective_settings
    settings = {**DEFAULTS, **(effective_settings(config, start) if config else {})}
    gap = timedelta(minutes=settings['min_gap_minutes'])
    day_left, day_right = window(settings, start.date())
    rows = list(LifeItem.objects.select_for_update().filter(
        owner_id=owner, actor_id=actor, status__in=('pending', 'deferred'),
        scheduled_at__gte=storage_time(start),
    ).exclude(pk=life_item_id).order_by('scheduled_at', 'id'))
    at_by_id = {row.pk: local_time(row.scheduled_at) for row in rows}
    overlapping = [row for row in rows if start <= at_by_id[row.pk] < end]
    if not overlapping:
        return

    today = start.date()
    today_conflicts = [at_by_id[row.pk] for row in overlapping if at_by_id[row.pk].date() == today]
    first_today_conflict = min(today_conflicts) if today_conflicts else None
    today_tail = [row for row in rows if first_today_conflict is not None
                  and at_by_id[row.pk].date() == today and at_by_id[row.pk] >= first_today_conflict]
    tail_ids = {row.pk for row in today_tail}
    next_day_conflicts = [row for row in overlapping if at_by_id[row.pk].date() > today]
    next_day_ids = {row.pk for row in next_day_conflicts}

    updates = []
    failures = []
    overflow = []
    same_day_occupied = [at_by_id[row.pk] for row in rows if row.pk not in tail_ids
                         and at_by_id[row.pk].date() == today]
    last_tail_target = None
    for row in today_tail:
        original = at_by_id[row.pk]
        target = original + timedelta(seconds=duration_seconds)
        target = max(target, end + gap)
        if last_tail_target is not None:
            target = max(target, last_tail_target + gap)
        last_tail_target = target
        if target.date() == today and target < day_right:
            updates.append((row, target, f'迷宫探索占用 {duration_seconds // 60} 分钟，当天后续日程顺延'))
            same_day_occupied.append(target)
        else:
            if row.activity == 'market_prepare':
                point = _next_free_slot(max(end + gap, day_left), settings, same_day_occupied)
                if point is None or point >= day_right:
                    failures.append((row, '迷宫探索挤占后，当天没有可用的市场机会时段'))
                else:
                    updates.append((row, point, '迷宫探索占用后，市场机会移入当天空档'))
                    same_day_occupied.append(point)
            else:
                overflow.append((row, target, original))

    for row in next_day_conflicts:
        original = at_by_id[row.pk]
        overflow.append((row, end + gap, original))

    if overflow:
        next_day = today + timedelta(days=1)
        _, next_right = window(settings, next_day)
        moving_ids = tail_ids | next_day_ids
        occupied = [at_by_id[row.pk] for row in rows if row.pk not in moving_ids
                    and at_by_id[row.pk].date() == next_day]
        farm_days = {at_by_id[row.pk].date() for row in rows
                     if row.pk not in moving_ids and at_by_id[row.pk].date() == next_day
                     and row.activity == 'farm'}
        previous_target = None
        for row, proposed, original in sorted(overflow, key=lambda entry: (entry[2], entry[1], entry[0].pk)):
            # A daily market opportunity belongs to its original date and cannot roll over.
            if row.activity == 'market_prepare' and local_time(row.original_at).date() != next_day:
                failures.append((row, '迷宫探索挤占后，当天没有可用的市场机会时段'))
                continue
            candidate = max(proposed, end + gap, window(settings, next_day)[0])
            if previous_target is not None:
                candidate = max(candidate, previous_target + gap)
            if row.activity == 'farm' and next_day in farm_days:
                point = None
            else:
                point = _next_free_slot(candidate, settings, occupied)
            if point is None or point >= next_right:
                failures.append((row, '探索顺延后次日没有可用空档，需要重新规划'))
                continue
            reason = f'迷宫探索预计 {end.strftime("%Y-%m-%d %H:%M")} 结束，安排到次日空档'
            updates.append((row, point, reason))
            occupied.append(point)
            previous_target = point
            if row.activity == 'farm':
                farm_days.add(next_day)

    for row, point, reason in updates:
        context = dict(row.context)
        if (row.activity == 'farm' and context.get('farm_plan_id')
                and point.date() != at_by_id[row.pk].date()):
            from .farm_queue_schedule import cancel
            cancel(row, reason + '；跨日后重新准备种植队列')
            # Keep each plan's original source for sync; execute_item will prepare
            # a new queue for the chosen farm activity using that day's inventory.
            context.pop('farm_plan_id')
            reason += '；农场队列将在开工前按新日期重新规划'
        if point.date() != today:
            context = {**context, 'planned_on': point.date().isoformat()}
        revise(row, reason, scheduled_at=point, status='deferred', context=context)
    for row, reason in failures:
        revise(row, reason, status='failed', result={'reason': reason})
        if row.context.get('farm_plan_id'):
            from .farm_queue_schedule import cancel
            cancel(row, reason)


def execution_key(item: LifeItem) -> str:
    return item.context.get('execution_key') or item.pk


def _retry_context(item: LifeItem, *, clear_plan: bool) -> dict:
    context = {key: value for key, value in item.context.items() if key != 'planning_retry_at'}
    if clear_plan:
        context.pop('planned_on', None)
        context.pop('cooking_plan', None)
        context.pop('alchemy_plan', None)
        context.pop('daily_choice', None)
        context.pop('travel_plan', None)
        for key in ('lottery_plan', 'lottery_target', 'lottery_numbers', 'lottery_attempts'):
            context.pop(key, None)
        # 重新排队后必须允许规划器再次处理该时段。
        context.pop('execution_started', None)
    elif item.activity == 'cooking' and context.get('cooking_plan'):
        from collections import Counter
        from copy import deepcopy
        from .cooking_models import CookingOperation
        from .cooking_schedule_plan import requirements
        done = Counter(CookingOperation.objects.filter(opportunity_id=execution_key(item)).values_list('recipe_id', flat=True))
        plan = deepcopy(context['cooking_plan'])
        for entry in plan['entries']:
            entry['quantity'] = max(0, entry['quantity'] - done[entry['recipe_id']])
        plan['entries'] = [entry for entry in plan['entries'] if entry['quantity']]
        if not plan['entries']:
            raise ValueError('已确认的美食计划已经全部制作，不能重复执行')
        plan['materials'] = requirements(plan['entries'])
        context['cooking_plan'] = plan
    elif item.activity == 'alchemy' and context.get('alchemy_plan'):
        from collections import Counter
        from copy import deepcopy
        from .alchemy_models import AlchemyOperation
        from .alchemy_schedule_plan import requirements
        done = Counter(AlchemyOperation.objects.filter(opportunity_id=execution_key(item)).values_list('recipe_id', flat=True))
        plan = deepcopy(context['alchemy_plan'])
        for entry in plan['entries']:
            entry['quantity'] = max(0, entry['quantity'] - done[entry['recipe_id']])
        plan['entries'] = [entry for entry in plan['entries'] if entry['quantity']]
        if not plan['entries']:
            raise ValueError('已确认的炼金计划已经全部制作，不能重复执行')
        plan['materials'] = requirements(plan['entries'])
        context['alchemy_plan'] = plan
    # 已规划或已有执行身份必须换键，避免 runner 撞上旧 WorldAction。
    if item.record_id or context.get('execution_key') or item.activity not in ('unplanned', ''):
        context['execution_key'] = stable_id(item.pk, 'retry', timezone.now().isoformat())
    return context


def requeue(item: LifeItem, reason: str) -> None:
    from .life_activities import is_interleaved
    if item.activity == 'blacksmith':
        raise ValueError('打造通过原检查点接续，不能重新规划或重复补跑；可重新发起手动打造')
    if is_interleaved(item):
        raise ValueError('空档穿插由检查点接续，过期机会不能重新规划或补跑')
    """把安排重新变成待规划，供下一次规划消费。"""
    if is_settled_exploration(item):
        raise ValueError('迷宫探索已正常结算，不能作为失败安排重新规划')
    if item.status == 'running':
        raise ValueError('活动正在执行')
    if item.activity == 'market_prepare':
        raise ValueError('每日市场机会不是普通生活次数，不能当作机会重新规划')
    if item.activity == 'travel':
        from .travel_models import TravelJourney
        if TravelJourney.objects.filter(pk__in=[item.pk, execution_key(item)]).exists():
            raise ValueError('旅行请在旅行面板继续或取消')
    if item.status not in (*OPEN, 'failed'):
        raise ValueError('安排已经结束')
    context = _retry_context(item, clear_plan=True)
    if item.context.get('farm_plan_id'):
        from .farm_queue_schedule import cancel
        cancel(item, reason)
        context.pop('farm_plan_id', None)
    revise(item, reason, activity='unplanned', task_id='', intent='', budget=item.spent, status='pending',
           attempts=0, context=context, result={}, record_id='')


def retry_block_reason(item: LifeItem, now=None) -> str:
    """每日市场机会仅在当天、尚未进入市场时允许重试。"""
    if item.activity != 'market_prepare':
        return ''
    now = local_time(now)
    original = local_time(item.original_at)
    if now.date() != original.date():
        return '每日市场机会只能在原定当天重试'
    config = LifeConfig.objects.filter(pk=item.owner_id).first()
    if not config:
        return '生活配置不存在，无法重试每日市场机会'
    settings = {**DEFAULTS, **effective_settings(config, now)}
    _, right = window(settings, original.date())
    if now >= right:
        return '当天市场活动窗口已结束，不能补跑'
    if not any(task.pk == item.task_id and task.enabled and task.task_kind == 'market'
               for task in tasks_for(item.owner_id)):
        return '市场任务已停用或删除，无法重试'
    if item.record_id:
        from .market_models import MarketSession
        if MarketSession.objects.filter(record_id=item.record_id).exists():
            return '本次机会已进入市场并消耗体力，不能再次重试'
    return ''


def retry_failed(item: LifeItem, reason: str) -> None:
    from .life_activities import is_interleaved
    if item.activity == 'blacksmith':
        raise ValueError('打造通过原检查点接续，不能重新规划或重复补跑；可重新发起手动打造')
    if is_interleaved(item):
        raise ValueError('空档穿插由检查点接续，过期机会不能重新规划或补跑')
    """保留已规划活动，换新的执行键再跑一次；规划失败则重新排队。"""
    if item.status != 'failed':
        raise ValueError('只能重试失败的安排')
    if is_settled_exploration(item):
        raise ValueError('迷宫探索已正常结算，不能作为执行失败重试')
    if item.activity == 'market_prepare':
        blocked = retry_block_reason(item)
        if blocked:
            raise ValueError(blocked)
    if item.activity == 'travel':
        from .travel_models import TravelJourney
        if TravelJourney.objects.filter(pk__in=[item.pk, execution_key(item)]).exists():
            raise ValueError('旅行请在旅行面板继续或取消')
    if item.activity in ('unplanned', ''):
        requeue(item, reason)
        return
    revise(item, reason, status='pending', attempts=0, record_id='', result={},
           context=_retry_context(item, clear_plan=False))


def is_settled_exploration(item: LifeItem) -> bool:
    if item.activity != 'exploration' or item.status != 'failed':
        return False
    from .combat.models import Exploration
    from .combat.explorations import execution_completed
    run = Exploration.objects.filter(
        life_item_id=item.pk, record_id=item.record_id, ended_at__isnull=False,
    ).only('status').first()
    return bool(run and execution_completed(run.status))


@guarded
@transaction.atomic
def recover(config, now=None, *, resume_actor=None, delay_reason=None):
    from system_settings.models import Agent
    now = local_time(now)
    settings = {**DEFAULTS, **config.settings}
    rows = list(LifeItem.objects.select_for_update().filter(owner_id=config.pk, status__in=OPEN).exclude(actor_id__in=Agent.objects.filter(archived_at__isnull=False).values('pk')).order_by('scheduled_at', 'id'))
    occupied={}
    from .life_activities import is_interleaved, is_reserved
    for row in rows:
        if row.activity != 'market_prepare' and row.status!='paused' and local_time(row.scheduled_at)>=now:
            occupied.setdefault(row.actor_id,[]).append((row.pk,local_time(row.scheduled_at)))
    last = {}
    for item in rows:
        if is_interleaved(item) or is_reserved(item):
            continue  # These have their own deadlines and must not enter legacy catch-up.
        if item.activity == 'market_prepare':
            if not resume_actor or item.actor_id == resume_actor:
                from .life_market import recover_daily_market
                recover_daily_market(item, config, now)
            continue
        if item.actor_id in config.paused_agents:
            if item.status != 'running' and item.status != 'paused':
                revise(item, '居民暂停，保留安排', status='paused')
            continue
        if resume_actor and item.actor_id != resume_actor:
            continue
        if (not resume_actor and item.status != 'paused' and item.context.get('lottery_target')
                and item.context.get('lottery_attempts', 0)):
            continue  # 彩票有自己的5/15分钟退避；普通遗留顺延不能覆盖已确认的购票意向。
        if item.status == 'running':
            continue  # 执行器根据已提交事实恢复，不能当作未启动活动重排。
        if local_time(item.scheduled_at) >= now-timedelta(seconds=90) and item.status != 'paused':
            last[item.actor_id] = local_time(item.scheduled_at)
            continue
        if item.status=='paused' and local_time(item.scheduled_at)>=now:
            revise(item,'暂停恢复，未来安排保持时间',status='pending')
            last[item.actor_id]=local_time(item.scheduled_at)
            continue
        if item.status == 'paused':
            point = datetime.combine(local_time(now).date()+timedelta(days=1), local_time(item.original_at).timetz())
        else:
            point = local_time(now)+timedelta(minutes=5)
        point = max(point, last.get(item.actor_id, point-timedelta(minutes=settings['min_gap_minutes']))+timedelta(minutes=settings['min_gap_minutes']))
        while True:
            left, right = window(settings, point.date())
            point = max(point, left)
            conflicts=[at for key,at in occupied.get(item.actor_id,[]) if key!=item.pk and abs((point-at).total_seconds())<settings['min_gap_minutes']*60]
            if conflicts:
                point=max(conflicts)+timedelta(minutes=settings['min_gap_minutes'])
                continue
            if point < right:
                break
            point = window(settings, point.date()+timedelta(days=1))[0]
        last[item.actor_id] = point
        occupied.setdefault(item.actor_id,[]).append((item.pk,point))
        revise(item, delay_reason or ('暂停恢复顺延' if item.status == 'paused' else '超过计划时间后由系统顺延，保持原顺序；具体延迟原因未记录'), scheduled_at=point, status='deferred')
