import copy
import json
import time
from datetime import timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from anthology.models import Anthology
from article.models import Article
from system_settings.models import Agent, AgentExecutionLease, AgentTask, AIModel, AIProvider, MCPServer, WorldAction, WorldActionRuntime, AgentActivity
from system_settings.agent_task_scheduler import AgentTaskScheduler
from .models import WorldCategory, WorldIncomeConfig, WorldLedger
from .publish_config import PublishConfigSerializer, eligibility
from .publish_search import canonical_url, search
from .publish_workflow import Workflow, SkipPublication, validate_draft
from .publish_runner import commit_publication, preview, run_publish_opportunity, repair_publication
from .execution import stamina


class PublicationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser('admin', 'test@example.invalid', 'test')
        self.client = APIClient(); self.client.force_authenticate(self.user)
        self.collection = Anthology.objects.create(title='发布测试', type='agent', user_id='admin')
        self.category = WorldCategory.objects.create(name='科技')
        provider = AIProvider.objects.create(name='fake', type='OpenAi', base_url='https://example.invalid/v1')
        model = AIModel.objects.create(provider=provider, name='fake', type='chat')
        self.agent = Agent.objects.create(name='科技作者', model=model)
        self.server = MCPServer.objects.create(name='测试搜索', transport='streamableHttp', enabled=True,
            url='https://example.invalid/mcp', tools=[{'name': 'tavily_search', 'enabled': True,
                'inputSchema': {'type': 'object', 'properties': {'query': {}, 'max_results': {}}, 'required': ['query']}}])
        self.config = {'collection_id': self.collection.pk, 'search_server_id': self.server.pk, 'owner_id': 'admin',
            'rules': [{'category_id': self.category.pk, 'modes': ['news', 'topic'], 'topics': 'AI', 'news_days': 3, 'region': '全球', 'excluded_topics': ''}],
            'cooldown_hours': 6, 'unread_enabled': False, 'unread_count': 3}
        self.task = AgentTask.objects.create(id='builtin-post-publish', name='自主选题并发帖', task_kind='post_publish',
            agent=self.agent, agent_ids=[self.agent.pk], publish_config=self.config, enabled=True)
        self.source = {'url': 'https://example.com/new-model', 'title': '官方发布', 'summary': '真实素材',
            'published_at': timezone.now().isoformat(), 'fetched_at': timezone.now().isoformat()}
        self.state = {'template_version': 1, 'config': copy.deepcopy(self.config), 'phase': 'ready', 'search_count': 1,
            'selection': {'category_id': self.category.pk, 'mode': 'news', 'query': 'AI', 'reason': '关注AI'},
            'materials': [self.source], 'assessment': {'sufficient': True, 'primary_source': True, 'verification_query': ''},
            'draft': {'title': '模型的新变化', 'summary': '测试摘要', 'content': '事实：新模型已发布。观点：值得观察。',
                      'source_urls': [self.source['url']], 'main_source_url': self.source['url'], 'reason': '原始发布', 'evidence_sufficient': True}}
        self.until = timezone.now()+timedelta(minutes=10)
        WorldActionRuntime.objects.create(pk='world', token='world-test', until=self.until)
        AgentExecutionLease.objects.create(agent=self.agent, token='agent-test', until=self.until)

    def action(self, state=None):
        return WorldAction.objects.create(pk='opportunity-test', task=self.task, agent=self.agent, actor_id=self.agent.pk, snapshot=state or self.state)

    def commit(self, action):
        return commit_publication(action.pk, 'agent-test', 'world-test')

    def release(self):
        WorldActionRuntime.objects.update(token='', until=None)
        AgentExecutionLease.objects.update(token='', until=None)

    def test_commit_idempotent_energy_and_income(self):
        WorldIncomeConfig.objects.create(enabled=True, post_amount=Decimal('2'))
        action = self.action(); self.commit(action); self.commit(action)
        self.assertEqual(Article.objects.count(), 1)
        self.assertEqual(WorldLedger.objects.filter(kind='post').count(), 1)
        action.refresh_from_db(); self.assertEqual(action.energy_cost, Decimal('20'))
        self.assertAlmostEqual(float(stamina(self.agent)), 80, places=1)
        repair_publication(action); repair_publication(action)
        self.assertEqual(AgentActivity.objects.filter(activity_type='publication').count(), 1)

    def test_transaction_rolls_back_post_and_income(self):
        action = self.action()
        with patch.object(WorldAction, 'save', side_effect=RuntimeError('fail')):
            with self.assertRaises(RuntimeError): self.commit(action)
        self.assertFalse(Article.objects.exists()); self.assertFalse(WorldLedger.objects.filter(kind='post').exists())
        action.refresh_from_db(); self.assertEqual(action.status, 'claimed')
        self.assertEqual(stamina(self.agent), Decimal('100'))

    def test_config_changed_does_not_publish(self):
        action = self.action(); self.task.publish_config = {**self.config, 'cooldown_hours': 12}; self.task.save()
        with self.assertRaises(SkipPublication): self.commit(action)
        self.assertFalse(Article.objects.exists())

    def test_binding_removed_does_not_publish(self):
        action = self.action(); other = Agent.objects.create(name='另一个'); self.task.agent_ids=[other.pk]; self.task.save()
        with self.assertRaises(SkipPublication): self.commit(action)

    def test_permission_revoked_does_not_publish(self):
        action = self.action(); self.collection.user_id='other'; self.collection.save()
        with self.assertRaises(SkipPublication): self.commit(action)

    def test_paused_does_not_publish(self):
        action=self.action(); self.task.enabled=False; self.task.save()
        with self.assertRaises(SkipPublication): self.commit(action)

    def test_invalid_category_does_not_publish(self):
        action=self.action(); self.category.enabled=False; self.category.save()
        with self.assertRaises(SkipPublication): self.commit(action)

    def test_renamed_travel_stays_excluded(self):
        self.category.name='远方'; self.category.workflow_kind='travel'; self.category.save()
        self.assertIn('分类', eligibility(self.task, self.agent))
        data=PublishConfigSerializer(data=self.config)
        self.assertFalse(data.is_valid())

    def test_travel_name_excluded_before_classification(self):
        self.category.name='旅行'; self.category.save()
        data=PublishConfigSerializer(data=self.config)
        self.assertFalse(data.is_valid())

    def test_unread_and_cooldown_cover_other_task_posts(self):
        for i in range(3):
            Article.objects.create(title=f'旧帖子{i}', coll_id=self.collection.pk, author='admin', content='正文', agent_post_author_id=self.agent.pk)
        self.assertIn('冷却', eligibility(self.task, self.agent))
        Article.objects.update(created_at=timezone.now()-timedelta(days=1))
        self.task.publish_config={**self.config,'unread_enabled':True}
        self.assertIn('未读', eligibility(self.task,self.agent))

    def test_unknown_or_stale_news_date_is_rejected(self):
        for date in (None, (timezone.now()-timedelta(days=5)).isoformat(), (timezone.now()+timedelta(days=1)).isoformat()):
            state=copy.deepcopy(self.state); state['materials'][0]['published_at']=date
            with self.assertRaises(SkipPublication): validate_draft(state['draft'],state)

    def test_topic_accepts_old_material_and_citations_are_idempotent(self):
        state=copy.deepcopy(self.state); state['selection']['mode']='topic'; state['materials'][0]['published_at']=None
        draft=validate_draft(state['draft'],state)
        self.assertEqual(validate_draft(draft,state)['content'].count('参考来源'),1)

    def test_model_reference_heading_cannot_omit_sources(self):
        self.state['draft']['content'] = '正文事实。\n\n参考来源：\n来源略。'
        action = self.commit(self.action())
        content = Article.objects.get(pk=action.result['post_id']).content
        self.assertEqual(content, f'正文事实。\n\n参考来源：\n- [1]({self.source["url"]})')

    def test_partial_reference_list_is_rebuilt_and_idempotent(self):
        second = {**self.source, 'url': 'https://other.example.com/confirm'}
        self.state['materials'].append(second)
        self.state['draft']['source_urls'].append(second['url'])
        self.state['draft']['content'] += f'\n\n参考来源：\n- [旧引用]({self.source["url"]})'
        draft = validate_draft(self.state['draft'], self.state)
        self.assertIn(f'- [2]({second["url"]})', draft['content'])
        self.assertNotIn('旧引用', draft['content'])
        self.assertEqual(validate_draft(draft, self.state), draft)

    def test_fabricated_source_is_rejected(self):
        draft={**self.state['draft'],'source_urls':['https://example.com/invented']}
        with self.assertRaises(ValueError): validate_draft(draft,self.state)

    def test_weak_source_requires_independent_verification(self):
        state=copy.deepcopy(self.state); state['assessment']['primary_source']=False
        with self.assertRaises(SkipPublication): validate_draft(state['draft'],state)

    def test_source_duplicate_canonicalization(self):
        Article.objects.create(title='之前',coll_id=self.collection.pk,author='admin',content='旧',
            agent_post_author_id=self.agent.pk,source_url=self.source['url']+'?utm_source=x')
        Article.objects.update(created_at=timezone.now()-timedelta(days=1))
        with self.assertRaises(SkipPublication): self.commit(self.action())

    def test_urls_reject_local_and_normalize_tracking(self):
        self.assertEqual(canonical_url('http://127.0.0.1/a'),'')
        self.assertEqual(canonical_url('https://example.com/a?utm_source=x&b=2#fragment'),'https://example.com/a?b=2')

    @patch('system_settings.agent_world.publish_search.call_mcp_tool')
    def test_search_uses_schema_and_limits_results(self, call):
        call.return_value=({'results':[{**self.source,'content':'材料','published_date':self.source['published_at']}]*9},None)
        rows=search(self.config,'AI','news',3,time.monotonic()+60)
        self.assertEqual(len(rows),1)
        self.assertEqual(call.call_args.args[2],{'query':'AI','max_results':5})
        self.assertNotIn('content',rows[0])

    @patch('system_settings.agent_world.publish_workflow.search')
    @patch('system_settings.agent_world.publish_workflow.complete')
    @patch('system_settings.agent_world.publish_workflow.AIService.get_client_config_for_model',return_value={})
    def test_workflow_bounded_search_and_saved_materials(self, model, completion, search_mock):
        selection=self.state['selection']; assessment={**self.state['assessment'],'primary_source':False,'verification_query':'核实AI'}
        second={**self.source,'url':'https://other.example.com/confirm'}
        draft={**self.state['draft'],'source_urls':[self.source['url'],second['url']]}
        completion.side_effect=[json.dumps(v) for v in [selection,assessment,draft]]
        search_mock.side_effect=[[self.source],[second]]
        state=Workflow(self.task,self.agent).run()
        self.assertEqual(search_mock.call_count,2); self.assertEqual(state['search_count'],2)
        self.assertNotIn('raw_response',state)

    @patch('system_settings.agent_world.publish_workflow.search')
    @patch('system_settings.agent_world.publish_workflow.complete',side_effect=['bad','still bad'])
    @patch('system_settings.agent_world.publish_workflow.AIService.get_client_config_for_model',return_value={})
    def test_format_repair_only_once(self, model, completion, search_mock):
        with self.assertRaises(ValueError): Workflow(self.task,self.agent).run()
        self.assertEqual(completion.call_count,2); search_mock.assert_not_called()

    @patch('system_settings.agent_world.publish_runner.Workflow.run')
    def test_preview_does_not_write_business_state(self, run):
        run.return_value=self.state; self.release()
        result=preview(self.task,self.agent)
        self.assertEqual(result['status'],'ready')
        self.assertFalse(WorldAction.objects.exists()); self.assertFalse(Article.objects.exists())
        self.assertEqual(stamina(self.agent),Decimal('100'))

    def test_busy_closes_opportunity_without_energy(self):
        record=run_publish_opportunity(self.task,AgentTaskScheduler(),key='busy-test')
        self.assertIn('忙碌',record.summary)
        self.assertEqual(WorldAction.objects.get(pk='busy-test').status,'skipped')
        self.assertEqual(stamina(self.agent),Decimal('100'))

    @patch('system_settings.agent_world.publish_runner.Workflow.run')
    def test_resume_ready_snapshot_without_model(self, run):
        def saved_state(): return self.state
        self.release(); action=self.action()
        run.return_value=self.state
        scheduler=AgentTaskScheduler()
        with patch.object(scheduler,'_send_task_notification'):
            run_publish_opportunity(self.task,scheduler,key=action.pk)
        action.refresh_from_db(); self.assertEqual(action.status,'success')
        self.assertEqual(Article.objects.count(),1)

    @patch('system_settings.agent_world.publish_runner.Workflow.run')
    def test_disabled_local_runner_does_not_resume_publication(self, run):
        from .action_runner import tick
        self.release()
        action = self.action()
        WorldAction.objects.filter(pk=action.pk).update(updated_at=timezone.now()-timedelta(minutes=16))
        tick(AgentTaskScheduler())
        run.assert_not_called()
        action.refresh_from_db()
        self.assertEqual(action.status, 'claimed')
        self.assertFalse(Article.objects.exists())
        self.assertEqual(stamina(self.agent), Decimal('100'))

    @patch('system_settings.agent_world.publish_runner.Workflow.run')
    def test_enabled_local_runner_resumes_publication_once(self, run):
        from .action_runner import tick
        self.release()
        WorldActionRuntime.objects.update(enabled=True)
        action = self.action()
        WorldAction.objects.filter(pk=action.pk).update(updated_at=timezone.now()-timedelta(minutes=16))
        run.return_value = self.state
        scheduler = AgentTaskScheduler()
        with patch.object(scheduler, '_send_task_notification', return_value=True):
            tick(scheduler)
            tick(scheduler)
        run.assert_called_once()
        action.refresh_from_db()
        self.assertEqual(action.status, 'success')
        self.assertEqual(Article.objects.count(), 1)

    def test_disabled_runner_still_repairs_completed_publication(self):
        from .action_runner import tick
        action = self.commit(self.action())
        scheduler = AgentTaskScheduler()
        with patch.object(scheduler, '_send_task_notification', return_value=True) as notification:
            tick(scheduler)
        action.refresh_from_db()
        self.assertTrue(action.effects_done)
        self.assertFalse(action.snapshot['notification_pending'])
        notification.assert_called_once()
        self.assertEqual(Article.objects.count(), 1)

    def test_task_api_defaults_singleton_and_camelcase(self):
        self.task.delete()
        data={'taskKind':'post_publish','name':'任意','agent':self.agent.pk,'agents':[self.agent.pk],
              'publishConfig':{'collectionId':self.collection.pk,'searchServerId':self.server.pk,
                               'rules':[{'categoryId':self.category.pk,'modes':['topic']}]}}
        for _ in range(2):
            response=self.client.post('/api/settings/agent-tasks/',data,format='json')
            self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(AgentTask.objects.filter(task_kind='post_publish').count(),1)
        task=AgentTask.objects.get(task_kind='post_publish')
        self.assertFalse(task.enabled); self.assertEqual(task.name,'自主选题并发帖')
        self.assertEqual(task.publish_config['owner_id'],'admin')
        content=json.loads(response.content)['data']; self.assertIn('publishConfig',content)
        response=self.client.delete(f'/api/settings/agent-tasks/{task.pk}/')
        self.assertEqual(response.status_code,400)

    def test_empty_rules_rejected_and_preview_binding_checked(self):
        data=PublishConfigSerializer(data={**self.config,'rules':[]}); self.assertFalse(data.is_valid())
        response=self.client.post(f'/api/settings/agent-tasks/{self.task.pk}/preview/',{'agentId':'missing'},format='json')
        self.assertEqual(response.status_code,400)

    def test_sync_serializes_config_and_snapshot_but_excludes_leases(self):
        from django.core import serializers
        from system_settings.sync_state import LOCAL_ONLY_MODEL_LABELS
        action=self.action()
        rows=json.loads(serializers.serialize('json',[self.task,action,self.category]))
        self.assertEqual(rows[0]['fields']['publish_config'],self.config)
        self.assertIn('materials',rows[1]['fields']['snapshot'])
        self.assertIn('system_settings.worldactionruntime',LOCAL_ONLY_MODEL_LABELS)
        self.assertIn('system_settings.agentexecutionlease',LOCAL_ONLY_MODEL_LABELS)

    def test_sync_snapshot_roundtrip_keeps_result_and_local_leases(self):
        from django.conf import settings
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from django.test import override_settings
        from utils.sync_manager import SyncManager
        from system_settings.sync_state import suspend_tracking
        self.commit(self.action())
        with TemporaryDirectory(prefix='odoc-publish-sync-') as root:
            media = Path(root)/'media'; media.mkdir()
            sentinel = Path(root)/'outside-media.txt'; sentinel.write_text('preserved')
            with override_settings(MEDIA_ROOT=media):
                self.assertTrue(Path(settings.MEDIA_ROOT).resolve().is_relative_to(Path(root).resolve()))
                manager=SyncManager()
                data=manager.build_snapshot_data()
                self.assertFalse(any(r['model'] in ('system_settings.worldactionruntime','system_settings.agentexecutionlease') for r in data))
                WorldAction.objects.filter(pk='opportunity-test').update(snapshot={},status='failed')
                with patch('system_settings.agent_world.settlement.reconcile_awards'), patch('article.html_note_resources.retry_html_cleanup'), patch('article.version_service.enforce_article_version_retention'), suspend_tracking():
                    manager.apply_snapshot_data(copy.deepcopy(data))
                    manager.apply_snapshot_data(copy.deepcopy(data))
                action=WorldAction.objects.get(pk='opportunity-test')
                self.assertEqual(action.status,'success'); self.assertIn('materials',action.snapshot)
                self.assertEqual(Article.objects.count(),1)
                self.assertEqual(WorldActionRuntime.objects.get(pk='world').token,'world-test')
                self.assertEqual(sentinel.read_text(),'preserved')

    def test_disable_remains_possible_when_search_service_offline(self):
        self.server.enabled=False; self.server.save()
        response=self.client.patch(f'/api/settings/agent-tasks/{self.task.pk}/',{'enabled':False},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.task.refresh_from_db(); self.assertFalse(self.task.enabled)

    def test_invalid_config_returns_http_400_and_no_write(self):
        response=self.client.patch(f'/api/settings/agent-tasks/{self.task.pk}/',{'publishConfig':{}},format='json')
        self.assertEqual(response.status_code,400)
        self.task.refresh_from_db(); self.assertEqual(self.task.publish_config,self.config)

    def test_preview_and_execute_reject_other_collection_owner(self):
        user=User.objects.create_user('other',password='test')
        self.client.force_authenticate(user)
        for operation in ('preview','run_now'):
            response=self.client.post(f'/api/settings/agent-tasks/{self.task.pk}/{operation}/',{'agentId':self.agent.pk},format='json')
            self.assertEqual(response.status_code,403)

    def test_adapted_selector_uses_publish_cost_and_keeps_comment_cost(self):
        from .action_schedule import select_agent
        self.release()
        WorldAction.objects.create(pk='energy-test',agent=self.agent,actor_id=self.agent.pk,status='success',created_at=timezone.now()-timedelta(minutes=16),consumed_at=timezone.now()-timedelta(minutes=16),energy_cost=Decimal('85'))
        self.assertIsNone(select_agent(self.task,cost=Decimal('20')))
        self.assertEqual(select_agent(self.task,cost=Decimal('10')).pk,self.agent.pk)

    def test_notification_failure_retries_only_effect(self):
        from .publish_runner import deliver_notification
        action=self.commit(self.action())
        scheduler=Mock(); scheduler._send_task_notification.side_effect=[False,True]
        deliver_notification(action,scheduler)
        action.refresh_from_db(); self.assertTrue(action.snapshot['notification_pending'])
        action.snapshot.pop('notification_next_at'); action.save()
        deliver_notification(action,scheduler)
        action.refresh_from_db(); self.assertFalse(action.snapshot['notification_pending'])
        self.assertEqual(Article.objects.count(),1); self.assertEqual(action.energy_cost,Decimal('20'))

    def test_stale_news_is_normal_skip_without_format_retry(self):
        state=copy.deepcopy(self.state); state['materials'][0]['published_at']=None
        flow=Workflow(self.task,self.agent,state)
        with self.assertRaises(SkipPublication): flow.run()
        self.assertEqual(flow.repairs,0)

    def test_singleton_cannot_be_taken_over_by_other_user(self):
        self.client.force_authenticate(User.objects.create_user('other',password='test'))
        response=self.client.post('/api/settings/agent-tasks/',{'taskKind':'post_publish'},format='json')
        self.assertEqual(response.status_code,403)

    def test_deleted_agent_recovery_closes_action(self):
        other=Agent.objects.create(name='任务主记录')
        self.task.agent=other; self.task.save()
        action=self.action(); self.agent.delete(); self.release()
        run_publish_opportunity(self.task,AgentTaskScheduler(),key=action.pk)
        action.refresh_from_db()
        self.assertEqual(action.status,'skipped')
        self.assertTrue(action.effects_done)
        self.assertFalse(Article.objects.exists())
