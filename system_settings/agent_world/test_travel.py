import copy
from contextlib import contextmanager
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from anthology.models import Anthology
from article.models import Article
from message.models import Notification
from system_settings.models import Agent, AgentTask, AIProvider, AIModel, MCPServer, Skill, WorldAction, WorldActionRuntime
from .models import WorldCategory, WorldLedger
from .travel_models import TravelJourney, TravelNode, TravelRuntime, TravelDestination, AgentInventoryItem, TravelMaterialCache
from .travel_steps import advance
from .travel_settlement import depart, purchase
from .travel_publication import publish_journal, recover_photo, insert_photo, content_hash
from .travel_candidates import candidates, travelling_ids
from .travel_runner import process_journey, tick_travel, run_travel_opportunity
from .travel_activity import start_activity, update_activity
from .travel_ai import sourced_items, local_materials
from .execution import stamina, execution_lease
from system_settings.serializers import AgentTaskSerializer
from system_settings.sync_state import LOCAL_ONLY_MODEL_LABELS
from utils.sync_manager import SyncManager


class TravelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser('admin', 'admin@example.invalid', 'test')
        self.client = APIClient(); self.client.force_authenticate(self.user)
        self.collection = Anthology.objects.create(title='旅行测试', type='agent', user_id='admin')
        self.category = WorldCategory.objects.create(name='旅行', workflow_kind='travel')
        provider = AIProvider.objects.create(name='fake', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(provider=provider, name='fake', type='chat')
        self.skill = Skill.objects.create(name='旅行游记', skill_key='odoc_travel_journal', prompt='按实际经历写日记')
        self.agent = Agent.objects.create(name='旅行者', model=model, skills=[self.skill.pk], money=10000)
        self.server = MCPServer.objects.create(name='搜索', transport='streamableHttp', enabled=True, tools=[{'name': 'tavily_search', 'enabled': True}])
        self.config = {'collection_id': self.collection.pk, 'category_id': self.category.pk, 'search_server_id': self.server.pk,
            'owner_id': 'admin', 'node_minutes': 1, 'recent_cities': 3, 'energy_cost': 20, 'photo_enabled': True}
        self.task = AgentTask.objects.create(id='builtin-travel', name='旅行', agent=self.agent, agent_ids=[self.agent.pk], task_kind='travel', travel_config=self.config, enabled=True)
        self.city = {'id': '1', 'country': '中国', 'city': '成都', 'region': '四川', 'country_code': 'CN', 'price': '5000'}
        self.source = {'url': 'https://example.com/chengdu', 'title': '成都旅游', 'summary': '成都公园、博物馆、麻婆豆腐、担担面、熊猫和茶叶是当地主题。'}
        self.goods = [{'id': '1', 'name': '熊猫钥匙扣', 'description': '虚拟纪念品', 'price': '100'}, {'id': '2', 'name': '茶叶礼盒', 'description': '虚拟礼盒', 'price': '200'}]

    def journey(self, phase='preview', **extra):
        state = {'config': copy.deepcopy(self.config), 'role_prompt': '旅行者角色', 'agent_name': self.agent.name,
            'candidates': [self.city], 'selected': self.city, 'selection': {'destination_id': '1', 'reason': '想吃美食', 'shopping_budget': '500'}, 'goods': self.goods}
        return TravelJourney.objects.create(id='j'+str(TravelJourney.objects.count()), task=self.task, agent=self.agent,
            actor_id=self.agent.pk, owner_id='admin', phase=phase, destination_id='1', snapshot=state, **extra)

    def fake_ask(self, journey, instruction, context, validate, **kwargs):
        if '一句' in instruction:
            value = {'feature': '品尝成都美食'}
        elif '自主决定' in instruction:
            value = {'destination_id': '1', 'reason': '想体验成都', 'shopping_budget': 500}
        elif '整理目的地行程' in instruction:
            item = lambda name: {'name': name, 'description': name, 'source_url': self.source['url'], 'belongs_to_destination': True, 'evidence_quote': '成都公园'}
            value = {'sites': [item('成都公园'), item('博物馆')], 'foods': [item('麻婆豆腐'), item('担担面')], 'souvenirs': [item('熊猫钥匙扣'), item('茶叶礼盒'), item('熊猫明信片')]}
        elif '已抵达' in instruction:
            value = {'choice': '游览', 'reaction': '很有意思'}
        elif '面对已经发生' in instruction:
            value = {'choice': context['choices'][0], 'reaction': '按自己的方式应对'}
        elif '选择一项当地美食' in instruction:
            value = {'choice': '麻婆豆腐', 'reaction': '有点辣，很好吃'}
        elif '自主购买' in instruction:
            value = {'basket': [], 'reason': '这次不买'}
        else:
            value = {'title': '成都的一天', 'content': '在公园散步，吃了麻婆豆腐。这次没有买纪念品。', 'reflection': '下次还想来', 'photo_scene': '在公园留影'}
        return validate(value)

    def test_full_trip_text_published_without_image_and_notification(self):
        row = self.journey()
        with patch('system_settings.agent_world.travel_steps.local_materials', return_value=[self.source]), patch('system_settings.agent_world.travel_steps.ask', side_effect=self.fake_ask):
            for _ in range(25):
                advance(row); row.refresh_from_db()
                if row.status == 'completed':
                    break
        self.assertEqual(row.status, 'completed')
        self.assertTrue(row.returned_at)
        self.assertTrue(row.article_id)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.money, 5000)
        self.assertEqual(WorldAction.objects.get(pk=row.pk).energy_cost, 20)
        self.assertFalse(AgentInventoryItem.objects.exists())
        publish_journal(row)
        self.assertEqual(Article.objects.count(), 1)
        recover_photo(row); row.refresh_from_db()
        self.assertEqual(row.snapshot['photo']['status'], 'manual')
        self.assertEqual(Notification.objects.count(), 1)
        recover_photo(row)
        self.assertEqual(Notification.objects.count(), 1)
        self.assertEqual(Article.objects.count(), 1)

    def test_departure_idempotent_balance_and_energy(self):
        row = self.journey('depart')
        depart(row); depart(row)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.money, 5000)
        self.assertEqual(WorldLedger.objects.filter(kind='travel').count(), 1)
        self.assertGreaterEqual(stamina(self.agent), 80)
        self.assertEqual(WorldAction.objects.count(), 1)

    def test_manual_state_change_before_execution_lock_is_preserved(self):
        for status in ['paused', 'skipped']:
            with self.subTest(status=status):
                row = self.journey('depart')
                TravelRuntime.objects.create(pk=row.pk, authorized=True)
                @contextmanager
                def changed_before_lock(model, lookup):
                    if model is TravelRuntime:
                        TravelJourney.objects.filter(pk=row.pk).update(status=status)
                    with execution_lease(model, lookup) as token:
                        yield token
                with patch('system_settings.agent_world.travel_runner.execution_lease', changed_before_lock), patch('system_settings.agent_world.travel_runner.advance') as step:
                    process_journey(row)
                    step.assert_not_called()
                row.refresh_from_db()
                self.assertEqual(row.status, status)
                self.assertIsNone(row.departed_at)
        self.assertFalse(WorldLedger.objects.filter(kind='travel').exists())

    def test_changed_queue_time_before_lock_does_not_run_early(self):
        row = self.journey('depart')
        TravelRuntime.objects.create(pk=row.pk, authorized=True)
        @contextmanager
        def changed_before_lock(model, lookup):
            if model is TravelRuntime:
                TravelRuntime.objects.filter(pk=row.pk).update(next_at=timezone.now()+timedelta(minutes=5))
            with execution_lease(model, lookup) as token:
                yield token
        with patch('system_settings.agent_world.travel_runner.execution_lease', changed_before_lock), patch('system_settings.agent_world.travel_runner.advance') as step:
            process_journey(row)
            step.assert_not_called()

    def test_first_disabled_task_rejects_empty_config_and_remains_configurable(self):
        self.task.delete()
        data = {'name': '旅行', 'task_kind': 'travel', 'agent': self.agent.pk, 'enabled': False, 'travel_config': {}}
        response = self.client.post('/api/settings/agent-tasks/', data, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(AgentTask.objects.filter(task_kind='travel').exists())
        data['travel_config'] = self.config
        response = self.client.post('/api/settings/agent-tasks/', data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        task = AgentTask.objects.get(task_kind='travel')
        self.assertEqual(task.travel_config['owner_id'], 'admin')
        response = self.client.patch(f'/api/settings/agent-tasks/{task.pk}/', {'travel_config': {**self.config, 'node_minutes': 2}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_plan_recovery_refreshes_sources_without_changing_selection(self):
        row = self.journey('plan', status='manual')
        row.snapshot['previews'] = [{'destination_id': '1', 'feature': '城市概况', 'sources': [{'url': 'https://example.com/brief', 'summary': '概况'}]}]
        row.save()
        TravelNode.objects.create(pk=f'{row.pk}:plan', journey=row, kind='plan', status='manual', error='资料不足')
        original = copy.deepcopy(row.snapshot)
        self.assertEqual(self.client.post(f'/api/settings/agent-world/travel/{row.pk}/', {'action': 'resume'}, format='json').status_code, 200)
        row.refresh_from_db()
        with patch('system_settings.agent_world.travel_steps.local_materials', return_value=[self.source]) as materials, patch('system_settings.agent_world.travel_steps.ask', side_effect=self.fake_ask):
            process_journey(row)
            materials.assert_called_once_with(row, original['selected'], force_refresh=True)
        row.refresh_from_db()
        self.assertEqual(row.phase, 'depart')
        for key in ['selected', 'selection', 'candidates']:
            self.assertEqual(row.snapshot[key], original[key])
        self.assertEqual(row.snapshot['sources'], [self.source])
        self.assertEqual(TravelNode.objects.get(pk=f'{row.pk}:plan').input['sources'], [self.source])
        self.assertFalse(WorldLedger.objects.filter(kind='travel').exists())

    def test_saved_plan_decision_is_not_researched_or_regenerated(self):
        row = self.journey('plan')
        row.snapshot['previews'] = [{'destination_id': '1', 'sources': [self.source]}]
        row.save()
        plan = self.fake_ask(row, '整理目的地行程', {}, lambda v: v)
        TravelNode.objects.create(pk=f'{row.pk}:plan', journey=row, kind='plan', status='waiting', error='后续效果中断', result=plan)
        with patch('system_settings.agent_world.travel_steps.local_materials') as materials, patch('system_settings.agent_world.travel_steps.ask') as ask:
            advance(row)
            materials.assert_not_called()
            ask.assert_not_called()
        self.assertEqual(row.snapshot['plan'], plan)

    def test_source_recovery_can_bypass_thirty_day_cache(self):
        row = self.journey('plan')
        stale = [{'url': 'https://example.com/brief', 'summary': '概况'}]
        TravelMaterialCache.objects.create(pk='1', materials=stale, fetched_at=timezone.now())
        with patch('system_settings.agent_world.travel_ai.search', return_value=[self.source]) as search:
            self.assertEqual(local_materials(row, self.city), stale)
            search.assert_not_called()
            self.assertEqual(local_materials(row, self.city, force_refresh=True), [self.source])
            search.assert_called_once()
        self.assertEqual(TravelMaterialCache.objects.get(pk='1').materials, [self.source])

    def test_activity_start_and_departure_share_one_action(self):
        row = self.journey('depart')
        start_activity(row); start_activity(row)
        action = WorldAction.objects.get(pk=row.pk)
        record_id = action.record_id
        self.assertIsNotNone(record_id)
        self.assertEqual(action.energy_cost, 0)
        depart(row); depart(row)
        action.refresh_from_db()
        self.assertEqual(action.record_id, record_id)
        self.assertEqual(action.energy_cost, 20)
        self.assertEqual(action.status, 'success')
        self.assertTrue(action.effects_done)
        row.status = 'completed'
        row.snapshot['draft'] = {'content': '真实旅行记录'}
        update_activity(row)
        action.record.refresh_from_db()
        self.assertEqual(action.record.status, 'success')
        self.assertEqual(action.record.output, '真实旅行记录')

    def test_manual_end_before_departure_completes_execution_record(self):
        row = self.journey()
        start_activity(row)
        result = self.client.post(f'/api/settings/agent-world/travel/{row.pk}/', {'action': 'end'}, format='json')
        self.assertEqual(result.status_code, 200)
        action = WorldAction.objects.get(pk=row.pk)
        self.assertEqual(action.status, 'skipped')
        self.assertEqual(action.record.status, 'success')
        self.assertEqual(action.energy_cost, 0)
        self.assertFalse(WorldLedger.objects.filter(kind='travel').exists())

    def test_insufficient_balance_does_not_charge_or_arrive(self):
        self.agent.money = 100; self.agent.save(); WorldLedger.objects.filter(pk=f'opening:{self.agent.pk}').update(amount=100)
        row = self.journey('depart')
        with self.assertRaises(ValueError):
            depart(row)
        row.refresh_from_db()
        self.assertIsNone(row.departed_at)
        self.assertFalse(WorldLedger.objects.exclude(kind='opening').exists())

    def test_purchase_idempotent_inventory_and_balance(self):
        row = self.journey('buy'); depart(row)
        basket = [{'id': '1', 'quantity': 2}]
        purchase(row, basket); purchase(row, basket)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.money, 4800)
        self.assertEqual(AgentInventoryItem.objects.get().quantity, 2)
        self.assertEqual(WorldLedger.objects.filter(kind='souvenir').count(), 1)

    def test_souvenir_attributes_survive_owner_change_and_role_rename(self):
        row = self.journey('buy')
        row.snapshot['goods'][0].update(rarity='rare', value='180')
        row.save()
        depart(row)
        purchase(row, [{'id': '1', 'quantity': 2}])
        item = AgentInventoryItem.objects.get()
        self.assertEqual((item.rarity, item.value), ('rare', Decimal('180')))
        self.assertEqual((item.origin_actor_id, item.origin_actor_name), (self.agent.pk, '旅行者'))
        item.actor_id, item.actor_name = 'next-owner', '下一位买家'
        item.save(update_fields=['actor_id', 'actor_name'])
        self.agent.name = '改名后的角色'; self.agent.save()
        item.refresh_from_db()
        self.assertEqual((item.origin_actor_id, item.origin_actor_name), (self.agent.pk, '旅行者'))
        response = self.client.get('/api/settings/agent-world/inventory/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data'][0]['origin_actor_name'], '旅行者')

    def test_invalid_souvenir_attributes_do_not_charge_or_create_items(self):
        row = self.journey('buy'); depart(row)
        for attrs in [{'rarity': 'invalid'}, {'value': '-10'}, {'value': 'NaN'}]:
            row.snapshot['goods'][0].update(rarity='common', value='100')
            row.snapshot['goods'][0].update(attrs); row.save()
            with self.assertRaises(ValueError): purchase(row, [{'id': '1', 'quantity': 1}])
        self.assertFalse(AgentInventoryItem.objects.exists())
        self.assertFalse(WorldLedger.objects.filter(kind='souvenir').exists())

    def test_resident_inventory_count_sums_quantities_and_scopes_account(self):
        from system_settings.agent_relation import relation_graph
        row = self.journey('buy'); depart(row)
        purchase(row, [{'id': '1', 'quantity': 2}, {'id': '2', 'quantity': 1}])
        AgentInventoryItem.objects.create(id='other-account', actor_id=self.agent.pk, owner_id='other', name='不可读取的物品', quantity=8)
        graph = relation_graph(owner_id='admin')
        node = next(node for node in graph['nodes'] if node['id'] == self.agent.pk)
        self.assertEqual(node['inventory_count'], 3)
        self.assertEqual(len(self.client.get('/api/settings/agent-world/inventory/', {'agentId': self.agent.pk}).data['data']), 2)
        empty = self.client.get('/api/settings/agent-world/inventory/', {'agentId': 'missing-agent'})
        self.assertEqual(empty.data['data'], [])

    def test_invalid_baskets_and_budget_do_not_partially_commit(self):
        row = self.journey('buy'); depart(row)
        for basket in [[{'id': 'bad', 'quantity': 1}], [{'id': '1', 'quantity': 4}], [{'id': '1', 'quantity': 1}, {'id': '1', 'quantity': 1}], [{'id': '2', 'quantity': 3}]]:
            with self.assertRaises(ValueError): purchase(row, basket)
        self.assertFalse(AgentInventoryItem.objects.exists())
        self.assertFalse(WorldLedger.objects.filter(kind='souvenir').exists())

    def test_purchase_failure_rolls_back_money(self):
        row = self.journey('buy'); depart(row)
        with patch.object(AgentInventoryItem, 'save', side_effect=RuntimeError('failed')):
            with self.assertRaises(RuntimeError): purchase(row, [{'id': '1', 'quantity': 1}])
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.money, 5000)
        self.assertFalse(WorldLedger.objects.filter(kind='souvenir').exists())

    def test_skip_does_not_publish_or_charge(self):
        row = self.journey('choose'); row.snapshot['previews'] = []; row.save()
        with patch('system_settings.agent_world.travel_steps.ask', return_value={'destination_id': 'skip', 'reason': '想休息', 'shopping_budget': '0'}):
            advance(row)
        row.refresh_from_db()
        self.assertEqual(row.status, 'skipped')
        self.assertFalse(Article.objects.exists()); self.assertFalse(WorldLedger.objects.exclude(kind='opening').exists())

    def test_retry_uses_saved_decision(self):
        row = self.journey('choose'); row.snapshot['previews'] = []; row.save()
        TravelNode.objects.create(pk=f'{row.pk}:choose', journey=row, kind='choose', result={'destination_id': '1', 'reason': '想去', 'shopping_budget': '0'})
        with patch('system_settings.agent_world.travel_steps.ask') as ask:
            advance(row); ask.assert_not_called()
        self.assertEqual(row.phase, 'plan')

    def test_candidates_affordable_distinct_and_recent_avoidance(self):
        for i in range(7):
            TravelDestination.objects.create(pk=str(i+1), country_code='CN' if i < 3 else 'TH', country='国家', city='城市', price=500 if i == 6 else 20000)
        self.journey(arrived_at=timezone.now())
        result = candidates(self.agent)
        self.assertEqual(len(result), 5)
        self.assertEqual(len({r['id'] for r in result}), 5)
        self.assertNotIn('1', {r['id'] for r in result})
        self.assertIn('7', {r['id'] for r in result})

    def test_pause_resume_and_early_end(self):
        row = self.journey(); depart(row)
        url = f'/api/settings/agent-world/travel/{row.pk}/'
        self.assertEqual(self.client.post(url, {'action': 'pause'}, format='json').status_code, 200)
        row.refresh_from_db(); self.assertEqual(row.status, 'paused')
        self.assertIn(self.agent.pk, list(travelling_ids()))
        self.assertEqual(self.client.post(url, {'action': 'resume'}, format='json').status_code, 200)
        self.assertEqual(self.client.post(url, {'action': 'end'}, format='json').status_code, 200)
        row.refresh_from_db(); self.assertEqual(row.phase, 'journal'); self.assertTrue(row.returned_at)
        self.assertNotIn(self.agent.pk, list(travelling_ids()))
        self.agent.refresh_from_db(); self.assertEqual(self.agent.money, 5000)

    def test_fewer_candidates_do_not_fill_with_recent_city(self):
        TravelDestination.objects.create(pk='1', country_code='CN', country='中国', city='成都', price=5000)
        TravelDestination.objects.create(pk='2', country_code='CN', country='中国', city='深圳', price=5000)
        self.journey(arrived_at=timezone.now())
        self.assertEqual([r['id'] for r in candidates(self.agent)], ['2'])

    def test_owner_and_anonymous_permissions(self):
        row = self.journey()
        other = User.objects.create_user('other', password='test')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f'/api/settings/agent-world/travel/{row.pk}/').status_code, 404)
        self.assertEqual(self.client.get('/api/settings/agent-world/travel/').json()['data'], [])
        self.client.force_authenticate(None)
        self.assertIn(self.client.get('/api/settings/agent-world/travel/').status_code, [401, 403])

    def test_photo_insert_once_and_edit_conflict(self):
        row = self.journey('publish')
        row.snapshot['draft'] = {'title': '旅行', 'content': '旅行正文'}; row.save()
        publish_journal(row); row.refresh_from_db()
        insert_photo(row, '/api/resource/view/test')
        insert_photo(row, '/api/resource/view/test')
        self.assertEqual(Article.objects.get().content.count('![旅行场景照]'), 1)
        other = self.journey('publish'); other.snapshot['draft'] = {'title': '另一次旅行', 'content': '另一个正文'}; other.save()
        publish_journal(other); other.refresh_from_db()
        Article.objects.filter(pk=other.article_id).update(content='人工修改')
        insert_photo(other, '/api/resource/view/test')
        self.assertEqual(Article.objects.get(pk=other.article_id).content, '人工修改')
        self.assertEqual(other.snapshot['photo']['status'], 'manual')

    def test_photo_query_does_not_submit_again(self):
        row = self.journey(status='completed'); row.article_id = 'post'
        row.snapshot['photo'] = {'status': 'generating', 'task_id': 'a'*32}; row.save()
        with patch('system_settings.agent_world.travel_publication.get_image_generation_result', return_value={'status': 'generating', 'task_id': 'a'*32}) as query, patch('system_settings.agent_world.travel_publication.generate_image') as generate:
            recover_photo(row); query.assert_called_once(); generate.assert_not_called()

    def test_model_failure_retries_then_requires_manual_recovery(self):
        row = self.journey(); TravelRuntime.objects.create(pk=row.pk, authorized=True)
        with patch('system_settings.agent_world.travel_runner.advance', side_effect=ValueError('网络失败')):
            for _ in range(4):
                TravelRuntime.objects.filter(pk=row.pk).update(next_at=timezone.now()-timedelta(minutes=1))
                process_journey(row); row.refresh_from_db()
        self.assertEqual(row.status, 'manual')
        self.assertFalse(WorldLedger.objects.exclude(kind='opening').exists())
        self.assertEqual(Notification.objects.count(), 1)

    def test_other_device_does_not_adopt_synced_journey(self):
        row = self.journey()
        with patch('system_settings.agent_world.travel_runner.advance') as run:
            process_journey(row); run.assert_not_called()
        self.assertFalse(TravelRuntime.objects.get(pk=row.pk).authorized)

    def test_sources_reject_fabricated_evidence(self):
        item = {'name': '不存在的景点', 'description': '...', 'source_url': self.source['url'], 'belongs_to_destination': True, 'evidence_quote': '凭空捏造'}
        with self.assertRaises(ValueError): sourced_items([item], [self.source], minimum=1, maximum=3)

    def test_sync_includes_business_excludes_runtime_and_image_lease(self):
        for label in ['system_settings.traveldestination', 'system_settings.traveljourney', 'system_settings.travelnode', 'system_settings.agentinventoryitem', 'prompts.imagegenerationtask']:
            self.assertNotIn(label, LOCAL_ONLY_MODEL_LABELS)
        for label in ['system_settings.travelruntime', 'system_settings.travelseedstate', 'system_settings.travelmaterialcache']:
            self.assertIn(label, LOCAL_ONLY_MODEL_LABELS)
        data = [{'model': 'prompts.imagegenerationtask', 'pk': 'a', 'fields': {'lease_until': 'remote-lock', 'provider_task_id': 'real-task'}}]
        SyncManager._strip_device_local_user_fields(data)
        self.assertNotIn('lease_until', data[0]['fields'])
        self.assertEqual(data[0]['fields']['provider_task_id'], 'real-task')

    def test_task_validation_requires_skill_and_weekly_default(self):
        self.task.delete()
        serializer = AgentTaskSerializer(data={'task_kind': 'travel', 'name': '旅行', 'agent': self.agent.pk, 'agents': [self.agent.pk], 'travel_config': self.config, 'enabled': True})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        task = serializer.save()
        self.assertEqual(task.pk, 'builtin-travel'); self.assertEqual(task.random_period, 'weekly')
        self.agent.skills = []; self.agent.save()
        serializer = AgentTaskSerializer(task, data={'enabled': True}, partial=True)
        self.assertFalse(serializer.is_valid())

    def test_same_opportunity_and_single_active_trip(self):
        TravelDestination.objects.create(pk='1', country_code='CN', country='中国', city='成都', price=5000)
        with patch('system_settings.agent_world.travel_runner.process_journey'):
            row = run_travel_opportunity(self.task, key='stable-key', manual=True)
            again = run_travel_opportunity(self.task, key='stable-key', manual=True)
            blocked = run_travel_opportunity(self.task, key='new-key', manual=True)
        self.assertEqual(row.pk, again.pk)
        self.assertIsNone(blocked)
        self.assertEqual(TravelJourney.objects.count(), 1)
        self.assertTrue(TravelRuntime.objects.get(pk=row.pk).authorized)

    def test_photo_timeout_and_regeneration_requires_charge_confirmation(self):
        row = self.journey(status='completed'); row.article_id = 'post'
        row.snapshot['photo'] = {'status': 'generating', 'task_id': 'a'*32}; row.save()
        TravelRuntime.objects.create(pk=f'{row.pk}:photo', photo_started_at=timezone.now()-timedelta(minutes=31))
        with patch('system_settings.agent_world.travel_publication.generate_image') as generate, patch('system_settings.agent_world.travel_publication.get_image_generation_result') as query:
            recover_photo(row); generate.assert_not_called(); query.assert_not_called()
        row.refresh_from_db(); self.assertEqual(row.snapshot['photo']['status'], 'manual')
        url = f'/api/settings/agent-world/travel/{row.pk}/'
        self.assertEqual(self.client.post(url, {'action': 'regenerate_image'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {'action': 'regenerate_image', 'confirm_charge': True}, format='json').status_code, 200)
        row.refresh_from_db(); self.assertEqual(row.snapshot['photo']['attempt'], 1)

    def test_world_switch_blocks_automatic_recovery(self):
        from .action_runner import tick
        row = self.journey()
        TravelRuntime.objects.create(pk=row.pk, authorized=True)
        WorldActionRuntime.objects.create(pk='world', enabled=False)
        with patch('system_settings.agent_world.travel_runner.advance') as run:
            tick(None); run.assert_not_called()

    def test_restart_does_not_mark_recoverable_trip_failed(self):
        from system_settings.agent_task_scheduler import AgentTaskScheduler
        from system_settings.models import AgentRunRecord
        row = self.journey(status='waiting')
        start_activity(row, manual=True)
        record = WorldAction.objects.get(pk=row.pk).record
        AgentRunRecord.objects.filter(pk=record.pk).update(updated_at=timezone.now()-timedelta(hours=4))
        AgentTaskScheduler()._mark_interrupted_runs()
        record.refresh_from_db()
        self.assertEqual(record.status, 'running')
        self.assertFalse(any(step['title'] == '执行中断' for step in record.steps))

    def test_execution_detail_exposes_retry_queue_without_syncing_runtime(self):
        from system_settings.serializers import AgentRunRecordSerializer
        row = self.journey(status='waiting')
        start_activity(row, manual=True)
        next_at = timezone.now()+timedelta(minutes=5)
        TravelRuntime.objects.create(pk=row.pk, authorized=True, attempts=2, next_at=next_at)
        record = WorldAction.objects.get(pk=row.pk).record
        data = AgentRunRecordSerializer(record).data['travel_progress']
        self.assertEqual((data['status'], data['attempts'], data['next_at']), ('waiting', 2, next_at))
        self.assertEqual(record.random_context, {'journey_id': row.pk})

    def test_validation_failure_is_explained_and_sent_back_for_correction(self):
        from .travel_ai import ask
        row = self.journey()
        def validate(value):
            raise ValueError('当地素材的依据必须是来源中的原文片段')
        with patch('system_settings.agent_world.travel_ai.complete', return_value='{}') as model:
            with self.assertRaisesRegex(ValueError, '旅行模型输出未通过校验：当地素材的依据'):
                ask(row, '整理行程', {}, validate)
            self.assertIn('当地素材的依据必须是来源中的原文片段', model.call_args.args[1])

    def test_manual_trip_continues_with_world_switch_off_without_new_opportunities(self):
        from .action_runner import tick
        manual = self.journey()
        start_activity(manual, manual=True)
        TravelRuntime.objects.create(pk=manual.pk, authorized=True)
        automatic = self.journey()
        start_activity(automatic)
        TravelRuntime.objects.create(pk=automatic.pk, authorized=True)
        synced = self.journey()
        start_activity(synced, manual=True)
        TravelRuntime.objects.create(pk=synced.pk, authorized=False)
        WorldActionRuntime.objects.create(pk='world', enabled=False)
        with patch('system_settings.agent_world.travel_runner.advance') as advance_node, patch('system_settings.agent_world.travel_runner.take_due') as take:
            tick(None)
            advance_node.assert_called_once()
            self.assertEqual(advance_node.call_args.args[0].pk, manual.pk)
            take.assert_not_called()

    def test_travel_activity_exposes_saved_nodes_and_candidate_progress(self):
        row = self.journey()
        row.snapshot['previews'] = [{'destination_id': '1'}]
        row.save()
        start_activity(row, manual=True)
        TravelNode.objects.create(pk=f'{row.pk}:preview-0', journey=row, kind='preview', input=self.city,
            result={'feature': '成都美食'}, status='pending')
        update_activity(row)
        record = WorldAction.objects.get(pk=row.pk).record
        self.assertIn('准备候选目的地（1/1）', record.summary)
        self.assertEqual(record.steps[0]['title'], '准备候选目的地：中国 · 成都')
        self.assertEqual(record.steps[0]['status'], 'success')

    def test_same_title_can_publish_distinct_journeys(self):
        first = self.journey('publish')
        first.snapshot['draft'] = {'title': '同名日记', 'content': '第一趟旅行'}; first.save()
        publish_journal(first)
        second = self.journey('publish')
        second.snapshot['draft'] = {'title': '同名日记', 'content': '第二趟旅行'}; second.save()
        publish_journal(second)
        self.assertEqual(Article.objects.count(), 2)
        self.assertEqual(len(set(Article.objects.values_list('title', flat=True))), 2)

    def test_photo_unknown_submission_not_automatically_recreated(self):
        row = self.journey(status='completed'); row.article_id = 'post'
        row.snapshot['photo'] = {'status': 'generating', 'task_id': 'a'*32}; row.save()
        with patch('system_settings.agent_world.travel_publication.get_image_generation_result', return_value={'status':'submission_unknown', 'task_id':'a'*32, 'message':'服务商是否接收未知'}), patch('system_settings.agent_world.travel_publication.generate_image') as generate:
            recover_photo(row); generate.assert_not_called()
        row.refresh_from_db(); self.assertEqual(row.snapshot['photo']['status'], 'manual')

    def test_photo_submission_preserves_avatar_style_when_prompt_model_omits_it(self):
        scene = Skill.objects.create(name='旅行场景照', skill_key='odoc_travel_scene_photo', prompt='沿用头像画风')
        self.agent.skills = [self.skill.pk, scene.pk]
        self.agent.mcp_servers = [self.server.pk]; self.agent.save()
        self.server.tools = [{'name': 'generate_image', 'enabled': True}]; self.server.save()
        row = self.journey(status='completed'); row.article_id = 'post'
        row.snapshot.update(draft={'photo_scene': '在地标前留影'}, photo={'status': 'pending'})
        row.save()
        options = {'configured': True, 'supports_reference_images': True,
            'agent_reference_images': {'avatar': 'avatar-resource', 'full_body': 'body-resource'}}
        with patch('system_settings.agent_world.travel_publication.image_generation_options', return_value=options), \
                patch('system_settings.agent_world.travel_steps.decide', return_value={'prompt': '角色在地标前留影'}), \
                patch('system_settings.agent_world.travel_publication.generate_image', return_value={'status': 'generating', 'task_id': 'a'*32}) as generate:
            recover_photo(row)
        request = generate.call_args.args[0]
        self.assertEqual(request['reference_image_ids'], ['avatar-resource', 'body-resource'])
        self.assertIn('参考图 1 是头像', request['prompt'])
        self.assertIn('头身比例', request['prompt'])
        row.refresh_from_db()
        self.assertEqual(row.snapshot['photo']['request'], request)

    def test_restore_discards_remote_image_lease(self):
        data = [{'model':'prompts.imagegenerationtask', 'pk':'a'*32, 'fields':{'lease_until':'remote-lock'}}]
        SyncManager._restore_device_local_user_fields(data)
        self.assertIsNone(data[0]['fields']['lease_until'])


    def test_travel_memory_is_idempotent_and_excludes_debug_items(self):
        from .travel_memory import remember_travel, recent_travel_context
        row = self.journey('done', status='completed', departed_at=timezone.now(), returned_at=timezone.now())
        row.snapshot.update(shopping={'basket': [], 'reason': '不买'}, debug_purchase={'items': [{'name': '调试礼盒'}]},
                            ended_early=True, destination_scope='region')
        row.save()
        memory = remember_travel(row)
        self.assertEqual(remember_travel(row).pk, memory.pk)
        self.assertIn('未购买', memory.content)
        self.assertIn('具体城市未确认', memory.content)
        self.assertIn('提前结束', memory.content)
        self.assertNotIn('调试礼盒', memory.content)
        self.assertEqual(len(recent_travel_context(self.agent)), 1)
        memory.status = 'archived'; memory.save()
        remember_travel(row)
        self.assertEqual(recent_travel_context(self.agent), [])
        self.assertIsNone(remember_travel(self.journey(status='skipped')))

    def test_history_without_scope_keeps_real_city_visits(self):
        row = self.journey(arrived_at=timezone.now())
        TravelDestination.objects.create(pk='1', country='中国', country_code='CN', city='成都', price=20000)
        self.assertEqual(candidates(self.agent, recent_count=0)[0]['visited'], True)
        row.snapshot['destination_scope'] = 'region'; row.save()
        self.assertEqual(candidates(self.agent, recent_count=0)[0]['visited'], False)

    def test_successful_photo_can_regenerate_with_charge_confirmation(self):
        row = self.journey()
        row.snapshot['draft'] = {'title': '旅行', 'content': '原文'}; row.save()
        publish_journal(row); row.refresh_from_db()
        insert_photo(row, '/old.png')
        path = f'/api/settings/agent-world/travel/{row.pk}/'
        self.assertEqual(self.client.post(path, {'action': 'regenerate_image'}, format='json').status_code, 400)
        response = self.client.post(path, {'action': 'regenerate_image', 'confirm_charge': True}, format='json')
        self.assertEqual(response.status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.snapshot['photo']['previous_image_url'], '/old.png')
        self.assertEqual(row.snapshot['photo_history'][0]['image_url'], '/old.png')
        insert_photo(row, '/new.png')
        content = Article.objects.get(pk=row.article_id).content
        self.assertEqual(content, '原文\n\n![旅行场景照](/new.png)')
        insert_photo(row, '/new.png')
        self.assertEqual(Article.objects.get(pk=row.article_id).content, content)

    def test_regenerated_photo_keeps_manual_edits(self):
        row = self.journey()
        row.snapshot['draft'] = {'title': '旅行', 'content': '原文'}; row.save()
        publish_journal(row); row.refresh_from_db()
        insert_photo(row, '/old.png')
        Article.objects.filter(pk=row.article_id).update(content='手动编辑\n\n![旅行场景照](/old.png)')
        self.client.post(f'/api/settings/agent-world/travel/{row.pk}/', {'action': 'regenerate_image', 'confirm_charge': True}, format='json')
        row.refresh_from_db(); insert_photo(row, '/new.png')
        self.assertEqual(row.snapshot['photo']['status'], 'manual')
        self.assertEqual(Article.objects.get(pk=row.article_id).content, '手动编辑\n\n![旅行场景照](/old.png)')

    def test_legacy_photo_hash_supports_replacement(self):
        row = self.journey()
        row.snapshot['draft'] = {'title': '旅行', 'content': '原文'}; row.save()
        publish_journal(row); row.refresh_from_db()
        Article.objects.filter(pk=row.article_id).update(content='原文\n\n![旅行场景照](/old.png)')
        row.snapshot['photo'] = {'status': 'pending', 'previous_image_url': '/old.png'}; row.save()
        insert_photo(row, '/new.png')
        self.assertEqual(Article.objects.get(pk=row.article_id).content, '原文\n\n![旅行场景照](/new.png)')


    def test_role_memory_recall_does_not_expose_other_users_or_agents(self):
        from types import SimpleNamespace
        from system_settings.models import AgentLongTermMemory
        from system_settings.agent_memory import get_long_term_memories_for_record
        global_memory = AgentLongTermMemory.objects.create(agent=self.agent, scope='agent', content='自身旅行')
        AgentLongTermMemory.objects.create(agent=self.agent, sender_id='other-user', content='其他用户私事')
        other_agent = Agent.objects.create(name='另一个角色')
        AgentLongTermMemory.objects.create(agent=other_agent, scope='agent', content='另一角色经历')
        for record in [SimpleNamespace(sender_id='current-user', chat_id='chat'), SimpleNamespace(sender_id='', chat_id='chat')]:
            self.assertEqual([m.pk for m in get_long_term_memories_for_record(self.agent, record)], [global_memory.pk])

    def test_task_context_loads_and_prompt_contains_travel_memory(self):
        from system_settings.agent_task_scheduler import AgentTaskScheduler
        from .travel_memory import remember_travel
        row = self.journey('done', status='completed', departed_at=timezone.now(), returned_at=timezone.now())
        memory = remember_travel(row)
        scheduler = object.__new__(AgentTaskScheduler)
        with patch.object(scheduler, '_append_agent_run_step'):
            context = scheduler._append_agent_context_steps(None, self.task, agent=self.agent)
        self.assertEqual(context['tools'], [])
        self.assertEqual(context['agent'], self.agent)
        prompt = scheduler._build_prompt(self.task, agent=self.agent)
        self.assertIn(memory.title, prompt)
        self.assertIn(memory.content, prompt)

    def test_manual_photo_operations_continue_for_automatic_trip_with_world_off(self):
        from .action_runner import tick
        WorldActionRuntime.objects.create(pk='world', enabled=False)
        for operation in ['regenerate_image', 'query_image']:
            with self.subTest(operation=operation):
                row = self.journey('done', status='completed', article_id='photo-test-article')
                row.snapshot['photo'] = ({'status': 'inserted', 'image_url': '/old.png'} if operation == 'regenerate_image'
                    else {'status': 'manual', 'task_id': 'existing-provider-task'})
                row.save()
                start_activity(row, manual=False)
                result = self.client.post(f'/api/settings/agent-world/travel/{row.pk}/',
                    {'action': operation, 'confirm_charge': True}, format='json')
                self.assertEqual(result.status_code, 200)
                self.assertTrue(TravelRuntime.objects.get(pk=f'{row.pk}:photo').authorized)
                self.assertEqual(WorldAction.objects.get(pk=row.pk).record.trigger, '定时任务')
                with patch('system_settings.agent_world.travel_runner.recover_photo') as recover, patch('system_settings.agent_world.travel_runner.take_due') as take:
                    tick(None)
                    self.assertIn(row.pk, [call.args[0].pk for call in recover.call_args_list])
                    take.assert_not_called()

    def test_world_off_skips_automatic_and_synced_photo_queues_without_local_authority(self):
        from .action_runner import tick
        WorldActionRuntime.objects.create(pk='world', enabled=False)
        for main_authority, photo_authority in [(True, False), (False, True)]:
            row = self.journey('done', status='completed', article_id='photo-test-article')
            row.snapshot['photo'] = {'status': 'pending'}; row.save()
            start_activity(row, manual=False)
            TravelRuntime.objects.create(pk=row.pk, authorized=main_authority)
            TravelRuntime.objects.create(pk=f'{row.pk}:photo', authorized=photo_authority)
        with patch('system_settings.agent_world.travel_runner.recover_photo') as recover:
            tick(None)
            recover.assert_not_called()
