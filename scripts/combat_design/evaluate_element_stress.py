"""White gear and no-potion stress checks against candidate boss waves."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.combat_design.element_all_candidates import candidate
from scripts.combat_design.evaluate_element_water_draft import run_party_sample
from system_settings.agent_world.combat import attributes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seeds', type=int, default=500)
    parser.add_argument('--boss-hp-factor', type=float, default=1)
    parser.add_argument('--boss-attack-factor', type=float, default=1)
    args = parser.parse_args()
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
    output = []
    for dungeon_id, level in [('dungeon.element.tidal_shoal',20), ('dungeon.element.earth',27),
                              ('dungeon.element.wind',35), ('dungeon.element.fire',43)]:
        dungeon = catalog.row('dungeons', dungeon_id)
        jobs = [r['id'] for r in catalog.tables['professions'] if r['stage'] == ('1' if level < 30 else '2')]
        for job in jobs:
            samples = [run_party_sample(catalog, (job,), 202610270000+n, health=.5, level=level,
                        boss_id=dungeon['boss_id'], boss_level=int(dungeon['boss_level_max']),
                        dungeon_id=dungeon_id, potion_limit=0, quality='white') for n in range(args.seeds)]
            output.append({'dungeon': dungeon_id, 'level': level, 'job': job, 'samples': len(samples),
                           'win_rate': sum(row['won'] for row in samples)/len(samples),
                           'fallen_rate': sum(row['any_fallen'] for row in samples)/len(samples)})
    print(json.dumps({'scope':'候选Boss：白装、50%血蓝、零药剂，现行共享回合',
                      'boss_hp_factor': args.boss_hp_factor, 'boss_attack_factor': args.boss_attack_factor,
                      'limitations':'压力对照，不作为推荐装备与补给下的验收', 'results':output}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
