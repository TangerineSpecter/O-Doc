"""Mage burst uses the runtime catalog and the real damage/HP settlement path."""
import copy
import json
from pathlib import Path
from django.test import SimpleTestCase
from . import effects, engine
from .catalog import bundled


class FixedRandom:
    def __init__(self, variant=0):
        self.variant = variant

    def random(self):
        return .1

    def uniform(self, low, high):
        return 1

    def choices(self, population, weights):
        if isinstance(population[0], dict):
            return [population[self.variant]]
        return ['skill'] if 'skill' in population else [population[0]]


class MageBalanceTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.catalog = bundled()[0]

    def unit(self, name, hp=100000):
        return engine.fighter({
            'hp_max': hp, 'mp_max': 10000, 'magic_attack': 100, 'physical_attack': 100,
            'magic_defense': 120, 'physical_defense': 120, 'accuracy': 1,
            'evasion': 0, 'critical': 0, 'critical_damage': 1.5, 'damage_type': 'magic',
        }, name, 10)

    def test_magic_bolt_exceeds_double_normal_attack_at_every_rank(self):
        for rank in (1, 2, 3):
            with self.subTest(rank=rank):
                player, target = self.unit('法师'), self.unit('目标')
                normal = engine.attack(self.catalog, player, copy.deepcopy(target), 1, FixedRandom())[0]['damage']
                _, spell = self.catalog.skill('skill.player.004', rank)
                actual = effects.apply(self.catalog, player, target, spell, '魔力弹', 1, FixedRandom())[0]['damage']
                self.assertGreater(actual, 2 * normal)
                _, warrior = self.catalog.skill('skill.player.001', rank)
                warrior_damage = effects.apply(self.catalog, player, self.unit('目标'), warrior, '重斩', 1, FixedRandom())[0]['damage']
                self.assertGreater(actual, warrior_damage)

    def test_advanced_burst_and_each_summon_variant_exceed_double_attack(self):
        for sid in ('017', '037', '039', '043'):
            for rank in (1, 2, 3):
                for variant in (range(3) if sid == '043' else (0,)):
                    with self.subTest(skill=sid, rank=rank, variant=variant):
                        player, target = self.unit('法师'), self.unit('目标')
                        normal = engine.attack(self.catalog, player, copy.deepcopy(target), 1, FixedRandom())[0]['damage']
                        _, spell = self.catalog.skill(f'skill.player.{sid}', rank)
                        events = effects.apply(self.catalog, player, target, spell, '法术', 1, FixedRandom(variant))
                        self.assertGreater(sum(e.get('damage', 0) for e in events if e['kind'] == 'damage'), 2 * normal)

    def test_decay_delivers_more_than_double_attack_over_three_ticks(self):
        for rank in (1, 2, 3):
            player, target = self.unit('法师'), self.unit('目标')
            normal = engine.attack(self.catalog, player, copy.deepcopy(target), 1, FixedRandom())[0]['damage']
            _, spell = self.catalog.skill('skill.player.041', rank)
            effects.apply(self.catalog, player, target, spell, '衰败咒', 1, FixedRandom())
            events = []
            for tick in (2, 3, 4):
                effects.upkeep(target, tick, events, opponent=player, catalog=self.catalog, rng=FixedRandom())
            self.assertEqual(len([e for e in events if e['kind'] == 'dot']), 3)
            self.assertGreater(sum(e.get('damage', 0) for e in events), 2 * normal)

    def test_skill_action_spends_mana_and_sets_existing_cooldown(self):
        player, target = self.unit('法师'), self.unit('目标')
        player['skills'] = {'skill.player.004': 1}
        before = player['mp']
        row, _ = self.catalog.skill('skill.player.004', 1)
        events = engine.player_action(self.catalog, player, target, {}, 7,
                                      self.catalog.row('styles', 'style.balanced'), FixedRandom())
        self.assertEqual(events[0]['action'], '魔力弹')
        self.assertEqual(events[0]['damage'], 110)
        self.assertEqual(before-player['mp'], engine.cost(self.catalog, player, 'skill.player.004', 1))
        self.assertEqual(player['cooldowns']['skill.player.004'], 7+int(row['cooldown_rounds']))

    def test_report_damage_stays_capped_by_remaining_hp(self):
        player, target = self.unit('法师'), self.unit('目标', hp=75)
        _, spell = self.catalog.skill('skill.player.004', 1)
        events = effects.apply(self.catalog, player, target, spell, '魔力弹', 1, FixedRandom())
        self.assertEqual((events[0]['damage'], target['hp']), (75, 0))

    def test_local_catalog_matches_runtime_skill_effects(self):
        root = Path(__file__).resolve().parents[3]
        local = json.loads((root/'frontend_react/src/mocks/agentWorld/catalog.json').read_text())['combat']
        self.assertEqual(local['version'], self.catalog.version)
        expected = [{'skillLevelId' if key == 'skill_level_id' else 'damageType' if key == 'damage_type' else key: value
                     for key, value in row.items()} for row in self.catalog.tables['skill_effects']]
        self.assertEqual(local['tables']['skillEffects'], expected)
