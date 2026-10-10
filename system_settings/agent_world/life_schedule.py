"""确定性周期分配与遗留重排；日程事实不依赖内存 job 存活。"""
import hashlib
import random
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo
from django.db import transaction
from django.utils import timezone
from system_settings.agent_random_schedule import period_bounds
from .life_models import LifeCycle, LifeItem, LifeRevision
from .life_config import DEFAULTS, ensure_profiles
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
    blocked = set(LifeItem.objects.filter(owner_id=config.pk, status__in=OPEN).exclude(activity='market_prepare').values_list('actor_id', flat=True))
    ids = [a for a in settings['agent_ids'] if a not in blocked and a not in config.paused_agents]
    settings['agent_ids'] = ids
    ensure_profiles(config.pk, ids)
    from system_settings.models import Agent
    settings['agent_ids'] = list(Agent.objects.filter(pk__in=ids, model__isnull=False).values_list('pk', flat=True))
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
    for key, value in changes.items():
        setattr(item, key, value)
    item.save()
    LifeRevision.objects.create(item=item, before=before, after=item_state(item), reason=reason)
    if item.context.get('farm_plan_id'):
        from .farm_queue_schedule import changed
        changed(item, reason)


def execution_key(item: LifeItem) -> str:
    return item.context.get('execution_key') or item.pk


def _retry_context(item: LifeItem, *, clear_plan: bool) -> dict:
    context = {key: value for key, value in item.context.items() if key != 'planning_retry_at'}
    if clear_plan:
        context.pop('planned_on', None)
    # 已规划或已有执行身份必须换键，避免 runner 撞上旧 WorldAction。
    if item.record_id or context.get('execution_key') or item.activity not in ('unplanned', ''):
        context['execution_key'] = stable_id(item.pk, 'retry', timezone.now().isoformat())
    return context


def requeue(item: LifeItem, reason: str) -> None:
    """把安排重新变成待规划，供下一次规划消费。"""
    if item.status == 'running':
        raise ValueError('活动正在执行')
    if item.activity == 'market_prepare':
        raise ValueError('每日市场机会不是普通生活次数，不能当作机会重新规划')
    if item.activity == 'travel':
        from .travel_models import TravelJourney
        if TravelJourney.objects.filter(pk=item.pk).exists():
            raise ValueError('旅行请在旅行面板继续或取消')
    if item.status not in (*OPEN, 'failed'):
        raise ValueError('安排已经结束')
    revise(item, reason, activity='unplanned', task_id='', intent='', budget=item.spent, status='pending',
           attempts=0, context=_retry_context(item, clear_plan=True), result={}, record_id='')


def retry_failed(item: LifeItem, reason: str) -> None:
    """保留已规划活动，换新的执行键再跑一次；规划失败则重新排队。"""
    if item.status != 'failed':
        raise ValueError('只能重试失败的安排')
    if item.activity == 'market_prepare':
        raise ValueError('每日市场机会不是普通生活次数，不能重试')
    if item.activity == 'travel':
        from .travel_models import TravelJourney
        if TravelJourney.objects.filter(pk=item.pk).exists():
            raise ValueError('旅行请在旅行面板继续或取消')
    if item.activity in ('unplanned', ''):
        requeue(item, reason)
        return
    revise(item, reason, status='pending', attempts=0, record_id='', result={},
           context=_retry_context(item, clear_plan=False))


@guarded
@transaction.atomic
def recover(config, now=None, *, resume_actor=None, delay_reason=None):
    now = local_time(now)
    settings = {**DEFAULTS, **config.settings}
    rows = list(LifeItem.objects.select_for_update().filter(owner_id=config.pk, status__in=OPEN).order_by('scheduled_at', 'id'))
    occupied={}
    for row in rows:
        if row.activity != 'market_prepare' and row.status!='paused' and local_time(row.scheduled_at)>=now:
            occupied.setdefault(row.actor_id,[]).append((row.pk,local_time(row.scheduled_at)))
    last = {}
    for item in rows:
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
        revise(item, delay_reason or ('暂停恢复顺延' if item.status == 'paused' else '故障或离线后顺延，保持原顺序'), scheduled_at=point, status='deferred')
