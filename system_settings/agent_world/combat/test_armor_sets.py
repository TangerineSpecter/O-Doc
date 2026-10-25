"""Four-slot mastery contracts and typed level-band headwear."""
import copy
import random
from django.test import SimpleTestCase
from . import attributes,equipment
from .catalog import bundled,Catalog


class ArmorSetTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.catalog=bundled()[0]

    def test_every_armor_mastery_needs_all_four_matching_slots(self):
        for sid in [f'skill.player.{i:03}' for i in (*range(61,67),80)]:
            for rank in (1,2,3):
                group=self.catalog.skill(sid,rank)[1][0]['group']
                family=group.removesuffix('_set')
                gear=[{'slot':slot,'equipment_type':family,'stats':{}} for slot in ('head','body','hands','feet')]
                expected=attributes.passives(self.catalog,{sid:rank},gear)
                self.assertTrue(expected,(sid,rank))
                for slot in ('head','body','hands','feet'):
                    with self.subTest(skill=sid,rank=rank,missing=slot):
                        self.assertEqual(attributes.passives(self.catalog,{sid:rank},[g for g in gear if g['slot']!=slot]),[])
                        mixed=copy.deepcopy(gear)
                        next(g for g in mixed if g['slot']==slot)['equipment_type']='generic'
                        self.assertEqual(attributes.passives(self.catalog,{sid:rank},mixed),[])
                wrong_slots=[dict(g,slot='accessory') for g in gear]
                self.assertEqual(attributes.passives(self.catalog,{sid:rank},wrong_slots),[])

    def test_historical_catalog_still_uses_body_only(self):
        tables=copy.deepcopy(self.catalog.tables)
        for row in tables['skill_effects']:row['group']=row['group'].removesuffix('_set')
        old=Catalog(tables,'combat-1.0.26')
        self.assertTrue(attributes.passives(old,{'skill.player.061':1},[{'slot':'body','equipment_type':'cloth_armor'}]))
        self.assertFalse(attributes.passives(self.catalog,{'skill.player.061':1},[{'slot':'body','equipment_type':'cloth_armor'}]))

    def test_twenty_five_head_templates_keep_bands_and_real_types(self):
        heads=[r for r in self.catalog.tables['equipment_templates'] if r['slot']=='head']
        self.assertEqual(len(heads),25)
        self.assertEqual(len({r['name'] for r in heads}),25)
        for family in ('cloth','leather','light','heavy','plate'):
            rows=[r for r in heads if r['equipment_type']==family+'_armor']
            self.assertEqual([(int(r['level_min']),int(r['level_max'])) for r in rows],[(10,30),(30,50),(50,70),(70,90),(90,99)])
            for row in rows:
                item=equipment.generate(self.catalog,row['id'],int(row['level_min']),'gold',random.Random(1))
                self.assertEqual(item['equipment_type'],family+'_armor')
                self.assertEqual(item['slot'],'head')
                self.assertIn(row['id'],{r['equipment_id'] for r in self.catalog.tables['equipment_pools']})
        self.assertTrue(equipment.allowed(self.catalog,'equip.head','job.mage',20,20))
        self.assertFalse(equipment.allowed(self.catalog,'equip.head','job.warrior',20,20))
        self.assertTrue(equipment.allowed(self.catalog,'equip.head.heavy','job.warrior',20,20))

    def test_weapon_and_shield_mastery_do_not_need_armor_set(self):
        for sid,kind,slot in [('067','magic_shield','offhand'),('068','small_shield','offhand'),
                             ('069','two_handed_staff','weapon'),('072','two_handed_sword','weapon')]:
            self.assertTrue(attributes.passives(self.catalog,{f'skill.player.{sid}':1},[{'slot':slot,'equipment_type':kind}]))
