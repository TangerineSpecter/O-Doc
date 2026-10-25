"""Unyielding changes tiers before each hit; frozen low-HP passives keep old behavior."""
from django.test import SimpleTestCase
from . import attributes, effects, engine, party_engine
from .catalog import bundled
from .test_lifesteal import FixedRandom


class DefianceTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.catalog = bundled()[0]

    def unit(self, hp=1000, rank=3):
        stats = {'hp_max': 1000, 'mp_max': 1000, 'physical_attack': 100, 'magic_attack': 100,
                 'physical_defense': 0, 'magic_defense': 0, 'accuracy': 1, 'evasion': 0,
                 'critical': 0, 'critical_damage': 1.5, 'damage_type': 'physical'}
        return engine.fighter(stats, '狂战士', 80, hp=hp,
                              passives=attributes.passives(self.catalog, {'skill.player.036': rank}))

    def test_exact_thresholds_and_all_ranks(self):
        for rank, base in ((1, .05), (2, .075), (3, .1)):
            for hp, factor in ((1000, 0), (501, 0), (500, 0), (499, 1), (301, 1),
                               (300, 1), (299, 2), (101, 2), (100, 2), (99, 4), (1, 4)):
                with self.subTest(rank=rank, hp=hp):
                    self.assertAlmostEqual(effects.reduction(self.unit(hp, rank)), base*factor)
        unit = self.unit(50)
        unit['stats']['hp_max'] = 101
        self.assertEqual(effects.reduction(unit), .1)

    def test_damage_is_recomputed_for_each_hit_not_retroactively(self):
        attacker, target = self.unit(), self.unit(310)
        log = effects.apply(self.catalog, attacker, target, [{
            'code': 'damage', 'stat': 'physical_attack', 'value': 1, 'hits': 4, 'damage_type': 'physical',
        }], '连击', 1, FixedRandom())
        self.assertEqual([event['damage'] for event in log], [90, 80, 80, 60])
        self.assertEqual(target['hp'], 0)

    def test_tiers_reduce_both_channels_and_keep_total_cap(self):
        target = self.unit(99)
        for kind in ('physical', 'magic'):
            self.assertEqual(effects.damage(100, kind, 80, target), 60)
        target['defending'] = True
        target['states'] = [{'code': 'modifier', 'stat': 'reduction', 'value': .3, 'group': 'party_reduction'}]
        self.assertEqual(effects.reduction(target), .6)
        self.assertEqual(effects.damage(100, 'physical', 80, target), 40)

    def test_healing_lowers_tier_on_next_hit(self):
        target = self.unit(80)
        target['passives'] += attributes.passives(self.catalog, {'skill.player.073': 3},
                                                  [{'slot': 'weapon', 'equipment_type': 'two_handed_sword'}])
        self.assertEqual(effects.reduction(target), .4)
        effects._lifesteal(self.catalog, target, 1500)
        self.assertEqual(target['hp'], 380)
        self.assertEqual(effects.reduction(target), .1)
        target['hp'] = 500
        self.assertEqual(effects.reduction(target), 0)

    def test_frozen_old_passive_keeps_thirty_percent_threshold(self):
        for hp, expected in ((499, 0), (300, 0), (299, .1), (99, .1)):
            target = self.unit(hp)
            target['passives'] = [{'code': 'passive_low_hp', 'value': .1}]
            self.assertEqual(effects.reduction(target), expected)

    def test_dot_and_shared_round_follow_same_damage_rule(self):
        target = self.unit(99)
        target['states'] = [{'code': 'dot', 'group': 'poison', 'raw': 100, 'remaining': 1,
                             'next_tick': 1, 'source_level': 80, 'damage_type': 'magic', 'name': '毒'}]
        log = []
        effects.upkeep(target, 1, log, catalog=self.catalog, rng=FixedRandom())
        self.assertEqual((log[0]['damage'], target['hp']), (60, 39))
        player, enemy = self.unit(99), self.unit()
        player.update(id='狂战士', potions={}, elixirs=[], style_id='style.balanced')
        enemy.update(id='怪', template_id='monster.slime', potions={}, elixirs=[], style_id='style.balanced')
        player['stats']['dexterity'] = 1
        enemy['stats']['dexterity'] = 10
        from unittest.mock import patch
        with patch.object(engine, 'enemy_action', side_effect=lambda c, e, p, *args: engine.attack(c, e, p, 1, FixedRandom())):
            after, events = party_engine.step(self.catalog, {'players': {'狂战士': player},
                                                            'enemies': {'怪': enemy}, 'round': 0}, FixedRandom())
        incoming = next(e for e in events if e.get('actor_id') == '怪' and e['kind'] == 'damage')
        self.assertEqual(incoming['damage'], 60)
        self.assertEqual(after['players']['狂战士']['hp'], 39)
