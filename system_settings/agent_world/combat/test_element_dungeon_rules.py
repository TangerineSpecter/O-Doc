"""The staged element rules must not change the currently released catalog."""
import copy
import random
import unittest

from . import attributes, engine, equipment, rewards
from .catalog import Catalog, bundled
from .catalog_validation import validate_tables
from .effects import apply, attack_element, element_multiplier
from .element_context import dungeon_elements
from .party_rules import scaled_monster


class ElementDungeonRulesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.current = bundled()[0]
        tables = copy.deepcopy(cls.current.tables)
        profile = next(row for row in tables['monster_profiles'] if row['id'] == 'magic')
        profile['element_curve'] = 'element_v1'
        staff = next(row for row in tables['equipment_templates'] if row['id'] == 'equip.staff')
        staff.update(element='water', element_power='0.08')
        cls.staged = Catalog(tables, 'staged-elements')

    def test_element_curve_ignores_old_boss_reductions_before_party_scaling(self):
        template = {**self.staged.row('monsters', 'monster.tide_priest'), 'attack_multiplier': '1'}
        for rank, expected in [('normal', (525, 23, 25)), ('elite', (892, 31, 27)),
                               ('boss', (1575, 41, 30))]:
            with self.subTest(rank=rank):
                monster = attributes.monster(self.staged, {**template, 'rank': rank}, 25)
                self.assertEqual((monster['hp_max'], monster['magic_attack'], monster['magic_defense']), expected)
                self.assertEqual(monster['physical_attack'], 0)
                party = scaled_monster(self.staged, monster, 4)
                self.assertEqual(party['hp_max'], int(expected[0] * 1.5))
                self.assertEqual(party['magic_attack'], int(expected[1] * 1.5))
        old = self.current.row('monsters', 'monster.moss_king')
        self.assertEqual(attributes.monster(self.current, old, 16)['hp_max'], 1830)


    def test_intrinsic_power_survives_generation_recalculation_and_combat(self):
        for quality in ('white', 'blue', 'gold'):
            with self.subTest(quality=quality):
                item = equipment.generate(self.staged, 'equip.staff', 40, quality, random.Random(27))
                self.assertEqual(item['element'], 'water')
                self.assertEqual(item['stats']['water_power'], .08)
                self.assertFalse(any(a['stat'] == 'water_power' for a in item['affixes']))
                effective = equipment.effective_snapshot(item, self.staged)
                self.assertEqual(effective['stats']['water_power'], .08)
                stats = attributes.attributes(self.staged, attributes.initial(), [effective])
                attacker = {'stats': stats}
                target = {'stats': {'water_resist': -.15}}
                self.assertEqual(attack_element({}, attacker), 'water')
                self.assertEqual(attack_element({'element': 'fire'}, attacker), 'fire')
                self.assertEqual(attack_element({'element': 'none'}, attacker), '')
                self.assertEqual(element_multiplier(attacker, target, 'water'), 1.23)
                self.assertEqual(element_multiplier(attacker, target, 'fire'), 1)
                self.assertEqual(item['stats']['water_power'], .08)

    def test_catalog_rejects_invalid_intrinsic_power(self):
        tables = copy.deepcopy(self.current.tables)
        staff = {**next(row for row in tables['equipment_templates'] if row['id'] == 'equip.staff'),
                 'id': 'equip.test.unpooled_staff'}
        tables['equipment_templates'].append(staff)
        staff.update(element='', element_power='0.08')
        with self.assertRaisesRegex(ValueError, 'Intrinsic element power requires a staff'):
            validate_tables(tables, expected_player_skills=98, expected_promotion_level=50,
                            catalog_version=self.current.version)
        staff.update(element='water', element_power='nan')
        with self.assertRaisesRegex(ValueError, 'Invalid intrinsic element power'):
            validate_tables(tables, expected_player_skills=98, expected_promotion_level=50,
                            catalog_version=self.current.version)

    def test_elemental_damage_over_time_uses_caps_and_poison_remains_untyped(self):
        stats = attributes.monster(self.staged, self.staged.row('monsters', 'monster.tide_priest'), 25)
        attacker = engine.fighter({**stats, 'physical_attack': 100, 'accuracy': 1,
                                  'element': 'water', 'fire_power': .8}, 'caster', 25)
        target = engine.fighter({**stats, 'evasion': 0, 'fire_resist': -.5}, 'target', 25)
        effect = {'code':'dot', 'target':'enemy', 'stat':'physical_attack', 'value':'.1',
                  'group':'flame', 'element':'fire', 'duration':'2', 'damage_type':'physical', 'chance':'1'}
        class AlwaysHit:
            def random(self): return 0
        self.assertEqual(element_multiplier(attacker, target, 'fire', self.staged.rules), 1.5)
        apply(self.staged, attacker, target, [effect], '火焰', 1, AlwaysHit())
        self.assertEqual(target['states'][0]['raw'], 15)
        self.assertEqual(target['states'][0]['element'], 'fire')
        apply(self.staged, attacker, target, [{**effect, 'group':'poison'}], '毒', 1, AlwaysHit())
        self.assertEqual(next(state for state in target['states'] if state['group'] == 'poison')['raw'], 10)
    def test_variant_weights_split_only_among_eligible_templates(self):
        ordinary = {'equipment_id': 'sword', 'variant_group': 'sword', 'weight': '4'}
        elemental = {'equipment_id': 'water_sword', 'variant_group': 'sword', 'weight': '4'}
        armor = {'equipment_id': 'armor', 'weight': '2'}
        self.assertEqual(rewards.equipment_pool_weights([ordinary, elemental, armor]), [2, 2, 2])
        self.assertEqual(rewards.equipment_pool_weights([ordinary, armor]), [4, 2])
        self.assertEqual(rewards.equipment_pool_weights([{'weight': '4'}, armor]), [4, 2])

    def test_catalog_rejects_mismatched_variant_types(self):
        tables = copy.deepcopy(self.current.tables)
        sword = next(row for row in tables['equipment_pools'] if row['equipment_id'] == 'equip.sword')
        axe = next(row for row in tables['equipment_pools'] if row['pool_id'] == sword['pool_id'] and row['equipment_id'] == 'equip.axe')
        sword['variant_group'] = axe['variant_group'] = 'bad'
        with self.assertRaisesRegex(ValueError, 'Equipment variants must have matching types and levels'):
            validate_tables(tables, expected_player_skills=98, expected_promotion_level=50,
                            catalog_version=self.current.version)

    def test_water_pool_and_loot_respect_released_level_limits(self):
        from scripts.combat_design.element_water_candidate import candidate
        draft = candidate()
        dungeon = draft.row('dungeons', 'dungeon.element.tidal_shoal')
        for level in (15, 20, 25):
            pool = [row for row in draft.tables['equipment_pools']
                    if row['pool_id'] == 'pool.element.tidal_shoal'
                    and rewards._equipment_level_band(dungeon, draft.row('equipment_templates', row['equipment_id']), level)]
            water = [draft.row('equipment_templates', row['equipment_id']) for row in pool
                     if draft.row('equipment_templates', row['equipment_id']).get('element') == 'water']
            self.assertEqual({row['equipment_type'] for row in water},
                             {'long_sword', 'axe', 'bow', 'dagger', 'mage_staff', 'instrument'})
            self.assertTrue(all(row.get('element_power', '') == ('.05' if row['equipment_type'] == 'mage_staff' else '')
                                for row in water))
        rng = random.Random(4)
        dropped = [reward['item'] for _ in range(1000)
                   for reward in rewards.drops(draft, 'monster.element.water.bubble_crab', 20,
                                               {'gear': 1, 'loot': 1}, rng)
                   if reward['kind'] == 'equipment']
        self.assertTrue(any(row.get('element') == 'water' for row in dropped))
        self.assertTrue(all(15 <= row['level'] <= 20 for row in dropped))

    def test_all_candidates_cover_weapon_types_without_duplicate_level_30_tiers(self):
        from scripts.combat_design.element_all_candidates import CONFIGS, candidate
        draft = candidate()
        for element, _name, minimum, maximum, _weakness, _monsters in CONFIGS:
            dungeon = draft.row('dungeons', f'dungeon.element.{element}')
            for level in {minimum, min(maximum, 30), min(maximum, 31), maximum}:
                if level < minimum:
                    continue
                pool = [row for row in draft.tables['equipment_pools']
                        if row['pool_id'] == f'pool.element.{element}'
                        and rewards._equipment_level_band(dungeon, draft.row('equipment_templates', row['equipment_id']), level)]
                templates = [draft.row('equipment_templates', row['equipment_id']) for row in pool]
                elemental = [row for row in templates if row.get('element') == element]
                counts = {kind: sum(row['equipment_type'] == kind for row in elemental)
                          for kind in ('long_sword', 'axe', 'bow', 'dagger', 'mage_staff', 'instrument')}
                self.assertEqual(set(counts.values()), {1}, (element, level, counts))
                if level >= 30:
                    for kind in ('two_handed_staff', 'holy_staff'):
                        weapon = next(row for row in elemental if row['equipment_type'] == kind)
                        self.assertEqual(float(weapon['element_power']), .08 if kind == 'two_handed_staff' else .05)
                self.assertNotIn('two_handed_sword', {row['equipment_type'] for row in elemental})

    def test_dungeon_decision_context_preserves_individual_resists(self):
        from scripts.combat_design.element_all_candidates import candidate
        draft = candidate()
        summary = dungeon_elements(draft, 'dungeon.element.tidal_shoal')
        self.assertEqual(len(summary['monsters']), 4)
        boss = next(row for row in summary['monsters'] if row['rank'] == 'boss')
        self.assertEqual(boss['element'], 'water')
        self.assertEqual(boss['resists'], {'water': .25, 'earth': -.2})
        old = dungeon_elements(self.current, 'dungeon.sprout_meadow')
        self.assertEqual(len(old['monsters']), 4)

    def test_balance_fixture_never_uses_boss_trophies_or_elemental_gear(self):
        from scripts.combat_design.element_all_candidates import candidate
        from scripts.combat_design.evaluate_element_water_draft import regular_loadout
        draft = candidate()
        for job, level in [('job.warrior', 15), ('job.priest', 27),
                           ('job.elementalist', 35), ('job.musician', 43)]:
            with self.subTest(job=job, level=level):
                gear = regular_loadout(draft, job, level, random.Random(11))
                self.assertIn('weapon', {item['slot'] for item in gear})
                self.assertEqual({item['quality'] for item in gear}, {'white', 'blue'})
                for item in gear:
                    template = draft.row('equipment_templates', item['template_id'])
                    self.assertNotEqual(template.get('boss_only'), '1')
                    self.assertFalse(template.get('element'))
                    self.assertLessEqual(item['level'], level)

    def test_balance_element_weapon_is_obtainable_from_its_region(self):
        from scripts.combat_design.element_all_candidates import candidate
        from scripts.combat_design.evaluate_element_water_draft import regular_loadout
        draft = candidate()
        water = regular_loadout(draft, 'job.swordsman', 43, random.Random(11), weapon_element='water')
        weapon = next(item for item in water if item['slot'] == 'weapon')
        self.assertEqual(weapon['element'], 'water')
        self.assertEqual(weapon['level'], 25)
        with self.assertRaises(ValueError):
            regular_loadout(draft, 'job.warrior', 20, random.Random(11), weapon_element='earth')

    def test_element_candidate_uses_shared_party_lifecycle_even_for_solo(self):
        from scripts.combat_design.element_all_candidates import candidate
        from scripts.combat_design.evaluate_element_water_draft import run_party_sample
        from .party_sessions import modern
        draft = candidate()
        self.assertTrue(modern(draft))
        result = run_party_sample(draft, ('job.warrior',), 11, level=20,
                                  boss_id='monster.element.water.tide_crown', boss_level=25,
                                  dungeon_id='dungeon.element.tidal_shoal')
        self.assertIn('any_fallen', result)
        self.assertGreater(result['rounds'], 0)


if __name__ == '__main__':
    unittest.main()
