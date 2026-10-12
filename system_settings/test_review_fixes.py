"""审查修复回归：隔离数据库、诊断文件与外部模型。"""
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from .agent_memory import promote_due_short_term_memories
from .models import Agent, AgentExecutionLease, AgentShortTermMemory, AgentLongTermMemory, AgentTokenUsage
from .token_usage import details
from .token_usage.capture import Capture, is_active
from .token_usage.test_usage import CONFIG, response
from .token_usage.views import TokenUsageView
from utils.token_usage import usage_scope, create_completion


class MemoryMaintenanceIsolationTests(TestCase):
    def test_archived_and_busy_agents_do_not_block_others_or_cleanup(self):
        archived = Agent.objects.create(pk='a-archived', name='归档', archived_at=timezone.now())
        busy = Agent.objects.create(pk='b-busy', name='忙碌')
        active = Agent.objects.create(pk='c-active', name='正常')
        AgentExecutionLease.objects.create(agent=busy, token='busy', until=timezone.now()+timedelta(minutes=5))
        for agent in (archived, busy, active):
            AgentShortTermMemory.objects.create(agent=agent, content='稳定事实', expires_at=timezone.now()+timedelta(days=1),
                recall_count=3, best_score=0.9, query_sources=['q1', 'q2', 'q3'])
        with patch('system_settings.agent_memory._summarize_memory_for_promotion', return_value={'content': '长期事实'}) as summarize, \
                patch('system_settings.agent_memory.purge_expired_short_term_memories', return_value=2) as purge:
            result = promote_due_short_term_memories()
        self.assertEqual(result, {'promoted_count': 1, 'expired_count': 2})
        self.assertEqual(summarize.call_count, 1)
        self.assertEqual(AgentLongTermMemory.objects.get().agent_id, active.pk)
        purge.assert_called_once()


class DiagnosticFailureIsolationTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(prefix='odoc-diagnostic-failure-')
        self.addCleanup(self.temp.cleanup)
        self.settings_override = override_settings(TOKEN_USAGE_DETAILS_ENABLED=True,
            TOKEN_USAGE_DETAIL_DIR=Path(self.temp.name)/'details')
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.agent = Agent.objects.create(name='诊断测试')

    def test_write_failure_at_each_stage_preserves_success_and_usage(self):
        for failed_call in range(1, 5):
            with self.subTest(stage=failed_call):
                client = MagicMock()
                result = response()
                client.chat.completions.create.return_value = result
                calls = 0
                def failing_write(entry):
                    nonlocal calls
                    calls += 1
                    if calls == failed_call:
                        raise PermissionError('test-only diagnostic storage failure')
                with usage_scope(agent=self.agent, purpose='task'), \
                        patch('system_settings.token_usage.details.write', side_effect=failing_write), \
                        self.assertLogs('system_settings.token_usage.capture', level='WARNING'):
                    actual = create_completion(client, CONFIG, model='fake', stream=False)
                self.assertIs(actual, result)
                client.chat.completions.create.assert_called_once()
                row = AgentTokenUsage.objects.latest('started_at')
                self.assertEqual(row.status, 'success')
                self.assertEqual(row.total_tokens, 15)
                self.assertFalse(is_active(row.pk))

    def test_response_serialization_failure_does_not_escape(self):
        with usage_scope(agent=self.agent, purpose='task'):
            capture = Capture(CONFIG)
            with patch('system_settings.token_usage.details.jsonable', side_effect=RuntimeError('SDK serialization failed')), \
                    self.assertLogs('system_settings.token_usage.capture', level='WARNING'):
                capture.set_response(object())
            capture.finish('success')
        self.assertEqual(capture.row.status, 'success')
        self.assertFalse(is_active(capture.row.pk))

    def test_failed_finish_does_not_display_partial_file_as_complete(self):
        with usage_scope(agent=self.agent, purpose='task'):
            capture = Capture(CONFIG)
            capture.set_request({'messages': []})
            with patch('system_settings.token_usage.details.write', side_effect=OSError('disk full')), \
                    self.assertLogs('system_settings.token_usage.capture', level='WARNING'):
                capture.finish('success')
        self.assertEqual(details.read(capture.row.pk, capture.row.started_at)['status'], 'running')
        user = get_user_model().objects.create_user(username='diagnostic-test')
        request = APIRequestFactory().get('/')
        force_authenticate(request, user=user)
        result = TokenUsageView.as_view(kind='content')(request, request_id=capture.row.pk)
        self.assertEqual(result.status_code, 200)
        self.assertFalse(result.data['data']['available'])
