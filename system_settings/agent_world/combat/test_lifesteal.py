"""Weapon-gated sustain uses actual HP damage, with no recursive or post-death healing."""
import copy
from unittest.mock import patch
from django.test import SimpleTestCase
from . import attributes, effects, engine, equipment, party_engine
from .catalog import Catalog, bundled


class FixedRandom:
    roll = .5

    def random(self):
        return self.roll

    def uniform(self, low, high):
        return 1

    def shuffle(self, values):
        pass

    def choices(self, population, weights):
        return [population[0]]


class LifestealTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.catalog = bundled()[0]

    def unit(self, name, hp=100, rank=3, weapon=True):
        wearing = [{'slot': 'weapon', 'equipment_type': 'two_handed_sword', 'stats': {}}] if weapon else []
        passive = attributes.passives(self.catalog, {'skill.player.073': rank}, wearing)
        unit = engine.fighter({'hp_max': 1000, 'mp_max': 1000, 'physical_attack': 100,
                               'magic_attack': 100, 'physical_defense': 0, 'magic_defense': 0,
                               'accuracy': 1, 'evasion': 0, 'critical': 0, 'critical_damage': 2,
                               'damage_type': 'physical', 'dexterity': 10}, name, 50, hp=hp, passives=passive)
        unit.update(id=name, potions={}, elixirs=[], style_id='style.balanced')
        return unit

    def attack(self, player, target, spell=None):
        if spell is None:
            return engine.attack(self.catalog, player, target, 1, FixedRandom())
        return effects.apply(self.catalog, player, target, spell, '攻击', 1, FixedRandom())

    def test_matching_weapon_slot_is_required(self):
        for equipped in ([], [{'slot': 'weapon', 'equipment_type': 'axe'}],
                         [{'slot': 'offhand', 'equipment_type': 'two_handed_sword'}]):
            self.assertEqual(attributes.passives(self.catalog, {'skill.player.073': 3}, equipped), [])
        self.assertEqual(self.unit('狂战士')['passives'][0]['code'], 'passive_lifesteal')
        player = self.unit('狂战士', weapon=False)
        self.attack(player, self.unit('怪', hp=1000))
        self.assertEqual(player['hp'], 100)

    def test_all_ranks_heal_and_target_self_in_event(self):
        for rank, amount in ((1, 10), (2, 15), (3, 20)):
            player = self.unit('狂战士', rank=rank)
            log = self.attack(player, self.unit('怪', hp=1000))
            self.assertEqual(player['hp'], 100+amount)
            self.assertEqual(log[-1], {'actor': '狂战士', 'target': '狂战士', 'actor_id': '狂战士',
                                      'target_id': '狂战士', 'kind': 'heal', 'healing': amount,
                                      'action': '嗜血剑术·吸血'})

    def test_overkill_shields_and_defense_only_credit_actual_hp_damage(self):
        player, target = self.unit('狂战士'), self.unit('怪', hp=15)
        target['states'] = [{'code': 'shield', 'group': 'shield', 'remaining': 90, 'expires': 3}]
        log = self.attack(player, target)
        self.assertEqual((log[0]['absorbed'], log[0]['damage'], player['hp']), (90, 10, 102))
        player, target = self.unit('狂战士'), self.unit('怪', hp=15)
        self.attack(player, target)
        self.assertEqual(player['hp'], 103)
        player, target = self.unit('狂战士'), self.unit('怪', hp=1000)
        target['stats']['physical_defense'] = 360
        self.attack(player, target)
        self.assertEqual(player['hp'], 110)

    def test_miss_full_shield_full_hp_and_rounding_do_not_emit_heal(self):
        for case in ('miss', 'shield', 'full', 'rounding'):
            player, target = self.unit('狂战士'), self.unit('怪', hp=1000)
            if case == 'miss': player['stats']['accuracy'] = 0
            if case == 'shield': target['states'] = [{'code': 'shield', 'group': 'shield', 'remaining': 100, 'expires': 3}]
            if case == 'full': player['hp'] = 1000
            if case == 'rounding': target['hp'] = 1
            before = player['hp']
            log = self.attack(player, target)
            self.assertEqual(player['hp'], before)
            self.assertFalse(any(e['kind'] == 'heal' for e in log))
        player = self.unit('狂战士', hp=997)
        self.assertEqual(self.attack(player, self.unit('怪', hp=1000))[-1]['healing'], 3)
        self.assertEqual(player['hp'], 1000)

    def test_critical_damage_and_berserker_missing_hp_bonus_feed_lifesteal(self):
        player = self.unit('狂战士')
        player['stats']['critical'] = .6
        log = self.attack(player, self.unit('怪', hp=1000))
        self.assertEqual((log[0]['damage'], log[-1]['healing']), (200, 40))
        player = self.unit('狂战士')
        _, spell = self.catalog.skill('skill.player.035', 1)
        log = self.attack(player, self.unit('怪', hp=1000), spell)
        self.assertEqual(log[-1]['healing'], log[0]['damage']//5)
        self.assertGreater(log[0]['damage'], 160)

    def test_multi_hit_heals_once_after_missing_hp_damage_is_resolved(self):
        player = self.unit('狂战士')
        spell = [{'code': 'damage', 'stat': 'physical_attack', 'value': 1, 'hits': 2, 'damage_type': 'physical'},
                 {'code': 'missing_hp_damage', 'value': 1}]
        log = self.attack(player, self.unit('怪', hp=1000), spell)
        self.assertEqual([e['damage'] for e in log if e['kind'] == 'damage'], [190, 190])
        self.assertEqual([e['healing'] for e in log if e['kind'] == 'heal'], [76])

    def test_magic_dot_summon_and_reflection_do_not_leech(self):
        for code in ('damage', 'dot', 'summon'):
            player, target = self.unit('狂战士'), self.unit('怪', hp=1000)
            spell = [{'code': code, 'stat': 'magic_attack' if code == 'damage' else 'physical_attack',
                      'value': 1, 'hits': 1, 'damage_type': 'magic' if code == 'damage' else 'physical',
                      'target': 'enemy', 'group': 'poison' if code == 'dot' else 'contract', 'duration': 2, 'chance': 1}]
            self.attack(player, target, spell)
            if code == 'dot': effects.upkeep(target, 1, [], opponent=player, catalog=self.catalog, rng=FixedRandom())
            self.assertEqual(player['hp'], 100)
        attacker, bearer = self.unit('攻击方'), self.unit('反伤方')
        bearer['states'] = [{'code': 'reflect', 'value': .5, 'expires': 3}]
        effects._reflect_damage(self.catalog, bearer, attacker, {'physical': 100}, 1, FixedRandom())
        self.assertEqual(bearer['hp'], 100)

    def test_no_resurrection_and_heal_precedes_reflect(self):
        player, target = self.unit('狂战士', hp=10), self.unit('怪', hp=1000)
        target['states'] = [{'code': 'reflect', 'value': .2, 'expires': 3}]
        log = self.attack(player, target)
        self.assertEqual(player['hp'], 10)
        self.assertEqual([e['kind'] for e in log], ['damage', 'heal', 'damage'])
        player['hp'] = 0
        self.assertEqual(effects._lifesteal(self.catalog, player, 1000), [])

    def test_party_round_keeps_healing_on_attacker(self):
        player, target = self.unit('狂战士'), self.unit('怪', hp=1000, weapon=False)
        player['stats']['dexterity'] = 20
        state = {'players': {player['id']: player}, 'enemies': {target['id']: target}, 'round': 0}
        target['template_id'] = 'monster.slime'
        with patch.object(engine, 'enemy_action', return_value=[]):
            after, log = party_engine.step(self.catalog, state, FixedRandom())
        healed = next(e for e in log if e['kind'] == 'heal')
        self.assertEqual((healed['actor_id'], healed['target_id'], after['players'][player['id']]['hp']),
                         ('狂战士', '狂战士', 120))
        self.assertEqual(state['players'][player['id']]['hp'], 100)

    def test_inherited_mastery_permission_and_old_catalog_remain_intact(self):
        learned = self.catalog.learned('job.berserker', 70)
        self.assertEqual(learned['skill.player.072'], 3)
        self.assertEqual(learned['skill.player.073'], 3)
        self.assertTrue(equipment.allowed(self.catalog, 'equip.two_handed_sword', 'job.berserker', 70, 50))
        wearing = [{'slot': 'weapon', 'equipment_type': 'two_handed_sword', 'stats': {}}]
        passive = attributes.passives(self.catalog, learned, wearing)
        self.assertEqual(sum(float(e['value']) for e in passive if e['code'] == 'passive_percent' and e['stat'] == 'weapon_attack' and e['skill_level_id'].startswith('skill.player.072.')), .2)
        tables = copy.deepcopy(self.catalog.tables)
        for row in tables['skill_effects']:
            if row['skill_level_id'].startswith('skill.player.073.'):
                row.update(code='passive_equipment_percent', stat='weapon_attack')
        old = Catalog(tables, 'combat-1.0.23')
        old_effects = attributes.passives(old, {'skill.player.073': 3}, wearing)
        self.assertEqual(old_effects[0]['code'], 'passive_percent')
        player = self.unit('旧狂战士'); player['passives'] = old_effects
        self.assertFalse(any(e['kind'] == 'heal' for e in engine.attack(old, player, self.unit('怪', hp=1000), 1, FixedRandom())))
