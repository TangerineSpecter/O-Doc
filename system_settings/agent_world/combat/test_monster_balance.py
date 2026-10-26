"""Rank reductions and party difficulty are frozen with each runtime catalog."""
import copy
import json
import math
import random
from pathlib import Path

from django.test import SimpleTestCase

from . import attributes
from .catalog import Catalog, bundled
from .catalog_validation import validate_tables
from .party_rules import experience, scaled_monster, spawn_enemies


class MonsterBalanceTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.catalog = bundled()[0]
        tables = copy.deepcopy(cls.catalog.tables)
        tables['rules'] = [row for row in tables['rules'] if not row['id'].startswith(
            ('monster_elite_hp_reduction', 'monster_boss_', 'party_monster_multiplier_'))]
        cls.previous = Catalog(tables, 'combat-1.0.33')

    def test_all_regions_apply_flat_reductions_at_each_supported_level(self):
        for template in self.catalog.tables['monsters']:
            for level in range(int(template['level_min']), int(template['level_max']) + 1):
                with self.subTest(monster=template['id'], level=level):
                    old = attributes.monster(self.previous, template, level)
                    expected = dict(old)
                    rank = template['rank']
                    expected['hp_max'] -= {'normal': 0, 'elite': 200, 'boss': 2000}[rank]
                    if rank == 'boss':
                        channel = f"{old['damage_type']}_attack"
                        expected[channel] -= 100
                    self.assertGreater(expected['hp_max'], 0)
                    self.assertEqual(attributes.monster(self.catalog, template, level), expected)

    def test_moss_boss_level_15_attack_is_43(self):
        template = self.catalog.row('monsters', 'monster.moss_king')
        self.assertEqual(attributes.monster(self.previous, template, 15)['physical_attack'], 143)
        self.assertEqual(attributes.monster(self.catalog, template, 15)['physical_attack'], 43)

    def test_reductions_never_create_zero_or_negative_hp_or_active_attack(self):
        template = self.catalog.row('monsters', 'monster.moss_king')
        stats = attributes.monster(self.catalog, template, 1)
        self.assertEqual((stats['hp_max'], stats['physical_attack'], stats['magic_attack']), (1, 1, 0))

    def test_party_difficulty_preserves_other_stats_and_reward_formula(self):
        template = self.catalog.row('monsters', 'monster.moss_king')
        stats = attributes.monster(self.catalog, template, 16)
        original = copy.deepcopy(stats)
        for count, multiplier in ((1, 1), (2, 1.1), (3, 1.3), (4, 1.5)):
            with self.subTest(count=count):
                expected = dict(stats)
                for key in ('hp_max', 'physical_attack', 'magic_attack', 'physical_defense', 'magic_defense'):
                    expected[key] = math.floor(stats[key] * multiplier)
                self.assertEqual(scaled_monster(self.catalog, stats, count), expected)
                self.assertEqual(experience(self.catalog, 16, 17, 'boss', count),
                                 experience(self.previous, 16, 17, 'boss', count))
        self.assertEqual(stats, original)

    def test_spawn_uses_rank_reduction_before_party_multiplier(self):
        dungeon = {**self.catalog.row('dungeons', 'dungeon.moss_cave'),
                   'boss_probability_cap': '1', 'boss_probability_step': '1',
                   'boss_level_min': '16', 'boss_level_max': '16'}
        for count, hp, attack in ((1, 1830, 55), (2, 2013, 60), (3, 2379, 71), (4, 2745, 82)):
            with self.subTest(count=count):
                players = {str(i): {'level': 17} for i in range(count)}
                state = {'nonboss_kills': 100}
                enemies = spawn_enemies(self.catalog, dungeon, players, state, random.Random(7), 'party', 1)
                bosses = [row for row in enemies.values() if row['rank'] == 'boss']
                self.assertEqual(len(bosses), 1)
                boss = bosses[0]
                self.assertEqual((boss['hp'], boss['stats']['hp_max'], boss['stats']['physical_attack']), (hp, hp, attack))
                self.assertTrue(state['boss_seen'])
                self.assertTrue(all(row['rank'] == 'normal' for row in list(enemies.values())[1:]))

    def test_old_catalog_retains_original_difficulty_for_future_waves(self):
        template = self.previous.row('monsters', 'monster.moss_king')
        base = attributes.monster(self.previous, template, 16)
        self.assertEqual(base['hp_max'], 3830)
        self.assertEqual(base['physical_attack'], 155)
        for count, multiplier in ((1, 1), (2, 1.5), (3, 2), (4, 2.5)):
            stats = scaled_monster(self.previous, base, count)
            self.assertEqual(stats['hp_max'], math.floor(3830 * multiplier))
            self.assertEqual(stats['physical_attack'], math.floor(155 * multiplier))

    def test_new_catalog_rejects_missing_balance_rules(self):
        with self.assertRaisesRegex(ValueError, 'Invalid monster reduction'):
            validate_tables(self.previous.tables, expected_player_skills=98,
                            expected_promotion_level=50, catalog_version=self.catalog.version)

    def test_local_monster_previews_match_runtime_catalog(self):
        path = Path(__file__).resolve().parents[3] / 'frontend_react/src/mocks/agentWorld/catalog.json'
        local = json.loads(path.read_text())['combat']
        self.assertEqual(local['version'], self.catalog.version)
        for row in local['monsterPreviews']:
            template = self.catalog.row('monsters', row['id'])
            expected = attributes.monster(self.catalog, template, row['level'])
            self.assertEqual(row['attributes']['hpMax'], expected['hp_max'])
            self.assertEqual(row['attributes']['physicalAttack'], expected['physical_attack'])
            self.assertEqual(row['attributes']['magicAttack'], expected['magic_attack'])
