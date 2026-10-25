"""Owner-scoped, read-only join admission and durable adventure-mode choices."""
from datetime import timedelta
from django.db import transaction
from .models import Exploration, CombatProfile, CombatRuntime
from .party_models import AdventureParty, AdventureMember
from .party_rules import MIN_JOIN_SECONDS
from .store import current
from . import attributes
from ..life_time import local_time, storage_time
from ..farm_gate import farm_gate


def duration_for(party, owner, agent, now=None, *, excluding=''):
    from .explorations import energy, busy
    from .permissions import local_runtime
    from ..life_models import LifeConfig
    from ..life_commitments import capacity
    now = local_time(now)
    profile = CombatProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
    catalog = current(party.catalog_id)
    if (party.owner_id != owner or party.status != 'active' or agent.archived_at or
            busy(agent.pk, excluding=excluding) or AdventureMember.objects.filter(party_id=party.pk, active=True).count() >= 4):
        return 0
    if not profile or profile.catalog_id != party.catalog_id or attributes.promotion_options(catalog, profile.progression):
        return 0
    if profile.rest_until and local_time(profile.rest_until) > now:
        return 0
    if profile.progression['level'] < int(catalog.row('dungeons', party.dungeon_id)['recommended_level_min']):
        return 0
    members = AdventureMember.objects.filter(party_id=party.pk, active=True)
    if not any(local_runtime(run) and CombatRuntime.objects.filter(pk=run.pk, authorized=True).exists()
               for run in Exploration.objects.filter(pk__in=members.values('exploration_id'))):
        return 0
    run = Exploration.objects.filter(pk=excluding).first() if excluding else None
    item_id = run.life_item_id if run else ''
    remaining = int((local_time(party.ends_at)-now).total_seconds())
    from .reservation_resources import quota_remaining
    quota = quota_remaining(profile, now.date(), exclude_item=Exploration.objects.filter(pk=excluding).values_list('life_item_id', flat=True).first())
    remaining = min(remaining, quota)
    life = LifeConfig.objects.filter(pk=owner).first()
    if life:
        if agent.pk in life.paused_agents:
            return 0
        from ..life_interleaving_candidates import available_window
        remaining = min(remaining, available_window(owner, agent.pk, now, exclude_item=item_id))
    budget = capacity(owner, agent, now, exclude_item=item_id)['energy']
    if remaining < MIN_JOIN_SECONDS or energy(remaining) > budget:
        # A shorter affordable join is legal; full five-minute blocks have their existing price.
        remaining = min(remaining, max(0, int((budget-10)//2))*300)
    return remaining if remaining >= MIN_JOIN_SECONDS else 0


def options(owner, agent, now=None, *, excluding=''):
    result = []
    for party in AdventureParty.objects.filter(owner_id=owner, status='active').order_by('created_at', 'pk'):
        duration = duration_for(party, owner, agent, now, excluding=excluding)
        if not duration:
            continue
        catalog = current(party.catalog_id)
        members = []
        for row in AdventureMember.objects.filter(party_id=party.pk, active=True).order_by('joined_at', 'pk'):
            profile = CombatProfile.objects.get(pk=row.actor_id)
            job = catalog.row('professions', profile.progression['job'])
            members.append({'actor_id': row.actor_id, 'name': profile.actor_name, 'level': profile.progression['level'], 'job_id': job['id'], 'job_name': job['name']})
        result.append({'id': party.pk, 'revision': party.state.get('roster_revision', 0), 'dungeon_id': party.dungeon_id,
            'dungeon_name': catalog.row('dungeons', party.dungeon_id)['name'], 'members': members,
            'duration_seconds': duration, 'ends_at': local_time(party.ends_at).isoformat()})
    return {'solo': True, 'parties': result}


def select_for_preparation(run, agent):
    """One extra bounded model decision, durably saved before any equipment or paid preparation."""
    if run.snapshot.get('adventure_choice'):
        return
    available = options(run.owner_id, agent, excluding=run.pk)['parties']
    requested = run.snapshot.get('target_party_id')
    choices = {**({} if run.snapshot.get('join_only') else {'solo': '自己出发'}), **{row['id']: row for row in available}}
    if not choices:
        raise ValueError('已没有可加入的冒险，本次准备结束')
    if requested:
        if requested not in choices:
            raise ValueError('所选冒险已不能加入')
        selected = requested
    elif run.snapshot.get('adventure_mode') == 'solo' or not available or not run.life_item_id:
        selected = 'solo'
    elif len(choices)==1:
        selected = next(iter(choices))
    else:
        from ..life_interleaving_choices import choose
        selected = choose(run.owner_id, agent, 'combat_preparation',
            {'question': '选择自己出发或加入正在进行的冒险', 'level': CombatProfile.objects.get(pk=agent.pk).progression['level']}, choices)
    with farm_gate(), transaction.atomic():
        locked = Exploration.objects.select_for_update().get(pk=run.pk)
        if locked.status != 'preparing' or not CombatRuntime.objects.filter(pk=run.pk, authorized=True).exists():
            raise ValueError('准备期间探索已取消')
        locked.snapshot['adventure_choice'] = selected
        if selected != 'solo':
            row = choices[selected]
            locked.snapshot['target_party_id'] = selected
            locked.snapshot['constraints'] = {**locked.snapshot['constraints'], 'dungeon_id': row['dungeon_id'], 'duration_seconds': row['duration_seconds']}
        locked.save()
        from .facts import append
        append(CombatProfile.objects.get(pk=run.actor_id), run.pk+':adventure-choice', 'adventure_choice',
               {'choice': selected, 'constraints': locked.snapshot['constraints']}, locked)
    run.refresh_from_db()
