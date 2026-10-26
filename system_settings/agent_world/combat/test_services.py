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
from utils.sync_merge import item_identity, revision_key


class ExplorationTests(TestCase):
    def setUp(self):
        # Legacy in-flight explorations keep the personal engine after this release.
        legacy = patch('system_settings.agent_world.combat.party_sessions.modern', return_value=False)
        legacy.start()
        self.addCleanup(legacy.stop)
        provider=AIProvider.objects.create(name='test',type='OpenAi',base_url='https://example.invalid')
        model=AIModel.objects.create(name='test',type='chat',provider=provider)
        self.agent=Agent.objects.create(name='冒险者',model=model)
        self.now=storage_time(local_time());install()
        self.plan={'dungeon_id':'dungeon.moss_cave','style_id':'style.balanced','duration_seconds':1800,'potions':{}}
        self.preparation_plan={**self.plan,'dungeon_id':'dungeon.sprout_meadow'}

    def run_trip(self,key='trip'):
        run=explorations.request('admin',self.agent,key,{},now=self.now)
        return explorations.depart(run.pk,self.plan,now=self.now)

    def test_profile_api_serializes_current_and_legacy_starter_equipment(self):
        from django.contrib.auth.models import User
        from rest_framework.test import APIClient
        from .models import EquipmentInstance

        profile = ensure('admin', self.agent, self.now)
        starter = EquipmentInstance.objects.get(pk=profile.loadout['weapon'])
        self.assertTrue(starter.snapshot.get('equipment_type'))
        client = APIClient()
        client.force_authenticate(User.objects.create_superuser('admin', password='test-password'))
        url = f'/api/settings/agent-world/combat/agents/{self.agent.pk}/'

        for template_id in ('equip.training_sword', 'equip.sword'):
            with self.subTest(template_id=template_id):
                starter.template_id = template_id
                starter.snapshot = {**starter.snapshot, 'template_id': template_id}
                starter.save(update_fields=['template_id', 'snapshot'])
                original_snapshot = json.loads(json.dumps(starter.snapshot))
                response = client.get(url)
                self.assertEqual(response.status_code, 200)
                data = response.json()['data']
                item = next(row for row in data['equipment'] if row['id'] == starter.pk)
                self.assertEqual(item['templateId'], template_id)
                self.assertEqual(item['displayType'], 'generic')
                self.assertIn('equip.training_sword', data['discoveries']['equipment'])
                starter.refresh_from_db()
                self.assertEqual(starter.snapshot, original_snapshot)

    def test_existing_gear_displays_effective_base_stats_without_rewriting_snapshot(self):
        from .models import EquipmentInstance
        from .queries import profile_view
        profile = ensure('admin', self.agent, self.now)
        legacy = EquipmentInstance.objects.create(
            pk='legacy-blue-sword', owner_id='admin', actor_id=self.agent.pk,
            catalog_id=profile.catalog_id, template_id='equip.sword', bound=False,
            snapshot={'template_id': 'equip.sword', 'slot': 'weapon', 'level': 10, 'quality': 'blue',
                      'stats': {'physical_attack': 28, 'strength': 2},
                      'affixes': [{'id': 'affix.strength', 'stat': 'strength', 'value': 2, 'min': 2, 'max': 4}],
                      'name': '长剑', 'value': '0'})
        original = json.loads(json.dumps(legacy.snapshot))
        row = next(item for item in profile_view('admin', self.agent)['equipment'] if item['id'] == legacy.pk)
        self.assertEqual(row['snapshot']['stats'], {'physical_attack': 37, 'strength': 2})
        legacy.refresh_from_db()
        self.assertEqual(legacy.snapshot, original)

    def test_snapshot_reads_current_extended_head_layer_for_existing_run(self):
        from assets.models import Asset
        from .queries import snapshot
        run = self.run_trip()
        asset = Asset.objects.create(id='long-hair-head', name='head.png', uploader='admin',
                                     file_type='image', file_size=10, file_path='image/head.png',
                                     file_extension='.png', mime_type='image/png', file_hash='head-hash')
        self.agent.battle_appearance = {'version': 2, 'head_asset_id': asset.pk, 'transform': {'hair_layer': 'behind'}}
        self.agent.save(update_fields=['battle_appearance'])
        visual = snapshot(run)['visual']
        self.assertEqual(visual['head_image_url'], '/api/resource/view/long-hair-head')
        self.assertTrue(visual['head_behind_body'])
        self.agent.battle_appearance = None
        self.agent.save(update_fields=['battle_appearance'])
        self.assertNotIn('head_image_url', snapshot(run)['visual'])

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
            run=prepare(run.pk,planner=lambda *args:self.preparation_plan)
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

    def test_preparation_does_not_revalidate_already_worn_gear_but_checks_new_gear(self):
        from .models import EquipmentInstance
        from .preparation import prepare
        from .profiles import preview_equipment

        profile=ensure('admin',self.agent,self.now)
        starter=EquipmentInstance.objects.get(pk=profile.loadout['weapon'])
        starter.template_id='equip.sword'
        starter.snapshot={**starter.snapshot,'template_id':'equip.sword','name':'训练木剑'}
        starter.rules={**starter.rules,'job_levels':{'job.mage':10}}
        starter.save(update_fields=['template_id','snapshot','rules'])
        run=explorations.request('admin',self.agent,'worn-gear-still-departs',{},now=self.now)
        plan={**self.preparation_plan,'equipment':{'weapon':starter.pk}}

        run=prepare(run.pk,planner=lambda *args:plan)
        self.assertEqual(run.status,'active')

        new_gear=EquipmentInstance.objects.create(pk='new-training-sword',owner_id='admin',
            actor_id=self.agent.pk,catalog_id=starter.catalog_id,template_id=starter.template_id,
            snapshot=starter.snapshot,rules=starter.rules)
        with self.assertRaisesMessage(ValueError,'装备不属于居民或不满足穿戴条件'):
            preview_equipment(CombatProfile.objects.get(pk=self.agent.pk),{'weapon':new_gear.pk})

    def test_ineligible_optional_equipment_does_not_block_exploration(self):
        import random
        from .equipment import generate
        from .models import EquipmentInstance
        from .preparation import prepare
        from .store import current

        profile=ensure('admin',self.agent,self.now)
        profile.progression={**profile.progression,'level':2}
        profile.save(update_fields=['progression'])
        catalog=current(profile.catalog_id)
        snapshot=generate(catalog,'equip.training_sword',3,'white',random.Random(31))
        new_gear=EquipmentInstance.objects.create(pk='too-high-training-sword',owner_id='admin',
            actor_id=self.agent.pk,catalog_id=catalog.version,template_id='equip.training_sword',snapshot=snapshot)
        run=explorations.request('admin',self.agent,'skip-ineligible-gear',{},now=self.now)
        plan={**self.preparation_plan,'equipment':{'weapon':new_gear.pk}}

        run=prepare(run.pk,planner=lambda *args:plan)

        self.assertEqual(run.status,'active')
        self.assertEqual(run.snapshot['prepared_plan']['equipment'],{})
        self.assertIn('保留当前装备继续探索',run.snapshot['prepared_plan']['reason'])
        profile.refresh_from_db()
        self.assertEqual(profile.loadout,{'weapon':'starter:'+self.agent.pk})

    def test_unaffordable_optional_potions_are_removed_from_exploration_plan(self):
        from .preparation import fit_potion_plan
        run=explorations.request('admin',self.agent,'unbudgeted-potion-plan',{},now=self.now)
        plan={**self.plan,'purchases':{'potion.heal.1':2},'potions':{'potion.heal.1':2}}
        with patch('system_settings.agent_world.market_spending.spending_context',return_value={'spendable':'0'}):
            fitted=fit_potion_plan(run,self.agent,plan)
        self.assertEqual(fitted['purchases'],{})
        self.assertEqual(fitted['potions'],{})
        self.assertIn('探索本身不需要生活预算',fitted['reason'])

    def test_manual_exploration_potion_plan_preserves_future_life_reservations(self):
        from ..life_models import LifeItem
        from .preparation import prepare
        future=LifeItem.objects.create(pk='future-travel-reservation',owner_id='admin',actor_id=self.agent.pk,
            original_at=self.now,scheduled_at=self.now+timedelta(days=2),activity='travel',status='pending',budget=9995)
        run=explorations.request('admin',self.agent,'manual-reserved-potion-plan',{},now=self.now)
        plan={**self.preparation_plan,'purchases':{'potion.heal.1':2},'potions':{'potion.heal.1':2},'equipment':{}}
        run=prepare(run.pk,planner=lambda *args:plan)
        self.agent.refresh_from_db();future.refresh_from_db()
        prepared=run.snapshot['prepared_plan']
        self.assertEqual(run.status,'active')
        self.assertEqual(prepared['purchases'],{})
        self.assertEqual(prepared['potions'],{})
        self.assertEqual(self.agent.money,10000)
        self.assertEqual((future.budget,future.spent),(9995,0))

    def test_manual_combat_potion_debit_rechecks_future_life_reservations(self):
        from decimal import Decimal
        from django.db import transaction
        from ..life_budget import charge_budget
        from ..life_models import LifeItem
        from ..life_scope import manual_combat_potion_scope
        LifeItem.objects.create(pk='future-potion-reservation',owner_id='admin',actor_id=self.agent.pk,
            original_at=self.now,scheduled_at=self.now+timedelta(days=2),activity='travel',status='pending',budget=9995)
        with manual_combat_potion_scope('admin',self.agent.pk),transaction.atomic():
            locked=type(self.agent).objects.select_for_update().get(pk=self.agent.pk)
            with self.assertRaisesRegex(ValueError,'真实余额不足或资金已预留给其他生活安排'):
                charge_budget(locked,Decimal('6'),business_key='manual-combat-potion',purchase_kind='buy_potion')

    def test_life_exploration_with_zero_budget_can_buy_potions_and_depart(self):
        from system_settings.models import SystemSetting,WorldActionRuntime
        from ..life_models import LifeConfig,LifeItem
        from ..life_schedule import DEFAULTS
        from .preparation import prepare
        WorldActionRuntime.objects.create(pk='world',enabled=True)
        LifeConfig.objects.create(pk='admin',settings={**DEFAULTS,'agent_ids':[self.agent.pk]},migrated=True)
        SystemSetting.objects.create(key='system_mcp_config',value={'enabled':True})
        item=LifeItem.objects.create(pk='zero-budget-exploration',owner_id='admin',actor_id=self.agent.pk,
            original_at=self.now,scheduled_at=self.now,activity='exploration',status='running',budget=0)
        run=explorations.request('admin',self.agent,'zero-budget-preparation',{},life_item=item,now=self.now)
        plan={**self.preparation_plan,'purchases':{'potion.heal.1':2},'potions':{'potion.heal.1':2},'equipment':{}}
        run=prepare(run.pk,planner=lambda *args:plan)
        item.refresh_from_db()
        self.agent.refresh_from_db()
        self.assertEqual(run.status,'active')
        self.assertEqual((item.budget,item.spent),(12,12))
        self.assertEqual(self.agent.money,9988)

    def data(self):
        from django.apps import apps
        return json.loads(serializers.serialize('json',[row for model in apps.get_app_config('system_settings').get_models() if model.__name__!='CombatRuntime' for row in model.objects.all()]))

    def test_resident_status_projects_exploration_in_graph_and_summary(self):
        from django.contrib.auth.models import User
        from rest_framework.test import APIRequestFactory, force_authenticate
        from system_settings.models import AgentActivity
        from system_settings.agent_views import AgentActivityViewSet, AgentRelationView
        user=User.objects.create_superuser('admin','fixture@example.invalid','fixture')
        AgentActivity.objects.create(event_key='previous-market',agent=self.agent,
            activity_type='work',status='success',title='市场交易完成')
        run=explorations.request('admin',self.agent,'presence-trip',{},now=self.now)

        def graph(owner_user=user):
            request=APIRequestFactory().get('/api/settings/agent-relations/')
            force_authenticate(request,owner_user)
            data=AgentRelationView.as_view()(request).data['data']
            return next(node for node in data['nodes'] if node['id']==self.agent.pk)

        def summary():
            request=APIRequestFactory().get('/api/settings/agent-activities/today-summary/')
            force_authenticate(request,user)
            return AgentActivityViewSet.as_view({'get':'today_summary'})(request).data['data']

        for status,label,running in [('preparing','准备探索',True),('active','探索中',True),
            ('paused','探索暂停，等待自动恢复',False),('settling','探索结算中',True),('completed','',False),('failed','',False)]:
            with self.subTest(status=status):
                Exploration.objects.filter(pk=run.pk).update(status=status)
                node=graph();data=summary()
                resident=next(item for item in data['agents'] if item['id']==self.agent.pk)
                expected='running' if running else 'idle'
                self.assertEqual(node['status'],expected)
                self.assertEqual(node['current_action'],label)
                self.assertEqual(resident['status'],expected)
                self.assertEqual(resident['currentAction'],label)
                self.assertEqual(data['activeAgentCount'],int(running))
                self.assertEqual(data['todayActivityCount'],1)
        Exploration.objects.filter(pk=run.pk).update(status='active')
        other=User.objects.create_user('other-presence',password='fixture')
        self.assertEqual(graph(other)['status'],'idle')
        self.assertEqual(graph(other)['current_action'],'')
        self.assertEqual(AgentActivity.objects.count(),1)

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

    def test_force_uploaded_recap_supports_strict_merge_and_restore(self):
        import tempfile
        import zipfile
        from system_settings.models import AgentRunRecord
        from system_settings.tests import MemoryStorageClient
        from system_settings.sync_state import canonical_hash
        from utils.sync_manager import SyncManager, SyncError
        from ..life_config import config_for

        config_for('admin')
        run = self.run_trip()
        explorations.finish(run.pk, now=self.now + timedelta(seconds=16))
        run.refresh_from_db()
        AgentRunRecord.objects.filter(pk=run.record_id).update(
            output='旧版探索回顾', steps=[], status='running',
        )
        with self.assertRaisesMessage(SyncError, '探索回顾记录与固定结算摘要不一致'):
            validate_source(self.data())

        with tempfile.TemporaryDirectory(prefix='odoc-force-sync-') as media_root, self.settings(MEDIA_ROOT=media_root):
            manager = SyncManager(MemoryStorageClient(), '/backup')
            snapshot, summary, backup = manager.sync_v2(force_overwrite=True)
            self.assertTrue(summary['force_overwrite'])
            validate_source(snapshot['data'], snapshot['meta'])
            recap = AgentRunRecord.objects.get(pk=run.record_id)
            self.assertEqual(recap.output, '旧版探索回顾')
            with zipfile.ZipFile(backup) as archive:
                original = json.loads(archive.read('data_index.json'))
            original_recap = next(
                row for row in original
                if row['model'] == 'system_settings.agentrunrecord' and row['pk'] == run.record_id
            )
            self.assertEqual(original_recap['fields']['output'], '旧版探索回顾')

            future_meta = {**snapshot['meta'], 'combat_schema_version': snapshot['meta']['combat_schema_version'] + 1}
            for check in (manager.validate_remote_snapshot_version, manager.validate_import_snapshot_version):
                with self.assertRaisesMessage(SyncError, '战斗快照版本过新'):
                    check(future_meta)

            remote = manager.get_v2_current()
            merged, revisions, _ = manager.merge_v2_data(None, [], {}, remote)
            validate_source(merged)
            for row in merged:
                key = revision_key(row['model'], item_identity(row))
                self.assertEqual(revisions[key]['hash'], canonical_hash(row['fields']))
            manager.apply_snapshot_data(remote['data'], remote_meta=remote['meta'], full_overwrite=True)
            restored = AgentRunRecord.objects.get(pk=run.record_id)
            self.assertEqual(restored.output, run.result['report'])
            self.assertEqual(restored.status, 'success')
            validate_source(manager.build_snapshot_data())

    def test_force_recap_normalization_still_rejects_corrupt_settlement_facts(self):
        from .sync import normalize_exploration_reviews
        from utils.sync_manager import SyncError

        run = self.run_trip()
        explorations.finish(run.pk, now=self.now + timedelta(seconds=16))
        data = self.data()
        for row in data:
            if row['model'] == 'system_settings.combatfact' and row['fields']['kind'] == 'terminal':
                row['fields']['payload']['report'] = '被改写的结算事实'
        with self.assertRaisesMessage(SyncError, '战斗事实链缺失或发生分叉'):
            normalize_exploration_reviews(data)

    def test_named_drop_snapshot_matches_reward_fact_and_sync(self):
        import copy
        import random
        from .catalog import bundled
        from .equipment import generate
        from .models import EquipmentInstance

        catalog = bundled()[0]
        item = generate(catalog, 'equip.staff', 30, 'gold', random.Random(14))
        run = self.run_trip()

        def defeated_enemy(_catalog, state, *_args, **_kwargs):
            result = copy.deepcopy(state)
            result['enemy']['hp'] = 0
            return result, []

        with patch.object(explorations.engine, 'step', side_effect=defeated_enemy), \
                patch.object(explorations.rewards, 'drops', return_value=[{'kind': 'equipment', 'item': item}]):
            run = explorations.tick(run.pk, now=self.now + timedelta(seconds=15))
        reward = run.result['rewards'][0]
        gear = EquipmentInstance.objects.get(pk=reward['equipment_id'])
        self.assertTrue(gear.snapshot['name'].endswith(catalog.row('equipment_templates', 'equip.staff')['name']))
        self.assertEqual(gear.snapshot['equipment_type'], 'two_handed_staff')
        self.assertEqual(gear.snapshot, reward['item'])
        round_fact = CombatFact.objects.get(kind='round')
        kill = next(event for event in round_fact.payload['events'] if event['kind'] == 'kill')
        self.assertEqual(kill['rewards'][0]['item'], gear.snapshot)
        validate_source(self.data())

    def test_two_handed_weapon_releases_and_blocks_offhand(self):
        import random
        from .store import current
        from .equipment import generate
        from .models import EquipmentInstance
        from .profiles import apply_loadout_changes

        profile=ensure('admin',self.agent,self.now)
        catalog=current(profile.catalog_id)
        profile.progression={**profile.progression,'job':'job.elementalist','level':30}
        profile.progression['skills']=catalog.learned('job.elementalist',30)
        offhand_snapshot=generate(catalog,'equip.offhand.magic_shield',10,'white',random.Random(11))
        offhand=EquipmentInstance.objects.create(pk='test-two-hand-offhand',owner_id='admin',actor_id=self.agent.pk,
            catalog_id=catalog.version,template_id='equip.offhand.magic_shield',snapshot=offhand_snapshot)
        weapon_snapshot=generate(catalog,'equip.staff',30,'white',random.Random(12))
        weapon=EquipmentInstance.objects.create(pk='test-two-hand-staff',owner_id='admin',actor_id=self.agent.pk,
            catalog_id=catalog.version,template_id='equip.staff',snapshot=weapon_snapshot)
        profile.loadout={**profile.loadout,'offhand':offhand.pk}
        replaced=apply_loadout_changes(profile,catalog,{'weapon':weapon.pk},'admin')
        self.assertNotIn('offhand',replaced)

        profile.loadout={'weapon':weapon.pk}
        with self.assertRaisesMessage(ValueError,'双手武器不能同时装备副手'):
            apply_loadout_changes(profile,catalog,{'offhand':offhand.pk},'admin')

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
        plan={**self.preparation_plan,'purchases':{'potion.heal.1':2,'potion.mana.1':1},'potions':{'potion.heal.1':2},'equipment':{}}
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

    def test_auto_recovery_skips_downtime_and_keeps_original_deadline(self):
        from .recovery import recover, deadline
        from system_settings.models import AgentExecutionLease
        run=self.run_trip()
        CombatFact.objects.filter(exploration_id=run.pk,kind='depart').update(created_at=self.now)
        run=explorations.tick(run.pk,now=self.now+timedelta(seconds=15))
        before=(run.elapsed_seconds,run.result.copy(),run.state.copy())
        revoke(disable_auto=False)
        recover(self.now+timedelta(minutes=20))
        run.refresh_from_db()
        self.assertEqual(run.status,'active')
        self.assertEqual((run.elapsed_seconds,run.result,run.state),before)
        self.assertEqual(deadline(run),local_time(self.now)+timedelta(minutes=30))
        from .queries import snapshot
        with patch('system_settings.agent_world.combat.queries.local_time',side_effect=lambda value=None:local_time(value if value is not None else self.now+timedelta(minutes=20))):
            self.assertEqual(snapshot(run)['remaining_seconds'],600)
        lease=AgentExecutionLease.objects.get(agent=self.agent)
        self.assertEqual(local_time(lease.until),deadline(run)+timedelta(seconds=60))
        run=explorations.tick(run.pk,now=self.now+timedelta(minutes=20,seconds=15))
        self.assertEqual(run.elapsed_seconds,30)
        run=explorations.tick(run.pk,now=self.now+timedelta(minutes=30))
        self.assertEqual(run.status,'completed')
        self.assertEqual(run.elapsed_seconds,30)
        self.assertFalse(explorations.busy(self.agent.pk))
        validate_source(self.data())

    def test_recovery_with_less_than_a_round_left_returns_at_deadline(self):
        from .recovery import recover
        run=self.run_trip()
        CombatFact.objects.filter(exploration_id=run.pk,kind='depart').update(created_at=self.now)
        revoke(disable_auto=False)
        recover(self.now+timedelta(minutes=29,seconds=59))
        run.refresh_from_db()
        self.assertEqual(local_time(run.next_tick_at),local_time(self.now)+timedelta(minutes=30))
        run=explorations.tick(run.pk,now=self.now+timedelta(minutes=30))
        self.assertEqual((run.status,run.elapsed_seconds),('completed',0))
        self.assertEqual(run.result['energy'],12)
        self.assertFalse(CombatFact.objects.filter(exploration_id=run.pk,kind='round').exists())
        validate_source(self.data())

    def test_auto_recovery_after_deadline_returns_potions_once_and_releases_life(self):
        from system_settings.agent_task_scheduler import AgentTaskScheduler
        from system_settings.models import SystemSetting
        from ..life_config import DEFAULTS
        from ..life_models import LifeConfig, LifeItem
        from ..life_manual import run_manual_life
        from .schedule import ensure_task, occupied_ids
        from .recovery import recover
        from .preparation import prepare
        ensure('admin',self.agent,self.now)
        SystemSetting.objects.create(key='system_mcp_config',value={'enabled':True})
        self.agent.money=1000;self.agent.save()
        LifeConfig.objects.create(pk='admin',settings={**DEFAULTS,'agent_ids':[self.agent.pk]},migrated=True)
        run_manual_life(ensure_task('admin'),self.agent.pk,'admin',AgentTaskScheduler())
        item=LifeItem.objects.get(activity='exploration')
        run=Exploration.objects.get(life_item_id=item.pk)
        prepare(run.pk,planner=lambda *args:{**self.preparation_plan,'purchases':{'potion.heal.1':2},'potions':{'potion.heal.1':2}})
        CombatFact.objects.filter(exploration_id=run.pk,kind='depart').update(created_at=self.now)
        revoke(disable_auto=False)
        recover(self.now+timedelta(minutes=31));recover(self.now+timedelta(minutes=32))
        run.refresh_from_db();item.refresh_from_db()
        self.assertEqual((run.status,item.status),('completed','completed'))
        self.assertEqual(run.elapsed_seconds,0)
        self.assertEqual(run.result['energy'],12)
        self.assertEqual(run.result['experience'],0)
        self.assertEqual(stock_quantity(self.agent.pk,'admin','combat.potion.heal.1'),2)
        self.assertEqual(CombatFact.objects.filter(exploration_id=run.pk,kind='terminal').count(),1)
        self.assertTrue(CombatRuntime.objects.get(pk=run.pk).promotion_pending)
        self.assertNotIn(self.agent.pk,occupied_ids())
        self.assertFalse(explorations.busy(self.agent.pk))
        validate_source(self.data())

    def test_auto_recovery_returns_if_busy_and_does_not_authorize_other_device(self):
        from .recovery import recover
        from system_settings.models import AgentExecutionLease
        run=self.run_trip();revoke(disable_auto=False)
        runtime=CombatRuntime.objects.get(pk=run.pk)
        runtime.requests={'origin':'other'};runtime.save()
        recover(self.now+timedelta(minutes=1))
        run.refresh_from_db();self.assertEqual(run.status,'paused')
        runtime.requests={'origin':run.snapshot['origin']};runtime.save()
        AgentExecutionLease.objects.filter(agent=self.agent).update(token='other-task',until=self.now+timedelta(minutes=10))
        recover(self.now+timedelta(minutes=1))
        run.refresh_from_db();self.assertEqual(run.status,'recalled')
        self.assertEqual(AgentExecutionLease.objects.get(agent=self.agent).token,'other-task')
        validate_source(self.data())

    def test_restart_preserves_automatic_opt_in_and_midnight_credits_are_integers(self):
        runtime=CombatRuntime.objects.create(pk='auto:admin',auto_enabled=True)
        revoke(disable_auto=False)
        runtime.refresh_from_db();self.assertTrue(runtime.auto_enabled)
        revoke()
        runtime.refresh_from_db();self.assertFalse(runtime.auto_enabled)
        point=local_time(self.now).replace(hour=23,minute=59,second=59,microsecond=123456)
        parts=explorations.day_parts(point,15)
        self.assertEqual(sum(parts.values()),15)
        self.assertTrue(all(type(value)is int for value in parts.values()))

    def test_dead_worker_revokes_before_any_replay(self):
        from .worker import recover_stopped_process, advance
        run=self.run_trip()
        CombatRuntime.objects.create(pk='combat-worker',requests={'process_id':2147483647},token='stale',until=self.now+timedelta(minutes=10))
        with patch('system_settings.agent_world.combat.worker.os.kill',side_effect=ProcessLookupError):recover_stopped_process()
        run.refresh_from_db()
        self.assertEqual((run.status,run.elapsed_seconds),('paused',0))
        self.assertFalse(CombatRuntime.objects.filter(authorized=True).exists())
        self.assertIsNone(CombatRuntime.objects.get(pk='combat-worker').until)
        advance()
        run.refresh_from_db();self.assertEqual(run.status,'active')
        self.assertEqual(run.elapsed_seconds,0)
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

    def test_catalog_adoption_sync_preserves_legacy_holy_staff_permissions(self):
        import random
        from copy import deepcopy
        from . import attributes, equipment
        from .catalog import Catalog
        from .facts import append
        from .history import freeze_legacy, maintain
        from .models import EquipmentInstance
        from .profiles import equip, preview_equipment, stats
        from .store import digest
        from ..life_models import LifeProfile

        released=install()
        legacy_tables=deepcopy(released.tables)
        # Before equipment mastery, every priest branch could wear a level-10 holy staff.
        holy_staff=next(row for row in legacy_tables['equipment_templates'] if row['id']=='equip.holy_staff')
        holy_staff.update(level_min='10',equipment_type='',required_mastery='',grip='')
        CombatCatalog.objects.create(pk='combat-1.0.3',digest=digest(legacy_tables),tables=legacy_tables)
        legacy=Catalog(legacy_tables,'combat-1.0.3')

        for path in [('job.priest',),('job.priest','job.naturalist'),
                     ('job.priest','job.naturalist','job.druid'),
                     ('job.priest','job.naturalist','job.warden')]:
            with self.subTest(job=path[-1]):
                actor=Agent.objects.create(name=path[-1],model=self.agent.model)
                progression=attributes.initial()
                for job in path:
                    target=int(legacy.row('professions',job)['required_level'])
                    experience=sum(int(legacy.row('level_experience',f'level.{level}')['experience_to_next'])
                                   for level in range(progression['level'],target))
                    progression,_=attributes.award(legacy,progression,experience)
                    progression=attributes.promote(legacy,progression,job)
                # Restore a saved old loadout and its wearing permissions; current
                # promotion deliberately keeps the resident's valid training sword.
                saved=equipment.generate(legacy,'equip.holy_staff',10,'white',random.Random(actor.pk),starter=True)
                rules={'version':1,'slot':'weapon','equipment_type':'','grip':'',
                       'job_levels':{job:10 for job in ('job.priest','job.naturalist','job.druid','job.warden')}}
                weapon=EquipmentInstance.objects.create(pk='legacy-holy:'+actor.pk,owner_id='admin',
                    actor_id=actor.pk,catalog_id=legacy.version,template_id='equip.holy_staff',
                    snapshot=saved,rules=rules,bound=True)
                LifeProfile.objects.create(pk=actor.pk,owner_id='admin')
                profile=CombatProfile.objects.create(pk=actor.pk,owner_id='admin',actor_name=actor.name,
                    catalog_id=legacy.version,progression=progression,loadout={'weapon':weapon.pk},recovered_at=self.now)
                derived=stats(profile,legacy)
                profile.hp,profile.mp=derived['hp_max'],derived['mp_max'];profile.save()
                append(profile,'legacy-initialize:'+actor.pk,'initialize',{
                    'equipment_id':weapon.pk,'progression':progression,'catalog_id':legacy.version})
                freeze_legacy()
                self.assertFalse(equipment.allowed(released,weapon.template_id,path[-1],
                                                   profile.progression['level'],weapon.snapshot['level']))
                validate_source(self.data())

                maintain(released)
                profile.refresh_from_db()
                self.assertEqual(profile.catalog_id,released.version)
                self.assertEqual(profile.loadout['weapon'],weapon.pk)
                weapon.refresh_from_db()
                self.assertEqual((weapon.snapshot,weapon.rules),(saved,rules))
                validate_source(self.data())
                profile=equip('admin',actor,'legacy-off:'+actor.pk,{'weapon':None})
                preview_equipment(profile,{'weapon':weapon.pk})
                profile=equip('admin',actor,'legacy-on:'+actor.pk,{'weapon':weapon.pk})
                self.assertEqual(profile.loadout['weapon'],weapon.pk)
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
