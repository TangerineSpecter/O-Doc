"""Transactional shared scheduling; personal receipts retain existing inventory/growth provenance."""
from copy import deepcopy
from datetime import datetime, timedelta
from django.db import transaction
from .party_models import AdventureParty, AdventureMember, AdventureWave
from .models import Exploration, CombatProfile, CombatRuntime, CombatEncounter, CombatConfig
from .party_sessions import rng_for, wave, admit_waiting
from .party_facts import append as shared_fact
from .facts import append
from .store import current
from .party_engine import step, rescue, alive
from . import attributes, rewards
from ..life_time import local_time, storage_time
from ..farm_gate import guarded


def copy_player(run, player):
    run.state['player'] = deepcopy(player)
    run.state['potions'] = deepcopy(player['potions'])
    run.state['elixirs'] = deepcopy(player.get('elixirs', []))
    run.state['elixir_cooldown'] = player.get('elixir_cooldown', 0)
    run.state['elixir_used_encounter'] = player.get('elixir_used_encounter',-1)
    run.state['round_in_encounter'] = player.get('round_in_encounter',0)


@transaction.atomic
def account(run, party, now):
    if run.status!='active' or party.status!='active':
        return []
    from .explorations import consume, day_parts
    last = local_time(datetime.fromisoformat(run.state['accounted_at']))
    seconds = max(0, int((now-last).total_seconds()))
    profile = CombatProfile.objects.select_for_update().get(pk=run.actor_id)
    config = CombatConfig.objects.get(pk=run.owner_id)
    credits = day_parts(last, seconds)
    if any(profile.loot_progress.get('days', {}).get(day, 0)+amount > config.daily_minutes*60 for day, amount in credits.items()):
        raise ValueError('今日探索额度耗尽')
    elapsed = min(run.duration_seconds, run.elapsed_seconds+seconds)
    charged = run.state.get('energy_blocks', 1)
    required = max(1, (elapsed+299)//300)
    charges = [consume(run, profile, 2, block, now) for block in range(charged, required)]
    run.state['energy_blocks'] = required
    for day, amount in credits.items():
        if party.state.get('wave_count', 1)==1:
            bonus = run.snapshot['profession_bonuses']
            rewards.accrue(profile.loot_progress, amount, day,
                loot_interval_seconds=int(current(run.catalog_id).rules['loot_interval_seconds']),
                equipment_interval_seconds=int(current(run.catalog_id).rules['equipment_interval_seconds']),
                equipment_interval_reduction_percentage=bonus.get('maze_equipment_interval_reduction_percentage', 0))
        else:
            days = profile.loot_progress.setdefault('days', {})
            days[day] = days.get(day, 0)+amount
    profile.save()
    run.elapsed_seconds = elapsed
    # Keep fractional seconds for the next receipt instead of dropping them each round.
    run.state['accounted_at'] = (last+timedelta(seconds=seconds)).isoformat()
    return charges


def award(party, runs, enemy, catalog):
    from .party_rewards import experience, loot, grant
    from .food import combat_stats
    from .profiles import wearing
    count = party.state['wave_count']
    rng = rng_for(party, 'reward:'+enemy['id'])
    earned = {r.actor_id: [] for r in runs}
    rolls = []
    for actor, reward, scores in loot(catalog, enemy, runs, count, rng):
        run = next(r for r in runs if r.actor_id==actor)
        key = f'{party.pk}:loot:{party.state["wave"]}:{enemy["id"].rsplit(":",1)[-1]}:{len(rolls)}'
        receipt = grant(run, reward, key)
        earned[actor].append(receipt)
        rolls.append({'reward_id': key, 'winner_id': actor, 'rounds': scores, 'reward': receipt})
    personal = {}
    for run in runs:
        profile = CombatProfile.objects.select_for_update().get(pk=run.actor_id)
        amount = experience(catalog, enemy['level'], profile.progression['level'], enemy['rank'], count,
                            run.snapshot['profession_bonuses'].get('maze_experience_bonus_percentage', 0))
        player = party.state['players'][run.actor_id]
        old = combat_stats(profile, catalog, run.snapshot)
        profile.progression, growth = attributes.award(catalog, profile.progression, amount, stop_at_promotion=True)
        derived = combat_stats(profile, catalog, run.snapshot)
        player['hp'] = max(1, int(player['hp']/old['hp_max']*derived['hp_max'])) if player['hp']>0 else 0
        player['mp'] = int(player['mp']/max(1,old['mp_max'])*derived['mp_max'])
        player.update(stats=derived, level=profile.progression['level'], skills=profile.progression['skills'],
                      passives=attributes.passives(catalog, profile.progression['skills'], wearing(profile)))
        profile.hp, profile.mp = player['hp'], player['mp']
        profile.save()
        run.result['experience'] += amount
        run.result['kills'] += 1
        run.result['growth'] += growth
        monster = {'id': enemy['template_id'], 'unit_id': enemy['id'], 'name': enemy['name'], 'level': enemy['level'], 'rank': enemy['rank']}
        personal[run.actor_id] = {'kind': 'kill', 'monster': monster, 'experience': amount, 'rewards': earned[run.actor_id]}
    return personal, rolls


def pause(party, runs, now, reason):
    party.status, party.next_tick_at = 'paused', None
    for run in runs:
        run.status, run.phase, run.reason, run.next_tick_at = 'paused', 'interrupted', reason, None
        run.revision += 1
        run.save()
        append(CombatProfile.objects.get(pk=run.actor_id), f'{run.pk}:party-pause:{run.revision}', 'pause', {'reason': reason}, run)
    shared_fact(party, 'pause', {'reason': reason})


@guarded
@transaction.atomic
def tick(identity, revision=None, now=None):
    from .explorations import finish
    from .permissions import local_runtime
    party = AdventureParty.objects.select_for_update().get(pk=identity)
    now = local_time(now)
    if party.status!='active' or (revision is not None and revision!=party.revision):
        return
    if party.next_tick_at and (now-local_time(party.next_tick_at)).total_seconds()>30:
        members = list(AdventureMember.objects.filter(party_id=party.pk, active=True).order_by('actor_id'))
        runs = list(Exploration.objects.select_for_update().filter(
            pk__in=[member.exploration_id for member in members]).order_by('actor_id'))
        # Pause before deadline settlement so the missing interval cannot be billed.
        pause(party, runs, now, '推进延迟超过30秒，暂停期间不补打离线回合')
        for member in members:
            if now>=local_time(member.ends_at):
                finish(member.exploration_id, 'completed', '已到本次冒险返回时间；中断期间不计探索成果', now)
        return
    # Also called every second to release hard deadlines, even between scheduled actions.
    for member in AdventureMember.objects.filter(party_id=party.pk, active=True).order_by('actor_id'):
        run = Exploration.objects.get(pk=member.exploration_id)
        expired = now>=local_time(member.ends_at)
        from system_settings.models import Agent
        unavailable=not Agent.objects.filter(pk=run.actor_id,archived_at__isnull=True).exists()
        if run.life_item_id:
            from ..life_scope import check_item_authorization
            from ..life_models import LifeItem
            try:
                check_item_authorization(LifeItem.objects.get(pk=run.life_item_id))
            except (ValueError,LifeItem.DoesNotExist):
                unavailable=True
        if unavailable:
            finish(run.pk,'recalled','居民已暂停、归档或活动授权停止',now)
            party.refresh_from_db()
            continue
        if expired or not local_runtime(run) or not CombatRuntime.objects.filter(pk=run.pk, authorized=True).exists():
            if expired:
                player = party.state['players'].get(run.actor_id)
                if player:
                    copy_player(run, player)
                    try:
                        charges = account(run, party, local_time(member.ends_at))
                    except ValueError:
                        charges = []
                    run.save()
                    append(CombatProfile.objects.get(pk=run.actor_id), f'{run.pk}:last-time:{run.elapsed_seconds}', 'round', {'events': [], 'consumption': charges}, run)
                finish(run.pk, 'completed', '已到本次冒险返回时间', now)
            elif local_runtime(run):
                finish(run.pk, 'recalled', '本机执行授权已撤销', now)
            else:
                pause(party, list(Exploration.objects.filter(pk__in=AdventureMember.objects.filter(party_id=party.pk, active=True).values('exploration_id'))), now, '其他设备恢复的组队冒险没有本机执行授权')
                return
            party.refresh_from_db()
    if party.status!='active' or not party.next_tick_at or now<local_time(party.next_tick_at):
        return
    runs = list(Exploration.objects.select_for_update().filter(pk__in=AdventureMember.objects.filter(party_id=party.pk, active=True).values('exploration_id')).order_by('actor_id'))
    if not runs:
        return
    if any(run.status!='active' for run in runs):
        party.status,party.next_tick_at='paused',None
        shared_fact(party,'pause',{'reason':'仍有成员未恢复，暂停共享行动与计费'})
        return
    catalog = current(party.catalog_id)
    charges, personal = {}, {r.actor_id: [] for r in runs}
    for run in list(runs):
        try:
            charges[run.actor_id] = account(run, party, now)
            run.save()
        except ValueError as exc:
            finish(run.pk, 'exhausted', str(exc), now)
            runs.remove(run)
            party.refresh_from_db()
    if not runs or party.status!='active':
        return
    if party.state.get('phase')=='searching':
        for run in list(runs):
            profile = CombatProfile.objects.get(pk=run.actor_id)
            leaving = run.state.get('leave_after_wave')
            if leaving or attributes.promotion_options(catalog, profile.progression):
                append(profile,f'{run.pk}:boundary-time:{party.head}','round',
                       {'events':[],'consumption':charges.get(run.actor_id,[])},run)
                finish(run.pk,'recalled' if leaving else 'completed',
                       '本波结束，已离队' if leaving else '达到转职等级，返回处理转职',now)
        party.refresh_from_db()
        admit_waiting(party, now)
        party.refresh_from_db()
        runs = list(Exploration.objects.filter(pk__in=AdventureMember.objects.filter(party_id=party.pk, active=True).values('exploration_id')).order_by('actor_id'))
        if not runs:
            return
        # The elapsed-time receipts must survive membership changes at the boundary.
        for run in runs:
            run.state['accounted_at'] = now.isoformat()
        wave(party, now)
        for run in runs:
            run.refresh_from_db()
        events = [{'kind': 'encounter', 'name': '下一波遭遇'}]
        personal = {run.actor_id: [] for run in runs}
    else:
        before = deepcopy(party.state['players'])
        party.state, events = step(catalog, party.state, rng_for(party, f'round:{party.state["round"]+1}'))
        for run in runs:
            player = party.state['players'][run.actor_id]
            for sid, count in before[run.actor_id]['potions'].items():
                used = count-player['potions'].get(sid, 0)
                if used:
                    run.result['potions_used'][sid] = run.result['potions_used'].get(sid, 0)+used
            for entry in before[run.actor_id].get('elixirs', []):
                after = next(e for e in player.get('elixirs', []) if e['recipe_id']==entry['recipe_id'] and e['stars']==entry['stars'])
                used = entry['remaining']-after['remaining']
                if used:
                    key = f'{entry["recipe_id"]}:{entry["stars"]}'
                    run.result['elixirs_used'][key] = run.result['elixirs_used'].get(key, 0)+used
        rolls = []
        for enemy in party.state['enemies'].values():
            if enemy['hp']<=0 and not enemy['settled']:
                details, items = award(party, runs, enemy, catalog)
                for actor, receipt in details.items():
                    personal[actor].append(receipt)
                rolls += items
                current_wave = AdventureWave.objects.get(pk=f'{party.pk}:{party.state["wave"]}')
                current_wave.result.setdefault('kills',[]).append({'monster_id':enemy['id'],'personal':details,'rolls':items})
                current_wave.save()
                enemy['settled'] = True
                if enemy['rank']!='boss':
                    party.state['nonboss_kills'] = party.state.get('nonboss_kills', 0)+1
        if rolls:
            events.append({'kind': 'loot_roll', 'rolls': rolls})
        if not alive(party.state['enemies']) and alive(party.state['players']):
            events += rescue(catalog, party.state, rng_for(party, f'rescue:{party.state["wave"]}'))
            party.state['phase'] = 'searching'
            current_wave = AdventureWave.objects.get(pk=f'{party.pk}:{party.state["wave"]}')
            current_wave.result.update(enemies=deepcopy(party.state['enemies']))
            current_wave.ended_at = storage_time(now)
            current_wave.save()
            for encounter in CombatEncounter.objects.filter(exploration_id__in=[r.pk for r in runs], ended_at__isnull=True):
                encounter.result, encounter.ended_at = {'killed': True, 'party_id': party.pk}, storage_time(now)
                encounter.save()
    party.next_tick_at = storage_time(now+timedelta(seconds=30 if party.state['phase']=='searching' else party.state['round_seconds']))
    shared = shared_fact(party, 'round', {'round': party.state['round'], 'wave': party.state['wave'], 'events': events,
        'personal': personal, 'action_order': party.state.get('action_order', [])})
    for run in runs:
        player = party.state['players'].get(run.actor_id)
        if not player:
            continue
        copy_player(run, player)
        run.phase = party.state['phase']
        run.revision += 1
        run.save()
        profile = CombatProfile.objects.get(pk=run.actor_id)
        profile.hp, profile.mp = player['hp'], player['mp']
        profile.save(update_fields=['hp', 'mp'])
        append(profile, f'{run.pk}:shared:{shared.sequence}', 'round', {'shared_event_id': shared.pk,
            'events': personal.get(run.actor_id, []), 'consumption': charges.get(run.actor_id, []),
            'potions': {sid: before[run.actor_id]['potions'][sid]-player['potions'].get(sid, 0) for sid in before[run.actor_id]['potions']} if 'before' in locals() else {}}, run)
    dead = not alive(party.state['players'])
    for run in runs:
        if run.state['player']['hp']<=0 and (dead or party.state['phase']=='searching'):
            finish(run.pk, 'fallen', '全队倒地' if dead else '清场救援后仍倒地，返回休整', now)
        elif party.state['phase']=='searching' and (run.state.get('leave_after_wave') or attributes.promotion_options(catalog,CombatProfile.objects.get(pk=run.actor_id).progression)):
            finish(run.pk,'recalled' if run.state.get('leave_after_wave') else 'completed',
                   '本波结束，已离队' if run.state.get('leave_after_wave') else '达到转职等级，返回处理转职',now)
