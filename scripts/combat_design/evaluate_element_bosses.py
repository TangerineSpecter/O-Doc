"""Seeded boss-wave comparison for all isolated elemental catalog candidates."""
import argparse
import json
import math
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.combat_design.element_all_candidates import candidate
from scripts.combat_design.checkpoints import Checkpoint
from scripts.combat_design.evaluate_element_water_draft import run_party_sample
from system_settings.agent_world.combat import attributes


def interval(wins, count):
    z = 1.959963984540054
    p = wins / count
    denom = 1 + z * z / count
    center = (p + z * z / (2 * count)) / denom
    delta = z * math.sqrt(p * (1 - p) / count + z * z / (4 * count * count)) / denom
    return [round(center - delta, 4), round(center + delta, 4)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seeds', type=int, default=500)
    parser.add_argument('--boss-hp-factor', type=float, default=1)
    parser.add_argument('--boss-attack-factor', type=float, default=1)
    parser.add_argument('--only-solo', action='store_true')
    parser.add_argument('--position', choices=('low', 'mid', 'high'), default='mid')
    parser.add_argument('--weapon', choices=('ordinary', 'same', 'weakness'), default='ordinary')
    parser.add_argument('--potion-limit', type=int, help='Maximum potions per resident; omit for standard supplies')
    parser.add_argument('--checkpoint', help='Write each completed group as one JSON line')
    parser.add_argument('--resume', action='store_true', help='Resume matching checkpoint without rerunning finished groups')
    args = parser.parse_args()
    options = {key: value for key, value in vars(args).items() if key not in ('checkpoint', 'resume')}
    checkpoint = Checkpoint(args.checkpoint, options, args.resume)
    original_monster = attributes.monster
    def adjusted(catalog, template, level):
        stats = original_monster(catalog, template, level)
        if template['rank'] == 'boss' and template['profile'].startswith('element.'):
            stats['hp_max'] = int(stats['hp_max'] * args.boss_hp_factor)
            for key in ('physical_attack', 'magic_attack'):
                stats[key] = int(stats[key] * args.boss_attack_factor)
        return stats
    attributes.monster = adjusted
    catalog = candidate()
    areas = [('dungeon.element.tidal_shoal', 15, 25), ('dungeon.element.earth', 22, 32),
             ('dungeon.element.wind', 30, 40), ('dungeon.element.fire', 38, 48)]
    output = checkpoint.rows
    complete = {(row['dungeon'], tuple(row['jobs']), row['starting_hp_mp']) for row in output}
    for dungeon_id, low, high in areas:
        level = {'low': low, 'mid': (low + high) // 2, 'high': high}[args.position]
        dungeon = catalog.row('dungeons', dungeon_id)
        theme, weakness = {'dungeon.element.tidal_shoal': ('water', 'earth'),
                           'dungeon.element.earth': ('earth', 'wind'),
                           'dungeon.element.wind': ('wind', 'fire'),
                           'dungeon.element.fire': ('fire', 'water')}[dungeon_id]
        weapon_element = {'ordinary': None, 'same': theme, 'weakness': weakness}[args.weapon]
        stage = '1' if level < 30 else '2'
        jobs = [r['id'] for r in catalog.tables['professions'] if r['stage'] == stage]
        if level < 30:
            fighter, mage, ranger, healer, bard = 'job.warrior', 'job.mage', 'job.ranger', 'job.priest', 'job.bard'
        else:
            fighter, mage, ranger, healer, bard = 'job.swordsman', 'job.elementalist', 'job.archer', 'job.cleric', 'job.musician'
        teams = [(j,) for j in jobs] + [(fighter, ranger), (fighter, healer),
                 (fighter, mage, ranger), (fighter, mage, healer),
                 (fighter, mage, ranger, bard), (fighter, mage, ranger, healer)]
        if args.only_solo:
            teams = [team for team in teams if len(team) == 1]
        for jobs in teams:
            for health in (1, .5):
                if (dungeon_id, tuple(jobs), health) in complete:
                    continue
                options = {'weapon_element': weapon_element, 'potion_limit': args.potion_limit}
                # Some cross-region weapons cannot exist at this level. Report them
                # as unavailable instead of silently substituting ordinary gear.
                if weapon_element:
                    from scripts.combat_design.evaluate_element_water_draft import regular_loadout
                    import random
                    try:
                        for job in jobs:
                            regular_loadout(catalog, job, level, random.Random(0), weapon_element=weapon_element)
                    except ValueError as exc:
                        checkpoint.add({'dungeon': dungeon_id, 'level': level, 'jobs': jobs,
                                        'starting_hp_mp': health, 'unavailable': str(exc)})
                        print(f'{args.position}: {len(output)} groups complete (unavailable)', file=sys.stderr, flush=True)
                        continue
                # Modern exploration always attaches a party, including a one-person
                # solo party. The legacy engine.step path is not the current solo path.
                samples = [run_party_sample(catalog, jobs, 202610270000 + n, health=health,
                    level=level, boss_id=dungeon['boss_id'], boss_level=int(dungeon['boss_level_max']), dungeon_id=dungeon_id, **options)
                    for n in range(args.seeds)]
                wins = sum(row['won'] for row in samples)
                rounds = sorted(row['rounds'] for row in samples)
                checkpoint.add({'dungeon': dungeon_id, 'level': level, 'jobs': jobs, 'starting_hp_mp': health,
                    'samples': len(samples), 'wins': wins, 'win_rate': wins/len(samples), 'win_rate_ci95': interval(wins, len(samples)),
                    'any_fallen_rate': sum(row['any_fallen'] for row in samples)/len(samples),
                    'median_rounds': statistics.median(rounds), 'p90_rounds': rounds[math.ceil(.9*len(rounds))-1],
                    'mean_potions_per_member': round(statistics.mean(row['potions_used'] for row in samples)/len(jobs), 2)})
                print(f'{args.position}: {len(output)} groups complete', file=sys.stderr, flush=True)
    print(json.dumps({'scope': '隔离候选，单人及组队均使用当前共享战斗回合；白蓝混装、均衡风格，Boss为该区域最高级；默认携带14红6蓝',
        'boss_hp_factor': args.boss_hp_factor, 'boss_attack_factor': args.boss_attack_factor,
        'level_position': args.position, 'weapon': args.weapon, 'potion_limit': args.potion_limit,
        'limitations': '仅孤立Boss波次，不包含实际探索的资源历史、升级、食物、模型和奖励，不作为完整验收',
        'results': output}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
