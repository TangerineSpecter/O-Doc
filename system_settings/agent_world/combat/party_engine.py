"""One shared, deterministic round for all participants. Never performs I/O."""
from copy import deepcopy
import math
from . import engine, effects
from .party_rules import speed

REVIVE = 'skill.player.075'


def alive(units):
    return [u for u in units.values() if u['hp'] > 0]


def tag(events, actor, target=None):
    for event in events:
        event['actor_id'] = event.get('actor_id') or actor['id']
        receiver = actor if event.get('kind') in ('potion','defend','passive_recovery') else target
        if receiver and not event.get('target_id'):
            event['target_id'] = receiver['id']
            event['target'] = receiver['name']
    return events


def ordered(units, rng):
    rows = sorted(units, key=lambda u: u['id'])
    rng.shuffle(rows)
    return sorted(rows, key=speed, reverse=True)


def revive_priority(unit):
    job = unit.get('job_id', '')
    return (0 if REVIVE in unit.get('skills', {}) else 1 if job in ('job.priest', 'job.cleric', 'job.highpriest') else
            2 if job in ('job.guardian', 'job.spellblade', 'job.paladin') else 3, -speed(unit), unit['id'])


def cast(catalog, caster, sid, rank, friends, enemies, tick, rng, *, rescue=False):
    row, spell = catalog.skill(sid, rank)
    candidates = [u for u in friends.values() if u['hp'] <= 0 and u['id'] != caster['id'] and not u.get('revived')]
    if sid == REVIVE and not candidates:
        return []
    caster['mp'] -= engine.cost(catalog, caster, sid, rank)
    caster['cooldowns'][sid] = tick + int(row['cooldown_rounds'])
    name = catalog.row('skills', sid)['name']
    result = []
    wounded = sorted(alive(friends), key=lambda u: (u['hp']/u['stats']['hp_max'], u['id']))
    for fx in spell:
        code = fx['code']
        kind = fx['target']
        receivers = (sorted(candidates, key=revive_priority)[:1] if kind == 'fallen_ally' else wounded[:1] if kind == 'ally' else
                     alive(friends) if kind == 'all_allies' else alive(enemies) if kind == 'all_enemies' else [caster])
        for receiver in receivers:
            event = {'actor_id': caster['id'], 'actor': caster['name'], 'target_id': receiver['id'],
                     'target': receiver['name'], 'action': name, 'kind': code}
            amount = float(fx['value'])
            if code == 'revive':
                receiver['hp'] = max(1, math.floor(receiver['stats']['hp_max'] * amount))
                receiver['states'] = []
                receiver['revived'] = True
                receiver['revived_round'] = tick
                event['healing'] = receiver['hp']
            elif code == 'heal':
                restored = min(receiver['stats']['hp_max']-receiver['hp'], math.floor(effects.value(caster, fx['stat']) * amount))
                receiver['hp'] += max(0, restored)
                event['healing'] = max(0, restored)
            elif code == 'taunt':
                receiver['taunt'] = {'actor_id': caster['id'], 'expires': tick + int(fx['duration'])}
            elif code == 'hot':
                effects.status(receiver, {'code': 'hot', 'group': fx['group'], 'stat': fx['stat'], 'value': amount,
                    'raw': effects.value(caster, fx['stat']) * amount, 'remaining': int(fx['duration']),
                    'next_tick': tick+1, 'source_id': caster['id'], 'name': name, 'damage_type': '', 'source_level': caster['level']})
            elif code in ('modifier', 'reflect'):
                previous = next((s for s in receiver['states'] if s['group'] == fx['group']), None)
                if fx['group'] == 'party_reduction' and previous and previous['value'] > amount:
                    continue
                effects.status(receiver, {'code': code, 'group': fx['group'], 'stat': fx['stat'], 'value': amount,
                    'expires': tick+int(fx['duration']), 'name': name, 'source_id': caster['id']})
            else:
                continue
            result.append(event)
    if rescue:
        result.append({'kind': 'rescue', 'actor_id': caster['id'], 'action': name})
    return result


def support(catalog, player, friends, enemies, tick, rng):
    from .bard_combat import silenced
    if silenced(player, tick):
        return []
    choices = []
    for sid, rank in player['skills'].items():
        if catalog.row('skills', sid)['kind'] != 'active' or tick < player['cooldowns'].get(sid, 0) or player['mp'] < engine.cost(catalog, player, sid, rank):
            continue
        _, spell = catalog.skill(sid, rank)
        if sid == REVIVE and any(u['hp'] <= 0 and not u.get('revived') and u['id'] != player['id'] for u in friends.values()):
            choices.append((100, sid, rank))
        elif any(fx['target'] in ('ally', 'all_allies') and fx['code'] in ('heal', 'hot') for fx in spell):
            targets = [u for u in alive(friends) if u['hp'] < u['stats']['hp_max'] and not (
                any(fx['code'] == 'hot' for fx in spell) and any(s['code'] == 'hot' and s['group'] in {f['group'] for f in spell} for s in u['states']))]
            if targets:
                missing = max(1-u['hp']/u['stats']['hp_max'] for u in targets)
                choices.append((80 if missing >= .65 else 60 if missing >= .4 else 20*missing, sid, rank))
        elif any(fx['code'] == 'taunt' for fx in spell) and any(not u.get('taunt') or u['taunt']['expires'] <= tick for u in alive(enemies)):
            choices.append((70, sid, rank))
    if not choices:
        return []
    urgency, sid, rank = max(choices)
    if urgency < 60 and rng.random() > .5:
        return []
    return cast(catalog, player, sid, rank, friends, enemies, tick, rng)


def target_for(enemy, friends, tick, rng):
    targets = alive(friends)
    taunt = enemy.get('taunt', {})
    forced = friends.get(taunt.get('actor_id'))
    if taunt.get('expires', 0) > tick and forced and forced['hp'] > 0:
        return forced
    targets = sorted(targets,key=lambda u:u['id'])
    rng.shuffle(targets)
    return max(targets, key=lambda u: enemy.get('threat', {}).get(u['id'], 0)) if targets else None


def step(catalog, state, rng):
    """Advance a round without mutating the caller's persisted snapshot."""
    return step_in_place(catalog, deepcopy(state), rng)


def step_in_place(catalog, state, rng):
    """Advance an owned state in place; intended for isolated simulations."""
    friends, enemies = state['players'], state['enemies']
    tick = state['round'] = state.get('round', 0) + 1
    result = []
    from .bard_combat import prepare
    prepare({**friends, **enemies}, tick)
    order = ordered(alive(friends)+alive(enemies), rng)
    state['action_order'] = [u['id'] for u in order]
    for unit in order:
        if unit['hp'] <= 0 or unit.get('revived_round') == tick or not alive(friends) or not alive(enemies):
            continue
        unit['defending'] = False
        opponent = next(iter(alive(enemies) if unit['id'] in friends else alive(friends)), None)
        events = []
        statuses = deepcopy(unit['states'])
        effects.upkeep(unit, tick, events, opponent=opponent, catalog=catalog, rng=rng)
        for event in events:
            origin = next((s.get('source_id') for s in statuses if s.get('name')==event.get('action') and s.get('source_id')), None)
            if origin:
                event['actor_id'],event['target_id'] = origin,unit['id']
                source = friends.get(origin) or enemies.get(origin)
                if source:event['actor'] = source['name']
                if event.get('healing'):
                    for foe in alive(enemies):
                        threat=foe.setdefault('threat',{})
                        threat[origin]=threat.get(origin,0)+.5*event['healing']/max(1,len(alive(enemies)))
                if event.get('damage') and unit['id'] in enemies:
                    threat=unit.setdefault('threat',{})
                    threat[origin]=threat.get(origin,0)+event['damage']
        result += tag(events, unit, unit)
        if unit['hp'] <= 0:
            continue
        if unit['id'] in friends:
            result += tag(engine.recover_passives(catalog, unit), unit, unit)
            from ..food_effects import recover
            result += tag(recover(unit, unit.get('food')), unit, unit)
            before = {u['id']: u['hp'] for u in alive(friends)+alive(enemies)}
            foe = next(iter(alive(enemies)), None)
            events = []
            if foe and unit.get('elixirs'):
                from .elixir import use as use_elixir
                events = tag(use_elixir(unit, foe, unit['elixirs'], unit, tick), unit, unit)
            if not events:
                events = support(catalog, unit, friends, enemies, tick, rng)
            if not events and foe:
                # The legacy single-target action picker remains responsible for attacks, potions and self buffs.
                learned = unit['skills']
                unit['skills'] = {sid: rank for sid, rank in learned.items() if not any(
                    fx['target'] in ('ally', 'all_allies', 'fallen_ally', 'all_enemies') for fx in catalog.skill(sid, rank)[1])}
                try:
                    events = tag(engine.player_action(catalog, unit, foe, unit['potions'], tick,
                        catalog.row('styles', unit['style_id']), rng, unit.get('elixirs'), unit, friends=friends, enemies=enemies), unit, foe)
                finally:
                    unit['skills'] = learned
            for target in enemies.values():
                if any(e.get('target_id')==target['id'] and e.get('kind')=='dot' for e in events):
                    for status in target['states']:
                        if status['code']=='dot':status['source_id']=unit['id']
            result += events
            heal = sum(max(0, u['hp']-before.get(u['id'], u['hp'])) for u in alive(friends))
            for enemy in enemies.values():
                threat = enemy.setdefault('threat', {})
                threat[unit['id']] = threat.get(unit['id'], 0) + max(0, before.get(enemy['id'], enemy['hp'])-enemy['hp']) + .5*heal/max(1, len(alive(enemies)))
        else:
            target = target_for(unit, friends, tick, rng)
            if target:
                incoming = tag(engine.enemy_action(catalog, unit, target, unit['template_id'], tick, rng), unit, target)
                for status in target['states']:
                    if status['code']=='dot' and any(e.get('kind')=='dot' for e in incoming):status['source_id']=unit['id']
                for event in incoming:
                    if event.get('actor_id') in friends and event.get('target_id')==unit['id'] and event.get('damage'):
                        threat=unit.setdefault('threat',{})
                        threat[event['actor_id']]=threat.get(event['actor_id'],0)+event['damage']
                result += incoming
    for unit in friends.values():
        unit['defending'] = False
        unit['round_in_encounter'] = unit.get('round_in_encounter',0)+1
    return state, result


def rescue(catalog, state, rng):
    """Exactly one pass; never advances cooldowns or lets a revived healer chain-cast."""
    result = []
    tick = state.get('round', 0)
    rescuers = ordered(alive(state['players']), rng)
    for player in rescuers:
        rank = player['skills'].get(REVIVE)
        if rank and tick >= player['cooldowns'].get(REVIVE, 0) and player['mp'] >= engine.cost(catalog, player, REVIVE, rank):
            result += cast(catalog, player, REVIVE, rank, state['players'], {}, tick, rng, rescue=True)
    return result
