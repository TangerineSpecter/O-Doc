"""Permanent growth and derived attributes; no models, clocks or network."""
import math
from copy import deepcopy
from .catalog import Catalog, numeric

STATS = ('strength', 'dexterity', 'intelligence', 'vitality', 'spirit', 'luck')


def initial() -> dict:
    return {'level': 1, 'experience': 0, 'job': 'job.novice', 'stats': dict.fromkeys(STATS, 5),
            'fixed_hp': 0, 'fixed_mp': 0, 'skills': {}}


def passives(catalog: Catalog, learned: dict) -> list[dict]:
    return [effect for sid, rank in learned.items() if catalog.row('skills', sid)['kind'] == 'passive'
            for effect in catalog.skill(sid, rank)[1]]


def attributes(catalog: Catalog, progress: dict, equipment: list[dict]) -> dict:
    additions = {}
    for item in equipment:
        for key, value in item['stats'].items():
            additions[key] = additions.get(key, 0) + value
    effects = passives(catalog, progress['skills'])
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
    values.update({key: math.floor(value) for key, value in primaries.items()})
    values.update(accuracy=min(1.1, .95 + .1 * dexterity / (dexterity + 80) + additions.get('accuracy', 0) + flats.get('accuracy', 0)),
                  evasion=min(.35, .03 + .25 * dexterity / (dexterity + 120) + additions.get('evasion', 0) + flats.get('evasion', 0)),
                  critical=min(.6, .05 + .3 * luck / (luck + 150) + additions.get('critical', 0) + flats.get('critical', 0)),
                  critical_damage=min(3, 1.5 + additions.get('critical_damage', 0) + flats.get('critical_damage', 0)),
                  damage_type='magic' if weapon_stats.get('magic_attack', 0) else 'physical')
    return values


def award(catalog: Catalog, progress: dict, experience: int) -> tuple[dict, list[dict]]:
    updated = deepcopy(progress)
    records = []
    if updated['level'] >= 99:
        return updated, records
    updated['experience'] += experience
    while updated['level'] < 99:
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
        updated['skills'] = catalog.learned(updated['job'], updated['level'])
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
    updated['skills'] = catalog.learned(job_id, updated['level'])
    return updated


def monster(catalog: Catalog, template: dict, level: int) -> dict:
    profile = catalog.row('monster_profiles', template['profile'])
    rank = catalog.row('monster_ranks', template['rank'])
    hp = math.floor((numeric(profile, 'hp_constant') + numeric(profile, 'hp_linear') * level + numeric(profile, 'hp_quadratic') * level ** 2) * numeric(profile, 'hp_multiplier') * numeric(rank, 'hp_multiplier'))
    attack = math.floor((numeric(profile, 'attack_constant') + numeric(profile, 'attack_linear') * level + numeric(profile, 'attack_quadratic') * level ** 2) * numeric(profile, 'attack_multiplier') * numeric(rank, 'attack_multiplier') * float(template.get('attack_multiplier',1)))
    defense = numeric(profile, 'defense_constant') + numeric(profile, 'defense_linear') * level
    return {'hp_max': hp, 'mp_max': math.floor(numeric(profile, 'mp_constant') + numeric(profile, 'mp_linear') * level),
            'physical_attack': attack if profile['damage_type'] == 'physical' else 0,
            'magic_attack': attack if profile['damage_type'] == 'magic' else 0,
            'physical_defense': math.floor(defense * numeric(profile, 'physical_defense_multiplier') * numeric(rank, 'defense_multiplier')),
            'magic_defense': math.floor(defense * numeric(profile, 'magic_defense_multiplier') * numeric(rank, 'defense_multiplier')),
            **{key: numeric(profile, key) for key in ('accuracy', 'evasion', 'critical', 'critical_damage')},
            'healing': 0, 'damage_type': profile['damage_type']}


def kill_experience(catalog: Catalog, level: int, actor_level: int, rank: str) -> int:
    base = math.floor(10 + 3 * level + .3 * level ** 2)
    limit = math.floor(1.25 * math.floor(10 + 3 * actor_level + .3 * actor_level ** 2))
    delta = level - actor_level
    factor = 1 if -3 <= delta <= 3 else 1 + .1 * (delta + 3) if -9 <= delta <= -4 else .1 if -19 <= delta <= -10 else .02 if delta <= -20 else 1 + min(.2, .04 * (delta - 3))
    return max(1, math.floor(min(base, limit) * numeric(catalog.row('monster_ranks', rank), 'experience_multiplier') * factor))
