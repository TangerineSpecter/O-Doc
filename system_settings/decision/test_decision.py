"""Isolated credential/API/usage tests; no real provider requests."""
from types import SimpleNamespace
from unittest.mock import patch, Mock
import time
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from system_settings.models import SystemSetting, SyncEntityState
from system_settings.token_usage.models import AgentTokenUsage
from utils.token_usage import usage_scope
from .config import CREDENTIAL_KEY, api_key, save_key, market_config
from .jev import choose, DecisionUnavailable


class DecisionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser('admin', 'decision@example.invalid', 'test')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_credentials_write_only_account_scoped_and_clear(self):
        path = '/api/settings/decision-models/'
        response = self.client.patch(path, {'apiKey': 'private-test-secret'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['data']['providers'][0]['configured'])
        self.assertNotIn('private-test-secret', str(response.data))
        self.assertEqual(api_key('admin'), 'private-test-secret')
        self.assertEqual(api_key('another-account'), '')
        other = User.objects.create_user('other', password='test')
        self.client.force_authenticate(other)
        self.assertFalse(self.client.get(path).data['data']['providers'][0]['configured'])
        self.client.patch(path, {'apiKey': 'other-key'}, format='json')
        self.assertEqual(api_key('admin'), 'private-test-secret')
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.patch(path, {'apiKey': ''}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(path, {'apiKey': None}, format='json').status_code, 200)
        self.assertEqual(api_key('admin'), '')
        self.assertTrue(SyncEntityState.objects.filter(object_pk=CREDENTIAL_KEY).exists())

    def test_snapshot_export_and_restore_include_secret(self):
        from utils.sync_manager import SyncManager
        save_key('admin', 'not-in-snapshot')
        manager = SyncManager.__new__(SyncManager)
        self.assertTrue(manager._queryset_for_export(SystemSetting).filter(pk=CREDENTIAL_KEY).exists())
        remote = [{'model': 'system_settings.systemsetting', 'pk': CREDENTIAL_KEY, 'fields': {'value': {'admin': {'jev': 'remote-secret'}}}}]
        self.assertEqual(manager._drop_local_only_settings(remote), remote)
        self.assertEqual(api_key('admin'), 'not-in-snapshot')

    def test_full_snapshot_restore_restores_remote_credential(self):
        import tempfile
        from django.test import override_settings
        from utils.sync_manager import SyncManager
        save_key('admin', 'local-stays')
        with tempfile.TemporaryDirectory(prefix='odoc-decision-sync-') as root, override_settings(MEDIA_ROOT=root):
            SyncManager().apply_snapshot_data([
                {'model': 'system_settings.systemsetting', 'pk': 'system_ai_config',
                 'fields': {'value': {}, 'description': ''}},
                {'model': 'system_settings.systemsetting', 'pk': CREDENTIAL_KEY,
                 'fields': {'value': {'admin': {'jev': 'remote-must-not-replace'}}, 'description': ''}},
            ], full_overwrite=True)
        self.assertEqual(api_key('admin'), 'remote-must-not-replace')

    def test_config_defaults_and_partial_update(self):
        self.assertFalse(market_config({})['decision_enabled'])
        self.assertTrue(market_config({}, {'decision_enabled': True})['decision_enabled'])
        for value in ({'decision_enabled': 'true'}, {'decision_provider': 'openai'}, {'api_key': 'secret'}):
            with self.assertRaises(ValueError):
                market_config(value)

    @patch('system_settings.decision.jev.requests.get')
    def test_connection_test_does_not_call_decision_or_expose_body(self, get):
        save_key('admin', 'safe-secret')
        get.return_value = Mock(status_code=401, text='safe-secret')
        response = self.client.post('/api/settings/decision-models/test/')
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('safe-secret', str(response.data))
        get.return_value = Mock(status_code=200)
        get.return_value.json.return_value = {'models': [{'name': 'jev-latest'}]}
        self.assertEqual(self.client.post('/api/settings/decision-models/test/').status_code, 200)
        self.assertEqual(AgentTokenUsage.objects.count(), 0)

    @patch('system_settings.decision.jev.requests.post')
    def test_choice_records_actual_version_usage_and_invalid_response(self, post):
        save_key('admin', 'safe-secret')
        post.return_value = Mock(status_code=200)
        data = {'model': 'jev-1.13.0', 'usage': {'input_tokens': 120, 'output_tokens': 9},
                'answers': {'next_action': {'type': 'choice', 'choice': 'buy', 'probabilities': {'buy': .8, 'wait': .2}, 'confidence': .7}}}
        post.return_value.json.return_value = data
        with usage_scope(owner_id='admin', purpose='task', phase='JEV 市场选择'):
            self.assertEqual(choose('admin', {}, {'buy': '买', 'wait': '等待'}, deadline=time.monotonic() + 300), ('buy', .7))
        row = AgentTokenUsage.objects.get()
        self.assertEqual((row.input_tokens, row.output_tokens, row.total_tokens), (120, 9, 129))
        self.assertEqual(row.model_name, 'jev-1.13.0')
        self.assertEqual(row.provider_name, 'TypeSafe JEV')
        self.assertTrue(row.usage_complete)
        self.assertLessEqual(post.call_args.kwargs['timeout'], 60)
        data['answers']['next_action']['choice'] = 'unknown'
        with usage_scope(owner_id='admin', purpose='task'):
            with self.assertRaises(DecisionUnavailable):
                choose('admin', {}, {'buy': '买', 'wait': '等待'}, deadline=time.monotonic() + 300)
        self.assertEqual(AgentTokenUsage.objects.filter(status='failed').count(), 1)

    @patch('system_settings.decision.jev.requests.post')
    def test_failed_request_is_not_retried_and_unknown_usage_stays_null(self, post):
        save_key('admin', 'safe-secret')
        post.return_value = Mock(status_code=429)
        with usage_scope(owner_id='admin', purpose='task'):
            with self.assertRaises(DecisionUnavailable):
                choose('admin', {}, {'wait': '等待'}, deadline=time.monotonic() + 300)
        self.assertEqual(post.call_count, 1)
        row = AgentTokenUsage.objects.get()
        self.assertIsNone(row.total_tokens)
        self.assertFalse(row.usage_complete)

    @patch('system_settings.decision.jev.requests.post')
    def test_network_failure_finishes_capture_and_allows_scene_fallback(self, post):
        from requests import ConnectionError
        from .routing import choose_scene
        save_key('admin', 'safe-secret')
        post.side_effect = ConnectionError('unreachable')
        with patch('system_settings.decision.routing.jev_enabled', return_value=True), \
                patch('system_settings.agent_role.role_text', return_value='角色偏好'), \
                patch('system_settings.decision.routing.report') as report:
            result = choose_scene('admin', SimpleNamespace(pk='', name='测试居民'), 'life_activity', {},
                                  {'farm': '经营农场', 'rest': '休息'}, deadline=time.monotonic() + 60)
        self.assertIsNone(result)
        self.assertEqual(post.call_count, 1)
        report.assert_called_once()
        row = AgentTokenUsage.objects.get()
        self.assertEqual(row.status, 'failed')
        self.assertIsNotNone(row.ended_at)
