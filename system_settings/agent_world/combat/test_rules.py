import copy
import random
from django.test import SimpleTestCase
from .catalog import bundled
from . import attributes, equipment, engine, effects, rewards


class RuleTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass();cls.catalog=bundled()[0]

    def test_complete_catalog_and_every_active_skill_executes(self):
        from pathlib import Path
        from .catalog_validation import validate
        with self.assertRaises(ValueError):validate(Path(__file__).resolve().parents[3]/'docs/data/combat')
        c=self.catalog
        self.assertEqual((len(c.tables['dungeons']),len(c.tables['monsters']),len(c.tables['professions'])),(7,28,36))
        self.assertEqual(sum(r['kind']!='monster' for r in c.tables['skills']),98)
        for row in c.tables['skills']:
            for rank in c.ranks[row['id']]:
                progress=attributes.initial();progress['skills']={row['id']:int(rank['rank'])};progress['level']=99
                stats=attributes.attributes(c,progress,[])
                a=engine.fighter(stats,'A',99,hp=stats['hp_max']//2,passives=attributes.passives(c,progress['skills']))
                b=engine.fighter(stats,'B',99)
                with self.subTest(skill=row['id'],rank=rank['rank']):
                    result=effects.apply(c,a,b,c.skill(row['id'],int(rank['rank']))[1],row['name'],1,random.Random(17))
                    effects.upkeep(a,2,result);effects.upkeep(b,2,result)
                    self.assertGreaterEqual(a['hp'],0);self.assertGreaterEqual(b['hp'],0)

    def test_repeatability_pure_inputs_and_gear_no_duplicate_affix(self):
        c=self.catalog;p=attributes.initial();g=equipment.generate(c,'equip.training_sword',1,'gold',random.Random(1))
        self.assertEqual(len({r['id'] for r in g['affixes']}),3)
        state={'player':engine.fighter(attributes.attributes(c,p,[g]),'A',1),'enemy':engine.fighter(attributes.monster(c,c.row('monsters','monster.slime'),1),'B',1),'potions':{},'monster_id':'monster.slime'}
        original=copy.deepcopy(state)
        self.assertEqual(engine.step(c,state,'style.balanced',1,random.Random(1)),engine.step(c,state,'style.balanced',1,random.Random(1)))
        self.assertEqual(state,original)
        self.assertEqual(attributes.attributes(c,p,[g]),attributes.attributes(c,p,[g]))

    def test_recovery_passives_restore_empty_mana_and_do_not_revive(self):
        c = self.catalog
        for sid, expected_hp, expected_mp in (('skill.player.006', 50, 5), ('skill.player.074', 53, 3)):
            with self.subTest(skill=sid):
                player = engine.fighter({'hp_max': 100, 'mp_max': 100}, 'A', 40, hp=50, mp=0,
                                        passives=attributes.passives(c, {sid: 3}))
                events = engine.recover_passives(c, player)
                self.assertEqual((player['hp'], player['mp']), (expected_hp, expected_mp))
                self.assertEqual(sum(row.get('restored', 0) for row in events), expected_mp)
                player.update(hp=99, mp=99)
                engine.recover_passives(c, player)
                self.assertEqual(player['mp'], 100)
                self.assertEqual(player['hp'], 100 if sid == 'skill.player.074' else 99)
                player.update(hp=0, mp=0)
                self.assertEqual(engine.recover_passives(c, player), [])
                self.assertEqual((player['hp'], player['mp']), (0, 0))

    def test_growth_boundaries_and_no_retroactive_job_growth(self):
        c=self.catalog;p=attributes.initial()
        for target in (10,30,70,99):
            while p['level']<target:
                xp=int(c.row('level_experience',f'level.{p["level"]}')['experience_to_next'])
                p,history=attributes.award(c,p,xp)
                self.assertEqual(len(history),1)
            options=[r for r in c.tables['professions'] if r['parent_id']==p['job'] and int(r['required_level'])<=target]
            if options:
                prior=copy.deepcopy(p);p=attributes.promote(c,p,options[0]['id'])
                self.assertEqual((p['stats'],p['fixed_hp'],p['fixed_mp']),(prior['stats'],prior['fixed_hp'],prior['fixed_mp']))
        self.assertEqual(attributes.award(c,p,100000)[0],p)
        for job in c.tables['professions']:
            if job['parent_id']:
                p=attributes.initial();p.update(job=job['parent_id'],level=int(job['required_level']))
                self.assertEqual(attributes.promote(c,p,job['id'])['skills'],c.learned(job['id'],p['level']))

    def test_allowances_cross_runs_and_cap(self):
        progress={}
        rewards.accrue(progress,1790,'2026-10-10');rewards.accrue(progress,10,'2026-10-11')
        self.assertEqual((progress['loot'],progress['gear']),(2,1))
        for _ in range(100):
            drops=rewards.drops(self.catalog,'monster.slime',1,progress,random.Random(1))
            self.assertLessEqual(len(drops),1)
        self.assertEqual(progress['loot'],0)
        self.assertEqual(progress['gear'],0)
        self.assertEqual(rewards.drops(self.catalog,'monster.slime',1,progress,random.Random(1)),[])

    def test_equipment_opportunities_every_five_minutes_consume_misses(self):
        self.assertEqual(self.catalog.rules['equipment_interval_seconds'],300)
        self.assertEqual(self.catalog.rules['equipment_per_hour_limit'],12)
        progress={}
        for _ in range(5):
            rewards.accrue(progress,300,'2026-10-10',
                equipment_interval_seconds=int(self.catalog.rules['equipment_interval_seconds']))
            self.assertEqual(progress['gear'],1)
            drops=rewards.drops(self.catalog,'monster.slime',1,progress,random.Random(0))
            self.assertEqual([row['kind'] for row in drops],['material'])
            self.assertEqual((progress['loot'],progress['gear']),(0,0))
        self.assertEqual(progress['gear_time'],0)

    def test_dot_precedes_healing_and_shield_refresh_does_not_stack(self):
        a=engine.fighter({'hp_max':100,'mp_max':10,'physical_defense':0},'A',1,hp=1)
        a['states']=[{'code':'dot','group':'x','next_tick':1,'remaining':1,'raw':5,'source_level':1,'damage_type':'physical','name':'毒'},
            {'code':'hot','group':'y','next_tick':1,'remaining':1,'raw':20,'name':'治愈'}]
        log=[];effects.upkeep(a,1,log);self.assertEqual(a['hp'],0);self.assertEqual(len(log),1)
        a['states']=[]
        effects.status(a,{'code':'shield','group':'shield','remaining':20,'expires':4})
        effects.status(a,{'code':'shield','group':'shield','remaining':30,'expires':3})
        self.assertEqual(a['states'][0],{'code':'shield','group':'shield','remaining':30,'expires':4})

    def test_moss_cave_levels_and_drops_match_region(self):
        c = self.catalog
        dungeon = c.row('dungeons', 'dungeon.moss_cave')
        for prefix in ('recommended', 'equipment', 'boss'):
            expected = (15, 20) if prefix == 'boss' else (10, 20)
            self.assertEqual(tuple(int(dungeon[f'{prefix}_level_{edge}']) for edge in ('min', 'max')), expected)
        for monster_id, expected in (
            ('monster.cave_bat', (10, 14)),
            ('monster.cave_crystal_lizard', (12, 16)),
            ('monster.moss_beast', (13, 17)),
            ('monster.moss_king', (15, 20)),
        ):
            monster = c.row('monsters', monster_id)
            self.assertEqual(tuple(int(monster[f'level_{edge}']) for edge in ('min', 'max')), expected)
            if monster['rank'] != 'boss':
                encounter = next(row for row in c.tables['dungeon_monsters'] if row['monster_id'] == monster_id)
                self.assertEqual(tuple(int(encounter[f'level_{edge}']) for edge in ('min', 'max')), expected)
            generated_levels = set()
            for level in range(expected[0], expected[1] + 1):
                for seed in range(30):
                    rows = rewards.drops(c, monster_id, level, {'loot': 2, 'gear': 1}, random.Random(seed),
                                         {'maze_equipment_drop_bonus_percentage': 100})
                    gear = next(row['item'] for row in rows if row['kind'] == 'equipment')
                    self.assertGreaterEqual(gear['level'], 10)
                    self.assertLessEqual(gear['level'], min(level, 20))
                    generated_levels.add(gear['level'])
            self.assertGreater(max(generated_levels), 10)

    def test_equipment_drop_levels_respect_region_monster_and_template(self):
        c=self.catalog
        for dungeon in c.tables['dungeons']:
            if not dungeon['boss_id']:
                continue
            monster_id=dungeon['boss_id'];level=int(dungeon['boss_level_min'])
            for seed in range(100):
                progress={'loot':2,'gear':1}
                rows=rewards.drops(c,monster_id,level,progress,random.Random(seed))
                gear=next(row['item'] for row in rows if row['kind']=='equipment')
                template=c.row('equipment_templates',gear['template_id'])
                self.assertGreaterEqual(gear['level'],max(int(dungeon['equipment_level_min']),int(template['level_min'])))
                self.assertLessEqual(gear['level'],min(level,int(dungeon['equipment_level_max']),int(template['level_max'])))
                self.assertEqual(sum(row['kind']=='equipment' for row in rows),1)
                self.assertEqual(progress['gear'],0)

    def test_equipment_mastery_requires_matching_body_or_offhand_item(self):
        c=self.catalog
        progress=attributes.initial()
        progress.update(job='job.mage',level=10)
        progress['stats'].update(intelligence=20,spirit=100)
        progress['skills']=c.learned(progress['job'],progress['level'])
        base=attributes.attributes(c,progress,[])
        cloth={'slot':'body','equipment_type':'cloth_armor','stats':{}}
        gloves={'slot':'hands','equipment_type':'cloth_armor','stats':{}}
        full_set=[{'slot':slot,'equipment_type':'cloth_armor','stats':{}} for slot in ('head','body','hands','feet')]
        with_cloth=attributes.attributes(c,progress,full_set)
        with_gloves_only=attributes.attributes(c,progress,[gloves])
        self.assertGreater(with_cloth['magic_attack'],base['magic_attack'])
        self.assertGreater(with_cloth['magic_defense'],base['magic_defense'])
        self.assertEqual(with_gloves_only,base)
        self.assertTrue(equipment.allowed(c,'equip.offhand.magic_shield','job.mage',10,10))
        self.assertFalse(equipment.allowed(c,'equip.offhand.magic_shield','job.priest',10,10))

    def test_shield_wall_reduces_damage_and_reflects_one_multi_hit_action(self):
        class FixedRandom:
            @staticmethod
            def random(): return 0
            @staticmethod
            def uniform(_low, _high): return 1

        c=self.catalog
        stats={'hp_max':2000,'mp_max':100,'physical_attack':100,'magic_attack':100,
               'physical_defense':20,'magic_defense':20,'healing':0,'accuracy':1.1,
               'evasion':0,'critical':0,'critical_damage':1,'damage_type':'physical'}
        guard=engine.fighter(stats,'盾卫',70)
        enemy=engine.fighter({**stats,'physical_defense':0,'magic_defense':0},'敌人',70)
        _,shield_wall=c.skill('skill.player.031',1)
        effects.apply(c,guard,enemy,shield_wall,'盾墙',1,FixedRandom())
        incoming=[{'code':'damage','stat':'physical_attack','value':1,'hits':2,'damage_type':'physical'}]
        events=effects.apply(c,enemy,guard,incoming,'多段攻击',2,FixedRandom())
        reflected=[event for event in events if event.get('action')=='盾墙·反伤']
        received=[event for event in events if event.get('action')=='多段攻击']
        self.assertEqual(len(reflected),1)
        self.assertEqual(reflected[0]['damage'],20)
        self.assertFalse(reflected[0]['critical'])
        self.assertEqual(len(received),2)
        self.assertEqual([event['damage'] for event in received],[76,76])
        self.assertEqual(enemy['hp'],1980)

    def test_element_factor_follows_channel_damage_and_stays_bounded(self):
        c = self.catalog
        self.assertEqual(c.version, 'combat-1.0.34')
        defender = engine.fighter({'hp_max': 1000, 'mp_max': 10, 'physical_defense': 60}, '守方', 10)
        self.assertEqual(effects.damage(150, 'physical', 10, defender, variation=1), 100)
        defender['defending'] = True
        self.assertEqual(effects.damage(150, 'physical', 10, defender, variation=1), 65)
        defender['defending'] = False
        rules = c.rules
        samples = (
            ({'fire_power': .17}, {'fire_resist': .45}, 'fire', .72, 72),
            ({'water_power': .15}, {'water_resist': -.25}, 'water', 1.4, 140),
            ({'fire_power': .4}, {'fire_resist': -.25}, 'fire', 1.5, 150),
            ({}, {'fire_resist': .45}, 'fire', .6, 60),
        )
        for attack, resist, element, factor, amount in samples:
            with self.subTest(element=element, factor=factor):
                self.assertEqual(effects.element_multiplier({'stats': attack}, {'stats': resist}, element, rules), factor)
                self.assertEqual(effects.damage(150, 'physical', 10, defender, variation=1, element_factor=factor), amount)
        self.assertEqual(effects.element_multiplier({'stats': {'fire_power': .4}}, {'stats': {}}, '', rules), 1)
        self.assertEqual(effects.attack_element({'element': 'none'}, {'stats': {'element': 'fire'}}), '')
        self.assertEqual(effects.attack_element({}, {'stats': {'element': 'fire'}}), 'fire')
        self.assertEqual(effects.attack_element({'element': 'water'}, {'stats': {'element': 'fire'}}), 'water')
        capped_power, capped_resist = attributes.element_scores(c, [], {'fire_power': .9, 'water_resist': -.9})
        self.assertEqual((capped_power['fire'], capped_resist['water']), (.4, -.25))

    def test_skill_element_overrides_weapon_and_poison_is_not_scaled(self):
        class FixedRandom:
            @staticmethod
            def random(): return 0
            @staticmethod
            def uniform(_low, _high): return 1

        c = self.catalog
        attacker = engine.fighter({
            'hp_max': 500, 'mp_max': 100, 'magic_attack': 100, 'physical_attack': 100,
            'accuracy': 1.1, 'critical': 0, 'critical_damage': 1, 'element': 'water',
            'fire_power': .3, 'water_power': 0,
        }, '术士', 10)
        target = engine.fighter({
            'hp_max': 5000, 'mp_max': 10, 'magic_defense': 0, 'physical_defense': 0,
            'evasion': 0, 'fire_resist': 0, 'water_resist': .4,
        }, '目标', 10)
        _, burn = c.skill('skill.player.037', 1)
        events = effects.apply(c, attacker, target, burn, '炎爆', 1, FixedRandom())
        direct = next(event for event in events if event['kind'] == 'damage')
        self.assertEqual(direct['element'], 'fire')
        self.assertEqual(direct['damage'], 416)
        plain = effects.apply(c, attacker, target, [{
            'code': 'damage', 'stat': 'magic_attack', 'value': 1.8, 'hits': 1, 'damage_type': 'magic',
        }], '随武器', 1, FixedRandom())
        self.assertEqual(plain[0]['element'], 'water')
        self.assertEqual(plain[0]['damage'], 108)
        poisoned = engine.fighter(target['stats'], '中毒目标', 10)
        poison = effects.apply(c, attacker, poisoned, [{
            'code': 'dot', 'stat': 'magic_attack', 'value': 1, 'duration': 2, 'target': 'enemy',
            'damage_type': 'magic', 'group': 'poison', 'chance': '1', 'element': 'fire', 'hits': 1,
        }], '毒', 1, FixedRandom())
        state = poisoned['states'][0]
        self.assertEqual(state['raw'], 100)
        self.assertNotIn('element', state)
        self.assertEqual(poison[0]['kind'], 'dot')

    def test_mastery_gear_and_monster_resists(self):
        c = self.catalog
        progress = attributes.initial()
        progress.update(job='job.pyromancer', level=99)
        progress['skills'] = c.learned('job.pyromancer', 99)
        stats = attributes.attributes(c, progress, [])
        self.assertEqual(stats['fire_power'], .17)
        self.assertEqual(stats['fire_resist'], .1)
        self.assertEqual(stats['water_power'], .05)
        self.assertEqual(stats['element'], '')
        cryomancer = attributes.initial()
        cryomancer.update(job='job.cryomancer', level=99)
        cryomancer['skills'] = c.learned('job.cryomancer', 99)
        pieces = [{'slot': slot, 'stats': {'water_resist': .06}} for slot in ('head', 'body', 'hands', 'feet', 'offhand')]
        cooled = attributes.attributes(c, cryomancer, pieces)
        self.assertEqual(cooled['water_resist'], .42)
        factor = effects.element_multiplier({'stats': {}}, {'stats': cooled}, 'water', c.rules)
        defender = engine.fighter({'hp_max': 1000, 'mp_max': 10, 'physical_defense': 60, 'water_resist': cooled['water_resist']}, '守方', 10)
        self.assertEqual(factor, .6)
        self.assertEqual(effects.damage(150, 'physical', 10, defender, variation=1, element_factor=factor), 60)
        ash = attributes.monster(c, c.row('monsters', 'monster.ash_lord'), 65)
        self.assertEqual(ash['element'], 'fire')
        self.assertEqual((ash['fire_resist'], ash['water_resist'], ash['earth_resist']), (.45, -.25, 0))
        self.assertNotIn('fire_power', ash)
        rabbit = attributes.monster(c, c.row('monsters', 'monster.fuzzy_ear_rabbit'), 1)
        self.assertEqual(rabbit['element'], '')
        self.assertTrue(all(rabbit[f'{name}_resist'] == 0 for name in ('water', 'fire', 'earth', 'wind', 'light', 'dark')))
        self.assertTrue(all(row.get('element', '') == '' for row in c.tables['equipment_templates']))
        self.assertEqual(c.skill('skill.player.001', 1)[1][0]['element'], '')
        self.assertEqual(c.skill('skill.monster.poison', 1)[1][0]['element'], 'none')
        legacy_tables = copy.deepcopy(c.tables)
        legacy_tables.pop('monster_resists')
        for row in legacy_tables['monsters']:
            row.pop('element', None)
        legacy = type(c)(legacy_tables, 'combat-1.0.18')
        old = attributes.monster(legacy, legacy.row('monsters', 'monster.ash_lord'), 65)
        self.assertEqual(old['element'], '')
        self.assertEqual(old['fire_resist'], 0)

    def test_crystal_lizard_skill_is_single_earth_hit_without_status(self):
        c = self.catalog
        rows = [r for r in c.tables['monster_actions'] if r['monster_id'] == 'monster.cave_crystal_lizard']
        self.assertEqual({r['action_kind']: float(r['weight']) for r in rows}, {'attack': 80, 'skill': 20})
        level, skill_effects = c.skill('skill.monster.crystal', 1)
        self.assertEqual(float(level['cooldown_rounds']), 4)
        self.assertEqual(len(skill_effects), 1)
        effect = skill_effects[0]
        self.assertEqual((effect['code'], effect['stat'], effect['damage_type'], effect['element'], effect['target']),
                         ('damage', 'physical_attack', 'physical', 'earth', 'enemy'))
        self.assertEqual((float(effect['value']), int(effect['hits'])), (1.35, 1))
