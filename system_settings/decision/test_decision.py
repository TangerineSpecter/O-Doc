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
        self.assertEqual(self.client.get(path).json()['data']['connections'], [])
        response = self.client.patch(path, {'apiKey': 'private-test-secret'}, format='json')
        self.assertEqual(response.status_code, 200)
        payload = response.json()['data']
        self.assertEqual(len(payload['connections']), 1)
        saved = payload['connections'][0]
        self.assertEqual(saved['id'], 'jev')
        self.assertFalse(saved['builtIn'])
        self.assertTrue(saved['configured'])
        self.assertTrue(saved['apiKeyConfigured'])
        self.assertEqual(saved['baseUrl'], 'https://api.typesafe.ai/v1')
        self.assertEqual(saved['modelId'], 'jev-latest')
        self.assertNotIn('private-test-secret', str(response.content))
        self.assertEqual(api_key('admin'), 'private-test-secret')
        self.assertEqual(api_key('another-account'), '')
        other = User.objects.create_user('other', password='test')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(path).json()['data']['connections'], [])
        self.client.patch(path, {'apiKey': 'other-key'}, format='json')
        self.assertEqual(api_key('admin'), 'private-test-secret')
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.patch(path, {'apiKey': ''}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(path, {'apiKey': None}, format='json').status_code, 200)
        self.assertEqual(api_key('admin'), '')
        self.assertTrue(SyncEntityState.objects.filter(object_pk=CREDENTIAL_KEY).exists())
        self.assertEqual(self.client.get(path).json()['data']['connections'][0]['id'], 'jev')
        removed = self.client.delete('/api/settings/decision-models/connections/jev/')
        self.assertEqual(removed.status_code, 200, removed.content)
        self.assertEqual(removed.json()['data']['connections'], [])
        self.assertEqual(api_key('admin'), '')

    def test_legacy_jev_migration_keeps_configured_accounts_and_drops_placeholders(self):
        import importlib
        from django.apps import apps
        from django.db import connection as db_connection
        from system_settings.agent_world.life_models import LifeConfig
        migrate_legacy_jev = importlib.import_module(
            'system_settings.migrations.0076_custom_decision_connections').migrate_legacy_jev

        class Editor:
            connection = db_connection

        SystemSetting.objects.create(pk='system_decision_credentials', value={
            'kept': {'jev': 'kept-secret'},
        })
        LifeConfig.objects.create(pk='kept', settings={
            'decision_connection_id': 'jev', 'decision_connection_ids': ['jev'],
        })
        LifeConfig.objects.create(pk='plain', settings={
            'decision_connection_id': 'jev', 'decision_connection_ids': ['jev'],
        })
        LifeConfig.objects.create(pk='mixed', settings={
            'decision_connection_id': 'jev', 'decision_connection_ids': ['jev', 'dc_0123456789abcdef'],
        })
        migrate_legacy_jev(apps, Editor())
        profiles = SystemSetting.objects.get(pk='system_decision_connections').value
        self.assertEqual(profiles['kept'], [{
            'id': 'jev', 'name': 'JEV', 'protocol': 'systemone',
            'base_url': 'https://api.typesafe.ai/v1', 'model_id': 'jev-latest',
        }])
        self.assertNotIn('plain', profiles)
        self.assertEqual(LifeConfig.objects.get(pk='kept').settings['decision_connection_id'], 'jev')
        plain = LifeConfig.objects.get(pk='plain').settings
        self.assertEqual(plain['decision_connection_id'], '')
        self.assertEqual(plain['decision_connection_ids'], [])
        mixed = LifeConfig.objects.get(pk='mixed').settings
        self.assertEqual(mixed['decision_connection_id'], 'dc_0123456789abcdef')
        self.assertEqual(mixed['decision_connection_ids'], ['dc_0123456789abcdef'])
        profiles['kept'][0]['name'] = '已改名'
        row = SystemSetting.objects.get(pk='system_decision_connections')
        row.value = profiles
        row.save(update_fields=['value'])
        migrate_legacy_jev(apps, Editor())
        self.assertEqual(SystemSetting.objects.get(pk='system_decision_connections').value['kept'][0]['name'], '已改名')

    def test_snapshot_export_and_restore_include_secret(self):
        from utils.sync_manager import SyncManager
        save_key('admin', 'not-in-snapshot')
        manager = SyncManager()
        self.assertTrue(manager.models.queryset_for_export(SystemSetting).filter(pk=CREDENTIAL_KEY).exists())
        remote = [{'model': 'system_settings.systemsetting', 'pk': CREDENTIAL_KEY, 'fields': {'value': {'admin': {'jev': 'remote-secret'}}}}]
        self.assertEqual(manager.models.drop_local_only_settings(remote), remote)
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
        self.assertEqual(get.call_args.args[0], 'https://api.typesafe.ai/v1/models')
        self.assertEqual(get.call_args.kwargs['headers']['Authorization'], 'Bearer safe-secret')
        self.assertEqual(get.call_args.kwargs['timeout'], 8)
        self.assertEqual(AgentTokenUsage.objects.count(), 0)

    @patch('system_settings.decision.jev.requests.post')
    @patch('system_settings.decision.jev.requests.get')
    def test_custom_systemone_connection_test_uses_decision_endpoint(self, get, post):
        created = self.client.post('/api/settings/decision-models/connections/', {
            'name': 'JEV', 'protocol': 'systemone',
            'baseUrl': 'https://api.typesafe.ai/v1', 'modelId': 'jev-latest',
            'apiKey': 'safe-secret',
        }, format='json')
        self.assertEqual(created.status_code, 200, created.content)
        saved = created.json()['data']['connections'][0]
        self.assertTrue(saved['id'].startswith('dc_'))
        self.assertEqual(saved['modelId'], 'jev-latest')
        self.assertEqual(saved['baseUrl'], 'https://api.typesafe.ai/v1')
        post.return_value = Mock(status_code=200, text='ok')
        post.return_value.json.return_value = {
            'model': 'jev-latest',
            'answers': {'connection_test': {'type': 'choice', 'choice': 'connected', 'confidence': 1,
                                            'probabilities': {'connected': 1, 'unavailable': 0}}},
        }
        response = self.client.post(f"/api/settings/decision-models/connections/{saved['id']}/test/")
        self.assertEqual(response.status_code, 200, response.content)
        get.assert_not_called()
        self.assertEqual(post.call_args.args[0], 'https://api.typesafe.ai/v1/systemone')
        self.assertEqual(post.call_args.kwargs['headers']['Authorization'], 'Bearer safe-secret')
        self.assertEqual(post.call_args.kwargs['json']['model'], 'jev-latest')
        self.assertEqual(post.call_args.kwargs['json']['questions']['connection_test']['type'], 'choice')
        self.assertNotIn('safe-secret', str(response.content))
        self.assertEqual(AgentTokenUsage.objects.count(), 0)
        post.return_value.json.return_value = {'model': 'jev-latest', 'answers': {}}
        rejected = self.client.post(f"/api/settings/decision-models/connections/{saved['id']}/test/")
        self.assertEqual(rejected.status_code, 502)
        self.assertIn('决策模型返回了无效候选', rejected.json()['msg'])

    @patch('system_settings.decision.jev.requests.post')
    def test_custom_systemone_full_endpoint_is_not_appended_twice(self, post):
        created = self.client.post('/api/settings/decision-models/connections/', {
            'name': 'JEV full', 'protocol': 'systemone',
            'baseUrl': 'https://api.typesafe.ai/v1/systemone', 'modelId': 'jev-latest',
            'apiKey': 'safe-secret',
        }, format='json')
        connection_id = created.json()['data']['connections'][0]['id']
        post.return_value = Mock(status_code=200, text='ok')
        post.return_value.json.return_value = {
            'model': 'jev-latest',
            'answers': {'connection_test': {'type': 'choice', 'choice': 'connected', 'confidence': 1,
                                            'probabilities': {'connected': 1, 'unavailable': 0}}},
        }
        response = self.client.post(f'/api/settings/decision-models/connections/{connection_id}/test/')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(post.call_args.args[0], 'https://api.typesafe.ai/v1/systemone')

    def test_systemone_url_normalization(self):
        from .adapters.systemone import SystemOneAdapter
        root = 'https://api.typesafe.ai/v1'
        full = root + '/systemone'
        self.assertEqual(SystemOneAdapter.endpoint(root), full)
        self.assertEqual(SystemOneAdapter.endpoint(full + '/'), full)
        self.assertEqual(SystemOneAdapter.models_endpoint(root), root + '/models')
        self.assertEqual(SystemOneAdapter.models_endpoint(full), root + '/models')
        self.assertEqual(SystemOneAdapter.models_endpoint(root + '/models/'), root + '/models')

    @patch('system_settings.decision.jev.requests.post')
    def test_openai_connection_test_accepts_typed_choice_and_hides_bad_json(self, post):
        created = self.client.post('/api/settings/decision-models/connections/', {
            'name': 'local', 'protocol': 'openai_chat_json',
            'baseUrl': 'http://127.0.0.1:8080/v1', 'modelId': 'startlux-decision',
            'apiKey': 'safe-secret',
        }, format='json')
        connection_id = created.json()['data']['connections'][0]['id']
        body = {'model': 'startlux-decision', 'usage': {'prompt_tokens': 3, 'completion_tokens': 1, 'total_tokens': 4},
                'choices': [{'message': {'content': '{"connection_test":{"type":"choice","choice":"connected","confidence":0.9,"probabilities":{"connected":0.8,"unavailable":0.2}}}'}}]}
        post.return_value = Mock(status_code=200, text='ok')
        post.return_value.json.return_value = body
        response = self.client.post(f'/api/settings/decision-models/connections/{connection_id}/test/')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(post.call_args.args[0], 'http://127.0.0.1:8080/v1/chat/completions')
        self.assertEqual(post.call_args.kwargs['json']['model'], 'startlux-decision')
        self.assertEqual(post.call_args.kwargs['headers']['Authorization'], 'Bearer safe-secret')
        post.return_value.json.side_effect = ValueError('safe-secret')
        rejected = self.client.post(f'/api/settings/decision-models/connections/{connection_id}/test/')
        self.assertEqual(rejected.status_code, 502)
        self.assertEqual(rejected.json()['msg'], '连接测试响应结构无效')
        self.assertNotIn('safe-secret', str(rejected.content))
        self.assertEqual(AgentTokenUsage.objects.count(), 0)

    @patch('system_settings.decision.jev.requests.post')
    def test_choice_records_actual_version_usage_and_invalid_response(self, post):
        save_key('admin', 'safe-secret')
        post.return_value = Mock(status_code=200, text='{}')
        data = {'model': 'jev-1.13.0', 'usage': {'input_tokens': 120, 'output_tokens': 9},
                'answers': {'next_action': {'type': 'choice', 'choice': 'buy', 'probabilities': {'buy': .8, 'wait': .2}, 'confidence': .7}}}
        post.return_value.json.return_value = data
        with usage_scope(owner_id='admin', purpose='task', phase='JEV 市场选择'):
            self.assertEqual(choose('admin', {}, {'buy': '买', 'wait': '等待'}, deadline=time.monotonic() + 300), ('buy', .7))
        self.assertEqual(post.call_args.args[0], 'https://api.typesafe.ai/v1/systemone')
        self.assertEqual(post.call_args.kwargs['headers']['Authorization'], 'Bearer safe-secret')
        payload = post.call_args.kwargs['json']
        self.assertEqual(payload['model'], 'jev-latest')
        self.assertEqual(payload['questions']['next_action']['type'], 'choice')
        self.assertEqual(set(payload['questions']['next_action']['criteria']), {'buy', 'wait'})
        row = AgentTokenUsage.objects.get()
        self.assertEqual((row.input_tokens, row.output_tokens, row.total_tokens), (120, 9, 129))
        self.assertEqual(row.model_name, 'jev-1.13.0')
        self.assertEqual(row.provider_name, 'TypeSafe JEV')
        full = self.client.post('/api/settings/decision-models/connections/', {
            'name': 'JEV endpoint', 'protocol': 'systemone',
            'baseUrl': 'https://api.typesafe.ai/v1/systemone/', 'modelId': 'jev-latest',
            'apiKey': 'safe-secret',
        }, format='json')
        self.assertEqual(full.status_code, 200, full.content)
        full_id = full.json()['data']['connections'][-1]['id']
        with usage_scope(owner_id='admin', purpose='task'):
            self.assertEqual(choose('admin', {}, {'buy': '买', 'wait': '等待'}, deadline=time.monotonic() + 300,
                                    connection_id=full_id), ('buy', .7))
        self.assertEqual(post.call_args.args[0], 'https://api.typesafe.ai/v1/systemone')
        self.assertTrue(row.usage_complete)
        self.assertEqual(post.call_args.kwargs['timeout'], 60)
        with usage_scope(owner_id='admin', purpose='task'):
            self.assertEqual(choose('admin', {}, {'buy': '买', 'wait': '等待'}, deadline=time.monotonic() + 15), ('buy', .7))
        self.assertEqual(post.call_args.kwargs['timeout'], 60)
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
