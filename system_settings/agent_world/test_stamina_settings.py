"""隔离数据库验证体力调速、API 契约和同步配置。"""
import json
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.contrib.auth.models import User
from django.core import serializers
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from system_settings.models import Agent, WorldAction, SystemSetting
from .execution import stamina
from .life_time import local_time
from .stamina_settings import SETTING_KEY, history, save_rate, validate_snapshot, validate_history


class StaminaSettingsTests(TestCase):
    def setUp(self):
        self.now = timezone.now().replace(microsecond=0)
        self.agent = Agent.objects.create(name='体力测试')
        Agent.objects.filter(pk=self.agent.pk).update(created_at=self.now - timedelta(hours=4))
        self.agent.refresh_from_db()
        WorldAction.objects.create(id='consume', actor_id=self.agent.pk, status='success',
                                   consumed_at=self.now - timedelta(hours=2), energy_cost=100)
        self.user = User.objects.create_user(username='stamina-user')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = '/api/settings/agent-world/stamina/config/'

    def change_rate(self, rate, at):
        with patch('system_settings.agent_world.stamina_settings.local_time', return_value=local_time(at)):
            return save_rate(rate)

    def test_default_and_change_does_not_reprice_history(self):
        self.assertEqual(stamina(self.agent, self.now), Decimal('10'))
        self.change_rate(10, self.now)
        self.assertEqual(stamina(self.agent, self.now), Decimal('10'))
        self.assertEqual(stamina(self.agent, self.now + timedelta(minutes=30)), Decimal('15'))
        self.assertEqual(stamina(self.agent, self.now - timedelta(hours=1)), Decimal('5'))
        self.assertEqual(stamina(self.agent, self.now + timedelta(days=2)), Decimal('100'))

    def test_multiple_changes_zero_and_successful_actions(self):
        self.change_rate(10, self.now)
        self.change_rate(0, self.now + timedelta(hours=1))
        self.assertEqual(stamina(self.agent, self.now + timedelta(hours=3)), Decimal('20'))
        WorldAction.objects.create(id='second', actor_id=self.agent.pk, status='success',
                                   consumed_at=self.now + timedelta(minutes=30), energy_cost=12)
        WorldAction.objects.create(id='failed', actor_id=self.agent.pk, status='failed',
                                   consumed_at=self.now + timedelta(minutes=40), energy_cost=100)
        self.assertEqual(stamina(self.agent, self.now + timedelta(hours=3)), Decimal('8'))
        self.change_rate(20, self.now + timedelta(hours=3))
        self.assertEqual(stamina(self.agent, self.now + timedelta(hours=4)), Decimal('28'))

    def test_api_auth_validation_and_camel_case(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.url).status_code, (401, 403))
        self.client.force_authenticate(self.user)
        data = json.loads(self.client.get(self.url).content)['data']
        self.assertEqual(data, {'recoveryPerHour': 5, 'maxStamina': 100})
        for value in (None, True, '10', -1, 101, 1.5):
            response = self.client.post(self.url, {'recoveryPerHour': value}, format='json')
            self.assertEqual(response.status_code, 400, value)
        response = self.client.post(self.url, {'recoveryPerHour': 10}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content)['data']['recoveryPerHour'], 10)
        self.client.post(self.url, {'recoveryPerHour': 10}, format='json')
        self.assertEqual(len(history()), 1)
        self.assertEqual(self.client.post(self.url, {'recoveryPerHour': 0}, format='json').status_code, 200)

    def test_sync_export_restore_retains_history_and_revision(self):
        from utils.sync_manager import SyncManager
        from system_settings.models import SyncEntityState
        self.change_rate(10, self.now)
        self.change_rate(0, self.now + timedelta(hours=1))
        manager = SyncManager()
        rows = manager.models.queryset_for_export(SystemSetting).filter(pk=SETTING_KEY)
        data = json.loads(serializers.serialize('json', rows))
        validate_snapshot(data)
        self.assertTrue(SyncEntityState.objects.filter(model_label='system_settings.systemsetting', object_pk=SETTING_KEY).exists())
        expected = history()
        SystemSetting.objects.filter(pk=SETTING_KEY).delete()
        for _ in range(2):
            for restored in serializers.deserialize('json', json.dumps(data)):
                restored.save()
            self.assertEqual(history(), expected)
            self.assertEqual(stamina(self.agent, self.now + timedelta(hours=3)), Decimal('20'))
        invalid = json.loads(json.dumps(data))
        invalid[0]['fields']['value'][0]['recovery_per_hour'] = -1
        with self.assertRaises(ValueError):
            validate_snapshot(invalid)
        self.assertEqual(history(), expected)
        with self.assertRaises(ValueError):
            manager.apply_snapshot_data(invalid)
        with self.assertRaises(ValueError):
            manager.merge_v2_data(None, data, {}, {'data': invalid})
        self.assertEqual(history(), expected)
        validate_snapshot([])  # 旧快照不含设置仍可读取。

    def test_invalid_history_and_empty_default(self):
        for value in ({}, [None], [{'effective_at': 'invalid', 'recovery_per_hour': 10}],
                      [{'effective_at': '2026-10-22T10:00:00', 'recovery_per_hour': 10}]):
            with self.assertRaises(ValueError):
                validate_history(value)
        self.change_rate(10, self.now)
        rows = history()
        with self.assertRaises(ValueError):
            validate_history(rows + rows)
        self.assertEqual(len(history()), 1)

    @override_settings(USE_TZ=True)
    def test_aware_times_and_clock_rollback(self):
        at = local_time(self.now)
        agent = Agent.objects.create(name='时区测试')
        Agent.objects.filter(pk=agent.pk).update(created_at=at - timedelta(hours=4))
        agent.refresh_from_db()
        WorldAction.objects.create(id='aware', actor_id=agent.pk, status='success',
                                   consumed_at=at - timedelta(hours=2), energy_cost=100)
        self.change_rate(10, at)
        before = history()
        with self.assertRaises(ValueError):
            self.change_rate(20, at - timedelta(minutes=1))
        self.assertEqual(history(), before)
        self.assertEqual(stamina(agent, at + timedelta(hours=1)), Decimal('20'))
