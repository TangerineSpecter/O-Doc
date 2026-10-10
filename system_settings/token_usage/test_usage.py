import copy
import json
from datetime import datetime
from types import SimpleNamespace as NS
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo
from django.contrib.auth import get_user_model
from django.core import serializers
from django.test import TestCase, SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from openai import APIConnectionError
import httpx
from system_settings.models import Agent, AgentTask, AgentRunRecord, AgentTokenUsage, SyncEntityState
from system_settings.serializers import AgentRunRecordSerializer
from system_settings.token_usage.capture import Capture
from system_settings.token_usage.normalize import normalize
from system_settings.token_usage.queries import total, record_summaries
from system_settings.token_usage.sync import normalize_restored_usage
from system_settings.token_usage.views import TokenUsageView
from utils.token_usage import usage_scope, usage_context, create_completion, attributed

CONFIG = {'model_name': 'fake', 'model_id': 'm', 'provider_id': 'p', 'provider_name': 'fake-provider', 'provider_type': 'OpenAi'}


def usage(i=10, o=5):
    return NS(prompt_tokens=i, completion_tokens=o, total_tokens=i+o,
              prompt_tokens_details=NS(cached_tokens=3), completion_tokens_details=NS(reasoning_tokens=2))


def response(tool=False):
    message = NS(content='完成', tool_calls=[NS(function=NS(name='lookup', arguments='{}'), id='tool-1')] if tool else [], reasoning_content=None)
    return NS(usage=usage(), choices=[NS(message=message, finish_reason='stop')])


class NormalizationTests(SimpleTestCase):
    def test_unknown_zero_and_details(self):
        self.assertEqual(normalize(None)['total_tokens'], None)
        self.assertEqual(normalize({'prompt_tokens': 0, 'completion_tokens': 0})['total_tokens'], 0)
        self.assertEqual(normalize(usage())['total_tokens'], 15)
        self.assertEqual(normalize(usage())['reasoning_tokens'], 2)
        self.assertIsNone(normalize({'prompt_tokens': True, 'completion_tokens': -1})['input_tokens'])


class UsageTests(TestCase):
    def setUp(self):
        self.agent = Agent.objects.create(name='甲')
        self.other = Agent.objects.create(name='乙')
        self.task = AgentTask.objects.create(name='日报', agent=self.agent)
        self.record = AgentRunRecord.objects.create(task=self.task, task_name='日报', agent=self.agent)
        self.user = get_user_model().objects.create_user(username='usage-test')
        self.factory = APIRequestFactory()

    def capture(self, actor=None, value=None):
        with usage_scope(agent=actor or self.agent, task=self.task, record=self.record, purpose='task'):
            captured = Capture(CONFIG)
            captured.usage(value)
            captured.finish('success')
            return captured.row

    def api(self, kind, params=None, authenticated=True):
        request = self.factory.get('/', params or {})
        if authenticated:
            force_authenticate(request, self.user)
        return TokenUsageView.as_view(kind=kind)(request)

    def test_duplicate_usage_unknown_and_zero(self):
        with usage_scope(agent=self.agent, task=self.task, record=self.record, purpose='task'):
            captured = Capture(CONFIG)
            captured.usage(usage())
            captured.usage(usage())
            captured.usage({'completion_tokens': 5})
            captured.finish('failed')
        zero = self.capture(value=usage(0, 0))
        unknown = self.capture()
        stats = total(AgentTokenUsage.objects.all())
        self.assertEqual(stats['total_tokens'], 15)
        self.assertEqual(stats['request_count'], 3)
        self.assertEqual(stats['incomplete_count'], 1)
        self.assertTrue(zero.usage_complete)
        self.assertIsNone(unknown.total_tokens)
        self.assertEqual(AgentTokenUsage.objects.get(pk=captured.row.pk).input_tokens, 10)

    def test_agents_runs_names_and_deletion(self):
        row = self.capture(value=usage())
        self.capture(self.other, usage(20, 10))
        self.agent.name = '改名'; self.agent.save()
        stats = record_summaries([self.record.pk])[self.record.pk]
        self.assertEqual(stats['total_tokens'], 45)
        self.assertEqual({a['name'] for a in stats['agents']}, {'甲', '乙'})
        self.record.delete(); self.task.delete(); self.agent.delete()
        row.refresh_from_db()
        self.assertEqual(row.agent_key, self.agent.pk or row.agent_key)
        self.assertEqual(row.agent_name, '甲')
        self.assertEqual(total(AgentTokenUsage.objects.all())['total_tokens'], 45)

    def test_explicit_retry_and_failed_attempt(self):
        client = MagicMock()
        client.chat.completions.create.side_effect = [APIConnectionError(request=httpx.Request('POST', 'https://fake.test')), response()]
        with usage_scope(agent=self.agent, task=self.task, record=self.record, purpose='task'), patch('utils.token_usage.time.sleep'):
            result = create_completion(client, CONFIG, model='fake', stream=False)
        self.assertEqual(result.choices[0].message.content, '完成')
        self.assertEqual(list(AgentTokenUsage.objects.order_by('started_at').values_list('status', 'attempt')), [('failed', 1), ('success', 2)])
        self.assertEqual(total(AgentTokenUsage.objects.all())['incomplete_count'], 1)

    def test_no_attribution_no_database_fact(self):
        client = MagicMock(); client.chat.completions.create.return_value = response()
        create_completion(client, CONFIG, stream=False)
        self.assertFalse(AgentTokenUsage.objects.exists())

    def test_generator_context_and_early_close(self):
        stream = MagicMock()
        stream.__iter__.return_value = iter([NS(usage=None, choices=[NS(finish_reason=None)]), NS(usage=usage(), choices=[])])
        client = MagicMock(); client.chat.completions.create.return_value = stream
        @attributed('im')
        def chat(agent):
            tracked = create_completion(client, CONFIG, stream=True)
            try:
                yield from tracked
            finally:
                tracked.close()
        generator = chat(self.agent)
        next(generator)
        self.assertEqual(usage_context()['agent_key'], self.agent.pk)
        generator.close()
        row = AgentTokenUsage.objects.get()
        self.assertEqual(row.status, 'interrupted')
        self.assertFalse(row.usage_complete)
        self.assertIsNone(usage_context())

    def test_stream_terminal_usage_only_chunk(self):
        stream = MagicMock(); stream.__iter__.return_value = iter([
            NS(usage=None, choices=[NS(finish_reason='stop')]), NS(usage=usage(), choices=[]), NS(usage=usage(), choices=[])
        ])
        client = MagicMock(); client.chat.completions.create.return_value = stream
        with usage_scope(agent=self.agent, purpose='im'):
            tracked = create_completion(client, CONFIG, stream=True)
            list(tracked); tracked.close()
        row = AgentTokenUsage.objects.get()
        self.assertEqual(row.total_tokens, 15)
        self.assertEqual(row.status, 'success')
        self.assertTrue(row.usage_complete)

    def test_tools_each_round_is_recorded_and_sdk_retries_disabled(self):
        from utils.ai_service import AIService
        with usage_scope(agent=self.agent, task=self.task, record=self.record, purpose='task'), \
             patch.object(AIService, 'get_default_client_config', return_value={**CONFIG, 'api_key': 'fake', 'base_url': 'https://fake.test'}), \
             patch('utils.ai_service.OpenAI') as factory:
            client = factory.return_value
            client.chat.completions.create.side_effect = [response(True), response(False)]
            AIService.chat_completion_messages_with_tools([], [{'type': 'function'}], lambda name, args: 'found')
            self.assertEqual(factory.call_args.kwargs['max_retries'], 0)
        self.assertEqual(total(AgentTokenUsage.objects.all())['total_tokens'], 30)
        self.assertEqual(AgentTokenUsage.objects.count(), 2)

    def test_bounded_queue_usage_on_owner_thread(self):
        from utils.bounded_completion import _drive
        import time
        def network(config, parameters, seconds, inbox, cancelled):
            inbox.put(('usage', normalize(usage())))
            inbox.put(('done', 'done'))
        with usage_scope(agent=self.agent, task=self.task, record=self.record, purpose='task'), patch('utils.bounded_completion._network', side_effect=network):
            self.assertEqual(_drive(CONFIG, {}, time.monotonic()+2, {'request_attempt': 1}), 'done')
        self.assertEqual(AgentTokenUsage.objects.get().total_tokens, 15)

    def test_midnight_filters_and_daily_groups(self):
        before = self.capture(value=usage())
        after = self.capture(value=usage(20, 10))
        from system_settings.agent_world.life_time import storage_time
        zone = ZoneInfo('Asia/Shanghai')
        AgentTokenUsage.objects.filter(pk=before.pk).update(started_at=storage_time(datetime(2026, 10, 9, 23, 59, tzinfo=zone)))
        AgentTokenUsage.objects.filter(pk=after.pk).update(started_at=storage_time(datetime(2026, 10, 10, 0, 1, tzinfo=zone)))
        data = self.api('summary', {'start_date': '2026-10-10', 'end_date': '2026-10-10'}).data['data']
        self.assertEqual(data['total_tokens'], 30)
        self.assertEqual(len(data['days']), 1)
        self.assertEqual(str(data['days'][0]['day']), '2026-10-10')

    def test_auth_validation_and_private_owner(self):
        self.capture(value=usage())
        private = self.capture(value=usage(100, 100))
        AgentTokenUsage.objects.filter(pk=private.pk).update(owner_key='other-user')
        self.assertIn(self.api('summary', authenticated=False).status_code, (401, 403))
        self.assertEqual(self.api('summary', {'all': '1'}).data['data']['total_tokens'], 15)
        self.assertEqual(self.api('summary', {'start_date': 'bad'}).status_code, 400)
        self.assertEqual(self.api('requests', {'all': '1', 'cursor': 'not-a-cursor'}).status_code, 400)
        self.assertEqual(self.api('breakdown', {'all': '1', 'group': 'bad'}).status_code, 400)
        data = self.api('requests', {'all': '1'}).data['data']['items'][0]
        self.assertNotIn('owner_key', data)
        self.assertNotIn('device_id', data)
        self.assertEqual(data['model_name'], 'fake')

    def test_pagination_ties_and_rank_filter(self):
        from django.utils import timezone
        moment = timezone.now()
        for i in range(53):
            AgentTokenUsage.objects.create(id=f'{i:032d}', agent_key=self.agent.pk, agent_name='甲', task_key=self.task.pk,
                task_name='日报', record_key=self.record.pk, device_id='fake', started_at=moment, total_tokens=1, input_tokens=1, output_tokens=0, usage_complete=True)
        first = self.api('requests', {'all': '1'}).data['data']
        second = self.api('requests', {'all': '1', 'cursor': first['next_cursor']}).data['data']
        self.assertEqual(len(first['items']), 50)
        self.assertEqual(len(second['items']), 3)
        self.assertFalse(set(x['id'] for x in first['items']) & set(x['id'] for x in second['items']))
        ranked = self.api('breakdown', {'all': '1', 'group': 'task', 'agent_id': self.agent.pk}).data['data']['items'][0]
        self.assertEqual(ranked['execution_count'], 1)
        self.assertEqual(ranked['average_tokens'], 53)

    def test_serializer_batch_and_chain(self):
        self.capture(value=usage())
        child = AgentRunRecord.objects.create(task=self.task, task_name='日报', parent_record=self.record, followup_depth=1)
        with usage_scope(agent=self.other, task=self.task, record=child, purpose='task'):
            capture = Capture(CONFIG); capture.usage(usage()); capture.finish('success')
        with self.assertNumQueries(2):
            items = AgentRunRecordSerializer([self.record, child], many=True, context={'view': NS(action='list')}).data
        self.assertEqual(items[0]['token_usage']['total_tokens'], 15)
        data = AgentRunRecordSerializer(self.record).data
        self.assertEqual(data['chain_token_usage']['total_tokens'], 30)
        historical = AgentRunRecord.objects.create(task_name='旧任务')
        self.assertFalse(AgentRunRecordSerializer(historical).data['token_usage']['collected'])

    def test_sync_snapshot_identity_merge_and_running_restore(self):
        from utils.sync_manager import SyncManager
        manager = SyncManager()
        row = self.capture(value=usage())
        self.assertTrue(SyncEntityState.objects.filter(model_label='system_settings.agenttokenusage', object_pk=row.pk).exists())
        snapshot = manager.build_snapshot_data()
        fact = next(x for x in snapshot if x['model'] == 'system_settings.agenttokenusage')
        self.assertEqual(fact['pk'], row.pk)
        # Duplicate restores use the stable primary key, never new usage IDs.
        for _ in range(2):
            for obj in serializers.deserialize('json', json.dumps([fact])):
                obj.save()
        self.assertEqual(AgentTokenUsage.objects.count(), 1)
        pending = copy.deepcopy(fact)
        pending['fields']['status'] = 'running'
        normalize_restored_usage([pending])
        self.assertEqual(pending['fields']['status'], 'interrupted')
        self.assertFalse(pending['fields']['usage_complete'])
        self.assertEqual(pending['fields']['total_tokens'], 15)
        other = copy.deepcopy(fact); other['pk'] = 'another-device-request'; other['fields']['device_id'] = 'device-b'
        from system_settings.sync_state import canonical_hash
        def revisions(rows):
            return {manager._revision_key(x['model'], str(x['pk'])): {'deleted': False, 'hash': canonical_hash(x['fields']), 'revision_at': '2026-10-10T12:00:00', 'origin_device': x['fields']['device_id']} for x in rows}
        merged, _, _ = manager.merge_v2_data(None, [fact], revisions([fact]), {'data': [fact, other], 'revisions': revisions([fact, other])})
        usage_rows = [x for x in merged if x['model'] == 'system_settings.agenttokenusage']
        self.assertEqual({x['pk'] for x in usage_rows}, {row.pk, other['pk']})
        normalize_restored_usage([]) # Old snapshots are valid.

    def test_sync_confirmed_usage_wins_over_newer_interrupted_restore(self):
        from utils.sync_manager import SyncManager
        from system_settings.sync_state import canonical_hash
        row = self.capture(value=usage())
        final = json.loads(serializers.serialize('json', [row]))[0]
        interrupted = copy.deepcopy(final)
        interrupted['fields'].update(status='interrupted', usage_complete=False, total_tokens=None)
        key = SyncManager._revision_key(final['model'], str(final['pk']))
        def revision(item, when):
            return {key: {'deleted': False, 'hash': canonical_hash(item['fields']), 'revision_at': when, 'origin_device': 'fixture'}}
        merged, revisions, _ = SyncManager().merge_v2_data(None, [interrupted], revision(interrupted, '2026-10-10T15:00:00'),
            {'data': [final], 'revisions': revision(final, '2026-10-10T14:00:00')})
        usage_fact = next(item for item in merged if item['model'] == final['model'])
        self.assertEqual(usage_fact['fields']['status'], 'success')
        self.assertEqual(usage_fact['fields']['total_tokens'], 15)
        self.assertEqual(revisions[key]['hash'], canonical_hash(usage_fact['fields']))

    def test_real_restore_and_rendered_response(self):
        from tempfile import TemporaryDirectory
        from pathlib import Path
        from django.test import override_settings
        from utils.sync_manager import SyncManager
        from djangorestframework_camel_case.render import CamelCaseJSONRenderer
        row = self.capture(value=usage())
        manager = SyncManager()
        snapshot = manager.build_snapshot_data()
        pending = next(x for x in snapshot if x['model'] == 'system_settings.agenttokenusage')
        pending['fields']['status'] = 'running'
        with TemporaryDirectory(prefix='usage-sync-test-') as root:
            media = Path(root) / 'media'; media.mkdir()
            sentinel = Path(root) / 'outside-media'; sentinel.write_text('untouched')
            with override_settings(MEDIA_ROOT=media, CHROMA_DB_PATH=Path(root) / 'chroma'), patch('article.image_search_service.delete_image_vectors'):
                manager.apply_snapshot_data(copy.deepcopy(snapshot))
                manager.apply_snapshot_data(copy.deepcopy(snapshot))
            self.assertEqual(sentinel.read_text(), 'untouched')
        row.refresh_from_db()
        self.assertEqual(row.status, 'interrupted')
        self.assertEqual(row.total_tokens, 15)
        self.assertFalse(row.usage_complete)
        self.assertEqual(AgentTokenUsage.objects.count(), 1)
        response = self.api('requests', {'all': '1'})
        payload = json.loads(CamelCaseJSONRenderer().render(response.data))['data']['items'][0]
        self.assertEqual(payload['totalTokens'], 15)
        self.assertTrue(payload['startedAt'].endswith('+08:00'))
        self.assertEqual(payload['agentKey'], self.agent.pk)

    def test_no_agent_system_planning(self):
        with usage_scope(purpose='planning'):
            capture = Capture(CONFIG); capture.usage(usage()); capture.finish('success')
        row = AgentTokenUsage.objects.get()
        self.assertEqual(row.agent_key, '')
        self.assertEqual(row.agent_name, '系统规划')
        self.assertEqual(row.purpose, 'planning')

    def test_active_local_request_not_interrupted_by_sync(self):
        with usage_scope(agent=self.agent, purpose='im'):
            capture = Capture(CONFIG)
            fact = json.loads(serializers.serialize('json', [capture.row]))[0]
            normalize_restored_usage([fact])
            self.assertEqual(fact['fields']['status'], 'running')
            capture.finish('success')

    def test_restore_preserves_active_requests_created_or_updated_after_snapshot(self):
        from tempfile import TemporaryDirectory
        from pathlib import Path
        from django.test import override_settings
        from utils.sync_manager import SyncManager
        manager = SyncManager()
        with usage_scope(agent=self.agent, purpose='im'):
            existing = Capture(CONFIG)
            snapshot = manager.build_snapshot_data()
            existing.usage(usage(20, 10))
            recent = Capture(CONFIG)
            recent.usage(usage())
            try:
                with TemporaryDirectory(prefix='usage-active-sync-') as root:
                    with override_settings(MEDIA_ROOT=Path(root) / 'media', CHROMA_DB_PATH=Path(root) / 'chroma'), \
                         patch('article.image_search_service.delete_image_vectors'):
                        manager.apply_snapshot_data(copy.deepcopy(snapshot), full_overwrite=True)
                        manager.apply_snapshot_data(copy.deepcopy(snapshot), full_overwrite=True)
                existing.row.refresh_from_db()
                recent.row.refresh_from_db()
                self.assertEqual(existing.row.total_tokens, 30)
                self.assertEqual(recent.row.total_tokens, 15)
                self.assertEqual(existing.row.status, 'running')
                self.assertEqual(recent.row.status, 'running')
            finally:
                existing.finish('success')
                recent.finish('success')
        self.assertEqual(total(AgentTokenUsage.objects.all())['total_tokens'], 45)
        self.assertEqual(set(AgentTokenUsage.objects.values_list('status', flat=True)), {'success'})


class ParallelAttributionTests(SimpleTestCase):
    def test_parallel_agents_do_not_share_attribution(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier, Lock
        agents = [NS(pk='a', name='甲'), NS(pk='b', name='乙')]
        task = NS(pk='task', name='日报', task_kind='custom')
        record = NS(pk='run')
        barrier, lock, captured = Barrier(2), Lock(), []
        def capture(config, attempt):
            with lock:
                captured.append(dict(usage_context()))
            return NS(usage=lambda value: None, finish=lambda status: None)
        @attributed('task')
        def execute(record, task, agent):
            barrier.wait(timeout=3)
            client = MagicMock(); client.chat.completions.create.return_value = response()
            create_completion(client, CONFIG, stream=False)
            return usage_context()['agent_key']
        with patch('system_settings.token_usage.capture.Capture', side_effect=capture):
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda agent: execute(record, task, agent), agents))
        self.assertEqual(results, ['a', 'b'])
        self.assertEqual({row['agent_key'] for row in captured}, {'a', 'b'})
        self.assertTrue(all(row['task_key'] == 'task' and row['record_key'] == 'run' for row in captured))
        self.assertIsNone(usage_context())
