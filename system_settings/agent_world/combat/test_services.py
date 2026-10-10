import json
from datetime import timedelta
from unittest.mock import patch
from django.core import serializers
from django.test import TestCase, TransactionTestCase
from system_settings.models import Agent, AIProvider, AIModel, WorldAction
from .models import CombatProfile, Exploration, CombatFact, CombatRuntime, CombatCatalog
from . import explorations
from .store import install
from .profiles import ensure
from .sync import validate_source, revoke
from ..life_time import storage_time, local_time
from ..inventory_stock import add_stock, stock_quantity


class ExplorationTests(TestCase):
    def setUp(self):
        provider=AIProvider.objects.create(name='test',type='OpenAi',base_url='https://example.invalid')
        model=AIModel.objects.create(name='test',type='chat',provider=provider)
        self.agent=Agent.objects.create(name='冒险者',model=model)
        self.now=storage_time(local_time());install()
        self.plan={'dungeon_id':'dungeon.moss_cave','style_id':'style.balanced','duration_seconds':1800,'potions':{}}

    def run_trip(self,key='trip'):
        run=explorations.request('admin',self.agent,key,{},now=self.now)
        return explorations.depart(run.pk,self.plan,now=self.now)

    def test_preparation_and_resume_respect_execution_token_length(self):
        from system_settings.models import AgentExecutionLease
        from .preparation import prepare
        field=AgentExecutionLease._meta.get_field('token')
        original_save=AgentExecutionLease.save

        def checked_save(lease,*args,**kwargs):
            # SQLite does not enforce varchar lengths; apply the schema validator on writes.
            field.clean(lease.token,lease)
            return original_save(lease,*args,**kwargs)

        run=explorations.request('admin',self.agent,'f'*64,{},now=self.now)
        with patch.object(AgentExecutionLease,'save',checked_save):
            run=prepare(run.pk,planner=lambda *args:self.plan)
            self.assertEqual(run.status,'active')
            lease=AgentExecutionLease.objects.get(agent=self.agent)
            self.assertLessEqual(len(lease.token),field.max_length)
            self.assertFalse(explorations.busy(self.agent.pk,excluding=run.pk))
            self.assertTrue(explorations.busy(self.agent.pk))
            run=explorations.tick(run.pk,now=self.now+timedelta(seconds=46))
            self.assertEqual(run.status,'paused')
            run=explorations.resume(run.pk,now=self.now+timedelta(seconds=47))
            self.assertEqual(run.status,'active')
            lease.refresh_from_db()
            self.assertLessEqual(len(lease.token),field.max_length)
            explorations.finish(run.pk,now=self.now+timedelta(seconds=48))
            lease.refresh_from_db()
            self.assertEqual(lease.token,'')
            self.assertIsNone(lease.until)

    def data(self):
        from django.apps import apps
        return json.loads(serializers.serialize('json',[row for model in apps.get_app_config('system_settings').get_models() if model.__name__!='CombatRuntime' for row in model.objects.all()]))

    def test_duplicate_start_round_recall_and_consumption(self):
        run=self.run_trip()
        self.assertEqual(explorations.request('admin',self.agent,'trip',{},now=self.now).pk,run.pk)
        self.assertEqual(WorldAction.objects.filter(snapshot__combat_energy=True).count(),2)
        revision=run.revision
        one=explorations.tick(run.pk,revision,self.now+timedelta(seconds=15))
        two=explorations.tick(run.pk,revision,self.now+timedelta(seconds=15))
        self.assertEqual(one.revision,two.revision)
        self.assertEqual(CombatFact.objects.filter(kind='round').count(),1)
        explorations.finish(run.pk,now=self.now+timedelta(seconds=16));explorations.finish(run.pk,now=self.now+timedelta(seconds=16))
        self.assertEqual(CombatFact.objects.filter(kind='terminal').count(),1)
        self.assertEqual(WorldAction.objects.filter(snapshot__combat_energy=True).count(),2)
        validate_source(self.data())
        from utils.sync_manager import SyncError
        bad=self.data()
        for row in bad:
            if row['model']=='system_settings.agentrunrecord':row['fields']['output']='其他探索的回顾'
        with self.assertRaisesMessage(SyncError,'回顾记录'):validate_source(bad)

    def test_escrow_return_exactly_once(self):
        ensure('admin',self.agent,self.now)
        # Seed inventory with an authentic mocked market receipt in another test; here validate escrow itself.
        add_stock(self.agent.pk,'admin',self.agent.name,'combat.potion.heal.1',3,'药剂','combat_potion',6)
        self.plan['potions']={'potion.heal.1':3};run=self.run_trip()
        self.assertEqual(stock_quantity(self.agent.pk,'admin','combat.potion.heal.1'),0)
        explorations.finish(run.pk,now=self.now);explorations.finish(run.pk,now=self.now)
        self.assertEqual(stock_quantity(self.agent.pk,'admin','combat.potion.heal.1'),3)

    def test_delay_restore_and_missing_sources(self):
        run=self.run_trip()
        run=explorations.tick(run.pk,now=self.now+timedelta(seconds=46))
        self.assertEqual(run.status,'paused');self.assertEqual(run.elapsed_seconds,0)
        validate_source(self.data())
        revoke();self.assertFalse(CombatRuntime.objects.filter(authorized=True).exists())
        bad=[row for row in self.data() if row['model']!='system_settings.worldaction']
        from utils.sync_manager import SyncError
        with self.assertRaises(SyncError):validate_source(bad)
        self.assertTrue(validate_source([]))

    def test_damaged_bundle_preserves_installed_version(self):
        old=install()
        with patch('system_settings.agent_world.combat.store.bundled',side_effect=ValueError('invalid')):
            self.assertEqual(install().version,old.version)
        self.assertEqual(CombatCatalog.objects.count(),1)
        from copy import deepcopy
        from .catalog import Catalog
        changed=deepcopy(old.tables);changed['monsters'][0]['name']='篡改同版本'
        with patch('system_settings.agent_world.combat.store.bundled',return_value=(Catalog(changed,old.version),'')):
            self.assertEqual(install().tables,old.tables)
        self.assertEqual(CombatCatalog.objects.get(pk=old.version).tables,old.tables)

    def test_complete_endpoint_block_fees_and_no_boundary_attack(self):
        run=self.run_trip()
        def immediate_kill(c,state,style,tick,rng,waiting=False):
            import copy
            result=copy.deepcopy(state)
            if not waiting:result['enemy']['hp']=0
            return result,[]
        with patch('system_settings.agent_world.combat.engine.step',side_effect=immediate_kill) as step:
            for index in range(1,121):run=explorations.tick(run.pk,now=self.now+timedelta(seconds=index*15))
        self.assertEqual(run.status,'completed');self.assertEqual(run.elapsed_seconds,1800)
        self.assertEqual(run.result['energy'],22)
        self.assertEqual(WorldAction.objects.filter(snapshot__combat_energy=True).count(),7)
        self.assertEqual(step.call_count,119)
        self.assertLessEqual(len(run.result['rewards']),5)
        self.assertFalse(any(r['kind']=='equipment' for r in run.result['rewards']))
        self.assertEqual(CombatProfile.objects.get(pk=self.agent.pk).loot_progress['gear'],1)
        validate_source(self.data())

    def test_quota_and_day_budget_survive_short_restart(self):
        from .rewards import accrue
        profile=ensure('admin',self.agent,self.now)
        accrue(profile.loot_progress,300,'2026-10-10');profile.save()
        from .facts import append
        append(profile,'fixture-quota','fixture',{})
        one=self.run_trip();explorations.finish(one.pk,now=self.now)
        profile.refresh_from_db();self.assertEqual(profile.loot_progress['loot'],1)
        two=self.run_trip('trip-2');self.assertEqual(two.state['boss_seen'],False)
        profile.refresh_from_db();self.assertEqual(profile.loot_progress['loot'],1)
        parts=explorations.day_parts(local_time(self.now).replace(hour=23,minute=59,second=50,microsecond=0),15)
        self.assertEqual(sorted(parts.values()),[5,10])

    def test_fallen_is_unique_and_consumption_remains_successful(self):
        run=self.run_trip()
        def fallen(c,state,*args,**kwargs):
            state['player']['hp']=0
            return state,[{'kind':'dot','damage':100}]
        with patch('system_settings.agent_world.combat.engine.step',side_effect=fallen):
            run=explorations.tick(run.pk,now=self.now+timedelta(seconds=15))
        self.assertEqual(run.status,'fallen')
        self.assertEqual(CombatProfile.objects.get(pk=self.agent.pk).hp,0)
        self.assertEqual(WorldAction.objects.filter(status='success',snapshot__combat_energy=True).count(),2)
        self.assertEqual(explorations.finish(run.pk).status,'fallen')
        validate_source(self.data())

    def test_preparation_purchases_reuse_session_and_survive_departure_failure(self):
        from system_settings.models import SystemSetting
        from ..market_models import MarketTransaction,MarketSession
        from .preparation import prepare
        from .models import CombatIntegrity
        SystemSetting.objects.create(key='system_mcp_config',value={'enabled':True})
        self.agent.money=1000;self.agent.save()
        run=explorations.request('admin',self.agent,'prepared',{},now=self.now)
        plan={**self.plan,'purchases':{'potion.heal.1':2,'potion.mana.1':1},'potions':{'potion.heal.1':2},'equipment':{}}
        with patch('system_settings.agent_world.combat.preparation.depart',side_effect=ValueError('late resource change')):
            with self.assertRaises(ValueError):prepare(run.pk,planner=lambda *args:plan)
        self.assertEqual(MarketTransaction.objects.count(),2)
        self.assertEqual(MarketSession.objects.count(),1)
        self.assertEqual(WorldAction.objects.filter(snapshot__market_energy=True).count(),1)
        self.assertEqual(stock_quantity(self.agent.pk,'admin','combat.potion.heal.1'),2)
        self.assertEqual(Exploration.objects.get(pk=run.pk).status,'failed')
        self.assertEqual(CombatIntegrity.objects.get(pk=self.agent.pk).head,CombatFact.objects.filter(actor_id=self.agent.pk).count())
        validate_source(self.data())

    def test_export_restore_and_fork_rejection_without_network(self):
        from utils.sync_manager import SyncManager,SyncError
        run=self.run_trip();manager=SyncManager()
        data=manager.build_snapshot_data();meta=manager.build_snapshot_meta(data_list=data)
        self.assertEqual(meta['combat_actors'],[self.agent.pk])
        self.assertFalse(any(r['model']=='system_settings.combatruntime' for r in data))
        validate_source(data,meta)
        manager.apply_snapshot_data(data,meta,full_overwrite=True)
        run.refresh_from_db();self.assertEqual(run.status,'paused')
        self.assertFalse(CombatRuntime.objects.filter(authorized=True).exists())
        validate_source(manager.build_snapshot_data())
        bad=self.data()
        for row in bad:
            if row['model']=='system_settings.combatprofile':row['fields']['progression']['level']=50
        with self.assertRaises(SyncError):validate_source(bad)
        missing=[r for r in data if r['model'] not in ('system_settings.combatprofile','system_settings.combatfact','system_settings.combatintegrity','system_settings.equipmentinstance','system_settings.exploration','system_settings.combatencounter')]
        with self.assertRaises(SyncError):validate_source(missing,meta)

    def test_other_device_cannot_resume_and_busy_resident_cannot_trade(self):
        from ..market_sessions import enter
        from system_settings.models import SystemSetting
        SystemSetting.objects.create(key='system_mcp_config',value={'enabled':True})
        from .queries import snapshot
        run=self.run_trip();revoke();run.refresh_from_db()
        runtime=CombatRuntime.objects.get(pk=run.pk)
        runtime.requests={'origin':'other-backend-incarnation'};runtime.save()
        self.assertFalse(snapshot(run)['can_control'])
        with self.assertRaisesMessage(ValueError,'其他设备'):explorations.resume(run.pk,now=self.now)
        CombatRuntime.objects.filter(pk=run.pk).delete()
        with self.assertRaisesMessage(ValueError,'其他设备'):explorations.resume(run.pk,now=self.now)
        with self.assertRaisesMessage(ValueError,'战斗探索'):enter('admin',self.agent,'market')

    def test_api_read_only_permission_camel_contract_and_idempotency(self):
        from django.contrib.auth.models import User
        from rest_framework.test import APIClient
        from ..life_models import LifeProfile
        admin=User.objects.create_user('admin');other=User.objects.create_user('other');client=APIClient();client.force_authenticate(admin)
        url=f'/api/settings/agent-world/combat/agents/{self.agent.pk}/'
        data=client.get(url).json()['data']
        self.assertIn('promotionOptions',data);self.assertIn('hpMax',data['attributes'])
        self.assertFalse(CombatProfile.objects.exists())
        self.assertEqual(client.post(url,{'operation':'prepare'},format='json').status_code,409)
        result=client.post(url,{'key':'api-trip','operation':'prepare','constraints':{'durationSeconds':1800,'dungeonId':'dungeon.moss_cave','styleId':'style.balanced'}},format='json')
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()['data']['status'],'preparing')
        repeated=client.post(url,{'key':'api-trip','operation':'prepare','constraints':{'durationSeconds':1800,'dungeonId':'dungeon.moss_cave','styleId':'style.balanced'}},format='json')
        self.assertEqual(repeated.status_code,200);self.assertEqual(Exploration.objects.count(),1)
        client.force_authenticate(other)
        self.assertEqual(client.get(url).status_code,403)
        self.assertEqual(client.get('/api/settings/agent-world/combat/explorations/api-trip/').status_code,404)

    def test_manual_life_remains_running_with_automatic_off_and_cancel_releases_lease(self):
        from system_settings.agent_task_scheduler import AgentTaskScheduler
        from system_settings.models import AgentExecutionLease
        from ..life_config import DEFAULTS
        from ..life_models import LifeConfig, LifeItem
        from ..life_manual import run_manual_life
        from ..life_views import LifeScheduleView
        from .schedule import ensure_task
        from django.contrib.auth.models import User
        ensure('admin',self.agent,self.now)
        LifeConfig.objects.create(pk='admin',settings={**DEFAULTS,'agent_ids':[self.agent.pk]},migrated=True)
        task=ensure_task('admin')
        run_manual_life(task,self.agent.pk,'admin',AgentTaskScheduler())
        item=LifeItem.objects.get(activity='exploration');run=Exploration.objects.get(life_item_id=item.pk)
        self.assertEqual(item.status,'running')
        explorations.depart(run.pk,self.plan,now=self.now)
        self.assertTrue(AgentExecutionLease.objects.filter(agent_id=self.agent.pk,token__startswith='combat:').exists())
        # Directly exercise the authenticated view through its normal DRF dispatch.
        from rest_framework.test import APIRequestFactory, force_authenticate
        request=APIRequestFactory().post('/',{'action':'cancel','reason':'结束观察'},format='json')
        force_authenticate(request,User.objects.create_superuser('admin','fixture@example.invalid','fixture'))
        response=LifeScheduleView.as_view()(request,identity=item.pk)
        self.assertEqual(response.status_code,200)
        item.refresh_from_db();run.refresh_from_db()
        self.assertEqual((item.status,run.status),('completed','recalled'))
        self.assertFalse(AgentExecutionLease.objects.filter(agent_id=self.agent.pk,token__startswith='combat:').exists())
        validate_source(self.data())

    def test_custom_task_lease_rejects_preparing_and_missing_encounter_rejected(self):
        from system_settings.models import AgentExecutionLease
        from ..execution import execution_lease
        self.run_trip()
        with execution_lease(AgentExecutionLease,{'agent':self.agent}) as token:self.assertIsNone(token)
        from utils.sync_manager import SyncError
        bad=[row for row in self.data() if row['model']!='system_settings.combatencounter']
        with self.assertRaises(SyncError):validate_source(bad)

    def test_resume_rechecks_daily_budget(self):
        from .models import CombatConfig
        run=self.run_trip();revoke()
        profile=CombatProfile.objects.get(pk=self.agent.pk)
        profile.loot_progress['days']={local_time(self.now).date().isoformat():1799};profile.save()
        CombatConfig.objects.update_or_create(pk='admin',defaults={'daily_minutes':30})
        with self.assertRaisesMessage(ValueError,'当日时间额度'):explorations.resume(run.pk,now=self.now)

    def test_dead_worker_revokes_before_any_replay(self):
        from .worker import recover_stopped_process
        run=self.run_trip()
        CombatRuntime.objects.create(pk='combat-worker',requests={'process_id':2147483647},token='stale',until=self.now+timedelta(minutes=10))
        with patch('system_settings.agent_world.combat.worker.os.kill',side_effect=ProcessLookupError):recover_stopped_process()
        run.refresh_from_db()
        self.assertEqual((run.status,run.elapsed_seconds),('paused',0))
        self.assertFalse(CombatRuntime.objects.filter(authorized=True).exists())
        self.assertIsNone(CombatRuntime.objects.get(pk='combat-worker').until)
        validate_source(self.data())

    def test_recovery_replenishes_mp_during_fallen_rest(self):
        from .profiles import recover, stats
        profile=ensure('admin',self.agent,self.now)
        profile.hp=0;profile.mp=0;profile.rest_until=self.now+timedelta(minutes=30);profile.save()
        recover(profile,self.now+timedelta(minutes=30))
        derived=stats(profile)
        self.assertEqual(profile.hp,max(1,int(derived['hp_max']*.2)))
        self.assertEqual(profile.mp,min(derived['mp_max'],max(1,int(derived['mp_max']*.1))*6))
        hp,mp=profile.hp,profile.mp
        recover(profile,self.now+timedelta(minutes=30));self.assertEqual((hp,mp),(profile.hp,profile.mp))

    def test_market_tools_supply_and_rejected_purchase_keep_entry_fact(self):
        from system_settings.models import SystemSetting
        from ..market_tools import call_market_tool
        from ..market_models import MarketTransaction
        SystemSetting.objects.create(key='system_mcp_config',value={'enabled':True})
        ensure('admin',self.agent,self.now)
        session=call_market_tool('enter_market',{'request_id':'supply-market'},self.agent)
        args={'request_id':'buy-heal','session_id':session['session_id'],'potion_id':'potion.heal.1','quantity':1}
        first=call_market_tool('buy_combat_potion',args,self.agent)
        self.assertEqual(call_market_tool('buy_combat_potion',args,self.agent)['total'],first['total'])
        with self.assertRaises(ValueError):call_market_tool('buy_combat_potion',{**args,'request_id':'bad-buy','quantity':21},self.agent)
        self.assertEqual(MarketTransaction.objects.count(),1)
        self.assertEqual(WorldAction.objects.filter(snapshot__market_energy=True).count(),1)
        validate_source(self.data())

    def test_catalog_adoption_keeps_historical_growth_and_sync_provenance(self):
        profile=ensure('admin',self.agent,self.now)
        before=json.loads(json.dumps(profile.progression))
        old=CombatCatalog.objects.get(pk=profile.catalog_id)
        CombatCatalog.objects.create(pk='combat-1.0.1',digest=old.digest,tables=old.tables)
        run=explorations.request('admin',self.agent,'catalog-upgrade',{},now=self.now)
        profile.refresh_from_db()
        self.assertEqual((profile.catalog_id,run.catalog_id),('combat-1.0.1','combat-1.0.1'))
        self.assertEqual(profile.progression,before)
        self.assertEqual(CombatFact.objects.filter(kind='catalog').count(),1)
        self.assertEqual(CombatCatalog.objects.count(),2)
        validate_source(self.data())


class ConcurrencyTests(TransactionTestCase):
    def setUp(self):
        provider=AIProvider.objects.create(name='test',type='OpenAi',base_url='https://example.invalid')
        model=AIModel.objects.create(name='test',type='chat',provider=provider)
        self.agent=Agent.objects.create(name='并发冒险者',model=model)
        self.now=storage_time(local_time());install()
        run=explorations.request('admin',self.agent,'concurrent-run',{},now=self.now)
        self.run=explorations.depart(run.pk,{'dungeon_id':'dungeon.moss_cave','style_id':'style.balanced','duration_seconds':1800,'potions':{}},now=self.now)

    def parallel(self,*actions):
        from concurrent.futures import ThreadPoolExecutor
        from django.db import close_old_connections
        def execute(action):
            close_old_connections()
            try:return action().status
            finally:close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:return list(pool.map(execute,actions))

    def test_workers_only_commit_one_round_for_same_revision(self):
        revision=self.run.revision
        self.parallel(*[lambda:explorations.tick(self.run.pk,revision,self.now+timedelta(seconds=15)) for _ in range(2)])
        self.run.refresh_from_db()
        self.assertEqual(self.run.elapsed_seconds,15)
        self.assertEqual(CombatFact.objects.filter(kind='round').count(),1)
        self.assertEqual(WorldAction.objects.filter(snapshot__combat_energy=True).count(),2)

    def test_recall_competing_with_round_has_one_terminal(self):
        self.parallel(lambda:explorations.tick(self.run.pk,self.run.revision,self.now+timedelta(seconds=15)),lambda:explorations.finish(self.run.pk,now=self.now+timedelta(seconds=15)))
        self.run.refresh_from_db()
        self.assertEqual(self.run.status,'recalled')
        self.assertEqual(CombatFact.objects.filter(kind='terminal').count(),1)
        self.assertLessEqual(CombatFact.objects.filter(kind='round').count(),1)
        self.assertEqual(WorldAction.objects.filter(snapshot__combat_energy=True).count(),2)
