"""Ranger basic skill keeps its critical identity on the runtime catalog."""
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


class RangerBalanceTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.catalog = bundled()[0]

    def unit(self, name, hp=100000):
        return engine.fighter({
            'hp_max': hp, 'mp_max': 10000, 'magic_attack': 100, 'physical_attack': 100,
            'magic_defense': 120, 'physical_defense': 120, 'accuracy': 1,
            'evasion': 0, 'critical': 0, 'critical_damage': 1.5, 'damage_type': 'physical',
        }, name, 10)

    def damage_of(self, skill_id, rank, name):
        player, target = self.unit('游侠'), self.unit('目标')
        _, spell = self.catalog.skill(skill_id, rank)
        events = effects.apply(self.catalog, player, target, spell, name, 1, FixedRandom())
        return sum(event.get('damage', 0) for event in events if event['kind'] == 'damage')

    def test_skill_keeps_id_and_learning_level_after_rename(self):
        row = self.catalog.row('skills', 'skill.player.007')
        self.assertEqual((row['name'], row['profession_id'], int(row['learn_level']), row['kind']),
                         ('弱点射击', 'job.ranger', 10, 'active'))

    def test_each_rank_trades_accuracy_for_critical(self):
        for rank, (damage, critical) in enumerate(((1.5, .10), (1.7, .15), (2.0, .20)), 1):
            with self.subTest(rank=rank):
                level, spell = self.catalog.skill('skill.player.007', rank)
                codes = [fx['code'] for fx in spell]
                self.assertNotIn('attack_accuracy', codes)
                self.assertEqual([float(fx['value']) for fx in spell if fx['code'] == 'damage'], [damage])
                self.assertEqual([float(fx['value']) for fx in spell if fx['code'] == 'attack_critical'], [critical])
                self.assertEqual(level['description'],
                                 f'{damage:g} 倍物攻，本技能暴击加成 {round(critical * 100)} 个百分点')

    def test_straight_damage_sits_between_heavy_slash_and_magic_bolt(self):
        for rank in (1, 2, 3):
            with self.subTest(rank=rank):
                shot = self.damage_of('skill.player.007', rank, '弱点射击')
                slash = self.damage_of('skill.player.001', rank, '重斩')
                _, shot_spell = self.catalog.skill('skill.player.007', rank)
                _, bolt_spell = self.catalog.skill('skill.player.004', rank)
                shot_multiplier = next(float(fx['value']) for fx in shot_spell if fx['code'] == 'damage')
                bolt_multiplier = next(float(fx['value']) for fx in bolt_spell if fx['code'] == 'damage')
                # 同属性下实际伤害高于重斩；跨职业比倍率，不比较两条属性线下的绝对伤害。
                self.assertGreater(shot, slash)
                self.assertLess(shot_multiplier, bolt_multiplier)

    def test_critical_multiplier_reaches_past_magic_bolt(self):
        base = float(self.catalog.row('rules', 'critical_damage_base')['value'])
        for rank in (1, 2, 3):
            with self.subTest(rank=rank):
                _, shot = self.catalog.skill('skill.player.007', rank)
                _, bolt = self.catalog.skill('skill.player.004', rank)
                shot_multiplier = next(float(fx['value']) for fx in shot if fx['code'] == 'damage')
                bolt_multiplier = next(float(fx['value']) for fx in bolt if fx['code'] == 'damage')
                self.assertGreater(shot_multiplier, bolt_multiplier / base)

    def test_critical_bonus_stays_inside_the_global_cap(self):
        cap = float(self.catalog.row('rules', 'critical_cap')['value'])
        for rank in (1, 2, 3):
            with self.subTest(rank=rank):
                _, spell = self.catalog.skill('skill.player.007', rank)
                bonus = next(float(fx['value']) for fx in spell if fx['code'] == 'attack_critical')
                self.assertGreater(bonus, 0)
                self.assertLessEqual(bonus, cap)
