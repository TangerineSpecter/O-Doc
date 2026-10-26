"""Isolated party rules, lifecycle and source-integrity regressions."""
import copy
import json
import random
from datetime import timedelta
from django.test import SimpleTestCase, TestCase
from django.core import serializers
from system_settings.models import Agent, AIProvider, AIModel
from . import engine, attributes, explorations
from .catalog import bundled
from .store import install
from .profiles import ensure
from .party_rules import scaled_monster, equipment_chance, roll
from .party_engine import step, cast, rescue
from .party_rewards import experience
from .models import CombatProfile
from .party_models import AdventureParty, AdventureMember
from .party_sessions import admit_waiting
from .party_tick import tick
from .party_options import options
from ..life_time import local_time, storage_time


class PartyRuleTests(SimpleTestCase):
    def setUp(self):
        self.catalog = bundled()[0]

    def unit(self, identity, hp=100, dex=10, skills=None):
        stats = {'hp_max':100,'mp_max':1000,'physical_attack':1,'magic_attack':1,'physical_defense':100,'magic_defense':100,
                 'accuracy':1,'evasion':0,'critical':0,'critical_damage':1.5,'dexterity':dex,'healing':100,'damage_type':'physical'}
        unit = engine.fighter(stats, identity, 70, hp=hp, skills=skills)
        unit.update(id=identity, potions={}, elixirs=[], style_id='style.balanced', template_id='monster.slime')
        return unit

    def test_only_hp_attack_defense_scale(self):
        base = {'hp_max':100,'physical_attack':20,'magic_attack':0,'physical_defense':10,'magic_defense':8,'speed':10,'mp_max':50,'accuracy':.95,'critical':.05}
        value = scaled_monster(base,4)
        self.assertEqual((value['hp_max'],value['physical_attack'],value['magic_defense']), (250,50,20))
        self.assertEqual((value['speed'],value['mp_max'],value['accuracy'],value['critical']), (10,50,.95,.05))

    def test_party_experience_preserves_single_formula_and_level_decay(self):
        for level in (1,10,30,70,99):
            for actor in (1,10,30,70,99):
                for rank in ('normal','elite','boss'):
                    self.assertEqual(experience(self.catalog,level,actor,rank,1),attributes.kill_experience(self.catalog,level,actor,rank))
        self.assertLess(experience(self.catalog,10,40,'normal',4),experience(self.catalog,10,10,'normal',4))

    def test_interval_bonus_and_roll_are_deterministic(self):
        self.assertAlmostEqual(equipment_chance(.2,{'maze_equipment_interval_reduction_percentage':20}), .25)
        self.assertEqual(equipment_chance(.2,{'maze_equipment_interval_reduction_percentage':100}),1)
        self.assertEqual(roll(['a','b'], random.Random(4)), roll(['a','b'], random.Random(4)))
        from unittest.mock import Mock
        self.assertEqual(roll(['a','b'],Mock(randint=Mock(side_effect=[80,80,90,42]))),
                         ('a',[{'a':80,'b':80},{'a':90,'b':42}]))

    def test_equal_threat_ties_are_seeded_random_instead_of_speed_biased(self):
        from .party_engine import target_for
        players={'a':self.unit('a',dex=1),'b':self.unit('b',dex=100)}
        enemy=self.unit('enemy')
        chosen=[target_for(enemy,players,1,random.Random(seed))['id'] for seed in range(10)]
        self.assertEqual(set(chosen),{'a','b'})
        self.assertEqual(chosen,[target_for(enemy,players,1,random.Random(seed))['id'] for seed in range(10)])
        enemy['threat']={'a':100,'b':10}
        self.assertEqual(target_for(enemy,players,1,random.Random(3))['id'],'a')

    def test_group_heal_and_taunt_cost_once(self):
        a = self.unit('a',skills={'skill.player.053':1,'skill.player.031':1})
        b = self.unit('b',hp=10)
        e = self.unit('e')
        initial = a['mp']
        cast(self.catalog,a,'skill.player.053',1,{'a':a,'b':b},{'e':e},1,random.Random(1))
        self.assertEqual(b['hp'],100)
        self.assertEqual(initial-a['mp'],engine.cost(self.catalog,a,'skill.player.053',1))
        cast(self.catalog,a,'skill.player.031',1,{'a':a,'b':b},{'e':e},2,random.Random(1))
        self.assertEqual(e['taunt']['actor_id'],'a')
        self.assertTrue(any(s['group']=='party_reduction' for s in b['states']))

    def test_revive_once_no_self_and_no_chain_rescue(self):
        a = self.unit('a', skills={'skill.player.075':1})
        b = self.unit('b',hp=0,skills={'skill.player.075':1})
        c = self.unit('c',hp=0)
        state = {'players':{'a':a,'b':b,'c':c},'enemies':{},'round':1}
        result = rescue(self.catalog,state,random.Random(1))
        self.assertTrue(result)
        self.assertEqual(b['hp'],20)
        self.assertEqual(c['hp'],0)
        b['hp']=0
        self.assertEqual(cast(self.catalog,a,'skill.player.075',1,{'a':a,'b':b},{},12,random.Random(1)),[])

    def test_speed_order_is_repeatable_and_input_immutable(self):
        state={'players':{'a':self.unit('a',dex=5),'b':self.unit('b',dex=20)},'enemies':{'e':self.unit('e',dex=10)},'round':0}
        original=copy.deepcopy(state)
        result,events=step(self.catalog,state,random.Random(1))
        self.assertEqual(result['action_order'],['b','e','a'])
        self.assertEqual(state,original)
        self.assertEqual((result,events),step(self.catalog,state,random.Random(1)))

    def test_offensive_elixir_precedes_support_and_is_once_per_wave(self):
        a=self.unit('a',dex=100,skills={'skill.player.031':1})
        from .party_rules import spawn_enemies
        spawn_enemies(self.catalog,self.catalog.row('dungeons','dungeon.sprout_meadow'),{'a':a},{},random.Random(2),'trip',2)
        self.assertEqual((a['encounter'],a['round_in_encounter']),(2,0))
        a['elixirs']=[{'recipe_id':'fury','name':'狂怒药水','stars':1,'remaining':2,
            'trigger':{'kind':'elite_first'},'effects':{'physical_attack':.2,'duration':6}}]
        e=self.unit('e');e['rank']='elite'
        state,events=step(self.catalog,{'players':{'a':a},'enemies':{'e':e},'round':0},random.Random(1))
        self.assertEqual(state['players']['a']['elixirs'][0]['remaining'],1)
        self.assertFalse(e.get('taunt'))
        state,events=step(self.catalog,state,random.Random(1))
        self.assertEqual(state['players']['a']['elixirs'][0]['remaining'],1)


class PartyServiceTests(TestCase):
    def test_solo_settlement_uses_personal_fallen_reason_without_team_summary(self):
        from .participation import participation
        run, party = self.start()
        self.assertEqual(participation([run], 'admin')[run.pk], {'min': 1, 'max': 1, 'final': 1})
        explorations.finish(run.pk, 'fallen', '全队倒地', self.now + timedelta(seconds=60))
        run.refresh_from_db()
        self.assertIn('角色倒地', run.result['report'])
        self.assertNotIn('全队倒地', run.result['report'])
        self.assertNotIn('队伍累计', run.result['report'])
        self.assertNotIn('按怪物去重', run.result['report'])

    def test_participation_tracks_personal_waves_and_freezes_after_departure(self):
        from .party_models import AdventureWave
        from .models import CombatEncounter
        from .participation import participation, display_report
        run, party = self.start()
        member = AdventureMember.objects.get(exploration_id=run.pk)
        member.left_at = storage_time(self.now + timedelta(minutes=2))
        member.save()
        AdventureWave.objects.create(id='roster-two', party_id=party.pk, owner_id='admin', number=2,
            created_at=storage_time(self.now + timedelta(minutes=1)), snapshot={'members': [run.actor_id, 'other']})
        CombatEncounter.objects.create(id=f'{run.pk}:party:2', exploration_id=run.pk,
            owner_id='admin', actor_id=run.actor_id, number=2)
        AdventureWave.objects.create(id='later-roster-four', party_id=party.pk, owner_id='admin', number=3,
            created_at=storage_time(self.now + timedelta(minutes=3)), snapshot={'members': [run.actor_id, 'b', 'c', 'd']})
        roster = participation([run], 'admin')[run.pk]
        self.assertEqual(roster, {'min': 1, 'max': 2, 'final': 2})
        report = '全队倒地 本人参与击败14只，离队时队伍累计击败20只（按怪物去重）。'
        self.assertEqual(display_report(report, roster), '全队倒地 本人参与击败14只，离队时队伍累计击败20只。')
        self.assertEqual(participation([run], 'another-owner'), {})

    def setUp(self):
        provider=AIProvider.objects.create(name='test',type='OpenAi',base_url='https://example.invalid')
        model=AIModel.objects.create(name='test',type='chat',provider=provider)
        self.agents=[Agent.objects.create(name='队员'+str(i),model=model) for i in range(5)]
        self.catalog=install()
        self.now=local_time()
        for agent in self.agents:ensure('admin',agent,self.now)
        self.plan={'dungeon_id':'dungeon.sprout_meadow','style_id':'style.balanced','duration_seconds':1800,'potions':{}}

    def start(self):
        run=explorations.request('admin',self.agents[0],'start',{'adventure_mode':'solo'},now=self.now)
        run=explorations.depart(run.pk,self.plan,now=self.now)
        return run,AdventureParty.objects.get(pk=run.snapshot['party_id'])

    def join(self,agent,key,party):
        available=options('admin',agent,self.now)['parties']
        choice=next(r for r in available if r['id']==party.pk)
        run=explorations.request('admin',agent,key,{'party_id':party.pk,'party_revision':choice['revision']},now=self.now)
        plan={**self.plan,'duration_seconds':choice['duration_seconds']}
        explorations.depart(run.pk,plan,now=self.now)
        return run

    def test_queued_join_is_not_charged_and_boundary_admits_only_four(self):
        run,party=self.start()
        for i in range(1,5):self.join(self.agents[i],f'join{i}',party)
        self.assertEqual(AdventureMember.objects.filter(party_id=party.pk,active=True).count(),1)
        admit_waiting(party,self.now)
        self.assertEqual(AdventureMember.objects.filter(party_id=party.pk,active=True).count(),4)
        self.assertEqual(explorations.Exploration.objects.get(pk='join4').status,'failed')

    def test_waiting_join_seals_personal_state_and_retries_without_new_facts(self):
        from .facts import append
        from .models import CombatFact
        from .sync import validate_source, metadata
        _,party=self.start()
        choice=options('admin',self.agents[1],self.now)['parties'][0]
        pending=explorations.request('admin',self.agents[1],'waiting-sync',
            {'party_id':party.pk,'party_revision':choice['revision']},now=self.now)
        plan={**self.plan,'duration_seconds':choice['duration_seconds']}
        pending.snapshot['prepared_plan']=plan
        pending.save()
        append(CombatProfile.objects.get(pk=pending.actor_id),pending.pk+':plan','plan',{'plan':plan},pending)
        self.assertTrue(validate_source(self.data(),metadata(self.data())))
        queued=explorations.depart(pending.pk,plan,now=self.now)
        self.assertEqual(queued.phase,'waiting_party')
        self.assertEqual(queued.elapsed_seconds,0)
        self.assertNotIn('energy',queued.result)
        self.assertTrue(validate_source(self.data(),metadata(self.data())))
        count=CombatFact.objects.filter(actor_id=pending.actor_id).count()
        explorations.depart(pending.pk,plan,now=self.now+timedelta(seconds=1))
        self.assertEqual(CombatFact.objects.filter(actor_id=pending.actor_id).count(),count)
        self.assertTrue(validate_source(self.data(),metadata(self.data())))

    def test_fractional_polling_retains_time_and_crosses_energy_boundary(self):
        from unittest.mock import patch
        from .sync import validate_source, metadata
        self.now=self.now.replace(hour=23,minute=58,second=0,microsecond=0)
        run,party=self.start()
        with patch('system_settings.agent_world.combat.party_tick.step',side_effect=lambda c,s,r:(copy.deepcopy(s),[])):
            for index in range(1,21):
                tick(party.pk,now=self.now+timedelta(seconds=index*15.9))
        run.refresh_from_db()
        self.assertEqual(run.elapsed_seconds,318)
        self.assertEqual(run.result['energy'],14)
        profile=CombatProfile.objects.get(pk=run.actor_id)
        self.assertEqual(sum(profile.loot_progress['days'].values()),318)
        self.assertEqual(profile.loot_progress['days'][self.now.date().isoformat()],120)
        self.assertEqual(profile.loot_progress['days'][(self.now+timedelta(days=1)).date().isoformat()],198)
        self.assertTrue(validate_source(self.data(),metadata(self.data())))

    def test_delayed_tick_pauses_without_billing_missing_time(self):
        from .sync import validate_source, metadata
        run,party=self.start()
        tick(party.pk,now=self.now+timedelta(seconds=60))
        run.refresh_from_db();party.refresh_from_db()
        self.assertEqual((run.status,party.status),('paused','paused'))
        self.assertEqual((run.elapsed_seconds,run.result['energy'],party.state['round']),(0,12,0))
        self.assertTrue(validate_source(self.data(),metadata(self.data())))

    def test_delayed_tick_past_deadline_finishes_without_offline_charges(self):
        from .sync import validate_source, metadata
        run,party=self.start()
        # Retain the already executed round, but never accrue the long missing interval.
        tick(party.pk,now=self.now+timedelta(seconds=15))
        tick(party.pk,now=self.now+timedelta(seconds=1801))
        run.refresh_from_db();party.refresh_from_db()
        self.assertEqual((run.status,party.status),('completed','completed'))
        self.assertEqual((run.elapsed_seconds,run.result['energy'],party.state['round']),(15,12,1))
        profile=CombatProfile.objects.get(pk=run.actor_id)
        self.assertEqual(sum(profile.loot_progress['days'].values()),15)
        self.assertTrue(validate_source(self.data(),metadata(self.data())))

    def test_owner_and_area_filtered(self):
        run,party=self.start()
        self.assertEqual(options('other',self.agents[1],self.now)['parties'],[])
        party.dungeon_id='dungeon.moss_cave';party.save()
        self.assertEqual(options('admin',self.agents[1],self.now)['parties'],[])
        with self.assertRaises(ValueError):
            explorations.request('admin',self.agents[1],'invalid-mode',{'adventure_mode':'unknown'},now=self.now)
        with self.assertRaises(ValueError):
            explorations.request('admin',self.agents[1],'invalid-revision',{'party_id':party.pk,'party_revision':True},now=self.now)

    def test_party_projection_batches_roster_and_preserves_asset_permissions(self):
        from assets.models import Asset
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        from .party_queries import snapshot
        run,party=self.start()
        for identity,owner,valid,kind in [('party-head','admin',True,'image'),
                ('party-foreign','other',True,'image'),('party-invalid','admin',False,'image'),
                ('party-document','admin',True,'document')]:
            Asset.objects.create(pk=identity,name=identity,original_name=identity,file_type=kind,file_size=1,
                file_path=identity,file_extension='png',mime_type='image/png',file_hash=identity,uploader=owner,is_valid=valid)
        for agent,identity in zip(self.agents,('party-head','party-foreign','party-invalid','party-document')):
            agent.battle_appearance={'version':3,'character_asset_id':identity}
            agent.save(update_fields=['battle_appearance'])
        with CaptureQueriesContext(connection) as single:
            solo=snapshot(run)
        self.force_clear(party,self.now+timedelta(seconds=15))
        for index in range(1,4):self.join(self.agents[index],f'projection-{index}',party)
        tick(party.pk,now=self.now+timedelta(seconds=45))
        run.refresh_from_db()
        with CaptureQueriesContext(connection) as multiple:
            team=snapshot(run)
        self.assertEqual(len(single),len(multiple))
        self.assertLessEqual(len(multiple),8)
        self.assertEqual(len(team['players']),4)
        visuals={player['id']:player['visual'] for player in team['players']}
        self.assertEqual(visuals[run.actor_id]['character_image_url'],solo['players'][0]['visual']['character_image_url'])
        for agent in self.agents[1:4]:
            self.assertNotIn('character_image_url',visuals[agent.pk])
        self.assertEqual({player['id'] for player in team['players']},{agent.pk for agent in self.agents[:4]})

    def test_party_projection_reports_missing_members_instead_of_hiding_them(self):
        from .party_queries import snapshot
        run,party=self.start()
        AdventureMember.objects.filter(party_id=party.pk).delete()
        with self.assertRaisesMessage(ValueError,'队伍成员缺少对应探索记录'):
            snapshot(run)

    def test_round_and_repeated_tick_then_leave(self):
        run,party=self.start()
        now=self.now+timedelta(seconds=15)
        tick(party.pk,party.revision,now)
        party.refresh_from_db()
        self.assertEqual(party.state['round'],1)
        head=party.head
        tick(party.pk,now=now)
        party.refresh_from_db()
        self.assertEqual(party.head,head)
        explorations.finish(run.pk,now=now)
        party.refresh_from_db()
        self.assertEqual(party.status,'completed')

    def test_serialized_party_frame_and_personal_chains_validate(self):
        from django.apps import apps
        from .sync import validate_source,metadata
        run,party=self.start()
        tick(party.pk,now=self.now+timedelta(seconds=15))
        data=[]
        for model in apps.get_app_config('system_settings').get_models():
            if model._meta.model_name in {'combatruntime','syncentitystate','agentexecutionlease'}:continue
            data+=json.loads(serializers.serialize('json',model.objects.all()))
        self.assertTrue(validate_source(data,metadata(data)))
        from .party_sync import validate_source as validate_party
        broken=copy.deepcopy(data)
        next(r for r in broken if r['model']=='system_settings.adventureparty')['fields']['state']['wave']=100
        with self.assertRaises(Exception):validate_party(broken)

    def data(self):
        from django.apps import apps
        from system_settings.sync_state import LOCAL_ONLY_MODEL_LABELS
        result=[]
        for model in apps.get_app_config('system_settings').get_models():
            if model._meta.label_lower in LOCAL_ONLY_MODEL_LABELS:continue
            result+=json.loads(serializers.serialize('json',model.objects.all()))
        return result

    def force_clear(self,party,now):
        from unittest.mock import patch
        def cleared(catalog,state,rng):
            state=copy.deepcopy(state);state['round']+=1
            for enemy in state['enemies'].values():enemy['hp']=0
            return state,[]
        with patch('system_settings.agent_world.combat.party_tick.step',side_effect=cleared):
            tick(party.pk,now=now)
        party.refresh_from_db()

    def test_four_person_wave_rewards_sync_and_return_to_single(self):
        from .sync import validate_source,metadata
        from .party_sync import validate_conflicts
        run,party=self.start()
        self.force_clear(party,self.now+timedelta(seconds=15))
        for i in range(1,4):self.join(self.agents[i],f'j{i}',party)
        tick(party.pk,now=self.now+timedelta(seconds=45))
        party.refresh_from_db()
        self.assertEqual((party.state['wave_count'],party.state['round_seconds']),(4,3))
        self.assertTrue(2<=len(party.state['enemies'])<=4)
        self.assertLessEqual(sum(e['rank']!='normal' for e in party.state['enemies'].values()),1)
        self.force_clear(party,self.now+timedelta(seconds=48))
        from .party_queries import snapshot
        from .queries import profile_view
        from .party_models import AdventureWave
        expected={e['template_id'] for w in AdventureWave.objects.filter(party_id=party.pk) for e in w.snapshot['monsters'].values()}
        self.assertTrue(expected<=set(profile_view('admin',self.agents[0])['discoveries']['defeated']))
        self.assertEqual(snapshot(run)['team_kills'],sum(len(w.snapshot['monsters']) for w in AdventureWave.objects.filter(party_id=party.pk)))
        data=self.data()
        self.assertTrue(validate_source(data,metadata(data)))
        fork=copy.deepcopy(data)
        event=next(r for r in fork if r['model']=='system_settings.adventureevent')
        event['fields']['digest']='fork'
        with self.assertRaises(Exception):validate_conflicts(data,fork)
        for i in range(1,4):explorations.finish(f'j{i}',now=self.now+timedelta(seconds=50))
        tick(party.pk,now=self.now+timedelta(seconds=78))
        party.refresh_from_db()
        self.assertEqual((party.state['wave_count'],party.state['round_seconds']),(1,15))
        data=self.data()
        self.assertTrue(validate_source(data,metadata(data)))

    def assert_cadence_billing(self,count):
        from unittest.mock import patch
        run,party=self.start()
        self.force_clear(party,self.now+timedelta(seconds=15))
        for i in range(1,count):self.join(self.agents[i],f'cadence-member-{i}',party)
        tick(party.pk,now=self.now+timedelta(seconds=45))
        cadence={1:15,2:8,3:5,4:3}[count]
        with patch('system_settings.agent_world.combat.party_tick.step',side_effect=lambda c,s,r:(copy.deepcopy(s),[])):
            for second in range(45+cadence,316,cadence):tick(party.pk,now=self.now+timedelta(seconds=second))
        run.refresh_from_db()
        self.assertEqual(run.result['energy'],14)
        profile=CombatProfile.objects.get(pk=run.actor_id)
        self.assertEqual(sum(profile.loot_progress['days'].values()),run.elapsed_seconds)
        for i in range(1,count):
            self.assertEqual(explorations.Exploration.objects.get(pk=f'cadence-member-{i}').result['energy'],12)

    def test_eight_second_round_crosses_energy_boundary_without_missing_charge(self):
        self.assert_cadence_billing(2)

    def test_three_second_round_crosses_energy_boundary_without_missing_charge(self):
        self.assert_cadence_billing(4)

    def test_five_second_round_splits_midnight_quota_by_actual_time(self):
        self.now=self.now.replace(hour=23,minute=58,second=0,microsecond=0)
        self.assert_cadence_billing(3)
        profile=CombatProfile.objects.get(pk=self.agents[0].pk)
        self.assertEqual(profile.loot_progress['days'][self.now.date().isoformat()],120)
        self.assertGreater(profile.loot_progress['days'][(self.now+timedelta(days=1)).date().isoformat()],0)

    def test_fifteen_second_solo_round_keeps_existing_time_billing(self):
        self.assert_cadence_billing(1)

    def test_resume_waits_for_all_members_and_never_bills_paused_time(self):
        from unittest.mock import patch
        from .party_tick import pause
        from .sync import validate_source,metadata
        run,party=self.start()
        self.force_clear(party,self.now+timedelta(seconds=15))
        member=self.join(self.agents[1],'paused-member',party)
        tick(party.pk,now=self.now+timedelta(seconds=45))
        party.refresh_from_db();run.refresh_from_db();member.refresh_from_db()
        elapsed=[run.elapsed_seconds,member.elapsed_seconds]
        pause(party,[run,member],self.now+timedelta(seconds=100),'test pause')
        explorations.resume(run.pk,now=self.now+timedelta(seconds=200))
        party.refresh_from_db()
        self.assertEqual(party.status,'paused')
        tick(party.pk,now=self.now+timedelta(seconds=208))
        run.refresh_from_db();member.refresh_from_db()
        self.assertEqual([run.elapsed_seconds,member.elapsed_seconds],elapsed)
        self.assertEqual(member.status,'paused')
        explorations.resume(member.pk,now=self.now+timedelta(seconds=210))
        party.refresh_from_db()
        self.assertEqual(party.status,'active')
        with patch('system_settings.agent_world.combat.party_tick.step',side_effect=lambda c,s,r:(copy.deepcopy(s),[])):
            tick(party.pk,now=self.now+timedelta(seconds=218))
        run.refresh_from_db();member.refresh_from_db()
        self.assertEqual([run.elapsed_seconds,member.elapsed_seconds],[n+8 for n in elapsed])
        data=self.data();self.assertTrue(validate_source(data,metadata(data)))

    def test_paused_member_leaving_releases_locally_resumed_party(self):
        from .party_tick import pause
        run,party=self.start()
        self.force_clear(party,self.now+timedelta(seconds=15))
        member=self.join(self.agents[1],'paused-leaver',party)
        tick(party.pk,now=self.now+timedelta(seconds=45))
        party.refresh_from_db();run.refresh_from_db();member.refresh_from_db()
        pause(party,[run,member],self.now+timedelta(seconds=100),'test pause')
        explorations.resume(run.pk,now=self.now+timedelta(seconds=200))
        explorations.finish(member.pk,now=self.now+timedelta(seconds=205))
        party.refresh_from_db();run.refresh_from_db()
        self.assertEqual(party.status,'active')
        self.assertEqual(run.state['accounted_at'],(self.now+timedelta(seconds=205)).isoformat())

    def test_three_turn_skills_are_reconciled_at_new_thresholds(self):
        self.assertEqual(self.catalog.learned('job.highpriest',50)['skill.player.053'],1)
        self.assertEqual(self.catalog.learned('job.highpriest',60)['skill.player.054'],1)
        self.assertNotIn('skill.player.075',self.catalog.learned('job.highpriest',60))
        self.assertEqual(self.catalog.learned('job.highpriest',90)['skill.player.075'],3)

    def test_short_free_activity_saves_one_join_choice_and_skips_location_duration_models(self):
        from unittest.mock import patch
        from ..life_models import LifeItem,LifeConfig
        from .party_options import select_for_preparation
        from .preparation_decision import build_plan
        from .preparation import validate
        run,party=self.start()
        LifeConfig.objects.create(pk='admin',settings={'active_start':'00:00','active_end':'24:00','min_gap_minutes':0})
        item=LifeItem.objects.create(pk='short-idle',owner_id='admin',actor_id=self.agents[1].pk,activity='exploration',
            original_at=storage_time(self.now),scheduled_at=storage_time(self.now),status='running',
            context={'manual':True,'interleaving':{'version':1,'expires_at':(self.now+timedelta(minutes=20)).isoformat(),'choices':[]}})
        calls=[]
        def finite(run,agent,question,state,choices,fallback,instructions,**kwargs):
            calls.append((question,len(choices)))
            selected=fallback if fallback in choices else next(iter(choices))
            return selected,{'choice':selected,'source':'single_candidate' if len(choices)==1 else 'test_model'}
        with patch('system_settings.agent_world.life_interleaving_candidates.available_window',return_value=900),patch(
            'system_settings.agent_world.life_interleaving_choices.choose',return_value=party.pk) as choice,patch(
            'system_settings.agent_world.combat.preparation_decision._choice',side_effect=finite):
            joining=explorations.request('admin',self.agents[1],'short-join',{},life_item=item,now=self.now)
            self.assertTrue(joining.snapshot['join_only'])
            select_for_preparation(joining,self.agents[1]);select_for_preparation(joining,self.agents[1])
            # A sole legal party is code-selected, without invoking the model.
            self.assertEqual(choice.call_count,0)
            plan,trace=build_plan(joining,self.agents[1],check=lambda:None)
            self.assertEqual(plan['duration_seconds'],900)
            self.assertEqual(dict(calls)['dungeon_id'],1)
            self.assertEqual(dict(calls)['duration_seconds'],1)
            validate(joining,plan)
            queued=explorations.depart(joining.pk,plan,now=self.now)
            self.assertEqual(queued.phase,'waiting_party')

    def test_api_options_and_shared_event_pagination_are_owner_scoped(self):
        from django.contrib.auth.models import User
        from rest_framework.test import APIClient
        run,party=self.start()
        client=APIClient();client.force_authenticate(User.objects.create_superuser('admin',password='test'))
        response=client.get(f'/api/settings/agent-world/combat/agents/{self.agents[1].pk}/adventure-options/')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['data']['parties'][0]['id'],party.pk)
        response=client.get(f'/api/settings/agent-world/combat/parties/{party.pk}/events/',{'before':100})
        self.assertEqual(response.status_code,200)
        self.assertTrue(response.json()['data']['events'])
        client.force_authenticate(User.objects.create_user('stranger',password='test'))
        self.assertEqual(client.get(f'/api/settings/agent-world/combat/parties/{party.pk}/events/').status_code,404)

    def test_finishing_last_member_cancels_waiting_preparation(self):
        run,party=self.start()
        pending=self.join(self.agents[1],'cancelled-join',party)
        explorations.finish(run.pk,now=self.now+timedelta(seconds=1))
        pending.refresh_from_db()
        self.assertEqual(pending.status,'failed')
        self.assertNotIn('energy',pending.result)

    def test_same_names_remain_distinct_and_periodic_healing_never_revives(self):
        from .party_engine import step
        c=self.catalog
        a=PartyRuleTests().unit('a',hp=1,skills={'skill.player.010':1})
        b=PartyRuleTests().unit('b')
        enemy=PartyRuleTests().unit('enemy')
        a['name']=b['name']='同名居民'
        a['states']=[{'code':'dot','name':'毒','group':'poison','raw':999,'remaining':1,'next_tick':1,'source_level':70,'damage_type':'magic'},
                     {'code':'hot','name':'祷言','group':'regeneration','raw':100,'remaining':3,'next_tick':1,'source_id':'b'}]
        state,events=step(c,{'players':{'a':a,'b':b},'enemies':{'enemy':enemy},'round':0},random.Random(1))
        self.assertEqual(state['players']['a']['hp'],0)
        for e in events:
            self.assertIn(e['actor_id'],('a','b','enemy'))

    def test_wave_leave_request_keeps_earned_receipts_and_releases_member(self):
        from .models import Exploration
        from .sync import validate_source,metadata
        run,party=self.start()
        run.state['leave_after_wave']=True;run.save()
        # The command fact binds the personal state change, like the public leave command.
        from .facts import append
        append(CombatProfile.objects.get(pk=run.actor_id),'leave-request','command',{'arguments':{'operation':'leave'}},run)
        self.force_clear(party,self.now+timedelta(seconds=15))
        run.refresh_from_db()
        self.assertEqual(run.status,'recalled')
        self.assertGreater(run.result['kills'],0)
        self.assertTrue(validate_source(self.data(),metadata(self.data())))

    def test_full_snapshot_restore_preserves_party_and_never_grants_runtime(self):
        from utils.sync_manager import SyncManager
        from ..life_config import config_for
        from ..cooking_catalog import catalog_for
        from .models import CombatRuntime
        from .sync import validate_source,metadata
        run,party=self.start()
        self.force_clear(party,self.now+timedelta(seconds=15))
        self.join(self.agents[1],'restore-member',party)
        tick(party.pk,now=self.now+timedelta(seconds=45))
        config_for('admin');catalog_for('admin')
        manager=SyncManager()
        source=manager.build_snapshot_data()
        meta=manager.build_snapshot_meta(data_list=source)
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(source),meta)
            self.assertEqual(AdventureMember.objects.filter(party_id=party.pk,active=True).count(),2)
            self.assertFalse(CombatRuntime.objects.filter(authorized=True).exists())
            current=manager.build_snapshot_data()
            self.assertTrue(validate_source(current,metadata(current)))

    def test_four_person_event_pressure_is_shared_and_projection_is_bounded(self):
        import time
        from unittest.mock import patch
        from .party_queries import snapshot
        from .party_models import AdventureEvent
        run,party=self.start()
        self.force_clear(party,self.now+timedelta(seconds=15))
        for i in range(1,4):self.join(self.agents[i],f'pressure{i}',party)
        tick(party.pk,now=self.now+timedelta(seconds=45))
        party.refresh_from_db();start=party.head;started=time.monotonic()
        def round_only(c,s,r):
            result=copy.deepcopy(s);result['round']+=1
            return result,[{'kind':'defend','actor_id':identity,'actor':u['name']} for identity,u in result['players'].items()]
        with patch('system_settings.agent_world.combat.party_tick.step',side_effect=round_only):
            for i in range(1,41):tick(party.pk,now=self.now+timedelta(seconds=45+i*3))
        party.refresh_from_db();run.refresh_from_db()
        self.assertEqual(party.head-start,40)
        self.assertEqual(AdventureEvent.objects.filter(party_id=party.pk,sequence__gt=start).count(),40)
        self.assertEqual(len(snapshot(run)['events']),40)
        print(f'party pressure: 4 members / 40 shared rounds in {time.monotonic()-started:.3f}s (isolated SQLite; no production throughput claim)')

    def test_unchanged_rounds_never_load_or_rehash_previous_wave_contents(self):
        from unittest.mock import patch
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        run,party=self.start()
        self.force_clear(party,self.now+timedelta(seconds=15))
        tick(party.pk,now=self.now+timedelta(seconds=45))
        with patch('system_settings.agent_world.combat.party_tick.step',side_effect=lambda c,s,r:(copy.deepcopy(s),[])), patch(
                'system_settings.agent_world.combat.party_integrity.wave_digest',side_effect=AssertionError('不应重算波次原文')):
            with CaptureQueriesContext(connection) as queries:
                tick(party.pk,now=self.now+timedelta(seconds=60))
                tick(party.pk,now=self.now+timedelta(seconds=75))
        wave_reads=[row['sql'] for row in queries if 'adventurewave' in row['sql'].lower()]
        self.assertTrue(wave_reads)
        self.assertTrue(all('"snapshot"' not in sql and '"result"' not in sql for sql in wave_reads))
        from .sync import validate_source,metadata
        self.assertTrue(validate_source(self.data(),metadata(self.data())))

    def test_historical_wave_content_and_fingerprint_are_both_checked_on_sync(self):
        from .party_integrity import wave_digest
        from .party_sync import WAVE
        from .sync import validate_source,metadata
        from utils.sync_manager import SyncError
        _,party=self.start()
        self.force_clear(party,self.now+timedelta(seconds=15))
        source=self.data()
        for field in ('snapshot','result','ended_at'):
            with self.subTest(field=field):
                broken=copy.deepcopy(source)
                row=next(row for row in broken if row['model']==WAVE)
                if field=='snapshot':
                    next(iter(row['fields']['snapshot']['monsters'].values()))['stats']['hp_max']+=1
                elif field=='result':
                    row['fields']['result']['unexpected']='改过的历史结果'
                else:
                    row['fields']['ended_at']=self.now.isoformat()
                with self.assertRaisesMessage(SyncError,'波次内容与固化指纹不一致'):
                    validate_source(broken,metadata(broken))
                row['fields']['content_digest']=wave_digest({'id':row['pk'],**row['fields']})
                with self.assertRaisesMessage(SyncError,'独立合并'):
                    validate_source(broken,metadata(broken))

    def test_wave_partial_save_hashes_only_the_fields_actually_written(self):
        from .party_models import AdventureWave
        from .party_integrity import WAVE_FIELDS,wave_digest
        _,party=self.start()
        wave=AdventureWave.objects.get(party_id=party.pk)
        original=wave.content_digest
        old_snapshot=copy.deepcopy(wave.snapshot)
        wave.snapshot={'unsaved':'不会写入'}
        wave.result={'note':'当前波次变化'}
        wave.save(update_fields=['result'])
        wave.refresh_from_db()
        self.assertEqual(wave.snapshot,old_snapshot)
        self.assertNotEqual(wave.content_digest,original)
        self.assertEqual(wave.content_digest,wave_digest({key:getattr(wave,key) for key in WAVE_FIELDS}))

    def test_legacy_party_snapshot_restores_over_newer_local_fields_and_upgrades_once(self):
        from utils.sync_manager import SyncManager
        from ..life_config import config_for
        from ..cooking_catalog import catalog_for
        from .party_models import AdventureWave
        from .party_integrity import aggregate_frame,canonical
        from .party_sync import PARTY,MEMBER,WAVE
        from .party_facts import append as shared_fact
        from .store import digest
        from .sync import validate_source,metadata
        _,party=self.start()
        config_for('admin');catalog_for('admin')
        manager=SyncManager()
        legacy=manager.build_snapshot_data()
        party_row=next(row for row in legacy if row['model']==PARTY)
        members=[{'id':row['pk'],**row['fields']} for row in legacy if row['model']==MEMBER]
        waves=[{'id':row['pk'],**row['fields']} for row in legacy if row['model']==WAVE]
        party_row['fields']['frame_version']=1
        party_row['fields']['frame']=digest(canonical(aggregate_frame(party_row['fields'],members,waves)))
        party_row['fields'].pop('frame_version')
        for row in legacy:
            if row['model']==WAVE:row['fields'].pop('content_digest')
        meta={**manager.build_snapshot_meta(data_list=legacy),'combat_schema_version':13}
        self.assertTrue(validate_source(legacy,meta))
        # Existing newer local hashes must not leak into this older complete snapshot.
        wave=AdventureWave.objects.get(party_id=party.pk)
        wave.result={'local_only':'较新的本地结果'};wave.save()
        party.refresh_from_db();shared_fact(party,'test_update',{})
        manager.apply_snapshot_data(copy.deepcopy(legacy),meta)
        restored=manager.build_snapshot_data()
        self.assertTrue(validate_source(restored,metadata(restored)))
        wave.refresh_from_db();party.refresh_from_db()
        self.assertNotIn('local_only',wave.result)
        self.assertEqual(party.frame_version,2)
        self.assertTrue(wave.content_digest)

    def test_new_party_fingerprints_require_sync_14_and_future_versions_are_rejected(self):
        from .sync import validate_source,metadata
        from utils.sync_manager import SyncError
        self.start()
        source=self.data();meta=metadata(source)
        self.assertEqual(meta['combat_schema_version'],16)
        with self.assertRaisesMessage(SyncError,'需要战斗同步14'):
            validate_source(source,{**meta,'combat_schema_version':13})
        with self.assertRaisesMessage(SyncError,'版本过新'):
            validate_source(source,{**meta,'combat_schema_version':17})

    def test_completed_legacy_party_restores_without_converting_history(self):
        from utils.sync_manager import SyncManager
        from ..life_config import config_for
        from ..cooking_catalog import catalog_for
        from .party_integrity import aggregate_frame,canonical
        from .party_sync import PARTY,MEMBER,WAVE
        from .store import digest
        run,party=self.start()
        run=explorations.finish(run.pk,now=self.now+timedelta(seconds=1))
        config_for('admin');catalog_for('admin')
        manager=SyncManager();source=manager.build_snapshot_data()
        row=next(row for row in source if row['model']==PARTY)
        row['fields']['frame_version']=1
        row['fields']['frame']=digest(canonical(aggregate_frame(row['fields'],
            [{'id':r['pk'],**r['fields']} for r in source if r['model']==MEMBER],
            [{'id':r['pk'],**r['fields']} for r in source if r['model']==WAVE])))
        row['fields'].pop('frame_version')
        for row in source:
            if row['model']==WAVE:row['fields'].pop('content_digest')
        before=copy.deepcopy(run.result)
        manager.apply_snapshot_data(source,{**manager.build_snapshot_meta(data_list=source),'combat_schema_version':13})
        party.refresh_from_db();run.refresh_from_db()
        self.assertEqual((party.status,party.frame_version),('completed',1))
        self.assertEqual(run.result,before)
        # Export validates the old full frame, without upgrading or replaying it.
        manager.build_snapshot_data()

    def test_two_member_settlement_flows_into_each_residents_analytics(self):
        from ..analytics.combat_statistics import load_combat_statistics
        from ..analytics.combat_kills import load_combat_kills
        leader,party=self.start()
        self.force_clear(party,self.now+timedelta(seconds=15))
        self.join(self.agents[1],'analytics-member',party)
        tick(party.pk,now=self.now+timedelta(seconds=45))
        party.refresh_from_db()
        shared_count=len(party.state['enemies'])
        self.force_clear(party,self.now+timedelta(seconds=53))
        for identity in (leader.pk,'analytics-member'):
            explorations.finish(identity,'completed','统计结算检查',now=self.now+timedelta(seconds=54))
        residents={agent.pk:{'id':agent.pk,'name':agent.name} for agent in self.agents[:2]}
        stats=load_combat_statistics('admin',storage_time(self.now-timedelta(days=1)),
            storage_time(self.now+timedelta(days=1)),residents)
        for row in stats:
            run=explorations.Exploration.objects.get(actor_id=row['id'])
            self.assertEqual((row['explorations'],row['completed'],row['successRate']),(1,1,100.0))
            self.assertEqual(row['kills'],shared_count+(1 if row['id']==leader.actor_id else 0))
            self.assertEqual(sum(monster['kills'] for monster in row['monsters']),row['kills'])
            self.assertEqual(row['unclassifiedKills'],0)
            self.assertEqual(row['experience'],run.result['experience'])
        kills=list(load_combat_kills('admin',start=storage_time(self.now-timedelta(days=1)),end=storage_time(self.now+timedelta(days=1))))
        self.assertEqual(len({kill.identity for kill in kills}),shared_count+1)

    def test_analytics_keeps_partial_clear_after_leaving_and_excludes_waiting_members(self):
        from unittest.mock import patch
        from ..analytics.combat_statistics import load_combat_statistics
        leader,party=self.start()
        self.force_clear(party,self.now+timedelta(seconds=15))
        self.join(self.agents[1],'analytics-leaver',party)
        tick(party.pk,now=self.now+timedelta(seconds=45))
        party.refresh_from_db()
        self.assertEqual(len(party.state['enemies']),2)
        self.join(self.agents[2],'analytics-waiting',party)
        def partial(catalog,state,rng):
            state=copy.deepcopy(state);state['round']+=1
            next(iter(state['enemies'].values()))['hp']=0
            return state,[]
        with patch('system_settings.agent_world.combat.party_tick.step',side_effect=partial):
            tick(party.pk,now=self.now+timedelta(seconds=53))
        explorations.finish('analytics-leaver',now=self.now+timedelta(seconds=54))
        self.force_clear(party,self.now+timedelta(seconds=61))
        residents={agent.pk:{'id':agent.pk,'name':agent.name} for agent in self.agents[:3]}
        rows={row['id']:row for row in load_combat_statistics('admin',storage_time(self.now-timedelta(days=1)),
            storage_time(self.now+timedelta(days=1)),residents)}
        leaver=rows[self.agents[1].pk]
        self.assertEqual((leaver['kills'],leaver['unclassifiedKills'],leaver['recalled']),(1,0,1))
        self.assertEqual(sum(monster['kills'] for monster in leaver['monsters']),1)
        self.assertEqual(rows[leader.actor_id]['kills'],3)
        self.assertEqual(rows[self.agents[2].pk]['explorations'],0)
