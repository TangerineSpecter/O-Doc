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
        self.assertEqual(sum(r['kind']!='monster' for r in c.tables['skills']),60)
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
        c=self.catalog;p=attributes.initial();g=equipment.generate(c,'equip.sword',1,'gold',random.Random(1))
        self.assertEqual(len({r['id'] for r in g['affixes']}),3)
        state={'player':engine.fighter(attributes.attributes(c,p,[g]),'A',1),'enemy':engine.fighter(attributes.monster(c,c.row('monsters','monster.slime'),1),'B',1),'potions':{},'monster_id':'monster.slime'}
        original=copy.deepcopy(state)
        self.assertEqual(engine.step(c,state,'style.balanced',1,random.Random(1)),engine.step(c,state,'style.balanced',1,random.Random(1)))
        self.assertEqual(state,original)
        self.assertEqual(attributes.attributes(c,p,[g]),attributes.attributes(c,p,[g]))

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
        self.assertEqual(rewards.drops(self.catalog,'monster.slime',1,progress,random.Random(1)),[])

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
