"""Decision-connection failover, sticky preference, and expiry back to the primary."""
import json
import time
from unittest.mock import Mock, patch

import requests
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from system_settings.agent_world.life_models import LifeConfig, LifeProfile
from system_settings.models import AIModel, AIProvider, Agent, SystemSetting, SyncEntityState
from system_settings.decision.config import delete_connection, save_connection
from system_settings.decision.failover import STICKY_KEY, read_sticky
from system_settings.decision.routing import choose_scene


def _connection(owner, name, host):
    saved = save_connection(owner, {
        'name': name, 'protocol': 'openai_chat_json', 'base_url': f'http://{host}/v1',
        'model_id': 'startlux-decision',
    })
    return next(item['id'] for item in saved['connections'] if item['name'] == name)


def _answer(choice, criteria, question_id='social_action'):
    probabilities = {key: (1.0 if key == choice else 0.0) for key in criteria}
    body = {
        'model': 'startlux-decision',
        'usage': {'prompt_tokens': 12, 'completion_tokens': 1, 'total_tokens': 13},
        'choices': [{'message': {'content': json.dumps({question_id: {
            'type': 'choice', 'choice': choice, 'probabilities': probabilities, 'confidence': 0.9,
        }})}}],
    }
    response = Mock(status_code=200, text='ok')
    response.json.return_value = body
    return response


class FailoverBehaviorTests(TestCase):
    def setUp(self):
        provider = AIProvider.objects.create(name='fixture', type='openai', base_url='https://invalid.local', api_key='test')
        model = AIModel.objects.create(provider=provider, name='resident', type='chat')
        self.agent = Agent.objects.create(name='居民', model=model, prompt='偏好', role_profile={'personality': '细心'})
        SystemSetting.objects.create(key='system_ai_config', value={'defaultChatModelId': model.pk})
        self.primary = _connection('owner', '主本地决策', 'primary.invalid')
        self.backup = _connection('owner', '备用本地决策', 'backup.invalid')
        self.criteria = {'reply': '回复', 'rest': '休息'}
        LifeConfig.objects.create(pk='owner', settings={
            'decision_connection_id': self.primary,
            'decision_connection_ids': [self.primary, self.backup],
            'decision_sticky_ttl_seconds': 7200,
            'jev_enabled': True,
            'jev_excluded_scenes': [],
        })
        LifeProfile.objects.create(pk=self.agent.pk, owner_id='owner')
        self.clock = {'now': 1_700_000_000.0}
        self.primary_mode = 'fail'
        self.calls = []

    def _post(self, url, **kwargs):
        self.calls.append((url, kwargs.get('timeout')))
        if self.primary_mode == 'all-fail' or ('primary.invalid' in url and self.primary_mode == 'fail'):
            raise requests.Timeout('hang')
        choice = 'rest'
        return _answer(choice, self.criteria)

    def _scene(self, deadline=None):
        with patch('system_settings.decision.failover.time.time', side_effect=lambda: self.clock['now']), \
                patch('system_settings.decision.jev.requests.post', side_effect=self._post):
            return choose_scene('owner', self.agent, 'social_action', {}, self.criteria,
                                deadline=deadline if deadline is not None else time.monotonic() + 5)

    def _sticky(self):
        row = SystemSetting.objects.filter(pk=STICKY_KEY).values_list('value', flat=True).first() or {}
        return row.get('owner')

    def test_failover_sticks_then_expiry_returns_to_primary(self):
        started = self.clock['now']
        self.assertEqual(self._scene(), 'rest')
        self.assertEqual([url for url, _ in self.calls], [
            'http://primary.invalid/v1/chat/completions',
            'http://backup.invalid/v1/chat/completions',
        ])
        self.assertTrue(all(timeout == 60 for _, timeout in self.calls))
        sticky = self._sticky()
        self.assertEqual(sticky['connection_id'], self.backup)
        self.assertEqual(sticky['until'], started + 7200)

        self.calls.clear()
        self.clock['now'] = started + 30
        self.assertEqual(self._scene(), 'rest')
        self.assertEqual([url for url, _ in self.calls], ['http://backup.invalid/v1/chat/completions'])
        self.assertEqual(self._sticky()['until'], started + 7200)

        self.calls.clear()
        self.clock['now'] = started + 7200 + 1
        self.primary_mode = 'ok'
        self.assertEqual(self._scene(), 'rest')
        self.assertEqual(self.calls[0][0], 'http://primary.invalid/v1/chat/completions')
        self.assertEqual(len(self.calls), 1)
        self.assertIsNone(read_sticky('owner', self.clock['now']))
        self.assertIsNone(self._sticky())

        self.calls.clear()
        self.assertEqual(self._scene(), 'rest')
        self.assertEqual([url for url, _ in self.calls], ['http://primary.invalid/v1/chat/completions'])

    def test_one_hour_ttl_is_configurable(self):
        config = LifeConfig.objects.get(pk='owner')
        config.settings['decision_sticky_ttl_seconds'] = 3600
        config.save(update_fields=['settings'])
        self.assertEqual(self._scene(), 'rest')
        self.assertEqual(self._sticky()['until'], self.clock['now'] + 3600)

    def test_sticky_failure_clears_preference_before_the_window_ends(self):
        self.assertEqual(self._scene(), 'rest')
        self.primary_mode = 'all-fail'
        self.calls.clear()
        self.clock['now'] += 10
        self.assertIsNone(self._scene())
        self.assertIsNone(self._sticky())
        self.primary_mode = 'fail'
        self.calls.clear()
        self._scene()
        self.assertIn('primary.invalid', self.calls[0][0])

    def test_passed_deadline_does_not_start_and_short_deadline_still_tries_the_backup(self):
        with patch('system_settings.decision.jev.requests.post', side_effect=self._post):
            self.assertIsNone(choose_scene(
                'owner', self.agent, 'social_action', {}, self.criteria, deadline=time.monotonic() - 1))
        self.assertEqual(self.calls, [])
        self.calls.clear()
        self.assertEqual(self._scene(deadline=time.monotonic() + 1), 'rest')
        self.assertEqual(len(self.calls), 2)
        self.assertTrue(all(timeout == 60 for _, timeout in self.calls))

    def test_text_fallback_keeps_its_own_minute_after_every_decision_connection_fails(self):
        self.primary_mode = 'all-fail'
        from system_settings.agent_world.life_choices import choose

        def complete(config, prompt, **kwargs):
            self.assertGreaterEqual(kwargs['deadline_seconds'], 59)
            self.assertLessEqual(kwargs['deadline_seconds'], 60)
            self.assertLessEqual(kwargs['max_deadline_seconds'], 60)
            self.assertEqual(len(self.calls), 2)
            return '{"choice":"rest"}'

        with patch('system_settings.decision.jev.requests.post', side_effect=self._post), \
                patch('system_settings.decision.routing.complete', side_effect=complete):
            result = choose(self.agent, 'owner', 'social_action', {}, self.criteria, deadline=time.monotonic() + 5)
        self.assertEqual(result, 'rest')
        self.assertTrue(all(timeout == 60 for _, timeout in self.calls))

    def test_missing_connection_is_skipped_and_primary_success_does_not_stick(self):
        config = LifeConfig.objects.get(pk='owner')
        config.settings['decision_connection_ids'] = ['dc_0123456789abcdef', self.primary]
        config.settings['decision_connection_id'] = 'dc_0123456789abcdef'
        config.save(update_fields=['settings'])
        self.primary_mode = 'ok'
        self.assertEqual(self._scene(), 'rest')
        self.assertEqual([url for url, _ in self.calls], ['http://primary.invalid/v1/chat/completions'])
        self.assertIsNone(self._sticky())

    def test_sticky_preference_is_local_and_not_exported(self):
        from utils.sync_manager import SyncManager
        self.assertEqual(self._scene(), 'rest')
        self.assertTrue(SystemSetting.objects.filter(pk=STICKY_KEY).exists())
        self.assertFalse(SyncEntityState.objects.filter(object_pk=STICKY_KEY).exists())
        manager = SyncManager.__new__(SyncManager)
        self.assertFalse(manager._queryset_for_export(SystemSetting).filter(pk=STICKY_KEY).exists())
        remote = [{'model': 'system_settings.systemsetting', 'pk': STICKY_KEY, 'fields': {'value': {'owner': {}}}}]
        self.assertEqual(manager._drop_local_only_settings(remote), [])


class FailoverSettingsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser('admin', 'failover@example.invalid', 'test')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.primary = _connection('admin', '主本地决策', 'primary.invalid')
        self.backup = _connection('admin', '备用本地决策', 'backup.invalid')

    def test_camel_case_order_is_aligned_and_ttl_is_saved(self):
        response = self.client.post('/api/settings/agent-world/life/config/', {'settings': {
            'decisionConnectionId': self.primary,
            'decisionConnectionIds': [self.backup, self.primary],
            'decisionStickyTtlSeconds': 3600,
            'jevEnabled': True,
        }}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()['data']
        settings = payload['settings']
        self.assertEqual(settings['decisionConnectionId'], self.primary)
        self.assertEqual(settings['decisionConnectionIds'], [self.primary, self.backup])
        self.assertEqual(settings['decisionStickyTtlSeconds'], 3600)
        failover = payload['decisionFailover']
        self.assertEqual(failover['order'][0], self.primary)
        self.assertIn(self.backup, failover['order'])
        self.assertIsNone(failover['stickyConnectionId'])
        self.assertEqual(failover['ttlSeconds'], 3600)

    def test_invalid_ttl_duplicate_and_oversized_order_are_rejected(self):
        self.assertEqual(self.client.post('/api/settings/agent-world/life/config/', {'settings': {
            'decisionStickyTtlSeconds': 90,
        }}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/settings/agent-world/life/config/', {'settings': {
            'decisionConnectionIds': ['jev', 'jev'],
        }}, format='json').status_code, 400)
        oversized = ['jev', *[f'dc_{index:016x}' for index in range(8)]]
        self.assertEqual(self.client.post('/api/settings/agent-world/life/config/', {'settings': {
            'decisionConnectionIds': oversized,
        }}, format='json').status_code, 400)

    def test_deleting_primary_promotes_the_next_backup_and_clears_sticky(self):
        LifeConfig.objects.create(pk='admin', settings={
            'decision_connection_id': self.primary,
            'decision_connection_ids': [self.primary, self.backup],
            'decision_sticky_ttl_seconds': 7200,
            'jev_enabled': True,
            'jev_excluded_scenes': [],
        })
        SystemSetting.objects.create(pk=STICKY_KEY, value={
            'admin': {'connection_id': self.primary, 'until': time.time() + 7200},
        })
        response = self.client.delete(f'/api/settings/decision-models/connections/{self.primary}/')
        self.assertEqual(response.status_code, 200, response.data)
        settings = LifeConfig.objects.get(pk='admin').settings
        self.assertEqual(settings['decision_connection_id'], self.backup)
        self.assertEqual(settings['decision_connection_ids'], [self.backup])
        self.assertIsNone(read_sticky('admin'))
        self.assertNotIn(self.primary, response.json()['data']['failover']['order'])

    def test_delete_helper_removes_only_the_listed_connection(self):
        LifeConfig.objects.create(pk='admin', settings={
            'decision_connection_id': self.primary,
            'decision_connection_ids': [self.primary, self.backup],
        })
        delete_connection('admin', self.backup)
        settings = LifeConfig.objects.get(pk='admin').settings
        self.assertEqual(settings['decision_connection_id'], self.primary)
        self.assertEqual(settings['decision_connection_ids'], [self.primary])
