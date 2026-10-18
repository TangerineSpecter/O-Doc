"""Mocked decision failures with isolated usage and diagnostic persistence."""
import json
import tempfile
import time
from types import SimpleNamespace
from unittest.mock import Mock, patch
import requests
from django.test import TestCase, override_settings
from system_logs import store
from system_logs.capture import capture as capture_event
from system_settings.token_usage.models import AgentTokenUsage
from utils.token_usage import usage_scope
from .jev import choose, DecisionUnavailable


class DecisionDiagnosticsTests(TestCase):
    def setUp(self):
        self.enterContext(patch('system_settings.decision.jev.api_key', return_value='private-api-secret'))
        self.post = self.enterContext(patch('system_settings.decision.jev.requests.post'))
        self.log = self.enterContext(patch('system_settings.decision.diagnostics.capture'))

    def run_failure(self):
        with usage_scope(owner_id='admin', purpose='task', phase='JEV 市场选择'):
            with self.assertRaises(DecisionUnavailable) as caught:
                choose('admin', {'private': 'private-resident-content'}, {'wait': '等待'}, deadline=time.monotonic() + 300)
        row = AgentTokenUsage.objects.latest('started_at')
        details = self.log.call_args.kwargs
        self.assertEqual(details['model_request_id'], row.pk)
        self.assertEqual(details['usage_id'], row.pk)
        self.assertEqual(row.status, 'failed')
        self.assertIn(row.pk, str(caught.exception))
        for secret in ('private-api-secret', 'private-resident-content', 'private-provider-body'):
            self.assertNotIn(secret, json.dumps(details))
            self.assertNotIn(secret, str(caught.exception))
        return row, details

    def test_timeout_and_connection_keep_category_without_exception_message(self):
        for exception, kind in [(requests.ReadTimeout, 'timeout'), (requests.ConnectionError, 'connection')]:
            with self.subTest(kind=kind):
                self.post.side_effect = exception('private-api-secret private-resident-content')
                row, details = self.run_failure()
                self.assertEqual(details['error_type'], kind)
                self.assertEqual(details['exception_class'], exception.__name__)
                self.assertEqual(details['stage'], 'request')
                self.assertIsNone(details['provider_http_status'])
                self.assertIsNone(row.total_tokens)
                self.assertIn('choose', details['stack'])
        self.assertEqual(self.post.call_count, 2)  # Exactly one request per execution.

    def test_http_errors_preserve_upstream_status_without_reading_body(self):
        for status, kind in [(401, 'authentication'), (403, 'permission'), (429, 'rate_limit'), (503, 'http_503')]:
            with self.subTest(status=status):
                response = Mock(status_code=status, text='private-provider-body private-api-secret')
                self.post.return_value = response
                row, details = self.run_failure()
                self.assertEqual(details['error_type'], kind)
                self.assertEqual(details['provider_http_status'], status)
                response.json.assert_not_called()
                self.assertFalse(row.usage_complete)

    def test_json_parse_failure_retains_stage_and_http_200(self):
        response = Mock(status_code=200)
        response.json.side_effect = ValueError('private-provider-body')
        self.post.return_value = response
        _, details = self.run_failure()
        self.assertEqual(details['error_type'], 'invalid_json')
        self.assertEqual(details['stage'], 'response_json')
        self.assertIn('解析响应 JSON', details['provider_endpoint'])
        self.assertEqual(details['provider_http_status'], 200)

    def test_non_dict_answers_are_invalid_candidates_without_leaking_body(self):
        response = Mock(status_code=200)
        response.json.return_value = {'model': 'jev-1.13.0', 'usage': {'input_tokens': 12, 'output_tokens': 2}, 'answers': ['private-provider-body']}
        self.post.return_value = response
        row, details = self.run_failure()
        self.assertEqual(details['error_type'], 'invalid_response')
        self.assertEqual(details['stage'], 'answer_validation')
        self.assertEqual(details['exception_class'], 'DecisionUnavailable')
        self.assertIn('无效候选', details['reason'])
        self.assertIsNone(row.total_tokens)

    def test_invalid_candidate_reports_validation_not_network(self):
        response = Mock(status_code=200)
        response.json.return_value = {'model': 'jev-1.13.0', 'answers': {'next_action': {'type': 'choice', 'choice': 'unknown'}}}
        self.post.return_value = response
        _, details = self.run_failure()
        self.assertEqual(details['error_type'], 'invalid_response')
        self.assertEqual(details['stage'], 'answer_validation')
        self.assertIn('无效候选', details['reason'])

    def test_persistent_logs_correlate_run_and_distinguish_requests(self):
        self.post.side_effect = requests.ReadTimeout('private-api-secret')
        # Synchronous sink avoids a writer outliving the temporary directory.
        self.log.side_effect = capture_event
        with tempfile.TemporaryDirectory(prefix='odoc-jev-diagnostics-') as root, override_settings(SYSTEM_LOG_DIR=root, SYSTEM_LOG_ENABLED=True), \
             patch('system_logs.capture.start', return_value=SimpleNamespace(put_nowait=store.write)):
            with patch('system_settings.agent_world.life_config.task_owner', return_value='admin'), usage_scope(
                    owner_id='admin', purpose='task', record=SimpleNamespace(pk='run-diagnostic'),
                    task=SimpleNamespace(pk='task-diagnostic', name='测试任务'),
                    agent=SimpleNamespace(pk='resident-diagnostic', name='测试居民')):
                self.run_failure()
                self.run_failure()
            with store.connection() as db:
                rows = db.execute('SELECT fault_key,detail FROM events ORDER BY created').fetchall()
            self.assertEqual(len(rows), 2)
            self.assertNotEqual(rows[0]['fault_key'], rows[1]['fault_key'])
            for row in rows:
                event = json.loads(row['detail'])
                self.assertEqual(event['run_id'], 'run-diagnostic')
                self.assertEqual(event['task_id'], 'task-diagnostic')
                self.assertEqual(event['agent_id'], 'resident-diagnostic')
                self.assertEqual(event['error_type'], 'timeout')
                self.assertNotIn('private-api-secret', row['detail'])

    def test_failure_without_usage_scope_still_has_unique_request_ids(self):
        self.post.side_effect = requests.ReadTimeout('private-api-secret')
        ids = []
        for _ in range(2):
            with self.assertRaises(DecisionUnavailable):
                choose('admin', {}, {'wait': '等待'}, deadline=time.monotonic() + 300)
            ids.append(self.log.call_args.kwargs['model_request_id'])
            self.assertEqual(self.log.call_args.kwargs['usage_id'], '')
        self.assertNotEqual(*ids)
        self.assertEqual(AgentTokenUsage.objects.count(), 0)

    def test_log_storage_failure_does_not_prevent_fallback(self):
        self.post.side_effect = requests.ReadTimeout('private-api-secret')
        self.log.side_effect = capture_event
        with override_settings(SYSTEM_LOG_ENABLED=True), \
             patch('system_logs.capture.start', side_effect=OSError('isolated store unavailable')), \
             patch('system_logs.capture._fallback') as fallback:
            _, details = self.run_failure()
        self.assertEqual(details['error_type'], 'timeout')
        fallback.assert_called_once()
