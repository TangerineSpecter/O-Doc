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

    def test_restore_discards_remote_image_lease(self):
        data = [{'model':'prompts.imagegenerationtask', 'pk':'a'*32, 'fields':{'lease_until':'remote-lock'}}]
        SyncManager._restore_device_local_user_fields(data)
        self.assertIsNone(data[0]['fields']['lease_until'])
