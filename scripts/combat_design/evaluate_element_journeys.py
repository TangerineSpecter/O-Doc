"""Exploration probes with candidate loot and production combat rounds.

No DB, actual model decisions, food, stamina, or real-time scheduling.
Run independently of the released catalog; results are diagnostics, not acceptance.
"""
import argparse
import json
import random
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.combat_design.element_all_candidates import candidate
from scripts.combat_design.checkpoints import Checkpoint
from scripts.combat_design.evaluate_element_bosses import interval
from scripts.combat_design.evaluate_element_water_draft import fixed_progress, regular_loadout
from scripts.combat_design.evaluate_engine import supplies
from system_settings.agent_world.combat import attributes, engine, rewards
from system_settings.agent_world.combat.party_engine import alive, rescue, step_in_place as party_step
from system_settings.agent_world.combat.party_rules import CADENCE, experience, roll, spawn_enemies


def player(catalog, job, level, rng, identity, potion_limit, weapon_element=None):
    progress = fixed_progress(catalog, job, level)
    gear = regular_loadout(catalog, job, level, rng, weapon_element=weapon_element)
    stats = attributes.attributes(catalog, progress, gear)
    entity = engine.fighter(stats, job, level, skills=progress['skills'],
                            passives=attributes.passives(catalog, progress['skills'], gear))
    potions = supplies(catalog, level)
    if potion_limit is not None:
        remaining = potion_limit
        for sid in sorted(potions, key=lambda sid: catalog.row('potions', sid)['kind'] != 'heal'):
            potions[sid] = min(potions[sid], remaining)
            remaining -= potions[sid]
    entity.update(id=identity, job_id=job, potions=potions, style_id='style.balanced', elixirs=[])
    return entity, progress, gear


def party(catalog, dungeon, jobs, level, minutes, seed, potion_limit, weapon_element=None):
    rng = random.Random(seed)
    builds = {f'p{i}': player(catalog, job, level, rng, f'p{i}', potion_limit, weapon_element)
              for i, job in enumerate(jobs)}
    players = {key: value[0] for key, value in builds.items()}
    progress = {key: value[1] for key, value in builds.items()}
    equipment = {key: value[2] for key, value in builds.items()}
    state = {'players': players, 'enemies': {}, 'round': 0, 'nonboss_kills': 0, 'boss_seen': False}
    gear = {identity: 0 for identity in players}
    fallen, promoted, boss_killed, elapsed, wave, potions_used = set(), set(), False, 0, 0, 0
    allowances = {identity: {'days': {}} for identity in players}
    while elapsed < minutes * 60 and alive(state['players']):
        wave += 1
        count = len(state['players'])
        state['enemies'] = spawn_enemies(catalog, dungeon, state['players'], state, rng, 'sample', wave)
        while elapsed + CADENCE[count] < minutes * 60 and alive(state['players']) and alive(state['enemies']):
            elapsed += CADENCE[count]
            if count == 1:
                rewards.accrue(allowances[next(iter(state['players']))], CADENCE[count], 'sample',
                               loot_interval_seconds=int(catalog.rules['loot_interval_seconds']),
                               equipment_interval_seconds=int(catalog.rules['equipment_interval_seconds']))
            before = sum(sum(unit['potions'].values()) for unit in state['players'].values())
            state, events = party_step(catalog, state, rng)
            potions_used += before - sum(sum(unit['potions'].values()) for unit in state['players'].values())
            fallen.update(key for key, unit in state['players'].items() if unit['hp'] <= 0)
            fallen.update(event['target_id'] for event in events if event['kind'] == 'revive')
            for enemy in state['enemies'].values():
                if enemy['hp'] > 0 or enemy['settled']:
                    continue
                enemy['settled'] = True
                boss_killed |= enemy['rank'] == 'boss'
                if enemy['rank'] != 'boss':
                    state['nonboss_kills'] += 1
                for identity, unit in state['players'].items():
                    gained = experience(catalog, enemy['level'], progress[identity]['level'], enemy['rank'], count)
                    updated, growth = attributes.award(catalog, progress[identity], gained, stop_at_promotion=True)
                    progress[identity] = updated
                    if growth:
                        old = unit['stats']
                        derived = attributes.attributes(catalog, updated, equipment[identity])
                        unit['hp'] = max(1, int(unit['hp'] / old['hp_max'] * derived['hp_max'])) if unit['hp'] > 0 else 0
                        unit['mp'] = int(unit['mp'] / max(1, old['mp_max']) * derived['mp_max'])
                        unit.update(stats=derived, level=updated['level'], skills=updated['skills'],
                                    passives=attributes.passives(catalog, updated['skills'], equipment[identity]))
                allowance = (allowances[next(iter(state['players']))] if count == 1 else
                             {'gear': 1, 'loot': 2 if enemy['rank'] == 'boss' else 1})
                for item in rewards.drops(catalog, enemy['template_id'], enemy['level'], allowance, rng):
                    winner = next(iter(state['players'])) if count == 1 else roll(list(state['players']), rng)[0]
                    if item['kind'] == 'equipment':
                        gear[winner] += 1
        if not alive(state['enemies']) and alive(state['players']):
            rescue(catalog, state, rng)
        if not alive(state['players']) or elapsed + CADENCE[count] >= minutes * 60:
            break
        promoted.update(key for key, unit in state['players'].items()
                        if unit['hp'] > 0 and attributes.promotion_options(catalog, progress[key]))
        state['players'] = {key: unit for key, unit in state['players'].items()
                            if unit['hp'] > 0 and key not in promoted}
        if not state['players']:
            break
        if elapsed + 30 >= minutes * 60:
            break
        elapsed += 30
        if len(state['players']) == 1:
            rewards.accrue(allowances[next(iter(state['players']))], 30, 'sample',
                           loot_interval_seconds=int(catalog.rules['loot_interval_seconds']),
                           equipment_interval_seconds=int(catalog.rules['equipment_interval_seconds']))
    return {'survived': bool(alive(state['players'])) or bool(promoted), 'fallen': bool(fallen),
            'boss_seen': state['boss_seen'], 'boss_killed': boss_killed,
            'boss_unfinished': state['boss_seen'] and not boss_killed and bool(alive(state['players'])),
            'equipment': list(gear.values()), 'potions': potions_used, 'promotion_departures': len(promoted),
            'levels_gained': [progress[key]['level'] - level for key in builds], 'elapsed_seconds': elapsed}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seeds', type=int, default=500)
    parser.add_argument('--minutes', type=int, nargs='+', default=[30, 60, 120])
    parser.add_argument('--no-supplies', action='store_true')
    parser.add_argument('--weapon', choices=('ordinary', 'same', 'weakness'), default='ordinary')
    parser.add_argument('--position', choices=('low', 'mid', 'high'), default='mid')
    parser.add_argument('--checkpoint', help='Write each completed group as one JSON line')
    parser.add_argument('--resume', action='store_true', help='Resume matching checkpoint without rerunning finished groups')
    args = parser.parse_args()
    options = {key: value for key, value in vars(args).items() if key not in ('checkpoint', 'resume')}
    checkpoint = Checkpoint(args.checkpoint, options, args.resume)
    catalog = candidate()
    output = checkpoint.rows
    complete = {(row['dungeon'], tuple(row['jobs']), row['minutes']) for row in output}
    areas = [('dungeon.element.tidal_shoal', 15, 25), ('dungeon.element.earth', 22, 32),
             ('dungeon.element.wind', 30, 40), ('dungeon.element.fire', 38, 48)]
    for identity, low, high in areas:
        level = {'low': low, 'mid': (low + high) // 2, 'high': high}[args.position]
        dungeon = catalog.row('dungeons', identity)
        theme, weakness = {'dungeon.element.tidal_shoal': ('water', 'earth'),
                           'dungeon.element.earth': ('earth', 'wind'),
                           'dungeon.element.wind': ('wind', 'fire'),
                           'dungeon.element.fire': ('fire', 'water')}[identity]
        weapon_element = {'ordinary': None, 'same': theme, 'weakness': weakness}[args.weapon]
        stage = '1' if level < 30 else '2'
        jobs = [row['id'] for row in catalog.tables['professions'] if row['stage'] == stage]
        fighter, mage, ranger, healer, bard = (('job.warrior', 'job.mage', 'job.ranger', 'job.priest', 'job.bard')
            if level < 30 else ('job.swordsman', 'job.elementalist', 'job.archer', 'job.cleric', 'job.musician'))
        teams = [(job,) for job in jobs] + [(fighter, ranger), (fighter, healer),
                 (fighter, mage, ranger), (fighter, mage, healer),
                 (fighter, mage, ranger, bard), (fighter, mage, ranger, healer)]
        for team in teams:
            for minutes in args.minutes:
                if (identity, tuple(team), minutes) in complete:
                    continue
                limit = 0 if args.no_supplies else None
                if weapon_element:
                    try:
                        for job in team:
                            regular_loadout(catalog, job, level, random.Random(0), weapon_element=weapon_element)
                    except ValueError as exc:
                        checkpoint.add({'dungeon': identity, 'level': level, 'jobs': team,
                                        'minutes': minutes, 'unavailable': str(exc)})
                        print(f'{args.position}: {len(output)} groups complete (unavailable)', file=sys.stderr, flush=True)
                        continue
                # Current solo explorations use the shared party lifecycle with one member.
                samples = [party(catalog, dungeon, team, level, minutes, 202610270000 + n, limit, weapon_element)
                           for n in range(args.seeds)]
                wins = sum(sample['survived'] for sample in samples)
                encounters = sum(sample['boss_seen'] for sample in samples)
                unfinished = sum(sample['boss_unfinished'] for sample in samples)
                resolved = encounters - unfinished
                checkpoint.add({'dungeon': identity, 'level': level, 'jobs': team, 'minutes': minutes,
                    'samples': len(samples), 'survival_rate': wins / len(samples), 'survival_ci95': interval(wins, len(samples)),
                    'any_fallen_rate': sum(sample['fallen'] for sample in samples) / len(samples),
                    'boss_encounters': encounters, 'boss_unfinished': unfinished,
                    'boss_win_rate_resolved': sum(sample['boss_killed'] for sample in samples) / resolved if resolved else None,
                    'equipment_per_member': [round(statistics.mean(sample['equipment'][i] for sample in samples), 3) for i in range(len(team))],
                    'mean_potions_per_member': round(statistics.mean(sample['potions'] for sample in samples) / len(team), 3),
                    'promotion_departure_rate': sum(sample['promotion_departures'] > 0 for sample in samples) / len(samples),
                    'mean_levels_per_member': [round(statistics.mean(sample['levels_gained'][i] for sample in samples), 3) for i in range(len(team))],
                    'mean_elapsed_seconds': round(statistics.mean(sample['elapsed_seconds'] for sample in samples), 1)})
                print(f'{args.position}: {len(output)} groups complete', file=sys.stderr, flush=True)
    print(json.dumps({'scope': '隔离目录候选；普通白蓝混装，均衡风格；当前单人及组队共享回合，候选掉落与组队roll',
        'limitations': '模拟战斗经验升级及转职时清波离队；不模拟食物、真实模型、体力、时间预约、职业收益加成或实际定时器。与正式探索随机数流不同。',
        'level_position': args.position, 'no_supplies': args.no_supplies, 'weapon': args.weapon,
        'results': output}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
