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
        self.assertEqual((len(c.tables['dungeons']),len(c.tables['monsters']),len(c.tables['professions'])),(6,24,29))
        self.assertEqual(sum(r['kind']!='monster' for r in c.tables['skills']),74)
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

    def test_equipment_drop_levels_respect_region_monster_and_template(self):
        c=self.catalog
        for dungeon in c.tables['dungeons']:
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
        with_cloth=attributes.attributes(c,progress,[cloth])
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
