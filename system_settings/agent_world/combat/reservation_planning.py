"""Daily intent checkpoints and owner/day coordination, outside main activity counts."""
from datetime import timedelta, datetime
from itertools import groupby
from django.db import transaction
from .reservation_models import AdventurePlanningDay, AdventureReservation
from .reservation_matching import match, DURATIONS
from ..life_time import local_time, storage_time
from ..farm_gate import farm_gate, guarded


def offers(owner, agent):
    from ..life_config import task_for
    from .models import CombatProfile
    from .store import current
    from .catalog import bundled
    from . import attributes
    if not task_for(owner, agent, 'exploration'):
        return []
    profile = CombatProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
    catalog = current(profile.catalog_id) if profile else bundled()[0]
    level = profile.progression['level'] if profile else 1
    if profile and attributes.promotion_options(catalog, profile.progression):
        return []
    return [{'id': row['id'], 'name': row['name']} for row in catalog.tables['dungeons']
            if row.get('enabled') == '1' and int(row['recommended_level_min']) <= level]


def validate_intent(value, offered):
    if not isinstance(value, dict) or type(value.get('participate')) is not bool:
        raise ValueError('组队探索意向须明确是否参加')
    if not isinstance(value.get('reason'), str) or not 0 < len(value['reason'].strip()) <= 2000:
        raise ValueError('组队探索意向缺少理由')
    if value['participate']:
        if value.get('dungeon_id') not in {row['id'] for row in offered} or type(value.get('duration_seconds')) is not int or value['duration_seconds'] not in DURATIONS:
            raise ValueError('组队探索地点或时长不属于合法候选')
    return {k: value[k] for k in ('participate', 'reason', 'dungeon_id', 'duration_seconds') if k in value}


def day_for(config, day):
    from ..life_schedule import stable_id
    from ..life_config import effective_settings
    return AdventurePlanningDay.objects.get_or_create(pk=stable_id('exploration-day', config.pk, str(day)), defaults={
        'owner_id': config.pk, 'day': day, 'snapshot': {'version': 1, 'participants': sorted(effective_settings(config).get('agent_ids', [])), 'intents': {}}})[0]


def save_intent(config, agent, day, value, offered):
    from .models import CombatProfile
    intent = validate_intent(value, offered)
    with farm_gate(), transaction.atomic():
        row = AdventurePlanningDay.objects.select_for_update().get(pk=day_for(config, day).pk)
        existing = row.snapshot.get('intents', {}).get(agent.pk)
        if existing:
            return
        profile = CombatProfile.objects.filter(pk=agent.pk).first()
        row.snapshot.setdefault('intents', {})[agent.pk] = {**intent, 'actor_id': agent.pk, 'name': agent.name,
            'job_id': profile.progression['job'] if profile else 'job.novice'}
        row.save()


def intent_context(config, agent, day):
    row = day_for(config, day)
    return None if agent.pk in row.snapshot.get('intents', {}) else {
        'dungeons': offers(config.pk, agent), 'durations_seconds': list(DURATIONS),
        'instructions': '独立于主日程次数，只决定今天是否参加组队探索、地点和期望时长，不指定时间；系统稍后配队。'}


def planning_complete(row, config):
    from ..life_models import LifeItem
    from ..life_activities import main_items
    from system_settings.models import Agent
    active = set(Agent.objects.filter(pk__in=row.snapshot['participants'], archived_at__isnull=True).exclude(pk__in=config.paused_agents).values_list('pk', flat=True))
    for actor in active:
        items = list(main_items(LifeItem.objects.filter(owner_id=row.owner_id, actor_id=actor,
            scheduled_at__gte=storage_time(local_time(datetime.combine(row.day, datetime.min.time()))),
            scheduled_at__lt=storage_time(local_time(datetime.combine(row.day+timedelta(days=1), datetime.min.time()))))))
        if any(item.status in ('pending', 'deferred') and (item.activity == 'unplanned' or item.context.get('planned_on') != str(row.day)) for item in items):
            return False
    return True


def coordinated(config, now=None):
    """Called after each one-resident planning pass, before free-activity selection."""
    now = local_time(now)
    for day in AdventurePlanningDay.objects.filter(owner_id=config.pk, status='planning', day__gte=now.date()):
        if planning_complete(day, config):
            if supplement_intent(day, config):
                continue
            finalize(day.pk, config, now)
    return not AdventurePlanningDay.objects.filter(owner_id=config.pk, day=now.date(), status='planning').exists()


def free_intervals(owner, actor, day, config, now):
    from ..life_models import LifeItem
    from ..life_activities import main_items
    from ..life_schedule import OPEN, window
    from ..life_config import effective_settings
    from .reservation_resources import appointments
    from system_settings.models import AgentExecutionLease
    left, right = window(effective_settings(config), day)
    left = max(left, now)
    blocks = []
    # Open plans without a reliable domain duration are conservatively occupied until
    # their next scheduled main slot (or the day's end), never presumed instantaneous.
    items = list(main_items(LifeItem.objects.filter(owner_id=owner, actor_id=actor, status__in=OPEN)).order_by('scheduled_at'))
    for i, item in enumerate(items):
        if item.activity == 'rest':
            continue
        at = local_time(item.scheduled_at)
        next_at = local_time(items[i+1].scheduled_at) if i+1 < len(items) else right
        end = None
        plan = item.context.get('travel_plan', {})
        if plan.get('ends_at'):
            end = local_time(datetime.fromisoformat(plan['ends_at']))
        if item.result.get('ends_at'):
            end = local_time(datetime.fromisoformat(item.result['ends_at']))
        blocks.append((at, max(at, end or next_at)))
    for row, _ in appointments(owner, actor):
        blocks.append((local_time(row.prepare_at), local_time(row.ends_at)))
    lease = AgentExecutionLease.objects.filter(agent_id=actor, until__gt=storage_time(now)).first()
    if lease:
        blocks.append((now, local_time(lease.until)))
    from .models import Exploration
    for run in Exploration.objects.filter(actor_id=actor, ended_at__isnull=True):
        from .recovery import deadline
        blocks.append((now, deadline(run) or right))
    from ..travel_models import TravelJourney
    # Active travel and fishing must have a real end, otherwise protect the full day.
    from ..fishing.models import FishingTrip
    for model in (TravelJourney, FishingTrip):
        for trip in model.objects.filter(actor_id=actor, status__in=('active', 'waiting', 'paused')):
            end = getattr(trip, 'deadline', None)
            blocks.append((now, local_time(end) if end else right))
    cursor = left
    result = []
    for start, end in sorted(blocks):
        if end <= cursor or start >= right:
            continue
        if start > cursor:
            result.append((cursor, min(start, right)))
        cursor = max(cursor, end)
    if cursor < right:
        result.append((cursor, right))
    return result


@guarded
@transaction.atomic
def finalize(identity, config, now):
    from .reservation_resources import quota_remaining
    from .models import CombatProfile
    from .explorations import energy
    from ..life_commitments import commitments
    from ..life_energy import Commitment, forecast
    from ..execution import stamina
    from ..stamina_settings import history
    from ..life_schedule import stable_id
    from ..life_models import LifeItem
    from ..life_config import task_for
    from system_settings.models import Agent
    from decimal import Decimal
    day = AdventurePlanningDay.objects.select_for_update().get(pk=identity)
    if day.status != 'planning':
        return
    committed = {actor for row in AdventureReservation.objects.filter(planning_day=day).exclude(status='cancelled') for actor in row.snapshot.get('members', {})}
    intents = [v for k, v in day.snapshot.get('intents', {}).items() if v['participate'] and k not in config.paused_agents and k not in committed]
    agents = Agent.objects.in_bulk([v['actor_id'] for v in intents])
    windows = {v['actor_id']: free_intervals(day.owner_id, v['actor_id'], day.day, config, now) for v in intents}
    def feasible(group, duration):
        common = [(now, now.replace(hour=0, minute=0, second=0, microsecond=0)+timedelta(days=2))]
        for member in group:
            actor = member['actor_id']
            agent = agents.get(actor)
            profile = CombatProfile.objects.filter(pk=actor, owner_id=day.owner_id).first()
            if not agent or agent.archived_at or not task_for(day.owner_id, agent, 'exploration') or group[0]['dungeon_id'] not in {entry['id'] for entry in offers(day.owner_id, agent)}:
                return None
            if profile and (quota_remaining(profile, day.day) < duration or (profile.rest_until and local_time(profile.rest_until) > now)):
                return None
            common = [(max(a,c), min(b,d)) for a,b in common for c,d in windows[actor] if max(a,c) < min(b,d)]
        for start, end in sorted(common):
            depart = start+timedelta(seconds=600)
            while depart+timedelta(seconds=duration) <= end:
                safe = True
                for member in group:
                    actor = member['actor_id']
                    rows = commitments(day.owner_id, actor, now)
                    rows.append(Commitment('reservation:proposal', depart, Decimal(energy(duration)), 'exploration'))
                    if not forecast(stamina(agents[actor], storage_time(now)), now, rows, history())['safe']:
                        safe = False
                        break
                if safe:
                    return depart
                depart += timedelta(minutes=1)
        return None
    matched = []
    for _, members in groupby(sorted(intents, key=lambda v: v['dungeon_id']), key=lambda v: v['dungeon_id']):
        matched.extend(match(list(members), feasible))
    assigned = set()
    for group in matched:
        members = sorted(group['members'], key=lambda v: v['actor_id'])
        start = group['starts_at']
        duration = group['duration_seconds']
        key = stable_id(day.pk, day.updated_at.isoformat(), ','.join(m['actor_id'] for m in members))
        row = AdventureReservation.objects.create(pk=key, owner_id=day.owner_id, planning_day=day,
            dungeon_id=members[0]['dungeon_id'], prepare_at=storage_time(start-timedelta(seconds=600)),
            starts_at=storage_time(start), ends_at=storage_time(start+timedelta(seconds=duration)), snapshot={'version': 1, 'origin': key, 'members': {}})
        for member in members:
            actor = member['actor_id']; assigned.add(actor)
            item_id = stable_id(key, actor)
            run_id = stable_id(key, actor, 'exploration')
            row.snapshot['members'][actor] = {**member, 'item_id': item_id, 'run_id': run_id, 'status': 'reserved'}
            LifeItem.objects.create(pk=item_id, owner_id=day.owner_id, actor_id=actor, activity='exploration',
                task_id=task_for(day.owner_id, agents[actor], 'exploration').pk,
                original_at=row.prepare_at, scheduled_at=row.prepare_at, intent='组队探索预约',
                context={'adventure_reservation_id': key, 'reservation_revision': row.revision, 'planned_on': str(day.day)})
        row.save()
        from .models import CombatRuntime
        CombatRuntime.objects.create(pk=row.pk, owner_id=row.owner_id, authorized=True, requests={'origin': row.snapshot['origin']})
    day.status = 'coordinated'
    from collections import Counter
    counts = Counter(m['dungeon_id'] for m in intents)
    day.snapshot['unmatched'] = {m['actor_id']: ('同地点只有一人，未成队，不生成预约' if counts[m['dungeon_id']] < 2 else '未找到共同空档与资源均满足的队伍，不生成预约') for m in intents if m['actor_id'] not in assigned}
    day.save()


def supplement_intent(day, config):
    from ..life_models import LifeItem
    from ..life_planner import ask
    from system_settings.models import Agent
    from ..life_activities import main_items
    for actor in day.snapshot['participants']:
        if actor in day.snapshot.get('intents', {}) or actor in config.paused_agents:
            continue
        agent = Agent.objects.filter(pk=actor, archived_at__isnull=True).first()
        if not agent:
            continue
        items = main_items(LifeItem.objects.filter(owner_id=config.pk, actor_id=actor, scheduled_at__date=day.day))
        if items.exists() and not items.exclude(status='failed').exists():
            continue
        offered = offers(config.pk, agent)
        errors = day.snapshot.get('intent_errors', {}).get(actor, {})
        if errors.get('retry_at') and local_time(datetime.fromisoformat(errors['retry_at'])) > local_time():
            return True
        if offered:
            try:
                from system_settings.agent_availability import agent_operation, AgentBusyError
                with agent_operation(agent):
                    value = ask(agent, '仅补充今天组队探索意向，不修改既有日程。返回 {"exploration_intent":{"participate":true或false,"dungeon_id":"合法地点ID","duration_seconds":1800或3600或7200,"reason":"理由"}}。',
                                {'exploration_offer': {'dungeons': offered, 'durations_seconds': list(DURATIONS)}}, include_profile=False, include_memory=False)
                value = validate_intent(value.get('exploration_intent'), offered)
            except AgentBusyError:
                return True
            except Exception:
                import logging
                logging.getLogger(__name__).exception('组队探索意向补问失败 actor=%s day=%s', actor, day.day)
                day.refresh_from_db()
                errors = day.snapshot.setdefault('intent_errors', {}).setdefault(actor, {'attempts': 0})
                errors['attempts'] += 1
                errors['retry_at'] = (local_time()+timedelta(minutes=5)).isoformat()
                errors['reason'] = '组队探索意向补问失败'
                day.save()
                if errors['attempts'] < 3:
                    return True
                value = {'participate':False, 'reason':'组队探索意向连续三次失败，本日不预约'}
        else:
            value = {'participate': False, 'reason': '没有可用探索地点或能力'}
        save_intent(config, agent, day.day, value, offered)
        return True
    return False
