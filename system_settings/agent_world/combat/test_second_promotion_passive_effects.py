"""Rank-three second-promotion bonuses, actual combat use and frozen history."""
import copy
from decimal import Decimal
import json
from pathlib import Path
import unittest

from . import attributes, effects, engine
from ._test_catalog_fixtures import restore_second_promotion_1_0_38
from .catalog import Catalog, bundled
from .catalog_validation import validate_tables


RANK_TWO = {
    'skill.player.014.r2.e1': '.15', 'skill.player.016.r2.e1': '.075',
    'skill.player.018.r2.e1': '.075', 'skill.player.018.r2.e2': '.0375', 'skill.player.018.r2.e3': '.0375',
    'skill.player.020.r2.e1': '.075', 'skill.player.022.r2.e1': '.03', 'skill.player.022.r2.e2': '.06',
    'skill.player.024.r2.e1': '.075', 'skill.player.026.r2.e1': '.075',
    'skill.player.028.r2.e1': '.045', 'skill.player.028.r2.e2': '.045',
    'skill.player.083.r2.e1': '.15', 'skill.player.086.r2.e1': '.15',
}


class FixedRandom:
    def random(self):
        return .1

    def uniform(self, low, high):
        return 1


class SecondPromotionPassiveEffectsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog, _ = bundled()
        old_tables = copy.deepcopy(cls.catalog.tables)
        restore_second_promotion_1_0_38(old_tables)
        cls.old = Catalog(old_tables, 'combat-1.0.38')

    def test_each_rank_three_component_is_twice_the_unchanged_rank_two(self):
        for identity, expected in RANK_TWO.items():
            with self.subTest(effect=identity):
                second = self.catalog.row('skill_effects', identity)
                third_id = identity.replace('.r2.', '.r3.')
                third = self.catalog.row('skill_effects', third_id)
                self.assertEqual(Decimal(second['value']), Decimal(expected))
                self.assertEqual(second, self.old.row('skill_effects', identity))
                self.assertEqual(Decimal(third['value']), Decimal(expected) * 2)
                self.assertEqual({k: v for k, v in third.items() if k != 'value'},
                                 {k: v for k, v in self.old.row('skill_effects', third_id).items() if k != 'value'})
        self.assertEqual(len({identity.split('.r2.')[0] for identity in RANK_TWO}), 10)

    def test_old_catalog_still_valid_and_rank_three_stays_frozen(self):
        validate_tables(self.old.tables, expected_player_skills=98,
                        expected_promotion_level=50, catalog_version=self.old.version)
        self.assertEqual(self.old.learned('job.swordsman', 50)['skill.player.014'], 3)
        self.assertEqual(self.old.skill('skill.player.014', 3)[1][0]['value'], '0.2')
        self.assertEqual(self.catalog.skill('skill.player.014', 3)[1][0]['value'], '0.3')

    def test_weapon_bonus_and_elemental_caps_apply_to_real_attributes(self):
        progress = attributes.initial()
        progress.update(job='job.swordsman', level=50, skills={'skill.player.014': 3})
        gear = [{'slot': 'weapon', 'equipment_type': 'long_sword', 'stats': {'physical_attack': 1000}}]
        old = attributes.attributes(self.old, progress, gear)
        new = attributes.attributes(self.catalog, progress, gear)
        self.assertEqual(new['physical_attack'] - old['physical_attack'], 100)

        passive = attributes.passives(self.catalog, {'skill.player.018': 3})
        power, _ = attributes.element_scores(self.catalog, passive, {'fire_power': .35})
        self.assertEqual(power['fire'], .4)
        self.assertEqual(power['water'], .075)

    def test_music_discount_changes_support_cost_but_not_attack_cost(self):
        identity = 'skill.player.083'
        old = {'level': 50, 'passives': attributes.passives(self.old, {identity: 3})}
        new = {'level': 50, 'passives': attributes.passives(self.catalog, {identity: 3})}
        self.assertEqual(engine.cost(self.old, old, 'skill.player.082', 3), 52)
        self.assertEqual(engine.cost(self.catalog, new, 'skill.player.082', 3), 46)
        self.assertEqual(engine.cost(self.old, old, 'skill.player.076', 3),
                         engine.cost(self.catalog, new, 'skill.player.076', 3))

    def test_magic_penetration_works_against_defense_and_respects_cap(self):
        def hit(catalog, defense, extra_penetration=0):
            stats = {'hp_max': 10000, 'mp_max': 10000, 'magic_attack': 1000, 'physical_attack': 1000,
                     'magic_defense': defense, 'physical_defense': 0, 'accuracy': 1,
                     'evasion': 0, 'critical': 0, 'critical_damage': 1.5}
            caster = engine.fighter(stats, 'caster', 50, passives=attributes.passives(catalog, {'skill.player.086': 3}))
            target = engine.fighter(stats, 'target', 50)
            spell = {**catalog.skill('skill.player.085', 3)[1][0], 'code': 'damage'}
            parameters = [spell]
            if extra_penetration:
                parameters.append({'code': 'attack_penetration', 'value': str(extra_penetration), 'target': 'self'})
            events = effects.apply(catalog, caster, target, parameters, 'spell', 1, FixedRandom())
            return next(event['damage'] for event in events if event['kind'] == 'damage')

        self.assertGreater(hit(self.catalog, 1000), hit(self.old, 1000))
        self.assertEqual(hit(self.catalog, 0), hit(self.old, 0))
        self.assertEqual(hit(self.catalog, 1000, .4), hit(self.old, 1000, .4))

    def test_local_catalog_matches_descriptions_and_all_effect_components(self):
        path = Path(__file__).resolve().parents[3] / 'frontend_react/src/mocks/agentWorld/catalog.json'
        local = json.loads(path.read_text())['combat']
        self.assertEqual(local['version'], self.catalog.version)
        levels = {row['id']: row for row in local['tables']['skillLevels']}
        local_effects = {row['id']: row for row in local['tables']['skillEffects']}
        for identity in RANK_TWO:
            for rank in (1, 2, 3):
                level_id = identity.split('.r2.')[0] + f'.r{rank}'
                effect_id = identity.replace('.r2.', f'.r{rank}.')
                with self.subTest(effect=effect_id):
                    self.assertEqual(levels[level_id]['description'], self.catalog.row('skill_levels', level_id)['description'])
                    self.assertEqual(local_effects[effect_id]['value'], self.catalog.row('skill_effects', effect_id)['value'])


if __name__ == '__main__':
    unittest.main()
