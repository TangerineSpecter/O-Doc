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

    def test_barrier_replaces_shield_with_reduction_and_mana_share(self):
        for rank, reduction, share in ((1, .1, .3), (2, .15, .4), (3, .2, .5)):
            with self.subTest(rank=rank):
                _, spell = self.catalog.skill('skill.player.005', rank)
                self.assertNotIn('shield', [fx['code'] for fx in spell])
                modifier = next(fx for fx in spell if fx['code'] == 'modifier')
                self.assertEqual((modifier['stat'], float(modifier['value']), int(modifier['duration'])),
                                 ('reduction', reduction, 3))
                mana = next(fx for fx in spell if fx['code'] == 'mp_share')
                self.assertEqual((float(mana['value']), int(mana['duration']), mana['target']), (share, 3, 'self'))

    def test_barrier_settles_hp_and_mana_after_mitigation(self):
        mage = engine.fighter({'hp_max': 1000, 'mp_max': 1000, 'magic_attack': 100, 'accuracy': 1,
                               'magic_defense': 0, 'physical_defense': 0}, '法师', 10)
        monster = engine.fighter({'hp_max': 1000, 'mp_max': 0}, '目标', 10)
        _, spell = self.catalog.skill('skill.player.005', 3)
        events = effects.apply(self.catalog, mage, monster, spell, '魔法屏障', 1, FixedRandom())
        self.assertEqual([e['kind'] for e in events], ['modifier', 'mp_share'])
        self.assertEqual([s['expires'] for s in mage['states']], [4, 4])
        self.assertEqual(effects.damage(100, 'magic', 10, mage, variation=1), 80)
        taken, absorbed, _, paid = effects.hurt(mage, 80)
        self.assertEqual((taken, absorbed, paid, mage['hp'], mage['mp']), (40, 0, 40, 960, 960))

        mage['mp'] = 15
        taken, absorbed, _, paid = effects.hurt(mage, 80)
        self.assertEqual((taken, absorbed, paid, mage['hp'], mage['mp']), (65, 0, 15, 895, 0))

        mage['mp'] = 1000
        mage['states'].append({'code': 'dot', 'group': 'burn', 'name': '灼烧', 'raw': 100.0, 'remaining': 1,
                               'next_tick': 2, 'source_level': 10, 'damage_type': 'magic'})
        ticks = []
        effects.upkeep(mage, 2, ticks)
        dot = next(e for e in ticks if e['kind'] == 'dot')
        self.assertEqual((dot['damage'], dot['mp_paid'], mage['mp']), (40, 40, 960))

    def test_barrier_stops_after_three_rounds_and_is_not_recast_while_active(self):
        mage = engine.fighter({'hp_max': 1000, 'mp_max': 1000, 'magic_attack': 100, 'accuracy': 1},
                              '法师', 10, skills={'skill.player.005': 3})
        monster = engine.fighter({'hp_max': 1000, 'mp_max': 0}, '目标', 10)
        _, spell = self.catalog.skill('skill.player.005', 3)
        effects.apply(self.catalog, mage, monster, spell, '魔法屏障', 1, FixedRandom())
        style = self.catalog.row('styles', 'style.balanced')
        self.assertFalse([s for s in engine.available(self.catalog, mage, monster, 2, style)
                          if s[0] == 'skill.player.005'])
        effects.expire(mage, 4)
        self.assertEqual(mage['states'], [])
        self.assertEqual(effects.hurt(mage, 80)[3], 0)

    def test_local_catalog_matches_runtime_skill_effects(self):
        root = Path(__file__).resolve().parents[3]
        local = json.loads((root/'frontend_react/src/mocks/agentWorld/catalog.json').read_text())['combat']
        self.assertEqual(local['version'], self.catalog.version)
        expected = [{'skillLevelId' if key == 'skill_level_id' else 'damageType' if key == 'damage_type' else key: value
                     for key, value in row.items()} for row in self.catalog.tables['skill_effects']]
        self.assertEqual(local['tables']['skillEffects'], expected)
