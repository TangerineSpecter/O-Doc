"""Damage and status execution; all randomness comes from the supplied source."""
import math
from fractions import Fraction
from .catalog import Catalog


def clamp(value, low=0, high=1):
    return max(low, min(high, value))


def value(fighter: dict, stat: str) -> float:
    base = fighter['stats'].get(stat, 0)
    modifiers = [s for s in fighter['states'] if s['code'] == 'modifier' and
                 (s['stat'] == stat or (s['stat'] == 'attack' and stat in ('physical_attack', 'magic_attack')) or
                  (s['stat'] == 'defense' and stat in ('physical_defense', 'magic_defense')))]
    total = sum(s['value'] for s in modifiers)
    if stat in ('accuracy', 'evasion', 'reduction', 'damage_taken'):
        return base + total
    return base * (1 + clamp(total, -.9, 2))


def reduction(fighter: dict) -> float:
    extra = sum(float(e['value']) for e in fighter['passives'] if e['code'] == 'passive_low_hp') if fighter['hp'] < fighter['stats']['hp_max'] * .3 else 0
    return clamp(value(fighter, 'reduction') + (.35 if fighter.get('defending') else 0) + extra, 0, .6)


def hit(attacker: dict, target: dict, rng, bonus=0) -> bool:
    delta = target['level'] - attacker['level']
    probability = clamp(value(attacker, 'accuracy') - value(target, 'evasion') + bonus - .02 * max(0, delta) + .005 * max(0, -delta), .2, .98)
    return rng.random() < probability


def damage(raw, kind: str, attacker_level: int, target: dict, *, penetration=0, variation=1, critical=1, extra=1) -> int:
    if raw <= 0:
        return 0
    # Fraction avoids an exact 100 becoming 99 through floating point truncation.
    defense = Fraction(str(max(0, value(target, kind + '_defense')))) * (1 - Fraction(str(clamp(penetration, 0, .6))))
    scale = Fraction(60 + 6 * attacker_level)
    factor = max(Fraction(1, 4), scale / (scale + defense))
    result = Fraction(str(raw)) * factor * (1 - Fraction(str(reduction(target)))) * Fraction(str(variation)) * Fraction(str(critical)) * Fraction(str(extra))
    return max(1, math.floor(result))


def hurt(target: dict, amount: int) -> tuple[int, int]:
    shield = next((s for s in target['states'] if s['code'] == 'shield'), None)
    absorbed = min(amount, shield['remaining']) if shield else 0
    if shield:
        shield['remaining'] -= absorbed
        if shield['remaining'] <= 0:
            target['states'].remove(shield)
    taken = min(target['hp'], amount - absorbed)
    target['hp'] -= taken
    return taken, absorbed


def status(target: dict, effect: dict) -> None:
    same = next((s for s in target['states'] if s['group'] == effect['group']), None)
    if same is None:
        target['states'].append(effect)
        return
    if effect['code'] == 'shield':
        same['remaining'] = max(same['remaining'], effect['remaining'])
        same['expires'] = max(same['expires'], effect['expires'])
    elif effect['code'] in ('dot', 'hot'):
        remaining = max(same['remaining'], effect['remaining'])
        if effect['raw'] > same['raw']:
            same.update(effect)
        same['remaining'] = remaining
    else:
        expires = max(same['expires'], effect['expires'])
        if abs(effect['value']) > abs(same['value']):
            same.update(effect)
        same['expires'] = expires


def expire(fighter: dict, tick: int) -> None:
    fighter['states'] = [s for s in fighter['states'] if s['code'] in ('dot', 'hot') or s['expires'] > tick]


def upkeep(fighter: dict, tick: int, events: list[dict]) -> None:
    expire(fighter, tick)
    for code in ('dot', 'hot'):
        for state in list(fighter['states']):
            if state['code'] != code or state['next_tick'] > tick:
                continue
            if code == 'dot':
                amount = damage(state['raw'], state['damage_type'], state['source_level'], fighter)
                taken, absorbed = hurt(fighter, amount)
                events.append({'actor': fighter['name'], 'action': state['name'], 'damage': taken, 'absorbed': absorbed, 'kind': 'dot'})
            else:
                restored = min(fighter['stats']['hp_max'] - fighter['hp'], math.floor(state['raw']))
                fighter['hp'] += restored
                events.append({'actor': fighter['name'], 'action': state['name'], 'healing': restored, 'kind': 'hot'})
            state['remaining'] -= 1
            state['next_tick'] = tick + 1
            if not state['remaining']:
                fighter['states'].remove(state)
            if fighter['hp'] <= 0:
                return


def apply(catalog: Catalog, attacker: dict, target: dict, effects: list[dict], name: str, tick: int, rng) -> list[dict]:
    events = []
    parameter = lambda code: sum(float(f['value']) for f in effects if f['code'] == code)
    direct = [f for f in effects if f['code'] == 'damage']
    shared = bool(parameter('shared_hit'))
    critical_bonus = parameter('attack_critical')
    accuracy_bonus = parameter('attack_accuracy')
    penetration = parameter('attack_penetration')
    successful, shared_hit, shared_critical = False, None, None
    passive_bonus = sum(float(f['value']) for f in attacker['passives'] if f['code'] == 'passive_damage' and f['stat'] == 'elite_boss' and target.get('rank') in ('elite', 'boss'))
    for effect in direct:
        for _ in range(int(effect['hits'])):
            landed = shared_hit if shared and shared_hit is not None else hit(attacker, target, rng, accuracy_bonus)
            critical = shared_critical if shared and shared_critical is not None else rng.random() < clamp(value(attacker, 'critical') + critical_bonus, 0, .6)
            if shared:
                shared_hit, shared_critical = landed, critical
            successful |= landed
            raw = value(attacker, effect['stat']) * float(effect['value'])
            extra = (1 + parameter('missing_hp_damage') * (1 - attacker['hp'] / attacker['stats']['hp_max'])) * (1 + clamp(passive_bonus, 0, 2)) * (1 + clamp(value(target, 'damage_taken'), 0, 1))
            amount = damage(raw, effect['damage_type'], attacker['level'], target, penetration=penetration,
                            variation=rng.uniform(.95, 1.05), critical=value(attacker, 'critical_damage') if critical else 1, extra=extra) if landed else 0
            taken, absorbed = hurt(target, amount)
            events.append({'actor': attacker['name'], 'target': target['name'], 'action': name, 'kind': 'damage',
                           'damage': taken, 'absorbed': absorbed, 'hit': landed, 'critical': landed and critical})
    enemy_status = [f for f in effects if f.get('target') == 'enemy' and f['code'] in ('modifier', 'dot')]
    if not direct and enemy_status:
        successful = hit(attacker, target, rng, accuracy_bonus)
    for fx in effects:
        code = fx['code']
        if code not in ('heal', 'shield', 'hot', 'dot', 'modifier'):
            continue
        receiver = attacker if fx['target'] == 'self' else target
        if (receiver is target and (not successful or target['hp'] <= 0)) or rng.random() >= float(fx['chance']):
            continue
        raw = value(attacker, fx['stat']) * float(fx['value'])
        duration = int(fx['duration'])
        if code == 'heal':
            restored = min(receiver['stats']['hp_max'] - receiver['hp'], max(0, math.floor(raw)))
            receiver['hp'] += restored
            events.append({'actor': attacker['name'], 'action': name, 'kind': 'heal', 'healing': restored})
            continue
        state = {'code': code, 'group': fx['group'], 'stat': fx['stat'], 'value': float(fx['value']), 'name': name}
        if code == 'modifier':
            if receiver is target and fx['stat'] in ('attack', 'defense', 'physical_defense', 'magic_defense'):
                duration += max((int(f['value']) for f in attacker['passives'] if f['code'] == 'passive_duration'), default=0)
            state['expires'] = tick + duration
        elif code == 'shield':
            state.update(remaining=max(0, math.floor(raw)), expires=tick + duration)
        else:
            bonus = passive_bonus + sum(float(f['value']) for f in attacker['passives'] if f['code'] == 'passive_damage' and f['stat'] == fx['group'])
            state.update(raw=raw * (1 + clamp(bonus, 0, 2)), remaining=duration, next_tick=tick + (1 if receiver is attacker else 0), source_level=attacker['level'], damage_type=fx['damage_type'])
        status(receiver, state)
        events.append({'actor': attacker['name'], 'target': receiver['name'], 'action': name, 'kind': code, 'duration': duration, 'group': fx['group']})
    return events
