"""Real isolated snapshots preserve music and reject both personal/shared state tampering."""
import copy
from django.test import TestCase
from . import test_parties as party_test_helpers
from . import attributes,profiles
from .models import CombatProfile,CombatRuntime,Exploration,EquipmentInstance
from .party_models import AdventureParty
from .facts import append
from .sync import validate_source,metadata
from .test_bard import FixedRandom


class BardSnapshotTests(TestCase):
    setUp=party_test_helpers.PartyServiceTests.setUp
    start=party_test_helpers.PartyServiceTests.start
    data=party_test_helpers.PartyServiceTests.data
    join=party_test_helpers.PartyServiceTests.join

    def level(self,actor,target):
        """Seed isolated earned-growth outcomes; promotions still use the real service."""
        p=CombatProfile.objects.get(pk=actor.pk)
        xp=sum(int(r['experience_to_next']) for r in self.catalog.tables['level_experience']
               if p.progression['level']<=int(r['level'])<target)
        p.progression,_=attributes.award(self.catalog,p.progression,xp)
        derived=profiles.stats(p,self.catalog)
        p.hp,p.mp=derived['hp_max'],derived['mp_max']
        p.save()
        append(p,f'test-growth:{p.pk}:{target}','catalog',{'skills':p.progression['skills'],'catalog_id':p.catalog_id})
        return p

    def poet(self,leaf="virtuoso"):
        support=leaf=="battleconductor"
        actor=self.agents[0]
        self.level(actor,10);p=profiles.promote('admin',actor,'bard-promote','job.bard')
        gear=EquipmentInstance.objects.get(pk=p.loadout['weapon'])
        self.assertEqual(gear.snapshot['equipment_type'],'instrument')
        self.assertEqual(gear.snapshot['grip'],'two_handed')
        self.level(actor,30);profiles.promote('admin',actor,'second-promote','job.musician' if support else 'job.cursesinger')
        self.level(actor,50);profiles.promote('admin',actor,'third-promote','job.'+leaf)
        self.level(actor,80)

    def recorded_music(self,leaf="virtuoso",skill="skill.player.093"):
        from datetime import timedelta
        from unittest.mock import patch
        from . import party_engine
        from .party_tick import tick
        class MusicPicker(FixedRandom):
            roll=.8 if leaf=="sonomancer" else .1
            def choices(self,population,weights=None,**kwargs):
                if 'skill' in population:return ['skill']
                for item in population:
                    if isinstance(item,tuple) and item[0]==skill:return [item]
                return [population[0]]
        self.poet(leaf)
        if leaf=='sonomancer':self.plan['dungeon_id']='dungeon.star_rift'
        run,party=self.start()
        with patch('system_settings.agent_world.combat.party_tick.step',
                   side_effect=lambda c,state,rng:party_engine.step(c,state,MusicPicker())):
            tick(party.pk,now=self.now+timedelta(seconds=15))
        party.refresh_from_db();run.refresh_from_db()
        caster=party.state['players'][run.actor_id]
        if leaf=='virtuoso':
            self.assertEqual(caster['bard']['beats'],1)
            self.assertTrue(any(state.get('echo') for state in caster['states']))
        return run,party

    def test_personal_and_shared_frames_reject_music_tampering(self):
        from utils.sync_manager import SyncError
        run,party=self.recorded_music()
        data=self.data();self.assertTrue(validate_source(data,metadata(data)))
        for label in ('system_settings.adventureparty','system_settings.exploration'):
            bad=copy.deepcopy(data)
            row=next(r for r in bad if r['model']==label and r['pk']==(party.pk if label.endswith('adventureparty') else run.pk))
            player=row['fields']['state']['players'][run.actor_id] if label.endswith('adventureparty') else row['fields']['state']['player']
            player['bard']['beats']=2
            with self.assertRaises(SyncError):validate_source(bad,metadata(bad))
            player['bard']['beats']=99
            with self.assertRaises(SyncError):validate_source(bad,metadata(bad))

    def test_real_restore_twice_preserves_music_and_never_grants_runtime(self):
        from utils.sync_manager import SyncManager
        from ..life_config import config_for
        from ..cooking_catalog import catalog_for
        run,party=self.recorded_music()
        config_for('admin');catalog_for('admin')
        expected=copy.deepcopy(party.state)
        personal=copy.deepcopy(run.state['player'])
        manager=SyncManager();source=manager.build_snapshot_data();meta=manager.build_snapshot_meta(data_list=source)
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(source),meta)
            self.assertEqual(AdventureParty.objects.get(pk=party.pk).state,expected)
            self.assertEqual(Exploration.objects.get(pk=run.pk).state['player'],personal)
            self.assertFalse(CombatRuntime.objects.filter(authorized=True).exists())
            self.assertTrue(validate_source(manager.build_snapshot_data(),metadata(manager.build_snapshot_data())))

    def test_main_melody_roundtrip(self):
        from utils.sync_manager import SyncManager
        from ..life_config import config_for
        from ..cooking_catalog import catalog_for
        run,party=self.recorded_music('battleconductor','skill.player.087')
        caster=party.state['players'][run.actor_id]
        self.assertEqual(caster['bard']['melody']['skill_id'],'skill.player.087')
        self.assertTrue(any(s.get('melody') for s in caster['states']))
        config_for('admin');catalog_for('admin')
        manager=SyncManager();source=manager.build_snapshot_data();meta=manager.build_snapshot_meta(data_list=source)
        manager.apply_snapshot_data(copy.deepcopy(source),meta)
        self.assertEqual(AdventureParty.objects.get(pk=party.pk).state,party.state)
        self.assertEqual(Exploration.objects.get(pk=run.pk).state,run.state)

    def test_music_structure_rejects_invalid_bounds(self):
        from .bard_state import validate_unit
        invalid=[{'bard':{'beats':True}}, {'bard':{'beats':4}},
                 {'bard':{'melody':{'skill_id':'skill.player.093','expires':4,'extended':False}}},
                 {'states':[{'code':'bard_resonance','music':True,'expires':3,'group':'bard_resonance:x','name':'共振','value':4,'source_id':'x'}]}]
        for state in invalid:
            with self.assertRaises(ValueError):validate_unit(state)

    def test_enemy_resonance_roundtrip_and_tamper_rejection(self):
        from utils.sync_manager import SyncManager,SyncError
        from ..life_config import config_for
        from ..cooking_catalog import catalog_for
        run,party=self.recorded_music('sonomancer','skill.player.096')
        enemy=next(u for u in party.state['enemies'].values() if any(s.get('code')=='bard_resonance' for s in u['states']))
        resonance=next(s for s in enemy['states'] if s['code']=='bard_resonance')
        self.assertEqual(resonance['value'],1)
        self.assertEqual(resonance['source_id'],run.actor_id)
        config_for('admin');catalog_for('admin')
        manager=SyncManager();source=manager.build_snapshot_data();meta=manager.build_snapshot_meta(data_list=source)
        manager.apply_snapshot_data(copy.deepcopy(source),meta)
        self.assertEqual(AdventureParty.objects.get(pk=party.pk).state,party.state)
        self.assertEqual(Exploration.objects.get(pk=run.pk).state,run.state)
        bad=copy.deepcopy(source)
        row=next(r for r in bad if r['model']=='system_settings.adventureparty' and r['pk']==party.pk)
        target=row['fields']['state']['enemies'][enemy['id']]
        next(s for s in target['states'] if s['code']=='bard_resonance')['value']=2
        with self.assertRaises(SyncError):validate_source(bad,metadata(bad))
