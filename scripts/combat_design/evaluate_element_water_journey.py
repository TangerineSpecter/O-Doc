"""Historical shared-engine water probe, including hypothetical single-member parties.

The draft catalog borrows existing drop items as placeholders. Its gear fixture
may include Boss items, and its one-person case is not the solo exploration engine.
This does not install content or reproduce scheduling, model decisions, levelling or food.
"""
import argparse
import json
import random
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.combat_design.evaluate_bards import loadout
from scripts.combat_design.evaluate_element_water_draft import DUNGEON, draft_catalog
from scripts.combat_design.evaluate_engine import progress_at, supplies
from system_settings.agent_world.combat import attributes, engine, rewards
from system_settings.agent_world.combat.party_engine import alive, rescue, step
from system_settings.agent_world.combat.party_rules import CADENCE, spawn_enemies


def run_sample(catalog, jobs, duration, seed, dungeon_id=DUNGEON):
    rng = random.Random(seed)
    players = {}
    potions_used = 0
    for index, job in enumerate(jobs):
        progress = progress_at(catalog, job, 20)
        gear = loadout(catalog, job, 20, rng)
        stats = attributes.attributes(catalog, progress, gear)
        unit = engine.fighter(stats, job, 20, skills=progress['skills'],
                              passives=attributes.passives(catalog, progress['skills'], gear))
        unit.update(id=f'p{index}', job_id=job, potions=supplies(catalog, 20),
                    style_id='style.balanced', elixirs=[])
        players[unit['id']] = unit
    state = {'players': players, 'enemies': {}, 'round': 0, 'nonboss_kills': 0, 'boss_seen': False}
    count = len(players)
    allowance = {'days': {}}
    elapsed = 0
    fallen = set()
    boss_killed = False
    equipment_drops = materials = waves = 0
    dungeon = catalog.row('dungeons', dungeon_id)
    while elapsed < duration and alive(state['players']):
        waves += 1
        state['enemies'] = spawn_enemies(catalog, dungeon, state['players'], state, rng, 'draft', waves)
        while elapsed + CADENCE[count] < duration and alive(state['players']) and alive(state['enemies']):
            elapsed += CADENCE[count]
            if count == 1:
                rewards.accrue(allowance, CADENCE[count], 'draft')
            before = sum(sum(unit['potions'].values()) for unit in state['players'].values())
            state, events = step(catalog, state, rng)
            potions_used += before - sum(sum(unit['potions'].values()) for unit in state['players'].values())
            fallen.update(key for key, unit in state['players'].items() if unit['hp'] <= 0)
            fallen.update(e['target_id'] for e in events if e['kind'] == 'revive')
            for foe in state['enemies'].values():
                if foe['hp'] > 0 or foe['settled']:
                    continue
                foe['settled'] = True
                boss_killed |= foe['template_id'] == dungeon['boss_id']
                if foe['rank'] != 'boss':
                    state['nonboss_kills'] += 1
                progress = allowance if count == 1 else {'gear': 1, 'loot': 2 if foe['rank'] == 'boss' else 1}
                for drop in rewards.drops(catalog, foe['template_id'], foe['level'], progress, rng):
                    if drop['kind'] == 'equipment':
                        equipment_drops += 1
                    else:
                        materials += drop['quantity']
        if not alive(state['enemies']) and alive(state['players']):
            rescue(catalog, state, rng)
        if not alive(state['players']) or elapsed + CADENCE[count] >= duration:
            break
        state['players'] = {key: unit for key, unit in state['players'].items() if unit['hp'] > 0}
        if not state['players']:
            break
        count = len(state['players'])
        if elapsed + 30 >= duration:
            elapsed = duration
            break
        elapsed += 30
        if count == 1:
            rewards.accrue(allowance, 30, 'draft')
    return {'survived': bool(alive(state['players'])), 'boss_encountered': state['boss_seen'],
            'boss_killed': boss_killed, 'fallen': bool(fallen), 'equipment': equipment_drops,
            'boss_unfinished': state['boss_seen'] and not boss_killed and bool(alive(state['players'])),
            'materials': materials, 'potions': potions_used, 'waves': waves}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seeds', type=int, default=500)
    parser.add_argument('--minutes', type=int, nargs='+', default=[30, 60, 120])
    parser.add_argument('--baseline', action='store_true', help='Use the unchanged moss cave as a comparison')
    args = parser.parse_args()
    catalog = draft_catalog()
    cases = [('job.warrior',), ('job.mage',), ('job.ranger',), ('job.priest',), ('job.bard',),
             ('job.warrior', 'job.ranger'), ('job.warrior', 'job.mage', 'job.ranger'),
             ('job.warrior', 'job.mage', 'job.ranger', 'job.bard'),
             ('job.warrior', 'job.mage', 'job.ranger', 'job.priest')]
    result = []
    for jobs in cases:
        for minutes in args.minutes:
            dungeon_id = 'dungeon.moss_cave' if args.baseline else DUNGEON
            samples = [run_sample(catalog, jobs, minutes * 60, 202610270000 + n, dungeon_id) for n in range(args.seeds)]
            encounters = sum(x['boss_encountered'] for x in samples)
            unfinished = sum(x['boss_unfinished'] for x in samples)
            resolved = encounters - unfinished
            result.append({'jobs': jobs, 'minutes': minutes, 'samples': len(samples),
                           'survival_rate': sum(x['survived'] for x in samples) / len(samples),
                           'any_fallen_rate': sum(x['fallen'] for x in samples) / len(samples),
                           'boss_encounters': encounters, 'boss_unfinished': unfinished,
                           'boss_win_rate_resolved': sum(x['boss_killed'] for x in samples) / resolved if resolved else None,
                           'equipment_per_member': round(statistics.mean(x['equipment'] for x in samples) / len(jobs), 3),
                           'mean_potions_per_member': round(statistics.mean(x['potions'] for x in samples) / len(jobs), 3),
                           'mean_waves': round(statistics.mean(x['waves'] for x in samples), 2)})
    print(json.dumps({'scope': f'{dungeon_id}；组队引擎及假设单人队伍，20级蓝装，满血蓝，14红6蓝，均衡风格',
                      'limitations': '可能包含Boss专属装备；借用旧材料装备池，固定等级，不模拟经验升级、食物、日程体力或模型',
                      'results': result}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
