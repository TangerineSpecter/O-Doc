"""Daily, news-led group discussions with durable turn-by-turn transcripts."""
import logging
import random
import time
from contextlib import ExitStack
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from system_settings.models import Agent, AgentExecutionLease, WorldActionRuntime
from .execution import execution_lease
from .farm_gate import farm_gate, guarded
from .life_config import effective_settings
from .life_models import LifeConfig, LifeItem, LifeProfile
from .life_schedule import stable_id, window
from .life_time import local_time, storage_time
from .social_config import settings_for
from .social_models import SocialConfig, SocialTheatreEvent
from .social_relations import apply_event
from .social_theatre import NEWS_DAYS, news_query, normalize_news
from .social_theatre_prompt import participant_profile

logger = logging.getLogger(__name__)
SCENE = '居民新闻小剧场'
BUSY_RETRY_MINUTES = 10
MIN_SCENE_GAP_MINUTES = 10
# Automatic scenes use slots 0–2. Manual scenes are stored beyond that range.
MANUAL_SLOT_START = 3
# Version 4 permits a fresh manual batch after the old news-only MCP check failed.
NEWS_SNAPSHOT_VERSION = 4


def _is_manual_event(event):
    return bool((event.snapshot or {}).get('manual'))


def _manual_news_index(slot_index, snapshot, news_count, auto_count=None):
    if news_count <= 0:
        return None
    if auto_count is None:
        auto_count = (snapshot or {}).get('theatre_daily_count', 0)
    auto_count = max(0, min(3, int(auto_count or 0)))
    manual_offset = max(0, slot_index - MANUAL_SLOT_START)
    return (auto_count + manual_offset) % news_count


def _candidate_news_error(candidate_count):
    if candidate_count <= 0:
        return '新闻搜索没有返回候选新闻'
    return f'新闻搜索返回{candidate_count}条候选，但没有筛出可直接打开的单篇新闻报道'


def _cached_news_error(snapshot):
    candidate_count = (snapshot or {}).get('news_candidate_count')
    if candidate_count is None:
        return '已缓存的新闻候选中没有可直接打开的单篇新闻报道'
    return _candidate_news_error(candidate_count)


def _news_anchor(events):
    if not events:
        return None
    current = [event for event in events
               if (event.snapshot or {}).get('version') == NEWS_SNAPSHOT_VERSION]
    events = current or events
    manual_retry_anchor = next((event for event in events if _is_manual_event(event)
                                and (event.snapshot or {}).get('manual_news_retry')), None)
    if manual_retry_anchor:
        return manual_retry_anchor
    automatic_anchor = next((event for event in events
                             if not _is_manual_event(event) and event.slot_index == 0), None)
    if automatic_anchor and automatic_anchor.search_state in ('ready', 'failed', 'searching'):
        return automatic_anchor
    if automatic_anchor and automatic_anchor.search_state == 'pending' and automatic_anchor.status in ('scheduled', 'searching'):
        return automatic_anchor
    return next((event for event in events if _is_manual_event(event)
                 and (event.search_state in ('ready', 'failed', 'searching')
                      or (event.search_state == 'pending'
                          and event.status in ('scheduled', 'searching', 'running')))), automatic_anchor)


def configured_residents(config, life):
    selected = config.settings.get('agent_ids', [])
    profiles = LifeProfile.objects.filter(owner_id=config.pk, pk__in=selected)
    ids = [row.pk for row in profiles if settings_for(config, row.pk)['enabled']]
    return list(Agent.objects.filter(pk__in=ids, archived_at__isnull=True, model__type='chat')
                .select_related('model').order_by('pk'))


def _schedule_times(owner, day, count, start, end, now):
    origin = max(start, now + timedelta(minutes=1)) if start <= now < end else start
    span_seconds = int((end - origin).total_seconds())
    if span_seconds <= 0:
        return []
    # Spread the random times while keeping at least ten minutes between starts.
    gap_seconds = MIN_SCENE_GAP_MINUTES * 60
    capacity = 1 + (span_seconds - 1) // gap_seconds
    count = min(count, capacity)
    if count <= 0:
        return []
    rng = random.Random(int(stable_id(owner, day.isoformat(), 'social-theatre-times'), 16))
    slack = span_seconds - gap_seconds * (count - 1)
    offsets = sorted(rng.sample(range(slack), count))
    return [origin + timedelta(seconds=offset + index * gap_seconds)
            for index, offset in enumerate(offsets)]


def ensure_daily_events(config, life, now=None):
    now = local_time(now)
    cfg = settings_for(config)
    count = cfg['theatre_daily_count']
    day = now.date()
    existing = list(SocialTheatreEvent.objects.filter(owner_id=config.pk, business_date=day).order_by('slot_index'))
    has_automatic_events = any(not _is_manual_event(event) for event in existing)
    if has_automatic_events or not cfg['enabled'] or count <= 0:
        return existing
    residents = configured_residents(config, life)
    if len(residents) <= 2:
        return existing
    life_settings = effective_settings(life, now)
    start, end = window(life_settings, day)
    times = _schedule_times(config.pk, day, count, start, end, now)
    snapshots = {'participant_ids': [agent.pk for agent in residents],
                 'search_server_id': cfg.get('theatre_search_server_id', ''),
                 'theatre_daily_count': count,
                 'active_start': life_settings['active_start'], 'active_end': life_settings['active_end'],
                 'version': NEWS_SNAPSHOT_VERSION}
    with farm_gate(), transaction.atomic():
        for index, point in enumerate(times):
            SocialTheatreEvent.objects.get_or_create(
                pk=stable_id(config.pk, day.isoformat(), 'theatre', index),
                defaults={'owner_id': config.pk, 'business_date': day, 'slot_index': index,
                          'scheduled_at': point, 'snapshot': snapshots})
    return list(SocialTheatreEvent.objects.filter(owner_id=config.pk, business_date=day).order_by('slot_index'))


def queue_manual_event(config, now=None):
    """Queue one standalone scene without consuming an automatic daily slot."""
    now = local_time(now)
    cfg = settings_for(config)
    if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
        raise ValueError('请先开启世界运行')
    if not cfg['enabled']:
        raise ValueError('请先开启自动社交')
    if not cfg.get('theatre_search_server_id'):
        raise ValueError('请先配置 Tavily 新闻搜索服务')

    life = LifeConfig.objects.filter(pk=config.pk, migrated=True).first()
    if not life:
        raise ValueError('请先完成生活日程设置')
    life_settings = effective_settings(life, now)
    left, right = window(life_settings, now.date())
    if not left <= now < right:
        raise ValueError('请在生活设置的活跃时间内手动触发')

    residents = configured_residents(config, life)
    residents = [agent for agent in residents if agent.pk not in life.paused_agents]
    if len(residents) <= 2:
        raise ValueError('至少需要3位已启用社交且配置了聊天模型的居民')

    ensure_daily_events(config, life, now)
    with farm_gate(), transaction.atomic():
        SocialConfig.objects.select_for_update().get(pk=config.pk)
        events = list(SocialTheatreEvent.objects.select_for_update().filter(
            owner_id=config.pk, business_date=now.date()).order_by('slot_index'))
        active = next((event for event in events if _is_manual_event(event)
                       and event.status in ('scheduled', 'searching', 'running')), None)
        if active:
            return active
        manual_slots = [event.slot_index for event in events if _is_manual_event(event)]
        slot_index = max([MANUAL_SLOT_START - 1, *manual_slots]) + 1
        if slot_index > 32767:
            raise ValueError('今天的手动场次过多，请明天再试')
        snapshot = {'participant_ids': [agent.pk for agent in residents],
                    'search_server_id': cfg['theatre_search_server_id'],
                    'theatre_daily_count': cfg['theatre_daily_count'],
                    'active_start': life_settings['active_start'], 'active_end': life_settings['active_end'],
                    'manual': True, 'version': NEWS_SNAPSHOT_VERSION}
        anchor = _news_anchor(events)
        source = {}
        search_state = 'pending'
        if (anchor and anchor.search_state in ('ready', 'failed')
                and (anchor.snapshot or {}).get('version') != NEWS_SNAPSHOT_VERSION):
            # Refresh once after upgrading, including failed searches that
            # exhausted their manual retry under the old MCP topic restriction.
            snapshot['manual_news_retry'] = True
        elif anchor and anchor.search_state == 'ready':
            # A cached batch may have been produced before the current article
            # filters were applied. Revalidate it before reusing it manually.
            news = normalize_news(anchor.search_batch or [], limit=3)
            if news:
                news_index = _manual_news_index(slot_index, snapshot, len(news))
                if news_index is not None:
                    source = news[news_index]
                search_state = 'ready'
            elif (anchor.snapshot or {}).get('manual_news_retry'):
                raise ValueError(_cached_news_error(anchor.snapshot) + '；今天已重搜过一次，请明天再试')
            else:
                # A manual trigger can repair one unusable daily cache without
                # turning every button click into another paid search request.
                snapshot['manual_news_retry'] = True
        elif anchor and anchor.search_state == 'failed':
            if (anchor.snapshot or {}).get('manual_news_retry'):
                raise ValueError(f"今天的手动新闻重搜也失败了：{anchor.error or '请检查新闻搜索服务'}")
            snapshot['manual_news_retry'] = True
            search_state = 'pending'
        event = SocialTheatreEvent.objects.create(
            pk=stable_id(config.pk, now.date().isoformat(), 'theatre-manual', slot_index),
            owner_id=config.pk, business_date=now.date(), slot_index=slot_index,
            scheduled_at=storage_time(now), status='scheduled', snapshot=snapshot,
            source=source, search_state=search_state)
        return event


def _window_for(event, now):
    life = LifeConfig.objects.filter(pk=event.owner_id, migrated=True).first()
    if not life:
        return None
    return window(effective_settings(life, now), event.business_date)


@guarded
def _set_skipped(event_id, reason, *, status='skipped'):
    SocialTheatreEvent.objects.filter(pk=event_id, status__in=('scheduled', 'searching')).update(
        status=status, error=str(reason)[:1000], updated_at=timezone.now())


@guarded
def _skip_day_after_search_failure(events, reason):
    for event in events:
        if (event.snapshot or {}).get('resume') and (event.snapshot or {}).get('topic'):
            continue
        _set_skipped(event.pk, reason)


def _ensure_news(events, now, anchor=None):
    if not events:
        return False
    anchor = anchor or _news_anchor(events)
    first = SocialTheatreEvent.objects.filter(pk=anchor.pk).first() if anchor else None
    if not first or first.search_state in ('ready', 'failed'):
        return first is not None and first.search_state == 'ready'
    if first.search_state == 'searching':
        return False
    claimed = False
    with farm_gate(), transaction.atomic():
        first = SocialTheatreEvent.objects.select_for_update().get(pk=first.pk)
        if first.search_state == 'pending' and first.status == 'scheduled':
            first.search_state = 'searching'
            first.status = 'searching'
            first.save(update_fields=['search_state', 'status', 'updated_at'])
            claimed = True
    if not claimed:
        return False
    server_id = first.snapshot.get('search_server_id', '')
    try:
        if not server_id:
            raise ValueError('尚未配置 Tavily 新闻搜索服务')
        from .publish_search import search
        max_news = 3
        # Fetch enough candidates to survive directory/roundup filtering, while
        # retaining at most three usable single-article sources.
        rows = search({'search_server_id': server_id}, news_query(first.business_date), 'news', NEWS_DAYS,
                      time.monotonic() + 90, search_depth='advanced', max_results=10,
                      time_range='day', require_news_filters=True, preserve_content=True)
        news = normalize_news(rows, limit=max_news)
        logger.info('小剧场新闻筛选 owner=%s date=%s candidates=%s accepted=%s',
                    first.owner_id, first.business_date, len(rows), len(news))
    except Exception as exc:
        logger.warning('小剧场新闻搜索失败 owner=%s date=%s error=%s', first.owner_id, first.business_date, exc)
        reason = f'新闻搜索失败：{str(exc)[:700]}'
        with farm_gate(), transaction.atomic():
            first = SocialTheatreEvent.objects.select_for_update().get(pk=first.pk)
            first.search_state = 'failed'
            first.status = 'skipped'
            first.error = reason
            first.snapshot = {**(first.snapshot or {}), 'version': NEWS_SNAPSHOT_VERSION}
            first.save(update_fields=['search_state', 'status', 'error', 'snapshot', 'updated_at'])
            for event in events:
                if (event.pk != first.pk and not (
                        (event.snapshot or {}).get('resume') and (event.snapshot or {}).get('topic'))):
                    _set_skipped(event.pk, reason)
        return False
    with farm_gate(), transaction.atomic():
        first = SocialTheatreEvent.objects.select_for_update().get(pk=first.pk)
        for event in events:
            row = SocialTheatreEvent.objects.select_for_update().get(pk=event.pk)
            # A manual retry refreshes the news batch, but must not revive
            # terminal automatic scenes or deleted history rows.
            if row.status not in ('scheduled', 'searching'):
                continue
            if row.pk != first.pk and (row.snapshot or {}).get('resume') and (row.snapshot or {}).get('topic'):
                continue
            if row.pk == first.pk:
                row.search_state = 'ready'
                row.search_batch = news
                row.snapshot = {**(row.snapshot or {}), 'news_candidate_count': len(rows),
                                'version': NEWS_SNAPSHOT_VERSION}
            index = (_manual_news_index(
                row.slot_index, row.snapshot, len(news))
                     if _is_manual_event(row) else row.slot_index)
            if index is not None and index < len(news):
                row.source = news[index]
                row.status = 'scheduled'
                row.error = ''
            else:
                row.status = 'skipped'
                row.error = (_candidate_news_error(len(rows)) if not news else '当天可讨论新闻不足')
            update_fields = ['source', 'status', 'error', 'updated_at']
            if row.pk == first.pk:
                update_fields.extend(['search_state', 'search_batch', 'snapshot'])
            row.save(update_fields=update_fields)
    return bool(news)


@guarded
def _attach_cached_news(events, anchor=None):
    if not events:
        return
    anchor = anchor or _news_anchor(events)
    if not anchor:
        return
    if anchor.search_state not in ('ready', 'failed'):
        return
    news = normalize_news(anchor.search_batch or [], limit=3)
    for event in events:
        if event.status not in ('scheduled', 'searching'):
            continue
        if (event.snapshot or {}).get('resume') and (event.snapshot or {}).get('topic'):
            continue
        if anchor.search_state == 'failed':
            _set_skipped(event.pk, anchor.error or '当天新闻搜索失败')
            continue
        index = (_manual_news_index(event.slot_index, event.snapshot, len(news))
                 if _is_manual_event(event) else event.slot_index)
        if index is not None and index < len(news):
            SocialTheatreEvent.objects.filter(pk=event.pk, status__in=('scheduled', 'searching')).update(
                source=news[index], status='scheduled', error='', updated_at=timezone.now())
        else:
            reason = (_cached_news_error(anchor.snapshot) if not news else '当天可讨论新闻不足')
            _set_skipped(event.pk, reason)


def _available_residents(config, event, now):
    life = LifeConfig.objects.filter(pk=event.owner_id, migrated=True).first()
    if not life:
        return [], 0
    residents = configured_residents(config, life)
    snapshot_ids = set(event.snapshot.get('participant_ids', []))
    residents = [agent for agent in residents if agent.pk in snapshot_ids and agent.pk not in life.paused_agents]
    pool_size = len(residents)
    from .travel_candidates import travelling_ids
    travelling = set(travelling_ids())
    running = set(LifeItem.objects.filter(owner_id=event.owner_id, actor_id__in=[a.pk for a in residents],
                                          status='running').values_list('actor_id', flat=True))
    leased = set(AgentExecutionLease.objects.filter(agent_id__in=[a.pk for a in residents],
                  until__gt=timezone.now()).values_list('agent_id', flat=True))
    return [agent for agent in residents if agent.pk not in travelling | running | leased], pool_size


@guarded
def _defer_or_skip(event, now, reason):
    bounds = _window_for(event, now)
    retry = now + timedelta(minutes=BUSY_RETRY_MINUTES)
    if bounds and retry < bounds[1] and event.business_date == now.date():
        SocialTheatreEvent.objects.filter(pk=event.pk, status='scheduled').update(
            scheduled_at=storage_time(retry), error=reason[:1000], updated_at=timezone.now())
    else:
        _set_skipped(event.pk, reason)


def _turn_check(owner, actor_tokens, day, now):
    if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
        raise ValueError('世界运行已关闭')
    config = SocialConfig.objects.filter(pk=owner).first()
    if not config or not settings_for(config)['enabled']:
        raise ValueError('自动社交已关闭')
    life = LifeConfig.objects.filter(pk=owner, migrated=True).first()
    if not life:
        raise ValueError('生活配置已停用')
    left, right = window(effective_settings(life, now), day)
    current = local_time()
    if current.date() != day or not left <= current < right:
        raise ValueError('已离开今日活动时间')
    for actor, token in actor_tokens.items():
        if (actor not in config.settings.get('agent_ids', []) or actor in life.paused_agents
                or not settings_for(config, actor)['enabled']
                or Agent.objects.filter(pk=actor, archived_at__isnull=False).exists()):
            raise ValueError('参与居民已暂停或退出社交')
        if not AgentExecutionLease.objects.filter(agent_id=actor, token=token, until__gt=timezone.now()).exists():
            raise ValueError('居民执行锁已失效')


def _complete_turn(agent, prompt, validate, *, owner, check):
    from system_settings.decision.routing import complete_json

    return complete_json(
        agent, prompt, validate, decision=False, owner=owner, scene=SCENE,
        check=check, model_only=True, repair_invalid=False, attempt_seconds=180)


def _persist_turn(event_id, turn):
    with farm_gate(), transaction.atomic():
        event = SocialTheatreEvent.objects.select_for_update().get(pk=event_id)
        if event.status != 'running':
            raise ValueError('小剧场状态已变化')
        event.transcript = [*event.transcript, turn]
        event.save(update_fields=['transcript', 'updated_at'])


@guarded
def _settle_relations(event):
    seen = set()
    profiles = {str(row['id']): row for row in event.participants}
    if 'relation_reviews' in (event.snapshot or {}):
        for review in event.snapshot['relation_reviews']:
            actor = review['actor_id']
            if actor not in profiles:
                continue
            for appraisal in review['appraisals']:
                target = appraisal['target_actor_id']
                direction = (actor, target)
                if target not in profiles or target == actor or direction in seen:
                    continue
                seen.add(direction)
                peer = profiles[target]
                apply_event(event.owner_id, actor, f'agent-id:{target}', f'theatre:{event.pk}', appraisal,
                            {'name': peer.get('name', ''), 'avatar': peer.get('avatar', ''), 'agent_id': target})
        return
    # Retain historical compatibility; new scenes settle received impressions above.
    for row in event.transcript:
        target = row.get('target_actor_id')
        appraisal = row.get('appraisal') or {}
        category = appraisal.get('category')
        direction = (row.get('speaker_id'), target)
        if not target or target not in profiles or direction in seen or category in ('', 'neutral', None):
            continue
        seen.add(direction)
        peer = profiles[target]
        apply_event(event.owner_id, row['speaker_id'], f'agent-id:{target}', f'theatre:{event.pk}', appraisal,
                    {'name': peer.get('name', ''), 'avatar': peer.get('avatar', ''), 'agent_id': target})


def _scene_sources(event):
    events = list(SocialTheatreEvent.objects.filter(
        owner_id=event.owner_id, business_date=event.business_date).order_by('slot_index'))
    anchor = _news_anchor(events)
    rows = [event.source, *((anchor.search_batch or []) if anchor else [])]
    used = {other.source.get('url') for other in events if other.pk != event.pk
            and other.status in ('completed', 'running')}
    sources = normalize_news(rows, limit=3)
    return [source for source in sources if _is_manual_event(event) or source['url'] not in used]


def run_event(config, event, available, now):
    requested = random.choice((2, 3)) if len(available) >= 3 else 2
    if (event.snapshot or {}).get('resume') and event.participants:
        wanted = {str(person['id']) for person in event.participants}
        residents = [agent for agent in available if str(agent.pk) in wanted]
        if len(residents) != len(wanted):
            _defer_or_skip(event, now, '原参与居民正在忙碌，稍后继续')
            return
        profiles = event.participants
        rounds = event.rounds
    else:
        residents = random.sample(available, requested)
        profiles = [participant_profile(agent, include_expression=True) | {'avatar': agent.avatar} for agent in residents]
        rounds = random.choice((2, 3))
    with ExitStack() as stack:
        tokens = {}
        for agent in sorted(residents, key=lambda item: item.pk):
            token = stack.enter_context(execution_lease(AgentExecutionLease, {'agent': agent}))
            if not token:
                _defer_or_skip(event, now, '居民正在忙碌，稍后重试')
                return
            tokens[agent.pk] = token
        with farm_gate(), transaction.atomic():
            locked = SocialTheatreEvent.objects.select_for_update().get(pk=event.pk)
            if locked.status != 'scheduled':
                return
            locked.status = 'running'
            locked.participants = profiles
            locked.rounds = rounds
            locked.error = ''
            locked.save(update_fields=['status', 'participants', 'rounds', 'error', 'updated_at'])
        try:
            from .social_theatre_scene import execute_scene
            check = lambda: _turn_check(config.pk, tokens, event.business_date, now)
            if not execute_scene(event, residents, profiles, rounds, _scene_sources(event),
                                 owner=config.pk, check=check, speak=_complete_turn, persist=_persist_turn):
                return
            check()
            with farm_gate(), transaction.atomic():
                locked = SocialTheatreEvent.objects.select_for_update().get(pk=event.pk)
                _settle_relations(locked)
                locked.status = 'completed'
                locked.error = ''
                locked.snapshot = {**locked.snapshot, 'stage': 'completed'}
                locked.save(update_fields=['status', 'error', 'snapshot', 'updated_at'])
        except Exception as exc:
            logger.exception('小剧场执行失败 id=%s', event.pk)
            with farm_gate():
                SocialTheatreEvent.objects.filter(pk=event.pk, status='running').update(
                    status='failed', error=str(exc)[:1000], updated_at=timezone.now())


def tick_theatres(config, now=None, *, manual_only=False):
    # 人工和自动入口共用场次执行位，避免两个后台同时搜索或执行。
    if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
        return
    with execution_lease(WorldActionRuntime, {'pk': 'social-th:' + stable_id(config.pk)[:30]}) as token:
        if token:
            _tick_theatres(config, now, manual_only=manual_only)


def _tick_theatres(config, now=None, *, manual_only=False):
    now = local_time(now)
    cfg = settings_for(config)
    if not cfg['enabled']:
        with farm_gate():
            SocialTheatreEvent.objects.filter(owner_id=config.pk, business_date=now.date(),
                status__in=('scheduled', 'searching')).update(
                    status='skipped', error='小剧场已在设置中关闭', updated_at=timezone.now())
        return
    life = LifeConfig.objects.filter(pk=config.pk, migrated=True).first()
    if not life:
        return
    with farm_gate():
        SocialTheatreEvent.objects.filter(owner_id=config.pk, business_date__lt=now.date(),
            status__in=('scheduled', 'searching', 'running')).update(
                status='expired', error='过去日期不补做', updated_at=timezone.now())
        stale = SocialTheatreEvent.objects.filter(owner_id=config.pk, business_date=now.date(),
            status__in=('searching', 'running'), updated_at__lt=timezone.now() - timedelta(minutes=30))
        stale.update(status='failed', search_state='failed', error='执行中断，保留已保存的发言', updated_at=timezone.now())
    events = ensure_daily_events(config, life, now)
    if not events:
        return
    for event in events:
        if (not _is_manual_event(event) and not (event.snapshot or {}).get('resume')
                and event.slot_index >= cfg['theatre_daily_count']
                and event.status in ('scheduled', 'searching')):
            _set_skipped(event.pk, '每日场数设置已调整')
    left, right = window(effective_settings(life, now), now.date())
    if now < left:
        return
    if now >= right:
        for event in events:
            if event.status == 'scheduled':
                _set_skipped(event.pk, '已离开今日活动时间')
        return
    due = [event for event in events if event.status in ('scheduled', 'searching')
           and local_time(event.scheduled_at) <= now
           and (not manual_only or _is_manual_event(event) or (event.snapshot or {}).get('resume'))]
    if not due:
        return
    anchor = _news_anchor(events)
    needs_news = any(not ((event.snapshot or {}).get('resume') and (event.snapshot or {}).get('topic'))
                     for event in due)
    if needs_news and anchor and anchor.search_state == 'pending':
        _ensure_news(events, now, anchor)
        events = list(SocialTheatreEvent.objects.filter(owner_id=config.pk, business_date=now.date()).order_by('slot_index'))
        anchor = _news_anchor(events)
    elif needs_news and anchor and anchor.search_state == 'searching' and anchor.updated_at < timezone.now() - timedelta(minutes=5):
        with farm_gate():
            _skip_day_after_search_failure(events, '新闻搜索中断，本日不重复搜索')
            SocialTheatreEvent.objects.filter(pk=anchor.pk).update(search_state='failed', status='failed')
        return
    _attach_cached_news(events, anchor)
    events = list(SocialTheatreEvent.objects.filter(
        owner_id=config.pk, business_date=now.date()).order_by('slot_index'))
    for event in events:
        if (not _is_manual_event(event) and not (event.snapshot or {}).get('resume')
                and event.slot_index >= cfg['theatre_daily_count']
                and event.status in ('scheduled', 'searching')):
            _set_skipped(event.pk, '每日场数设置已调整')
    for event in events:
        if manual_only and not _is_manual_event(event) and not (event.snapshot or {}).get('resume'):
            continue
        if event.status != 'scheduled' or local_time(event.scheduled_at) > now:
            continue
        if not event.source.get('title'):
            _set_skipped(event.pk, '当天没有可用新闻')
            continue
        available, pool_size = _available_residents(config, event, now)
        if pool_size <= 2:
            _set_skipped(event.pk, '参与小剧场的居民不足三位')
            continue
        if len(available) < 2:
            _defer_or_skip(event, now, '参与居民正在忙碌，稍后重试')
            continue
        run_event(config, event, available, now)
        # One full scene per scheduler tick keeps other world jobs responsive.
        return
