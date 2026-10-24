"""Party creation, wave boundaries and membership. Called inside the combat transaction/gate."""
import hashlib
from copy import deepcopy
from datetime import timedelta
from .models import Exploration, CombatProfile, CombatRuntime, CombatEncounter
from .party_models import AdventureParty, AdventureMember, AdventureWave
from .party_rules import CADENCE, MULTIPLIER
from .party_facts import append
from .store import current
from ..life_time import local_time, storage_time


def modern(catalog):
    return any(row['code']=='revive' for row in catalog.tables['skill_effects'])


def rng_for(party, channel):
    import random
    return random.Random(hashlib.sha256(f'{party.pk}:{channel}'.encode()).digest())


def resume_ready(party, now):
    """Only explicitly resumed, locally permitted members may restart a shared clock."""
    from .permissions import local_runtime
    from .facts import append as personal_fact
    runs = list(Exploration.objects.select_for_update().filter(
        pk__in=AdventureMember.objects.filter(party_id=party.pk, active=True).values('exploration_id')).order_by('actor_id'))
    if not runs or any(run.status!='active' or not local_runtime(run) or not local_runtime(run).authorized for run in runs):
        return False
    party.status = 'active'
    party.next_tick_at = storage_time(now+timedelta(seconds=30 if party.state.get('phase')=='searching' else party.state['round_seconds']))
    for run in runs:
        run.state['accounted_at'] = now.isoformat()
        run.phase, run.reason = party.state['phase'], ''
        run.revision += 1
        run.save()
        personal_fact(CombatProfile.objects.get(pk=run.actor_id),f'{run.pk}:shared-resume:{run.revision}',
                      'resume',{'party_id':party.pk},run)
    append(party,'resume_ready',{'members':[r.actor_id for r in runs]})
    return True


def wave(party, now):
    catalog = current(party.catalog_id)
    state = party.state
    players = state['players']
    if not players:
        return
    dungeon = catalog.row('dungeons', party.dungeon_id)
    state['wave'] = state.get('wave', 0)+1
    number = state['wave']
    rng = rng_for(party, f'wave:{number}')
    count = len(players)
    state['wave_members'] = sorted(players)
    state['wave_count'] = count
    state['round_seconds'] = CADENCE[count]
    from .party_rules import spawn_enemies
    enemies = spawn_enemies(catalog, dungeon, players, state, rng, party.pk, number)
    state['enemies'], state['phase'] = enemies, 'battle'
    primary = next(iter(enemies.values()))
    monster = {'id': primary['template_id'], 'name': primary['name'], 'level': primary['level'], 'rank': primary['rank'],
               'monsters': [{'unit_id': u['id'], 'id': u['template_id'], 'name': u['name'], 'level': u['level'], 'rank': u['rank']} for u in enemies.values()]}
    AdventureWave.objects.create(pk=f'{party.pk}:{number}', party_id=party.pk, owner_id=party.owner_id, number=number,
        snapshot={'members': sorted(players), 'count': count, 'multiplier': MULTIPLIER[count], 'round_seconds': CADENCE[count], 'monsters': deepcopy(enemies)})
    for member in AdventureMember.objects.filter(party_id=party.pk, active=True):
        run = Exploration.objects.get(pk=member.exploration_id)
        run.state['encounter'] = run.state.get('encounter',0)+1
        run.state['monster_id'] = primary['template_id']
        run.save()
        CombatEncounter.objects.create(pk=f'{member.exploration_id}:party:{number}', exploration_id=member.exploration_id,
            owner_id=party.owner_id, actor_id=member.actor_id, number=run.state['encounter'], monster=monster, started_at=storage_time(now))
    party.next_tick_at = storage_time(now+timedelta(seconds=CADENCE[count]))
    append(party, 'wave', {'number': number, 'members': sorted(players), 'monsters': monster['monsters']})


def attach(run, now, party=None):
    if party is None:
        identity = 'party:'+hashlib.sha256(run.pk.encode()).hexdigest()[:48]
        party = AdventureParty.objects.create(pk=identity, owner_id=run.owner_id, catalog_id=run.catalog_id,
            dungeon_id=run.snapshot['plan']['dungeon_id'], leader_id=run.actor_id, ends_at=storage_time(now+timedelta(seconds=run.duration_seconds)),
            state={'players': {}, 'enemies': {}, 'round': 0, 'wave': 0, 'nonboss_kills': 0, 'boss_seen': False})
        CombatRuntime.objects.create(pk=identity, owner_id=run.owner_id, authorized=True)
    profile = CombatProfile.objects.get(pk=run.actor_id)
    player = deepcopy(run.state['player'])
    player.update(id=run.actor_id, job_id=profile.progression['job'], style_id=run.snapshot['plan']['style_id'],
        potions=deepcopy(run.state['potions']), elixirs=deepcopy(run.state.get('elixirs', [])), food=run.state.get('food'))
    party.state['players'][run.actor_id] = player
    party.state['roster_revision'] = party.state.get('roster_revision',0)+1
    AdventureMember.objects.create(pk=run.pk, party_id=party.pk, exploration_id=run.pk, owner_id=run.owner_id,
        actor_id=run.actor_id, joined_at=storage_time(now), ends_at=storage_time(min(now+timedelta(seconds=run.duration_seconds), local_time(party.ends_at))))
    run.snapshot['party_id'] = party.pk
    run.state['accounted_at'] = now.isoformat()
    run.state['energy_blocks'] = 1
    run.next_tick_at = None  # the shared session owns scheduling
    run.save()
    append(party, 'join', {'actor_id': run.actor_id, 'exploration_id': run.pk})
    if not party.state.get('wave'):
        wave(party, now)
    from .facts import append as personal_fact
    run.refresh_from_db()
    personal_fact(profile, run.pk+':party-join', 'party_join', {'party_id': party.pk}, run)
    return party


def detach(run, now):
    member = AdventureMember.objects.select_for_update().filter(exploration_id=run.pk, active=True).first()
    if not member:
        return
    party = AdventureParty.objects.select_for_update().get(pk=member.party_id)
    from .party_queries import snapshot
    run.snapshot['party_final'] = snapshot(run)
    member.active, member.left_at = False, storage_time(now)
    member.save()
    party.state['players'].pop(run.actor_id, None)
    party.state['roster_revision'] = party.state.get('roster_revision',0)+1
    remaining = list(AdventureMember.objects.filter(party_id=party.pk, active=True).order_by('joined_at', 'pk'))
    if not remaining:
        party.status, party.next_tick_at = 'completed', None
        for unfinished in AdventureWave.objects.filter(party_id=party.pk, ended_at__isnull=True):
            unfinished.ended_at=storage_time(now)
            unfinished.save()
        CombatRuntime.objects.filter(pk=party.pk).update(authorized=False)
    elif party.leader_id==run.actor_id:
        party.leader_id = remaining[0].actor_id
    append(party, 'leave', {'actor_id': run.actor_id, 'exploration_id': run.pk})
    if remaining and party.status=='paused':
        resume_ready(party, now)
    if not remaining:
        from .explorations import finish
        for pending in Exploration.objects.filter(status='preparing',snapshot__target_party_id=party.pk).order_by('actor_id'):
            finish(pending.pk,'failed','目标冒险已经结束，已停止本次准备',now)


def admit_waiting(party, now):
    from system_settings.models import Agent
    from .party_options import duration_for
    from .explorations import depart, finish
    for pending in Exploration.objects.filter(status='preparing', phase='waiting_party', snapshot__target_party_id=party.pk).order_by('created_at', 'pk'):
        agent = Agent.objects.filter(pk=pending.actor_id).first()
        duration = duration_for(party, party.owner_id, agent, now, excluding=pending.pk) if agent else 0
        if not duration:
            finish(pending.pk, 'failed', '所选队伍已满员、结束或加入条件失效', now)
            continue
        plan = deepcopy(pending.snapshot['prepared_plan'])
        plan['duration_seconds'] = min(plan['duration_seconds'], duration)
        if plan.get('food'):
            plan['food']['quantity'] = (plan['duration_seconds']+1799)//1800
        from django.db import transaction
        try:
            with transaction.atomic():
                depart(pending.pk, plan, now=now, party=party)
        except ValueError as exc:
            finish(pending.pk, 'failed', '加入复核失败：'+str(exc), now)
        party.refresh_from_db()
