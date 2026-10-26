"""Permanent growth and derived attributes; no models, clocks or network."""
import math
from copy import deepcopy
from decimal import Decimal, ROUND_HALF_UP
from .catalog import Catalog, numeric
from .effects import ELEMENTS


STATS = ('strength', 'dexterity', 'intelligence', 'vitality', 'spirit', 'luck')


def _bounds(catalog: Catalog, key: str, default: float) -> float:
    return float(catalog.rules.get(key, default))


def element_scores(catalog: Catalog, effects: list[dict], additions: dict, food_effects: dict | None = None) -> tuple[dict, dict]:
    """Mastery and gear add element power or resist. Level growth does not."""
    power = dict.fromkeys(ELEMENTS, 0.0)
    resist = dict.fromkeys(ELEMENTS, 0.0)
    for fx in effects:
        if fx['code'] != 'passive_element':
            continue
        stat = fx['stat']
        if stat.endswith('_power') and stat[:-6] in power:
            power[stat[:-6]] += float(fx['value'])
        elif stat.endswith('_resist') and stat[:-7] in resist:
            resist[stat[:-7]] += float(fx['value'])
    for key, amount in additions.items():
        if key.endswith('_power') and key[:-6] in power:
            power[key[:-6]] += amount
        elif key.endswith('_resist') and key[:-7] in resist:
            resist[key[:-7]] += amount
    for key, amount in (food_effects or {}).items():
        if key.endswith('_power') and key[:-6] in power:
            power[key[:-6]] += amount
        elif key.endswith('_resist') and key[:-7] in resist:
            resist[key[:-7]] += amount
    low_power, high_power = _bounds(catalog, 'element_power_min', 0), _bounds(catalog, 'element_power_max', .4)
    low_resist, high_resist = _bounds(catalog, 'element_resist_min', -.25), _bounds(catalog, 'element_resist_max', .45)
    return ({key: round(max(low_power, min(high_power, value)), 4) for key, value in power.items()},
            {key: round(max(low_resist, min(high_resist, value)), 4) for key, value in resist.items()})


def initial() -> dict:
    return {'level': 1, 'experience': 0, 'job': 'job.novice', 'stats': dict.fromkeys(STATS, 5),
            'fixed_hp': 0, 'fixed_mp': 0, 'skills': {}}


def has_equipment_type(equipment: list[dict], equipment_type: str) -> bool:
    if equipment_type.endswith('_armor_set'):
        family = equipment_type.removesuffix('_set')
        return all(any(item.get('slot') == slot and item.get('equipment_type') == family
                       for item in equipment) for slot in ('head', 'body', 'hands', 'feet'))
    if equipment_type.endswith('_armor'):
        required_slot = 'body'
    elif equipment_type in {'magic_shield', 'small_shield', 'large_shield'}:
        required_slot = 'offhand'
    elif equipment_type in {'mage_staff', 'two_handed_staff', 'holy_staff', 'two_handed_sword', 'instrument'}:
        required_slot = 'weapon'
    else:
        required_slot = ''
    return any(item.get('equipment_type') == equipment_type and
               (not required_slot or item.get('slot') == required_slot)
               for item in equipment)


def passives(catalog: Catalog, learned: dict, equipment: list[dict] | None = None) -> list[dict]:
    equipped = equipment or []
    result = []
    for sid, rank in learned.items():
        if catalog.row('skills', sid)['kind'] != 'passive':
            continue
        for effect in catalog.skill(sid, rank)[1]:
            if effect['code'] == 'passive_equipment_duration':
                if not has_equipment_type(equipped, effect['group']):
                    continue
                effect = {**effect, 'code': 'passive_music_duration'}
            if effect['code'] == 'passive_equipment_lifesteal':
                if not has_equipment_type(equipped, effect['group']):
                    continue
                effect = {**effect, 'code': 'passive_lifesteal'}
            if effect['code'] in ('passive_equipment_percent', 'passive_equipment_flat'):
                if not has_equipment_type(equipped, effect['group']):
                    continue
                effect = {**effect, 'code': 'passive_percent' if effect['code'].endswith('_percent') else 'passive_flat'}
            result.append(effect)
    return result


def promotion_options(catalog: Catalog, progress: dict) -> list[dict]:
    return [row for row in catalog.tables['professions']
            if row['parent_id'] == progress['job'] and row['enabled'] == '1'
            and int(row['required_level']) <= progress['level']]


def promotion_level(catalog: Catalog, progress: dict) -> int | None:
    levels = [int(row['required_level']) for row in catalog.tables['professions']
              if row['parent_id'] == progress['job'] and row['enabled'] == '1']
    return min(levels) if levels else None


def reselect_options(catalog: Catalog) -> list[dict]:
    """Only level-one professions may be re-selected; later stages stay earned."""
    return [row for row in catalog.tables['professions'] if row['stage'] == '1' and row['enabled'] == '1']


def reselect_gate(catalog: Catalog) -> int | None:
    levels = [int(row['required_level']) for row in catalog.tables['professions']
              if row['stage'] == '2' and row['enabled'] == '1']
    return min(levels) if levels else None


def reselect_blocked(catalog: Catalog, progress: dict) -> str:
    """Return the reason a level-one re-selection is unavailable, or an empty string."""
    if promotion_options(catalog, progress):
        return '当前有未完成的转职，请先完成转职'
    options = reselect_options(catalog)
    if not options:
        return '当前内容没有可更换的一转职业'
    if progress['level'] < min(int(row['required_level']) for row in options):
        return '达到一转等级后才能更换职业'
    gate = reselect_gate(catalog)
    if gate is not None and progress['level'] >= gate:
        return '已进入二转阶段，不能再更换一转职业'
    return ''


def reselect(catalog: Catalog, progress: dict, job_id: str) -> dict:
    """Keep level and experience, replay growth along the new profession path.

    Growth accumulates level by level, so the only history that matters is which
    profession was held while each level was reached. The catalog's required
    levels make that path deterministic: the root profession covers the levels
    below the target's required level, the target covers the rest.
    """
    blocked = reselect_blocked(catalog, progress)
    if blocked:
        raise ValueError(blocked)
    if job_id not in {row['id'] for row in reselect_options(catalog)}:
        raise ValueError('只能更换为一转职业')
    if job_id == progress['job']:
        raise ValueError('当前已是该职业，无需更换')
    job = catalog.row('professions', job_id)
    root = catalog.row('professions', catalog.path(job_id)[0])
    target_level = int(job['required_level'])
    updated = deepcopy(progress)
    updated['job'] = job_id
    updated['stats'] = dict(initial()['stats'])
    updated['fixed_hp'] = 0
    updated['fixed_mp'] = 0
    for reached in range(2, updated['level'] + 1):
        holder = root if reached <= target_level else job
        for stat in STATS:
            updated['stats'][stat] += int(holder[stat + '_growth'])
        updated['fixed_hp'] += int(holder['hp_growth'])
        updated['fixed_mp'] += int(holder['mp_growth'])
    # A voluntary re-selection drops the previous branch instead of keeping its skills.
    updated['skills'] = catalog.learned(job_id, updated['level'], {})
    return updated


def attributes(catalog: Catalog, progress: dict, equipment: list[dict], *, food_effects: dict | None = None) -> dict:
    additions = {}
    for item in equipment:
        for key, value in item['stats'].items():
            additions[key] = additions.get(key, 0) + value
    effects = passives(catalog, progress['skills'], equipment)
    percentages, flats = {}, {}
    for fx in effects:
        target = percentages if fx['code'] == 'passive_percent' else flats if fx['code'] == 'passive_flat' else None
        if target is not None:
            target[fx['stat']] = target.get(fx['stat'], 0) + float(fx['value'])
    primaries = {key: (progress['stats'][key] + additions.get(key, 0)) * (1 + percentages.get(key, 0)) for key in STATS}
    strength, dexterity, intelligence, vitality, spirit, luck = (primaries[k] for k in STATS)
    weapon_bonus = 1 + percentages.get('weapon_attack', 0)
    weapon = next((g for g in equipment if g['slot'] == 'weapon'), {})
    weapon_stats = weapon.get('stats', {})
    patk = additions.get('physical_attack', 0) + weapon_stats.get('physical_attack', 0) * (weapon_bonus - 1)
    matk = additions.get('magic_attack', 0) + weapon_stats.get('magic_attack', 0) * (weapon_bonus - 1)
    for fx in effects:
        if fx['code'] == 'passive_conversion':
            matk += (strength if fx['stat'] == 'strength_to_magic' else spirit) * float(fx['value'])
    values = {
        'hp_max': 44 + progress['fixed_hp'] + 12 * vitality + additions.get('hp_max', 0),
        'mp_max': 12 + progress['fixed_mp'] + 6 * intelligence + 4 * spirit + additions.get('mp_max', 0),
        'physical_attack': 3 + 2 * strength + .4 * dexterity + patk,
        'magic_attack': 3 + 2 * intelligence + .4 * spirit + matk,
        'physical_defense': .8 * vitality + .25 * strength + additions.get('physical_defense', 0),
        'magic_defense': .8 * spirit + .25 * intelligence + additions.get('magic_defense', 0),
        'healing': 2 * spirit + .5 * intelligence + additions.get('healing', 0),
    }
    values = {key: max(0, math.floor(value * (1 + percentages.get(key, 0)))) for key, value in values.items()}
    for key in ('physical_attack', 'magic_attack', 'physical_defense', 'magic_defense'):
        values[key] = math.floor(Decimal(values[key]) * (1 + Decimal(str((food_effects or {}).get(key, 0)))))
    values.update({key: math.floor(value) for key, value in primaries.items()})
    values.update(accuracy=min(1.1, .95 + .1 * dexterity / (dexterity + 80) + additions.get('accuracy', 0) + flats.get('accuracy', 0)),
                  evasion=min(.35, .03 + .25 * dexterity / (dexterity + 120) + additions.get('evasion', 0) + flats.get('evasion', 0)),
                  critical=min(.6, .05 + .3 * luck / (luck + 150) + additions.get('critical', 0) + flats.get('critical', 0)),
                  critical_damage=min(3, 1.5 + additions.get('critical_damage', 0) + flats.get('critical_damage', 0)),
                  damage_type='magic' if weapon_stats.get('magic_attack', 0) else 'physical',
                  element=str(weapon.get('element') or ''))
    power, resist = element_scores(catalog, effects, additions, food_effects)
    values.update({f'{key}_power': value for key, value in power.items()})
    values.update({f'{key}_resist': value for key, value in resist.items()})
    return values


def award(catalog: Catalog, progress: dict, experience: int, *, stop_at_promotion: bool = False) -> tuple[dict, list[dict]]:
    updated = deepcopy(progress)
    records = []
    if updated['level'] >= 99:
        return updated, records
    updated['experience'] += experience
    gate = promotion_level(catalog, updated) if stop_at_promotion else None
    while updated['level'] < 99:
        if gate is not None and updated['level'] >= gate:
            break
        cost = int(catalog.row('level_experience', f'level.{updated["level"]}')['experience_to_next'])
        if updated['experience'] < cost:
            break
        updated['experience'] -= cost
        job = catalog.row('professions', updated['job'])
        for stat in STATS:
            updated['stats'][stat] += int(job[stat + '_growth'])
        updated['fixed_hp'] += int(job['hp_growth'])
        updated['fixed_mp'] += int(job['mp_growth'])
        updated['level'] += 1
        updated['skills'] = catalog.learned(updated['job'], updated['level'], updated.get('skills'))
        records.append({'level': updated['level'], 'job': updated['job'], 'catalog_id': catalog.version})
    if updated['level'] == 99:
        updated['experience'] = 0
    return updated, records


def promote(catalog: Catalog, progress: dict, job_id: str) -> dict:
    job = catalog.row('professions', job_id)
    if job['parent_id'] != progress['job'] or int(job['required_level']) > progress['level'] or job['enabled'] != '1':
        raise ValueError('战斗职业分支或等级不符合转职条件')
    updated = deepcopy(progress)
    updated['job'] = job_id
    updated['skills'] = catalog.learned(job_id, updated['level'], updated.get('skills'))
    return updated


def monster(catalog: Catalog, template: dict, level: int) -> dict:
    profile = catalog.row('monster_profiles', template['profile'])
    rank = catalog.row('monster_ranks', template['rank'])
    hp = math.floor((numeric(profile, 'hp_constant') + numeric(profile, 'hp_linear') * level + numeric(profile, 'hp_quadratic') * level ** 2) * numeric(profile, 'hp_multiplier') * numeric(rank, 'hp_multiplier'))
    attack = math.floor((numeric(profile, 'attack_constant') + numeric(profile, 'attack_linear') * level + numeric(profile, 'attack_quadratic') * level ** 2) * numeric(profile, 'attack_multiplier') * numeric(rank, 'attack_multiplier') * float(template.get('attack_multiplier',1)))
    # Apply rank reductions before party scaling. Missing rules retain frozen catalogs.
    hp = max(1, hp - int(catalog.rules.get(f"monster_{template['rank']}_hp_reduction", 0)))
    attack = max(1, attack - int(catalog.rules.get(f"monster_{template['rank']}_attack_reduction", 0)))
    defense = numeric(profile, 'defense_constant') + numeric(profile, 'defense_linear') * level
    resists = {}
    for row in catalog.tables.get('monster_resists', []):
        if row['monster_id'] == template['id']:
            resists[row['element']] = float(row['value'])
    _, resist = element_scores(catalog, [], {f'{key}_resist': value for key, value in resists.items()})
    return {'element': template.get('element') or '',
            **{f'{key}_resist': value for key, value in resist.items()},
            'hp_max': hp, 'mp_max': math.floor(numeric(profile, 'mp_constant') + numeric(profile, 'mp_linear') * level),
            'physical_attack': attack if profile['damage_type'] == 'physical' else 0,
            'magic_attack': attack if profile['damage_type'] == 'magic' else 0,
            'physical_defense': math.floor(defense * numeric(profile, 'physical_defense_multiplier') * numeric(rank, 'defense_multiplier')),
            'magic_defense': math.floor(defense * numeric(profile, 'magic_defense_multiplier') * numeric(rank, 'defense_multiplier')),
            **{key: numeric(profile, key) for key in ('accuracy', 'evasion', 'critical', 'critical_damage')},
            'healing': 0, 'damage_type': profile['damage_type']}


def base_kill_experience(catalog: Catalog, level: int, rank: str) -> float:
    return math.floor(10+3*level+.3*level**2)*numeric(catalog.row('monster_ranks',rank),'experience_multiplier')


def kill_experience(catalog: Catalog, level: int, actor_level: int, rank: str, *, share: float | None = None) -> int:
    """Apply personal limits/level decay to an already allocated, rank-inclusive share."""
    base = base_kill_experience(catalog,level,rank) if share is None else share
    limit = math.floor(1.25 * math.floor(10 + 3 * actor_level + .3 * actor_level ** 2))*numeric(catalog.row('monster_ranks',rank),'experience_multiplier')
    delta = level - actor_level
    factor = 1 if -3 <= delta <= 3 else 1 + .1 * (delta + 3) if -9 <= delta <= -4 else .1 if -19 <= delta <= -10 else .02 if delta <= -20 else 1 + min(.2, .04 * (delta - 3))
    return max(1, math.floor(min(base, limit) * factor))


def apply_experience_bonus(experience: int, percentage) -> int:
    """Apply a frozen maze profession bonus and round the awarded XP to an integer."""
    try:
        bonus = Decimal(str(percentage or 0))
        if not bonus.is_finite():
            bonus = Decimal(0)
    except Exception:
        bonus = Decimal(0)
    bonus = min(Decimal(100), max(Decimal(0), bonus))
    adjusted = Decimal(max(0, int(experience))) * (Decimal(100) + bonus) / Decimal(100)
    return int(adjusted.quantize(Decimal('1'), rounding=ROUND_HALF_UP))
