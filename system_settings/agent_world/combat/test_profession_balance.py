"""Non-elementalist profession buffs in combat-1.0.40 keep elementalist skills untouched."""
import json
import random
from decimal import Decimal
from pathlib import Path
import unittest

from . import attributes, bard_combat, effects, engine
from .catalog import bundled
from .catalog_validation import validate
from ..tournament_strategy import DuelCatalog, action as duel_action


class FixedRandom(random.Random):
    def random(self):
        return 0.1

    def uniform(self, low, high):
        return 1.0

    def choices(self, population, weights=None, **kwargs):
        return [population[0]]


class ProfessionBalanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog, _ = bundled()

    def fighter(self, name='角色', *, level=50, hp=5000, mp=5000, patk=400, matk=400,
                pdef=100, mdef=100, healing=300, skills=None, passives=None, damage_type='physical'):
        stats = {
            'hp_max': hp, 'mp_max': mp, 'physical_attack': patk, 'magic_attack': matk,
            'physical_defense': pdef, 'magic_defense': mdef, 'healing': healing,
            'accuracy': 1.0, 'evasion': 0.0, 'critical': 0.0, 'critical_damage': 1.5,
            'damage_type': damage_type, 'dexterity': 10,
        }
        unit = engine.fighter(stats, name, level, skills=skills or {}, passives=passives or [])
        unit['id'] = name
        return unit

    def test_catalog_validates_as_1_0_40_and_matches_local_catalog(self):
        validate()
        self.assertEqual(self.catalog.version, 'combat-1.0.40')
        path = Path(__file__).resolve().parents[3] / 'frontend_react/src/mocks/agentWorld/catalog.json'
        local = json.loads(path.read_text(encoding='utf-8'))['combat']
        self.assertEqual(local['version'], 'combat-1.0.40')
        self.assertEqual(len(local['tables']['skillEffects']), len(self.catalog.tables['skill_effects']))

    def test_elementalist_and_mage_line_skills_are_untouched(self):
        expected = {
            'skill.player.004': {1: ('2.2',), 2: ('2.5',), 3: ('2.8',)},
            'skill.player.005': {1: ('0.1', '0.3'), 2: ('0.15', '0.4'), 3: ('0.2', '0.5')},
            'skill.player.006': {1: ('0.02',), 2: ('0.03',), 3: ('0.05',)},
            'skill.player.017': {1: ('2.4', '0.2'), 2: ('2.7', '0.22'), 3: ('3.0', '0.24')},
            'skill.player.018': {1: ('0.05', '0.025', '0.025'), 2: ('0.075', '0.0375', '0.0375'), 3: ('0.15', '0.075', '0.075')},
            'skill.player.037': {1: ('3.2', '0.25'), 2: ('3.6', '0.275'), 3: ('4.0', '0.3')},
            'skill.player.039': {1: ('0.9', '-0.2'), 2: ('1.0', '-0.22'), 3: ('1.1', '-0.24')},
            'skill.player.069': {1: ('0.1', '0.05'), 2: ('0.15', '0.075'), 3: ('0.2', '0.1')},
        }
        for sid, ranks in expected.items():
            for rank, values in ranks.items():
                _, fx = self.catalog.skill(sid, rank)
                actual = tuple(str(Decimal(row['value']).normalize()) for row in fx)
                norm_expected = tuple(str(Decimal(v).normalize()) for v in values)
                with self.subTest(skill=sid, rank=rank):
                    self.assertEqual(actual, norm_expected)

    def test_guardian_fortitude_adds_magic_defense_and_elemental_resist_and_shield_bash_lasts_two_rounds(self):
        progress = attributes.initial()
        progress.update(job='job.guardian', level=50, skills={'skill.player.016': 3})
        base_progress = {**progress, 'skills': {}}
        base_stats = attributes.attributes(self.catalog, base_progress, [])
        buffed_stats = attributes.attributes(self.catalog, progress, [])
        self.assertGreater(buffed_stats['magic_defense'], base_stats['magic_defense'])
        self.assertEqual((buffed_stats['fire_resist'], buffed_stats['water_resist']), (0.12, 0.12))

        guard = self.fighter('守卫', level=50)
        foe = self.fighter('元素师', level=50)
        _, bash = self.catalog.skill('skill.player.015', 3)
        effects.apply(self.catalog, guard, foe, bash, '盾击', 1, FixedRandom())
        debuff = next(s for s in foe['states'] if s['group'] == 'attack')
        self.assertEqual((debuff['value'], debuff['expires']), (-0.28, 3))

    def test_occultist_weaken_deals_dark_damage_and_reduces_attack_and_defense(self):
        occ = self.fighter('秘术师', level=50, matk=500, damage_type='magic')
        foe = self.fighter('目标', level=50, mdef=100)
        _, spell = self.catalog.skill('skill.player.019', 3)
        events = effects.apply(self.catalog, occ, foe, spell, '虚弱咒', 1, FixedRandom())
        dmg = next(e for e in events if e['kind'] == 'damage')
        self.assertGreater(dmg['damage'], 0)
        self.assertEqual({s['stat']: s['value'] for s in foe['states']}, {'attack': -0.32, 'defense': -0.18})

    def test_naturalist_thorns_reflects_with_own_action_name_and_grants_elemental_resist(self):
        nat = self.fighter('自然使', level=50, matk=500, damage_type='magic')
        foe = self.fighter('元素师', level=50, matk=600, mdef=100, damage_type='magic')
        _, thorns = self.catalog.skill('skill.player.027', 3)
        effects.apply(self.catalog, nat, foe, thorns, '荆棘术', 1, FixedRandom())
        incoming = [{'code': 'damage', 'stat': 'magic_attack', 'value': 2.0, 'hits': 1, 'damage_type': 'magic'}]
        events = effects.apply(self.catalog, foe, nat, incoming, '魔力弹', 2, FixedRandom())
        reflected = [e for e in events if e.get('action') == '荆棘术·反伤']
        self.assertEqual(len(reflected), 1)
        self.assertGreater(reflected[0]['damage'], 0)

    def test_musician_tranquil_melody_heals_allies_and_is_suppressed_in_overtime(self):
        bard = self.fighter('乐师', level=50, hp=2000, skills={'skill.player.082': 3}, damage_type='magic')
        bard['hp'] = 1000
        foe = self.fighter('敌人', level=50)
        events = bard_combat.cast(self.catalog, bard, foe, {'乐师': bard}, {'敌人': foe},
                                  'skill.player.082', 3, 1, FixedRandom())
        heals = [e for e in events if e['kind'] == 'heal']
        self.assertEqual(len(heals), 1)
        self.assertEqual(heals[0]['healing'], 600)
        self.assertEqual(bard['hp'], 1600)

        # In tournament overtime, DuelCatalog strips heal effects while keeping damage reduction.
        bard['hp'] = 1000
        bard['cooldowns'].clear()
        overtime_catalog = DuelCatalog(self.catalog, overtime=True)
        ot_events = bard_combat.cast(overtime_catalog, bard, foe, {'乐师': bard}, {'敌人': foe},
                                     'skill.player.082', 3, 2, FixedRandom())
        self.assertFalse([e for e in ot_events if e['kind'] == 'heal'])
        self.assertEqual(bard['hp'], 1000)

    def test_summoner_duel_catalog_exposes_version_for_spirit_pact(self):
        summoner = self.fighter('召唤师', level=65, matk=800, skills={'skill.player.043': 2}, damage_type='magic')
        foe = self.fighter('对手', level=65)
        dcat = DuelCatalog(self.catalog, overtime=False)
        self.assertEqual(dcat.version, self.catalog.version)
        events = duel_action(dcat, summoner, foe, 1, FixedRandom())
        self.assertTrue(any(e['kind'] == 'damage' for e in events))

    def test_archer_bow_mastery_scales_bow_weapon_attack_only_and_keeps_ranger_bow_permission(self):
        from . import equipment
        self.assertEqual(self.catalog.learned('job.archer', 29).get('skill.player.099'), None)
        self.assertEqual(self.catalog.learned('job.archer', 30).get('skill.player.099'), 1)
        self.assertEqual(self.catalog.learned('job.archer', 40).get('skill.player.099'), 2)
        self.assertEqual(self.catalog.learned('job.archer', 50).get('skill.player.099'), 3)
        self.assertEqual(self.catalog.learned('job.sharpshooter', 50).get('skill.player.099'), 3)
        self.assertEqual(self.catalog.learned('job.hunter', 50).get('skill.player.099'), 3)
        # Ordinary bows stay usable by level-10 rangers without mastery gate.
        self.assertTrue(equipment.allowed(self.catalog, 'equip.bow', 'job.ranger', 10, 10))

        base_progress = attributes.initial()
        base_progress.update(job='job.archer', level=50, skills={})
        mastery_progress = {**base_progress, 'skills': {'skill.player.099': 3}}
        bow = [{'slot': 'weapon', 'equipment_type': 'bow', 'stats': {'physical_attack': 200}}]
        dagger = [{'slot': 'weapon', 'equipment_type': 'dagger', 'stats': {'physical_attack': 200}}]
        self.assertEqual(
            attributes.attributes(self.catalog, mastery_progress, bow)['physical_attack'] -
            attributes.attributes(self.catalog, base_progress, bow)['physical_attack'],
            40,
        )
        self.assertEqual(
            attributes.attributes(self.catalog, mastery_progress, dagger)['physical_attack'],
            attributes.attributes(self.catalog, base_progress, dagger)['physical_attack'],
        )


if __name__ == '__main__':
    unittest.main()
