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
    blocked = set(LifeItem.objects.filter(owner_id=config.pk, status__in=OPEN).values_list('actor_id', flat=True))
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


@guarded
@transaction.atomic
def recover(config, now=None, *, resume_actor=None):
    now = local_time(now)
    settings = {**DEFAULTS, **config.settings}
    rows = list(LifeItem.objects.select_for_update().filter(owner_id=config.pk, status__in=OPEN).order_by('scheduled_at', 'id'))
    occupied={}
    for row in rows:
        if row.status!='paused' and local_time(row.scheduled_at)>=now:
            occupied.setdefault(row.actor_id,[]).append((row.pk,local_time(row.scheduled_at)))
    last = {}
    for item in rows:
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
        revise(item, '暂停恢复顺延' if item.status == 'paused' else '故障或离线后顺延，保持原顺序', scheduled_at=point, status='deferred')
