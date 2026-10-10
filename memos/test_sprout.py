import json
import uuid
from unittest.mock import patch
from datetime import timedelta
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from memos.models import Memo, Sprout, SproutJob, MemoCapture
from memos.sprout_rules import validate_result, collect_sources
from memos.sprout_sync import metadata, validate, reset_execution
from memos.sprout_worker import tick
from memos.capture import commit_capture, skip_capture
from system_settings.models import Agent, AgentTask, AgentRunRecord
from system_settings.agent_random_schedule import make_plan, reconcile_successes, next_slot, progress
from system_settings.serializers import AgentTaskSerializer
from utils.sync_manager import SyncError
from anthology.models import Anthology


class SproutFixture(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice')
        from user.models import UserProfile
        UserProfile.objects.create(user=self.user, userid='alice')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.memos = [Memo.objects.create(user_id='alice', content=text) for text in ['种菜的时候很有耐心', '学习的时候却总是很着急']]
        self.config = patch('memos.sprout_services.AIService.get_client_config_for_model', return_value={'model_id': 'model', 'model_type': 'chat'})
        self.config.start()
        self.addCleanup(self.config.stop)

    def create(self):
        response = self.client.post('/api/memo/sprouts', {'memoIds': [str(m.pk) for m in self.memos]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['code'], 200, response.data)
        return Sprout.objects.latest('created_at')


class SproutTests(SproutFixture):
    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get('/api/memo/sprouts').status_code, [401, 403])

    def test_create_snapshot_and_local_permission(self):
        row = self.create()
        self.assertEqual(row.owner_id, 'alice')
        self.memos[0].content = '修改后的内容'
        self.memos[0].save()
        self.assertEqual(row.sources[0]['content'], '种菜的时候很有耐心')
        self.assertEqual(SproutJob.objects.get(pk=row.pk).state, 'pending')

    def test_duplicate_ids_rejected(self):
        response = self.client.post('/api/memo/sprouts', {'memoIds': [str(self.memos[0].pk)]*2}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_foreign_memo_rejected(self):
        self.memos[1].user_id = 'bob'
        self.memos[1].save()
        response = self.client.post('/api/memo/sprouts', {'memoIds': [str(m.pk) for m in self.memos]}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_foreign_result_hidden(self):
        row = self.create()
        self.client.force_authenticate(User.objects.create_user(username='bob'))
        for method, path in [('get', ''), ('delete', ''), ('post', '/cancel')]:
            self.assertEqual(getattr(self.client, method)(f'/api/memo/sprouts/{row.pk}{path}').status_code, 404)

    def test_cancel_revokes_permission(self):
        row = self.create()
        self.client.post(f'/api/memo/sprouts/{row.pk}/cancel')
        with patch('memos.sprout_worker.generate') as generate:
            tick()
        generate.assert_not_called()
        row.refresh_from_db()
        self.assertEqual(row.status, 'cancelled')

    def test_worker_ready_and_only_runs_permitted_rows(self):
        row = self.create()
        output = {'kind': 'article', 'title': '等待与反馈', 'body': '有意义的解释', 'length': 6, 'references': []}
        with patch('memos.sprout_worker.generate', return_value=output):
            tick()
        row.refresh_from_db()
        self.assertEqual(row.result, output)
        self.assertEqual(row.status, 'ready')
        Sprout.objects.create(owner_id='alice', sources=row.sources)
        with patch('memos.sprout_worker.generate') as generate:
            tick()
        generate.assert_not_called()

    def test_expired_lease_is_failed_without_replay(self):
        row = self.create()
        SproutJob.objects.filter(pk=row.pk).update(state='running', token='old', expires_at=timezone.now()-timedelta(seconds=1))
        with patch('memos.sprout_worker.generate') as generate:
            tick()
        generate.assert_not_called()
        row.refresh_from_db()
        self.assertEqual(row.status, 'failed')

    def test_regenerate_uses_snapshot_even_after_source_deleted(self):
        row = self.create()
        self.memos[0].delete()
        response = self.client.post(f'/api/memo/sprouts/{row.pk}/regenerate', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Sprout.objects.latest('created_at').sources, row.sources)

    def test_save_idempotent_and_collection_owned(self):
        row = self.create()
        row.status = 'ready'
        row.result = {'kind': 'article', 'title': '等待', 'body': '这是正文', 'references': []}
        row.save()
        collection = Anthology.objects.create(user_id='alice', title='笔记')
        with patch('article.serializers.sync_article_content_assets'), patch('article.serializers.ArticleSerializer._lock_html_resources'):
            response = self.client.post(f'/api/memo/sprouts/{row.pk}/save', {'collId': str(collection.pk)}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            again = self.client.post(f'/api/memo/sprouts/{row.pk}/save', {'collId': str(collection.pk)}, format='json')
        self.assertEqual(response.data['data']['article_id'], again.data['data']['article_id'])
        from article.models import Article
        self.assertEqual(Article.objects.filter(author='alice').count(), 1)
        self.assertIn('种菜的时候很有耐心', Article.objects.get(author='alice').content)

    def test_save_foreign_collection_rejected(self):
        row = self.create()
        row.status, row.result = 'ready', {'kind': 'article', 'title': '等待', 'body': '正文'}
        row.save()
        coll = Anthology.objects.create(user_id='bob', title='别人的')
        self.assertEqual(self.client.post(f'/api/memo/sprouts/{row.pk}/save', {'collId': str(coll.pk)}, format='json').status_code, 400)

    def test_delete_record_preserves_memo(self):
        row = self.create()
        self.assertEqual(self.client.delete(f'/api/memo/sprouts/{row.pk}').status_code, 200)
        self.assertEqual(Memo.objects.count(), 2)
        self.assertFalse(SproutJob.objects.exists())

    def test_sync_excludes_jobs_checks_hashes_and_resets(self):
        row = self.create()
        from django.core import serializers
        data = json.loads(serializers.serialize('json', [row]))
        meta = metadata(data)
        validate(data, meta)
        data[0]['fields']['direction'] = '篡改'
        with self.assertRaises(SyncError): validate(data, meta)
        with self.assertRaises(SyncError): validate([{'model':'memos.sproutjob'}])
        with self.assertRaises(SyncError): validate([], {'memo_sprout_schema_version': 2})
        validate([], {})  # legacy snapshot
        reset_execution()
        self.assertFalse(SproutJob.objects.exists())
        row.refresh_from_db()
        self.assertEqual(row.status, 'interrupted')


class RuleTests(TestCase):
    def test_length_and_fabricated_citations_rejected(self):
        payload = {'kind':'article', 'title':'题目', 'body':'字'*1201, 'source_urls':[]}
        with self.assertRaises(ValueError): validate_result(payload, [])
        payload.update(body='内容', source_urls=['https://fake.test'])
        with self.assertRaises(ValueError): validate_result(payload, [])
        payload.update(body='[杜撰](https://fake.test)', source_urls=[])
        with self.assertRaises(ValueError): validate_result(payload, [])

    def test_mcp_text_json_sources(self):
        result = {'content':[{'type':'text','text':json.dumps({'results':[{'url':'https://example.com', 'title':'事实', 'content':'摘要'}]})}]}
        sources = collect_sources(result)
        self.assertEqual(sources[0]['url'], 'https://example.com')
        self.assertEqual(validate_result({'kind':'insight','title':'想法','body':'一个问题','source_urls':['https://example.com']}, sources)['references'], sources)


class CaptureFixture(TestCase):
    def setUp(self):
        self.agent = Agent.objects.create(name='居民')
        self.task = AgentTask.objects.create(name='随手记', agent=self.agent, agent_ids=[str(self.agent.pk)], task_kind='memo_capture', memo_config={'owner_id':'alice'}, random_period='weekly', random_count=3, schedule_mode='random', execution_mode='serial')


class CaptureTests(CaptureFixture):
    def test_receipt_and_author_not_model_controlled(self):
        from system_mcp.views import ODocSystemMCPView
        view = ODocSystemMCPView(tool_scope='memos', agent_context=self.agent)
        view.memo_capture_context = {'key':'opportunity', 'owner_id':'alice'}
        with patch('memos.capture.schedule_memo_vector_sync'):
            first = view._create_memo({'content':'今天的一个小发现', 'tag':'随想/生活','creator_id':'evil','is_pinned':True})
            second = view._create_memo({'content':'不同内容'})
        self.assertEqual(first, second)
        memo = Memo.objects.get()
        self.assertEqual(memo.creator_id, str(self.agent.pk))
        self.assertEqual(memo.user_id, 'alice')
        self.assertFalse(memo.is_pinned)

    def test_duplicate_and_skip_receipts(self):
        with patch('memos.capture.schedule_memo_vector_sync'):
            commit_capture('one','alice',self.agent,{'content':'今天的发现值得记下来'})
            self.assertIsNone(commit_capture('two','alice',self.agent,{'content':'今天的发现值得记下来'}))
        skip_capture('three','alice',self.agent,'没想法')
        self.assertEqual(Memo.objects.count(), 1)
        self.assertEqual(MemoCapture.objects.count(), 3)
        with self.assertRaises(ValueError): commit_capture('four','alice',self.agent,{'content':'字'*301})

    def test_global_plan_does_not_scale_with_residents(self):
        others = [Agent.objects.create(name=f'居民{i}') for i in range(20)]
        self.task.agent_ids += [str(a.pk) for a in others]
        state = make_plan(self.task, timezone.now())
        self.assertEqual(len(state['slots']), 3)
        self.assertTrue(all(len(slot['agents']) == 1 for slot in state['slots']))

    def test_skips_consume_opportunity_only_for_capture(self):
        state = make_plan(self.task, timezone.now())
        AgentRunRecord.objects.create(task=self.task, task_name=self.task.name, agent_name=self.agent.name, status='success', random_context={'plan_id':state['id'],'slot':0}, agent_runs=[{'agent':str(self.agent.pk),'status':'success','captureOutcome':'skipped'}])
        reconcile_successes(self.task, state)
        self.assertEqual(next_slot(state)[0], 1)

    def test_serializer_forces_global_weekly_serial_defaults(self):
        user = User.objects.create_user(username='alice')
        from rest_framework.test import APIRequestFactory, force_authenticate
        request = APIRequestFactory().post('/')
        # Serializer context uses the authenticated DRF request in production.
        request.user = user
        serializer = AgentTaskSerializer(data={'name':'任意名称','task_kind':'memo_capture','agent':str(self.agent.pk),'agents':[str(self.agent.pk)],'execution_mode':'parallel'}, context={'request':request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        data = serializer.validated_data
        self.assertEqual(data['random_count'],3)
        self.assertEqual(data['random_period'],'weekly')
        self.assertEqual(data['execution_mode'],'serial')
        self.assertFalse(data['enabled'])

class ExecutionTests(SproutFixture):
    def test_research_failure_does_not_publish_unverified_article(self):
        from memos.sprout_execution import generate
        from system_settings.models import MCPServer
        server=MCPServer.objects.create(name='搜索',available_in_chat=True,enabled=True,tools=[{'name':'search'}])
        row,job=self.prepare([{'server_id':str(server.pk),'name':'search'}])
        outputs=[json.dumps({'worthwhile':True,'needs_research':True,'calls':[{'index':0,'arguments':{'query':'反馈'}}]}),json.dumps({'kind':'article','title':'观点','body':'未经查证的结论'}),json.dumps({'kind':'insight','title':'待查证','body':'需要查证反馈频率的影响，目前仅为假设。'})]
        with patch('memos.sprout_execution.complete',side_effect=outputs),patch('memos.sprout_execution.call_mcp_tool',return_value=(None,'unavailable')):
            result=generate(row,job,'active')
        self.assertEqual(result['kind'],'insight')
        self.assertEqual(result['mode'],'inspiration')

    def test_adaptive_research_can_read_discovered_url(self):
        from memos.sprout_execution import generate
        from system_settings.models import MCPServer
        server=MCPServer.objects.create(name='研究',available_in_chat=True,enabled=True,tools=[{'name':'search'},{'name':'read'}])
        row,job=self.prepare([{'server_id':str(server.pk),'name':name} for name in ['search','read']])
        url='https://example.com/evidence'
        outputs=[json.dumps({'worthwhile':True,'needs_research':True,'calls':[{'index':0,'arguments':{'query':'反馈'}}]}),json.dumps({'calls':[{'index':1,'arguments':{'url':url}}]}),json.dumps({'kind':'article','title':'观点','body':'具体、有边界的解释','source_urls':[url]})]
        with patch('memos.sprout_execution.complete',side_effect=outputs),patch('memos.sprout_execution.call_mcp_tool',side_effect=[({'results':[{'url':url,'snippet':'摘要'}]},None),({'url':url,'content':'读到的内容'},None)]) as calls:
            result=generate(row,job,'active')
        self.assertEqual([call.args[1] for call in calls.call_args_list],['search','read'])
        self.assertEqual(result['references'][0]['excerpt'],'读到的内容')

    def test_research_call_budget_rejected_before_tools_run(self):
        from memos.sprout_execution import generate
        row,job=self.prepare()
        with patch('memos.sprout_execution.complete',return_value=json.dumps({'calls':[{}]*5})),patch('memos.sprout_execution.call_mcp_tool') as tool:
            with self.assertRaises(ValueError): generate(row,job,'active')
        tool.assert_not_called()

    def prepare(self, tools=None):
        row = self.create()
        job = SproutJob.objects.get(pk=row.pk)
        job.state, job.token, job.expires_at = 'running', 'active', timezone.now()+timedelta(minutes=5)
        job.tools = tools or []
        job.save()
        return row, job

    def test_invalid_output_repaired_once(self):
        from memos.sprout_execution import generate
        row, job = self.prepare()
        outputs = [json.dumps({'worthwhile':True, 'needs_research':False,'calls':[]}), 'not json', json.dumps({'kind':'article','title':'题目','body':'具体的观点','source_urls':[]})]
        with patch('memos.sprout_execution.complete', side_effect=outputs) as complete:
            result = generate(row,job,'active')
        self.assertEqual(result['kind'],'article')
        self.assertEqual(complete.call_count,3)

    def test_missing_research_becomes_insight(self):
        from memos.sprout_execution import generate
        row, job = self.prepare()
        outputs = [json.dumps({'worthwhile':True, 'needs_research':True,'calls':[]}), json.dumps({'kind':'article','title':'题目','body':'未证实的结论','source_urls':[]}), json.dumps({'kind':'insight','title':'还待查证','body':'这需要外部资料验证。','source_urls':[]})]
        with patch('memos.sprout_execution.complete', side_effect=outputs):
            self.assertEqual(generate(row,job,'active')['kind'],'insight')

    def test_cancel_checked_before_model(self):
        from memos.sprout_execution import generate, SproutCancelled
        row,job = self.prepare()
        job.cancelled = True
        job.save()
        with patch('memos.sprout_execution.complete') as complete:
            with self.assertRaises(SproutCancelled): generate(row,job,'active')
        complete.assert_not_called()

    def test_selected_tool_only_and_actual_source(self):
        from memos.sprout_execution import generate
        from system_settings.models import MCPServer
        server = MCPServer.objects.create(name='搜索', available_in_chat=True, enabled=True, url='https://example.com/mcp', tools=[{'name':'search','enabled':True,'inputSchema':{'type':'object','properties':{'query':{'type':'string'}}}}])
        row,job=self.prepare([{'server_id':server.pk,'name':'search'}])
        outputs = [json.dumps({'worthwhile':True,'needs_research':True,'calls':[{'index':0,'arguments':{'query':'反馈机制'}}]}), json.dumps({'kind':'article','title':'反馈','body':'一个有边界的解释','source_urls':['https://example.com/source']})]
        with patch('memos.sprout_execution.complete', side_effect=outputs), patch('memos.sprout_execution.call_mcp_tool', return_value=({'results':[{'url':'https://example.com/source','title':'资料','content':'搜索摘要'}]},None)) as tool:
            result=generate(row,job,'active')
        self.assertEqual(tool.call_count,1)
        self.assertEqual(tool.call_args.args[1],'search')
        self.assertEqual(result['references'][0]['url'],'https://example.com/source')

    def test_sync_roundtrip_uses_actual_manager(self):
        from utils.sync_manager import SyncManager
        row = self.create()
        row.status, row.result = 'ready', {'kind':'insight','title':'思考','body':'值得继续的问题','references':[]}
        row.save()
        manager=SyncManager()
        data=manager.build_snapshot_data()
        self.assertFalse(any(r['model']=='memos.sproutjob' for r in data))
        meta=manager.build_snapshot_meta(data_list=data)
        manager.apply_snapshot_data(data,meta)
        restored=Sprout.objects.get(pk=row.pk)
        self.assertEqual(restored.result['body'],'值得继续的问题')
        self.assertFalse(SproutJob.objects.exists())
        manager.apply_snapshot_data(manager.build_snapshot_data(),manager.build_snapshot_meta(data_list=manager.build_snapshot_data()))
        self.assertEqual(Sprout.objects.count(),1)


class CaptureRunnerTests(CaptureFixture):
    def restore_during_capture(self, scheduled=False, skip=False):
        from utils.sync_manager import SyncManager
        from system_settings.agent_world.memo_capture import run_capture
        from system_settings.models import AgentRandomRuntime, AgentExecutionLease
        context = {'plan_id': 'week', 'slot': 0}
        if scheduled:
            AgentRandomRuntime.objects.create(task=self.task, lease_token='schedule-token', lease_until=timezone.now()+timedelta(minutes=5))
            context['lease_token'] = 'schedule-token'
        other = Agent.objects.create(name='其他任务居民')
        other_task = AgentTask.objects.create(name='自定义任务', agent=other)
        AgentExecutionLease.objects.create(agent=other, token='other-token', until=timezone.now()+timedelta(minutes=5))
        AgentRandomRuntime.objects.create(task=other_task, lease_token='other-schedule', lease_until=timezone.now()+timedelta(minutes=5))
        def restore(*args, **kwargs):
            manager=SyncManager()
            data=manager.build_snapshot_data()
            # The snapshot contains this same running record; existence alone is insufficient.
            manager.apply_snapshot_data(data,manager.build_snapshot_meta(data_list=data))
            return json.dumps({'skip': skip, 'reason': '没有新想法', 'content': '恢复前的结果不能写入'})
        with patch('system_settings.agent_world.memory.recall.memory_context',return_value=''), patch('system_settings.agent_world.memo_capture.AIService.get_client_config_for_model',return_value={}), patch('system_settings.agent_world.memo_capture.complete',side_effect=restore), patch('memos.capture.schedule_memo_vector_sync'):
            record=run_capture(self.task,'定时任务' if scheduled else '手动执行',[self.agent],context if scheduled else None)
        self.assertEqual(record.status,'failed')
        record.refresh_from_db()
        self.assertEqual(record.status,'failed')
        self.assertFalse(Memo.objects.exists())
        self.assertFalse(MemoCapture.objects.exists())
        self.assertEqual(AgentExecutionLease.objects.get(agent=other).token,'other-token')
        self.assertEqual(AgentRandomRuntime.objects.get(task=other_task).lease_token,'other-schedule')
        if scheduled:
            self.assertEqual(AgentRandomRuntime.objects.get(task=self.task).lease_token,'')

    def test_restore_revokes_inflight_manual_capture(self):
        self.restore_during_capture()

    def test_restore_revokes_inflight_scheduled_skip(self):
        self.restore_during_capture(scheduled=True, skip=True)

    def test_revoked_execution_cannot_write_memo(self):
        from system_settings.agent_world.memo_capture import run_capture
        from system_settings.models import AgentExecutionLease
        def revoked(*args, **kwargs):
            AgentExecutionLease.objects.filter(agent=self.agent).update(token='revoked')
            return json.dumps({'skip':False,'content':'不能提交这个结果'})
        with patch('system_settings.agent_world.memory.recall.memory_context',return_value=''), patch('system_settings.agent_world.memo_capture.AIService.get_client_config_for_model',return_value={}), patch('system_settings.agent_world.memo_capture.complete',side_effect=revoked):
            record=run_capture(self.task,'手动执行',[self.agent])
        self.assertEqual(record.status,'failed')
        self.assertFalse(MemoCapture.objects.exists())
        self.assertFalse(Memo.objects.exists())

    def test_automatic_authorization_is_local_and_off_after_transfer(self):
        from memos.models import MemoCaptureAuthorization
        from utils.sync_manager import SyncManager
        serializer = AgentTaskSerializer(self.task, data={'enabled':True}, partial=True)
        self.assertTrue(serializer.is_valid(),serializer.errors)
        task=serializer.save()
        self.assertFalse(task.enabled)
        self.assertTrue(serializer.data['enabled'])
        manager=SyncManager()
        data=manager.build_snapshot_data()
        self.assertFalse(any(r['model']=='memos.memocaptureauthorization' for r in data))
        MemoCaptureAuthorization.objects.all().delete()  # a different device
        manager.apply_snapshot_data(data,manager.build_snapshot_meta(data_list=data))
        task.refresh_from_db()
        self.assertFalse(AgentTaskSerializer(task).data['enabled'])

    def test_restored_receipt_prevents_duplicate_creation(self):
        from utils.sync_manager import SyncManager
        from system_settings.agent_world.memo_capture import run_capture
        context={'plan_id':'week','slot':0}
        with patch('system_settings.agent_world.memory.recall.memory_context',return_value=''), patch('system_settings.agent_world.memo_capture.AIService.get_client_config_for_model',return_value={}), patch('system_settings.agent_world.memo_capture.complete',return_value=json.dumps({'skip':False,'content':'值得记录的真实问题'})), patch('memos.capture.schedule_memo_vector_sync'):
            run_capture(self.task,'定时任务',[self.agent],context)
        manager=SyncManager()
        data=manager.build_snapshot_data()
        meta=manager.build_snapshot_meta(data_list=data)
        manager.apply_snapshot_data(data,meta)
        manager.apply_snapshot_data(data,meta)
        with patch('system_settings.agent_world.memo_capture.complete') as model:
            run_capture(AgentTask.objects.get(pk=self.task.pk),'定时任务',[self.agent],context)
        model.assert_not_called()
        self.assertEqual(Memo.objects.count(),1)
        self.assertEqual(MemoCapture.objects.count(),1)

    def test_runner_retry_uses_receipt_without_model(self):
        from system_settings.agent_world.memo_capture import run_capture
        context={'plan_id':'week','slot':0}
        with patch('system_settings.agent_world.memory.recall.memory_context',return_value='真实事实'), patch('system_settings.agent_world.memo_capture.AIService.get_client_config_for_model',return_value={}), patch('system_settings.agent_world.memo_capture.complete',return_value=json.dumps({'skip':False,'content':'一个有意思的具体观察','tag':'随想/生活'})) as model, patch('memos.capture.schedule_memo_vector_sync'):
            first=run_capture(self.task,'定时任务',[self.agent],context)
            second=run_capture(self.task,'定时任务',[self.agent],context)
        self.assertEqual(first.status,'success')
        self.assertEqual(second.status,'success')
        self.assertEqual(model.call_count,1)
        self.assertEqual(Memo.objects.count(),1)
        self.assertEqual(MemoCapture.objects.count(),1)

    def test_runner_voluntary_skip_is_success_without_memo(self):
        from system_settings.agent_world.memo_capture import run_capture
        with patch('system_settings.agent_world.memory.recall.memory_context',return_value=''), patch('system_settings.agent_world.memo_capture.AIService.get_client_config_for_model',return_value={}), patch('system_settings.agent_world.memo_capture.complete',return_value=json.dumps({'skip':True,'reason':'没有新的观察'})):
            record=run_capture(self.task,'定时任务',[self.agent],{'plan_id':'week','slot':0})
        self.assertEqual(record.status,'success')
        self.assertEqual(record.agent_runs[0]['captureOutcome'],'skipped')
        self.assertFalse(Memo.objects.exists())
