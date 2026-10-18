"""Damage and status execution; all randomness comes from the supplied source."""
import math
from fractions import Fraction
from .catalog import Catalog


SUMMON_VARIANTS = (
    {'name': '契约水滴史莱姆', 'probability': .6, 'hits': 2, 'damage_multiplier': 1.0,
     'debuff': {'stat': 'accuracy', 'value': -.08, 'duration': 1, 'group': 'contract_weak_accuracy'}},
    {'name': '暗影雷霆石像鬼', 'probability': .3, 'hits': 3, 'damage_multiplier': 1.2,
     'debuff': {'stat': 'attack', 'value': -.10, 'duration': 1, 'group': 'contract_medium_attack'}},
    {'name': '深渊熔岩巨像', 'probability': .1, 'hits': 4, 'damage_multiplier': 1.6,
     'debuff': {'stat': 'defense', 'value': -.12, 'duration': 2, 'group': 'contract_strong_defense'},
     'burn_value': .25, 'burn_duration': 2},
)
LEGACY_SUMMON_VARIANTS = tuple(
    {'name': row['name'], 'probability': 1 / 3, 'hits': row['hits'], 'damage_multiplier': 1.0}
    for row in (
        {'name': '契约水滴史莱姆', 'hits': 2},
        {'name': '暗影雷霆石像鬼', 'hits': 3},
        {'name': '深渊熔岩巨像', 'hits': 4},
    )
)
LEGACY_SUMMON_CATALOG = 'combat-1.0.1'
HOLY_AEGIS_SKILL_ID = 'skill.player.033'
HOLY_AEGIS_SHIELD_GROUP = 'holy_aegis'


def clamp(value, low=0, high=1):
    return max(low, min(high, value))


ELEMENTS = ('water', 'fire', 'earth', 'wind', 'light', 'dark')


def attack_element(effect: dict, attacker: dict) -> str:
    """Skill element wins. An empty cell inherits the weapon or monster element; none stays untyped."""
    written = str(effect.get('element') or '')
    if written == 'none':
        return ''
    if written:
        return written
    return str((attacker.get('stats') or {}).get('element') or '')


def element_multiplier(attacker: dict, target: dict, element: str, rules: dict | None = None, *, skip: bool = False) -> float:
    """Scale already-resolved channel damage. Untyped hits and poison ticks stay at 1."""
    if skip or not element:
        return 1
    rules = rules or {}
    power = float((attacker.get('stats') or {}).get(element + '_power', 0) or 0)
    resist = float((target.get('stats') or {}).get(element + '_resist', 0) or 0)
    low = float(rules.get('element_factor_min', .6))
    high = float(rules.get('element_factor_max', 1.5))
    # Ratios live on a 0.0001 grid. Rounding keeps the later Fraction from seeing binary dust.
    return round(clamp(1 + power - resist, low, high), 4)


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


def damage(raw, kind: str, attacker_level: int, target: dict, *, penetration=0, variation=1, critical=1, extra=1, element_factor=1) -> int:
    if raw <= 0:
        return 0
    # Fraction avoids an exact 100 becoming 99 through floating point truncation.
    defense = Fraction(str(max(0, value(target, kind + '_defense')))) * (1 - Fraction(str(clamp(penetration, 0, .6))))
    scale = Fraction(60 + 6 * attacker_level)
    factor = max(Fraction(1, 4), scale / (scale + defense))
    result = Fraction(str(raw)) * factor * (1 - Fraction(str(reduction(target)))) * Fraction(str(variation)) * Fraction(str(critical)) * Fraction(str(extra)) * Fraction(str(element_factor))
    return max(1, math.floor(result))


def hurt(target: dict, amount: int) -> tuple[int, int, dict | None]:
    shield = next((s for s in target['states'] if s['code'] == 'shield'), None)
    absorbed = min(amount, shield['remaining']) if shield else 0
    broken = None
    if shield:
        shield['remaining'] -= absorbed
        if shield['remaining'] <= 0:
            if shield['group'] == HOLY_AEGIS_SHIELD_GROUP:
                broken = dict(shield)
            target['states'].remove(shield)
    taken = min(target['hp'], amount - absorbed)
    target['hp'] -= taken
    return taken, absorbed, broken


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


def _summon_variant(catalog: Catalog, rng) -> dict:
    variants = LEGACY_SUMMON_VARIANTS if catalog.version == LEGACY_SUMMON_CATALOG else SUMMON_VARIANTS
    roll = rng.random()
    cumulative = 0.0
    for variant in variants:
        cumulative += variant['probability']
        if roll < cumulative:
            return variant
    return variants[-1]


def _apply_summon_aftermath(attacker: dict, target: dict, variant: dict, effect: dict,
                            action_name: str, tick: int, passive_bonus: float,
                            group_bonus: float, rules: dict) -> list[dict]:
    if target['hp'] <= 0:
        return []
    rank_scale = float(effect['value']) / .5
    events = []
    debuff = variant.get('debuff')
    if debuff:
        duration = int(debuff['duration'])
        status(target, {'code': 'modifier', 'group': debuff['group'], 'stat': debuff['stat'],
                        'value': float(debuff['value']) * rank_scale, 'name': action_name,
                        'expires': tick + duration})
        events.append({'actor': attacker['name'], 'target': target['name'], 'action': action_name,
                       'kind': 'modifier', 'duration': duration, 'group': debuff['group']})
    if variant.get('burn_value'):
        burn_value = float(variant['burn_value']) * rank_scale
        burn_bonus = sum(float(row['value']) for row in attacker['passives']
                         if row['code'] == 'passive_damage' and row['stat'] == 'burn')
        raw = value(attacker, 'magic_attack') * burn_value
        raw *= 1 + clamp(passive_bonus + group_bonus + burn_bonus, 0, 2)
        factor = element_multiplier(attacker, target, 'fire', rules)
        raw *= factor
        duration = int(variant['burn_duration'])
        burn = {'code': 'dot', 'group': 'burn', 'stat': 'magic_attack', 'value': burn_value,
                'name': action_name, 'raw': raw, 'remaining': duration, 'next_tick': tick,
                'source_level': attacker['level'], 'damage_type': 'magic'}
        if abs(factor - 1) > 1e-9:
            burn['element'] = 'fire'
        status(target, burn)
        events.append({'actor': attacker['name'], 'target': target['name'], 'action': action_name,
                       'kind': 'dot', 'duration': duration, 'group': 'burn'})
    return events


def expire(fighter: dict, tick: int) -> None:
    fighter['states'] = [s for s in fighter['states'] if s['code'] in ('dot', 'hot') or s['expires'] > tick]


def _shield_break(catalog: Catalog, bearer: dict, opponent: dict, shield: dict, tick: int, rng) -> list[dict]:
    if shield['group'] != HOLY_AEGIS_SHIELD_GROUP or bearer['hp'] <= 0 or opponent['hp'] <= 0:
        return []
    rank = bearer['skills'].get(HOLY_AEGIS_SKILL_ID)
    if not rank:
        return []
    _, effects = catalog.skill(HOLY_AEGIS_SKILL_ID, rank)
    retribution = next((fx for fx in effects if fx['code'] == 'shield_break' and fx['group'] == shield['group']), None)
    if not retribution:
        return []
    effect = {'code': 'damage', 'stat': retribution['stat'], 'value': float(retribution['value']),
              'hits': 1, 'damage_type': retribution['damage_type'] or 'magic',
              'element': retribution.get('element') or 'light'}
    return apply(catalog, bearer, opponent, [effect], '圣盾（Holy Aegis）·圣光十字波·圣光十字裁决圣柱', tick, rng,
                 allow_reflect=False)


def _reflect_damage(catalog: Catalog, bearer: dict, attacker: dict, raw_by_type: dict[str, float], tick: int,
                    rng) -> list[dict]:
    if bearer['hp'] <= 0 or attacker['hp'] <= 0 or not raw_by_type:
        return []
    reflect = max((float(state['value']) for state in bearer['states']
                   if state['code'] == 'reflect' and state['expires'] > tick), default=0)
    if reflect <= 0:
        return []
    events = []
    # One retaliation per incoming action. Multi-hit raw damage is accumulated by type;
    # it is then mitigated by the attacker's matching defense, without crit or recursion.
    for kind, raw in raw_by_type.items():
        amount = damage(raw * reflect, kind, bearer['level'], attacker)
        taken, absorbed, broken = hurt(attacker, amount)
        events.append({'actor': bearer['name'], 'target': attacker['name'], 'action': '盾墙·反伤',
                       'kind': 'damage', 'damage': taken, 'absorbed': absorbed,
                       'hit': True, 'critical': False})
        if broken:
            events.extend(_shield_break(catalog, attacker, bearer, broken, tick, rng))
        if attacker['hp'] <= 0:
            break
    return events


def upkeep(fighter: dict, tick: int, events: list[dict], *, opponent=None, catalog=None, rng=None) -> None:
    expire(fighter, tick)
    for code in ('dot', 'hot'):
        for state in list(fighter['states']):
            if state['code'] != code or state['next_tick'] > tick:
                continue
            if code == 'dot':
                amount = damage(state['raw'], state['damage_type'], state['source_level'], fighter)
                taken, absorbed, broken = hurt(fighter, amount)
                event = {'actor': fighter['name'], 'action': state['name'], 'damage': taken, 'absorbed': absorbed, 'kind': 'dot'}
                if state.get('element'):
                    event['element'] = state['element']
                events.append(event)
                if broken and opponent is not None and catalog is not None and rng is not None:
                    events.extend(_shield_break(catalog, fighter, opponent, broken, tick, rng))
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


def apply(catalog: Catalog, attacker: dict, target: dict, effects: list[dict], name: str, tick: int, rng,
          *, allow_reflect: bool = True) -> list[dict]:
    events = []
    reflected_raw = {}
    parameter = lambda code: sum(float(f['value']) for f in effects if f['code'] == code)
    direct = [f for f in effects if f['code'] in ('damage', 'summon')]
    shared = bool(parameter('shared_hit'))
    critical_bonus = parameter('attack_critical')
    accuracy_bonus = parameter('attack_accuracy')
    penetration = parameter('attack_penetration')
    successful, shared_hit, shared_critical = False, None, None
    passive_bonus = sum(float(f['value']) for f in attacker['passives'] if f['code'] == 'passive_damage' and f['stat'] == 'elite_boss' and target.get('rank') in ('elite', 'boss'))
    for effect in direct:
        summon = effect['code'] == 'summon'
        variant = _summon_variant(catalog, rng) if summon else None
        hit_count = int(variant['hits']) if variant else int(effect['hits'])
        action_name = f'{name}·{variant["name"]}' if variant else name
        group_bonus = sum(float(f['value']) for f in attacker['passives']
                          if f['code'] == 'passive_damage' and f['stat'] == effect.get('group')) if summon else 0
        variant_successful = False
        for _ in range(hit_count):
            if attacker['hp'] <= 0 or target['hp'] <= 0:
                break
            use_shared_roll = shared and not summon
            landed = shared_hit if use_shared_roll and shared_hit is not None else hit(attacker, target, rng, accuracy_bonus)
            critical = shared_critical if use_shared_roll and shared_critical is not None else rng.random() < clamp(value(attacker, 'critical') + critical_bonus, 0, .6)
            if use_shared_roll:
                shared_hit, shared_critical = landed, critical
            successful |= landed
            variant_successful |= landed
            raw = value(attacker, effect['stat']) * float(effect['value'])
            if variant:
                raw *= float(variant['damage_multiplier'])
            if landed:
                damage_kind = effect['damage_type'] or 'physical'
                reflected_raw[damage_kind] = reflected_raw.get(damage_kind, 0) + raw
            extra = (1 + parameter('missing_hp_damage') * (1 - attacker['hp'] / attacker['stats']['hp_max'])) * (1 + clamp(passive_bonus + group_bonus, 0, 2)) * (1 + clamp(value(target, 'damage_taken'), 0, 1))
            element = attack_element(effect, attacker)
            factor = element_multiplier(attacker, target, element, catalog.rules) if landed else 1
            amount = damage(raw, effect['damage_type'], attacker['level'], target, penetration=penetration,
                            variation=rng.uniform(.95, 1.05), critical=value(attacker, 'critical_damage') if critical else 1,
                            extra=extra, element_factor=factor) if landed else 0
            taken, absorbed, broken = hurt(target, amount)
            event = {'actor': attacker['name'], 'target': target['name'], 'action': action_name, 'kind': 'damage',
                     'damage': taken, 'absorbed': absorbed, 'hit': landed, 'critical': landed and critical}
            if landed and element and abs(factor - 1) > 1e-9:
                event['element'] = element
            events.append(event)
            if broken:
                events.extend(_shield_break(catalog, target, attacker, broken, tick, rng))
        if variant and variant_successful:
            events.extend(_apply_summon_aftermath(attacker, target, variant, effect, action_name,
                                                   tick, passive_bonus, group_bonus, catalog.rules))
    if allow_reflect and reflected_raw:
        events.extend(_reflect_damage(catalog, target, attacker, reflected_raw, tick, rng))
    enemy_status = [f for f in effects if f.get('target') == 'enemy' and f['code'] in ('modifier', 'dot')]
    if not direct and enemy_status:
        successful = hit(attacker, target, rng, accuracy_bonus)
    for fx in effects:
        code = fx['code']
        if code == 'shield_break':
            continue
        if code not in ('heal', 'shield', 'hot', 'dot', 'modifier', 'reflect'):
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
        if code in ('modifier', 'reflect'):
            if receiver is target and fx['stat'] in ('attack', 'defense', 'physical_defense', 'magic_defense'):
                duration += max((int(f['value']) for f in attacker['passives'] if f['code'] == 'passive_duration'), default=0)
            state['expires'] = tick + duration
        elif code == 'shield':
            state.update(remaining=max(0, math.floor(raw)), expires=tick + duration)
        else:
            bonus = passive_bonus + sum(float(f['value']) for f in attacker['passives'] if f['code'] == 'passive_damage' and f['stat'] == fx['group'])
            factor = 1
            if code == 'dot':
                element = attack_element(fx, attacker)
                skip = fx.get('group') == 'poison'
                factor = element_multiplier(attacker, receiver, element, catalog.rules, skip=skip)
                if element and not skip and abs(factor - 1) > 1e-9:
                    state['element'] = element
            state.update(raw=raw * (1 + clamp(bonus, 0, 2)) * factor, remaining=duration, next_tick=tick + (1 if receiver is attacker else 0), source_level=attacker['level'], damage_type=fx['damage_type'])
        status(receiver, state)
        events.append({'actor': attacker['name'], 'target': receiver['name'], 'action': name, 'kind': code, 'duration': duration, 'group': fx['group']})
    return events
