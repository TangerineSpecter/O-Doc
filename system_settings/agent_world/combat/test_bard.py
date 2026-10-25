"""Approved bard tree, real music actions and round-state contracts."""
import copy
import json
import random
from django.test import SimpleTestCase
from .catalog import bundled
from . import attributes,engine,effects,equipment,bard_combat as music,party_engine


class FixedRandom(random.Random):
    roll = .1
    def random(self):return self.roll
    def uniform(self,a,b):return 1
    def randrange(self,*args):return 0
    def shuffle(self,items):pass
    def choices(self,population,weights=None,**kwargs):
        if 'skill' in population:return ['skill']
        return [population[0]]


class BardTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass();cls.catalog=bundled()[0]

    def unit(self,name='诗人',job='job.virtuoso',*,armor=True):
        c=self.catalog;learned=c.learned(job,99)
        gear=[{'slot':'weapon','equipment_type':'instrument','stats':{'magic_attack':100}}]
        if armor:gear += [{'slot':s,'equipment_type':'leather_armor','stats':{}} for s in ('head','body','hands','feet')]
        stats={'hp_max':1000,'mp_max':10000,'physical_attack':100,'magic_attack':100,'physical_defense':0,'magic_defense':0,
               'accuracy':1,'critical':0,'critical_damage':1.5,'evasion':0,'damage_type':'magic','dexterity':10}
        u=engine.fighter(stats,name,99,skills=learned,passives=attributes.passives(c,learned,gear))
        u.update(id=name,potions={},elixirs=[],style_id='style.balanced')
        return u

    def cast(self,u,sid,tick=1,rank=3,target=None,friends=None,enemies=None):
        target=target or self.unit('怪','job.novice');target['hp']=100000;target['stats']['hp_max']=100000
        return music.cast(self.catalog,u,target,friends or {u['id']:u},enemies or {target['id']:target},f'skill.player.{sid}',rank,tick,FixedRandom()),target

    def test_tree_all_skills_and_instruments(self):
        c=self.catalog
        self.assertEqual(len(c.tables['professions']),36)
        self.assertEqual({r['id'] for r in c.tables['equipment_templates'] if r['equipment_type']=='instrument'}, {'equip.instrument','equip.instrument.30','equip.instrument.50'})
        for table in ('equipment_affixes','equipment_professions','equipment_pools'):
            self.assertFalse(any(r['equipment_id'] in {'equip.instrument.70','equip.instrument.90'} for r in c.tables[table]))
        self.assertEqual(len([s for s in c.tables['skills'] if s['kind']!='monster']),98)
        self.assertEqual([r['id'] for r in attributes.promotion_options(c,dict(attributes.initial(),job='job.bard',level=30))],['job.musician','job.cursesinger'])
        for job in ('bard','musician','cursesinger','battleconductor','requiemsinger','virtuoso','sonomancer'):
            learned=c.learned('job.'+job,99)
            self.assertIn('skill.player.080',learned)
            tid=equipment.promotion_weapon(c,'job.'+job,99)
            self.assertEqual(tid,'equip.instrument.50')
            generated=equipment.generate(c,tid,99,'gold',random.Random(1))
            self.assertEqual((generated['grip'],generated['equipment_type']),('two_handed','instrument'))
            self.assertTrue(equipment.allowed(c,'equip.head.leather.90','job.'+job,99,99))

    def test_all_active_music_executes_at_all_ranks(self):
        c=self.catalog
        for definition in c.tables['skills']:
            if not definition['id'].startswith('skill.player.') or int(definition['id'].split('.')[-1])<76 or definition['kind']!='active':continue
            for rank in (1,2,3):
                with self.subTest(skill=definition['name'],rank=rank):
                    u=self.unit(job=definition['profession_id']);before=u['mp']
                    events,_=self.cast(u,definition['id'].split('.')[-1],rank=rank)
                    self.assertTrue(events)
                    self.assertLess(u['mp'],before)

    def test_leather_duration_requires_every_slot_and_extends_songs(self):
        u=self.unit(job='job.musician')
        self.assertEqual(music.duration(u,3),6)
        self.assertEqual(music.duration(self.unit(armor=False),3),3)
        self.assertEqual(music.duration(u,0),0)
        self.cast(u,'081')
        self.assertEqual(u['bard']['melody']['expires'],7)
        self.assertEqual(u['states'][0]['expires'],7)
        self.assertEqual(u['cooldowns']['skill.player.081'],6)

    def test_main_melody_replaces_own_but_strongest_other_song_survives(self):
        a=self.unit('甲','job.battleconductor');b=self.unit('乙','job.musician');friends={'甲':a,'乙':b}
        self.cast(a,'087',friends=friends)
        self.cast(b,'081',friends=friends)
        self.assertAlmostEqual(effects.value(a,'magic_attack'),136)
        self.cast(a,'082',tick=2,friends=friends)
        self.assertAlmostEqual(effects.value(a,'magic_attack'),120)
        self.assertTrue(any(s.get('melody') and s.get('source_id')=='甲' and s['stat']=='reduction' for s in b['states']))
        self.assertEqual(a['bard']['melody']['skill_id'],'skill.player.082')

    def test_beats_and_finisher_are_one_stack_per_action(self):
        u=self.unit();target=self.unit('怪','job.novice')
        for tick in (1,4,7):
            events,target=self.cast(u,'093',tick,target=target)
            self.assertEqual(len([e for e in events if e['kind']=='damage']),3)
        self.assertEqual(u['bard']['beats'],3)
        events,_=self.cast(u,'095',8,target=target)
        self.assertEqual(u['bard']['beats'],0)
        self.assertEqual(next(e for e in events if e['kind']=='damage')['damage'],540)  # Solo echo has already granted 8% attack.
        self.assertEqual(len([e for e in events if e['action']=='余音馈赠']),1)

    def test_echo_targets_one_ally_and_does_not_replace_main_melody(self):
        u=self.unit();friend=self.unit('队友','job.novice');friends={u['id']:u,friend['id']:friend}
        self.cast(u,'093',friends=friends)
        self.assertEqual(len([s for s in friend['states'] if s.get('echo')]),1)
        self.assertFalse(any(s.get('echo') for s in u['states']))
        self.assertEqual(next(s for s in friend['states'] if s.get('echo'))['expires'],6)
        u['cooldowns'].clear();self.cast(u,'093',tick=2,friends=friends)
        self.assertEqual(len([s for s in friend['states'] if s.get('echo')]),1)

    def test_resonance_is_owned_expires_and_consumes_only_on_hit(self):
        a=self.unit('甲','job.sonomancer');b=self.unit('乙','job.sonomancer');target=self.unit('怪','job.novice')
        for tick in (1,3,5):self.cast(a,'096',tick,target=target)
        self.cast(b,'096',5,target=target)
        self.assertEqual(music.resonance(a,target,6)['value'],3)
        self.assertEqual(music.resonance(b,target,6)['value'],1)
        events,_=self.cast(a,'098',6,target=target)
        self.assertEqual(next(e for e in events if e['kind']=='damage')['damage'],671)
        self.assertIsNone(music.resonance(a,target,6))
        self.assertEqual(music.resonance(b,target,6)['value'],1)
        music.prepare({'target':target},11)
        self.assertIsNone(music.resonance(b,target,11))

    def test_silence_blocks_skill_but_not_attack_and_grants_one_round_immunity(self):
        u=self.unit(job='job.requiemsinger');target=self.unit('敌人','job.novice')
        self.cast(u,'092',1,target=target)
        self.assertTrue(music.silenced(target,2))
        self.assertEqual(engine.available(self.catalog,target,u,2,self.catalog.row('styles','style.balanced')),[])
        self.assertTrue(engine.attack(self.catalog,target,u,2,FixedRandom()))
        music.prepare({'target':target},5)
        self.assertFalse(music.silenced(target,5))
        self.assertTrue(any(s['code']=='bard_silence_immunity' for s in target['states']))
        u['cooldowns'].clear();self.cast(u,'092',5,target=target)
        self.assertFalse(music.silenced(target,5))

    def test_terminal_extends_melody_only_once(self):
        u=self.unit(job='job.battleconductor')
        self.cast(u,'087',1);end=u['bard']['melody']['expires']
        self.cast(u,'089',2)
        self.assertEqual(u['bard']['melody']['expires'],end+1)
        u['cooldowns'].clear();self.cast(u,'089',3)
        self.assertEqual(u['bard']['melody']['expires'],end+1)

    def test_auto_picker_and_shared_round_actually_cast_music(self):
        u=self.unit(job='job.battleconductor');u['skills']={'skill.player.087':3}
        foe=self.unit('怪','job.novice');foe.update(template_id='monster.slime');foe['stats']['dexterity']=1
        source={'players':{u['id']:u},'enemies':{foe['id']:foe},'round':0}
        from unittest.mock import patch
        with patch.object(engine,'enemy_action',return_value=[]):after,events=party_engine.step(self.catalog,source,FixedRandom())
        self.assertEqual(after['players'][u['id']]['bard']['melody']['skill_id'],'skill.player.087')
        self.assertEqual(events[0]['action'],'英雄战歌')
        self.assertNotIn('bard',source['players'][u['id']])
        restored=json.loads(json.dumps(after))
        self.assertEqual(restored,after)

    def test_sanctuary_and_other_reduction_share_sixty_percent_cap(self):
        bard=self.unit(job='job.requiemsinger');foe=self.unit('敌人','job.novice');friend=self.unit('队友','job.novice')
        self.cast(bard,'090',1,target=foe)
        friend['stats']['reduction']=.55
        foe['stats']['physical_attack']=100
        foe['states']=[s for s in foe['states'] if s['stat']=='outgoing_reduction']
        log=engine.attack(self.catalog,foe,friend,1,FixedRandom())
        self.assertEqual(log[0]['damage'],40)

    def test_music_cost_discount_does_not_discount_damage_spells(self):
        bard=self.unit(job='job.musician');base=self.unit(job='job.bard')
        self.assertLess(engine.cost(self.catalog,bard,'skill.player.081',3),engine.cost(self.catalog,base,'skill.player.081',3))
        self.assertEqual(engine.cost(self.catalog,bard,'skill.player.076',3),engine.cost(self.catalog,base,'skill.player.076',3))

    def test_cannot_cast_unlearned_music(self):
        u=self.unit(job='job.bard');before=copy.deepcopy(u)
        log,_=self.cast(u,'098')
        self.assertEqual(log,[])
        self.assertEqual(u,before)
