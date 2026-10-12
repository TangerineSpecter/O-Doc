"""归档、执行隔离与同步回归；仅使用隔离测试库，不调用在线模型。"""
import copy
from datetime import timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .agent_archive import archive_agent, restore_agent
from .agent_availability import require_active_agent, agent_operation
from .agent_archive_schedule import mark_archived_slots
from .agent_random_schedule import make_plan, reconcile_successes, next_slot
from .agent_relation import relation_graph
from .models import Agent, AgentTask, AgentLongTermMemory, AgentActivity, AgentExecutionLease, AgentRandomRuntime, AgentRunRecord, AIModel, AIProvider, SystemSetting, WorldAction, WorldActionRuntime
from .agent_world.execution import execution_lease
from .agent_world.life_models import LifeConfig, LifeItem
from .agent_world.life_schedule import recover
from .agent_world.market_models import MarketListing, MarketSession, MarketTransaction
from .agent_world.social_models import SocialRelation, SocialOpportunity
from .serializers import AgentTaskSerializer
from utils.sync_manager import SyncManager, SyncError


class AgentArchiveTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('archive-admin')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.agent = Agent.objects.create(name='猫猫', avatar='🐱', prompt='角色', money=Decimal('1234.56'))
        self.peer = Agent.objects.create(name='可莉')
        self.task = AgentTask.objects.create(name='任务', agent=self.agent, agent_ids=[self.agent.pk, self.peer.pk])
        self.memory = AgentLongTermMemory.objects.create(agent=self.agent, content='保留记忆')
        self.activity = AgentActivity.objects.create(agent=self.agent, event_key='archive-history', activity_type='work', title='历史')

    def test_archive_restore_preserves_identity_and_business(self):
        with patch('system_settings.agent_history.freeze_agent_history') as freeze:
            archived = archive_agent(self.agent.pk)
            first = archived.archived_at
            self.assertEqual(archive_agent(self.agent.pk).archived_at, first)
            self.task.refresh_from_db(); self.memory.refresh_from_db(); self.activity.refresh_from_db()
            self.assertEqual(self.task.agent_ids, [self.agent.pk, self.peer.pk])
            self.assertEqual(self.memory.agent_id, self.agent.pk)
            self.assertEqual(self.activity.agent_id, self.agent.pk)
            self.assertEqual(archived.money, Decimal('1234.56'))
            restored = restore_agent(self.agent.pk)
            self.assertFalse(restored.archived)
            self.assertEqual(restored.pk, self.agent.pk)
            freeze.assert_not_called()

    def test_list_filter_readonly_details_and_delete_alias(self):
        with patch.object(__import__('system_settings.agent_views', fromlist=['AgentViewSet']).AgentViewSet, '_sync_feishu_im_connection'):
            response = self.client.delete(f'/api/settings/agents/{self.agent.pk}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(Agent.objects.get(pk=self.agent.pk).archived)
        self.assertEqual([r['id'] for r in self.client.get('/api/settings/agents/').data['data']], [self.peer.pk])
        rows = self.client.get('/api/settings/agents/', {'status': 'archived'}).data['data']
        self.assertEqual(rows[0]['id'], self.agent.pk)
        self.assertTrue(rows[0]['archived'])
        self.assertEqual(len(self.client.get('/api/settings/agents/', {'status':'all'}).data['data']), 2)
        self.assertEqual(self.client.put(f'/api/settings/agents/{self.agent.pk}/', {'name':'改名'}, format='json').status_code, 409)
        self.assertEqual(self.client.get(f'/api/settings/agents/{self.agent.pk}/').status_code, 200)

    def test_duplicate_in_active_and_archived_including_edit(self):
        self.assertEqual(self.client.post('/api/settings/agents/', {'name':' 猫猫 '}, format='json').status_code, 409)
        archive_agent(self.agent.pk)
        response = self.client.post('/api/settings/agents/', {'name':'猫猫'}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data['data'], {'agentId':self.agent.pk, 'archived':True})
        response = self.client.put(f'/api/settings/agents/{self.peer.pk}/', {'name':'猫猫'}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.client.put(f'/api/settings/agents/{self.peer.pk}/', {'name':'可莉'}, format='json').status_code, 200)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Agent.objects.create(name=' 猫猫 ')

    def test_busy_execution_blocks_archive_and_stale_object_cannot_execute(self):
        with execution_lease(AgentExecutionLease, {'agent': self.agent}):
            with self.assertRaisesRegex(ValueError, '暂不能归档'):
                archive_agent(self.agent.pk)
        archive_agent(self.agent.pk)
        with self.assertRaisesRegex(ValueError, '归档'):
            require_active_agent(self.agent)
        with self.assertRaisesRegex(ValueError, '归档'):
            with agent_operation(self.agent):
                self.fail('归档居民获得执行资格')

    def test_running_mixed_record_checks_only_this_resident(self):
        record = AgentRunRecord.objects.create(agent=self.agent, task_name='混合任务', status='running',
            agent_runs=[{'agent':self.agent.pk,'status':'success'},{'agent':self.peer.pk,'status':'running'}])
        archive_agent(self.agent.pk)
        with self.assertRaisesRegex(ValueError, '执行中'):
            archive_agent(self.peer.pk)

    def test_restore_cancels_missed_life_items_preserves_future_and_pause(self):
        now = timezone.now()
        config = LifeConfig.objects.create(pk='archive-admin', settings={'agent_ids':[self.agent.pk]}, paused_agents=[self.agent.pk])
        old = LifeItem.objects.create(pk='old', owner_id=config.pk, actor_id=self.agent.pk, original_at=now-timedelta(hours=2), scheduled_at=now-timedelta(hours=2))
        future = LifeItem.objects.create(pk='future', owner_id=config.pk, actor_id=self.agent.pk, original_at=now+timedelta(hours=2), scheduled_at=now+timedelta(hours=2))
        archive_agent(self.agent.pk)
        recover(config, now)
        old.refresh_from_db(); self.assertEqual(old.scheduled_at, old.original_at)
        restore_agent(self.agent.pk)
        old.refresh_from_db(); future.refresh_from_db(); config.refresh_from_db()
        self.assertEqual(old.status, 'cancelled')
        self.assertEqual(future.status, 'pending')
        self.assertEqual(config.paused_agents, [self.agent.pk])

    def test_random_skips_are_per_slot_not_success_or_permanent_unavailable(self):
        self.task.schedule_mode='random'; self.task.random_count=2; self.task.save()
        now=timezone.now()
        state=make_plan(self.task,now)
        state['slots'][0]['at']=(now-timedelta(minutes=5)).isoformat()
        state['slots'][1]['at']=(now+timedelta(minutes=5)).isoformat()
        archive_agent(self.agent.pk)
        mark_archived_slots(self.task,state,now)
        reconcile_successes(self.task,state)
        self.assertEqual(state['completed'].get('0'), [])
        self.assertEqual(state['skipped']['0'], [self.agent.pk])
        self.assertNotIn(self.agent.pk,state['unavailable'])
        self.assertEqual(next_slot(state), (0,[self.peer.pk]))
        AgentRandomRuntime.objects.create(task=self.task,state=state)
        restore_agent(self.agent.pk)
        state['completed']['0']=[self.peer.pk]
        self.assertEqual(next_slot(state), (1,[self.agent.pk,self.peer.pk]))

    def test_graph_preserves_original_node_and_hides_by_default(self):
        SocialRelation.objects.create(pk='archive-relation', owner_id='archive-admin', actor_id=self.peer.pk,
                                      counterpart_id='agent-id:'+self.agent.pk)
        archive_agent(self.agent.pk)
        default=relation_graph('archive-admin')
        self.assertNotIn(self.agent.pk,[r['id'] for r in default['nodes']])
        full=relation_graph('archive-admin',True)
        node=next(r for r in full['nodes'] if r['id']==self.agent.pk)
        self.assertTrue(node['archived']);self.assertTrue(node['departed'])
        self.assertEqual(node['avatar'],'🐱')
        self.assertEqual(len(full['edges']),1)

    def test_graph_endpoint_works_through_query_middleware(self):
        archive_agent(self.agent.pk)
        response = self.client.get('/api/settings/agent-relations/', {'includeDeparted': 'true'})
        self.assertEqual(response.status_code, 200)
        self.assertIn(self.agent.pk, [node['id'] for node in response.data['data']['nodes']])
        response = self.client.get('/api/settings/agent-relations/', {'includeDeparted': 'false'})
        self.assertNotIn(self.agent.pk, [node['id'] for node in response.data['data']['nodes']])

    def test_restore_expires_pending_social_opportunities(self):
        archive_agent(self.agent.pk)
        now = timezone.now()
        day = now.date() if timezone.is_naive(now) else timezone.localdate(now)
        missed = SocialOpportunity.objects.create(pk='missed-social', owner_id='archive-admin', actor_id=self.agent.pk, business_date=day, kind='daily')
        future = SocialOpportunity.objects.create(pk='future-social', owner_id='archive-admin', actor_id=self.agent.pk, business_date=day+timedelta(days=1), kind='daily')
        restore_agent(self.agent.pk)
        missed.refresh_from_db(); future.refresh_from_db()
        self.assertEqual(missed.status, 'expired')
        self.assertEqual(future.status, 'pending')

    def test_sync_archive_revokes_execution_and_memory_authorization(self):
        from .models import AgentMemoryLease
        from .agent_archive_sync import revoke_archived_execution
        archive_agent(self.agent.pk)
        lease = AgentExecutionLease.objects.create(agent=self.agent, token='stale-execution', until=timezone.now()+timedelta(minutes=5))
        memory = AgentMemoryLease.objects.create(pk=self.agent.pk, token='stale-memory', until=timezone.now()+timedelta(minutes=5))
        revoke_archived_execution()
        lease.refresh_from_db(); memory.refresh_from_db()
        self.assertEqual(lease.token, '')
        self.assertEqual(memory.token, '')

    def test_archived_photo_operation_rejects_before_mutation(self):
        from .agent_world.publish_media import operate_photo
        action = WorldAction.objects.create(pk='archived-photo', agent=self.agent, actor_id=self.agent.pk, status='success', snapshot={'photo': {'status': 'manual', 'image_url': '/image.png'}})
        archive_agent(self.agent.pk)
        with self.assertRaisesRegex(ValueError, '已归档'):
            operate_photo(action, 'use_image')
        action.refresh_from_db()
        self.assertEqual(action.snapshot['photo']['status'], 'manual')

    def test_task_bindings_preserved_but_new_archived_binding_rejected(self):
        archive_agent(self.agent.pk)
        serializer=AgentTaskSerializer(self.task,data={'name':'原配置改名','agents':[self.agent.pk,self.peer.pk]},partial=True)
        self.assertTrue(serializer.is_valid(),serializer.errors)
        new=AgentTaskSerializer(data={'name':'新任务','agent':self.peer.pk,'agents':[self.agent.pk,self.peer.pk]})
        self.assertFalse(new.is_valid())

    def test_isolated_active_calls_cover_planning_and_manual_mcp(self):
        archive_agent(self.agent.pk)
        from .agent_world.life_planner import ask
        with patch('system_settings.agent_world.life_planner.complete') as model:
            with self.assertRaisesRegex(ValueError,'归档'):
                ask(self.agent,'规划',{})
            model.assert_not_called()
        from .feishu_im import handle_feishu_message_event
        with self.assertRaisesRegex(ValueError,'归档'):
            handle_feishu_message_event(self.agent, {'event':{}})

    def test_snapshot_roundtrip_legacy_field_and_name_swap(self):
        archive_agent(self.agent.pk)
        manager=SyncManager()
        data=manager.build_snapshot_data()
        manager.apply_snapshot_data(copy.deepcopy(data))
        self.agent.refresh_from_db();self.assertTrue(self.agent.archived)
        legacy=copy.deepcopy(data)
        for row in legacy:
            if row['model']=='system_settings.agent':row['fields'].pop('archived_at')
        manager.apply_snapshot_data(legacy)
        self.agent.refresh_from_db();self.assertTrue(self.agent.archived)
        swapped=copy.deepcopy(data)
        for row in swapped:
            if row['model']=='system_settings.agent':
                row['fields']['name']='可莉' if row['pk']==self.agent.pk else '猫猫'
        manager.apply_snapshot_data(swapped)
        self.agent.refresh_from_db();self.peer.refresh_from_db()
        self.assertEqual((self.agent.name,self.peer.name),('可莉','猫猫'))
        duplicate=copy.deepcopy(data)
        for row in duplicate:
            if row['model']=='system_settings.agent':row['fields']['name']='重复'
        with self.assertRaisesRegex(SyncError,'重复'):
            manager.apply_snapshot_data(duplicate)
        self.agent.refresh_from_db();self.assertEqual(self.agent.name,'可莉')

    def test_fixed_restore_skips_today_without_delaying_other_residents(self):
        from .agent_task_scheduler import AgentTaskScheduler, _to_local
        now = timezone.now().replace(hour=12, minute=0, second=0, microsecond=0)
        self.task.schedule_time = '09:00'
        self.task.save()
        archive_agent(self.agent.pk)
        with patch('system_settings.agent_archive.timezone.now', return_value=now):
            restore_agent(self.agent.pk)
        scheduler = AgentTaskScheduler()
        local = _to_local(now)
        self.assertEqual([agent.pk for agent in scheduler._scheduled_agents(self.task, local)], [self.peer.pk])
        self.task.agent_ids = [self.agent.pk]; self.task.save()
        self.assertFalse(scheduler._is_due(self.task, local))
        self.assertTrue(scheduler._is_due(self.task, local + timedelta(days=1)))

    def test_interval_restore_waits_next_full_interval(self):
        from .agent_task_scheduler import AgentTaskScheduler, _to_local
        self.task.schedule_type = 'interval'; self.task.interval_minutes = 60
        self.task.agent_ids = [self.agent.pk]; self.task.save()
        archive_agent(self.agent.pk)
        restored = restore_agent(self.agent.pk)
        now = _to_local(restored.execution_resumed_at)
        scheduler = AgentTaskScheduler()
        self.assertFalse(scheduler._is_due(self.task, now + timedelta(minutes=59)))
        self.assertTrue(scheduler._is_due(self.task, now + timedelta(minutes=60)))


class ArchiveMarketTests(TestCase):
    def setUp(self):
        from .agent_world.farm_service import ensure_farms
        from .agent_world.market_sessions import enter
        from .agent_world.market_shop import current_batch
        provider=AIProvider.objects.create(name='offline',type='OpenAi')
        model=AIModel.objects.create(name='offline',provider=provider,type='chat')
        self.a=Agent.objects.create(name='卖家',model=model)
        self.b=Agent.objects.create(name='买家',model=model)
        self.task=AgentTask.objects.create(name='市场',task_kind='market',agent=self.a,agent_ids=[self.a.pk,self.b.pk],market_config={'owner_id':'owner'})
        farm=AgentTask.objects.create(name='农场',task_kind='farm',agent=self.a,agent_ids=[self.a.pk,self.b.pk],farm_config={'owner_id':'owner'})
        ensure_farms(farm)
        SystemSetting.objects.create(key='system_mcp_config',value={'enabled':True})
        WorldActionRuntime.objects.create(pk='world',enabled=True)
        self.now=timezone.now();current_batch('owner',self.now)
        self.sa=enter('owner',self.a,'seller-session',task=self.task,mode='manual',now=self.now)
        self.sb=enter('owner',self.b,'buyer-session',task=self.task,mode='manual',now=self.now)

    def create_listing(self,key='listing'):
        from .agent_world.inventory_stock import add_stock
        from .agent_world.market_service import trade
        item=add_stock(self.a.pk,'owner',self.a.name,'crop.radish',5,'萝卜','farm_crop',Decimal('18'))
        trade(self.sa,self.a,key,{'kind':'list','item_id':item.pk,'quantity':5,'unit_price':'20.00'},self.now)
        return MarketListing.objects.get(pk=key)

    def close_sessions(self):
        from .agent_world.market_sessions import close_session
        close_session(self.sa,'done');close_session(self.sb,'done')

    def test_partial_sale_archive_withdraw_and_sync_has_no_extra_energy(self):
        from .agent_world.market_service import trade
        from .agent_world.market_sync import reconcile_market
        from .agent_world.travel_models import AgentInventoryItem
        listing=self.create_listing()
        trade(self.sb,self.b,'buy-part',{'kind':'buy_listing','listing_id':listing.pk,'version':1,'quantity':2},self.now)
        listing.refresh_from_db();remaining=copy.deepcopy(listing.item)
        self.close_sessions()
        self.a.refresh_from_db();balance=self.a.money
        energy=list(WorldAction.objects.values_list('pk','energy_cost'))
        archive_agent(self.a.pk)
        listing.refresh_from_db();self.assertEqual(listing.status,'withdrawn');self.assertEqual(listing.remaining_quantity,0)
        returned=AgentInventoryItem.objects.get(actor_id=self.a.pk)
        self.assertEqual(returned.quantity,3)
        self.assertEqual(returned.source['lots'],remaining['source']['lots'])
        self.assertEqual(returned.origin_actor_id,remaining['origin_actor_id'])
        self.assertEqual(returned.icon_asset_id,remaining['icon_asset_id'])
        receipt=MarketTransaction.objects.get(pk=returned.source['market_trade_id'])
        self.assertEqual(receipt.result['deltas'],[]);self.assertEqual(receipt.session.mode,'archive')
        self.assertEqual(list(WorldAction.objects.values_list('pk','energy_cost')),energy)
        reconcile_market()
        self.assertEqual(list(WorldAction.objects.values_list('pk','energy_cost')),energy)
        self.a.refresh_from_db();self.assertEqual(self.a.money,balance)
        manager=SyncManager();manager.apply_snapshot_data(copy.deepcopy(manager.build_snapshot_data()))
        self.assertEqual(list(WorldAction.objects.values_list('pk','energy_cost')),energy)
        restore_agent(self.a.pk);listing.refresh_from_db();self.assertEqual(listing.status,'withdrawn')

    def test_failed_second_withdraw_rolls_back_entire_archive(self):
        from .agent_world.travel_models import AgentInventoryItem
        self.create_listing('a-list');self.create_listing('z-list');self.close_sessions()
        from .agent_world.market_service import withdraw_listing
        def withdraw(listing,agent,key):
            if listing.pk=='z-list':raise ValueError('托管批次缺失')
            return withdraw_listing(listing,agent,key)
        count=MarketTransaction.objects.count()
        with patch('system_settings.agent_world.market_archive.withdraw_listing',side_effect=withdraw),self.assertRaisesRegex(ValueError,'缺失'):
            archive_agent(self.a.pk)
        self.a.refresh_from_db();self.assertFalse(self.a.archived)
        self.assertEqual(MarketListing.objects.filter(status='active').count(),2)
        self.assertFalse(AgentInventoryItem.objects.filter(actor_id=self.a.pk).exists())
        self.assertEqual(MarketTransaction.objects.count(),count)
