"""正文读写回归：所有文件仅放在临时目录，不访问真实模型或媒体。"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase, TestCase, override_settings

from . import details
from .capture import Capture
from .content import request_content
from utils.token_usage import usage_scope

NOW = datetime(2026, 10, 24, 6, tzinfo=ZoneInfo('Asia/Shanghai'))


class DetailStorageTests(SimpleTestCase):
    def setUp(self):
        temporary = TemporaryDirectory(prefix='odoc-token-details-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / 'details'
        self.enterContext(override_settings(TOKEN_USAGE_DETAILS_ENABLED=True, TOKEN_USAGE_DETAIL_DIR=self.root))
        self.enterContext(patch('system_settings.agent_world.life_time.local_time', side_effect=lambda value=None: (
            NOW if value is None else value.replace(tzinfo=NOW.tzinfo) if value.tzinfo is None else value.astimezone(NOW.tzinfo))))

    def entry(self, at=NOW):
        return {'id': 'a' * 32, 'started_at': at.isoformat(), 'status': 'success',
                'request': {'messages': [{'role': 'user', 'content': '输入'}]},
                'response': {'choices': [{'message': {'content': '输出'}}]}}

    def test_midnight_iso_and_datetime_use_same_shanghai_day(self):
        for hour in (0, 3, 6, 8, 23):
            at = NOW.replace(hour=hour, minute=2)
            utc = at.astimezone(timezone.utc)
            for timestamp in (at, utc, at.replace(tzinfo=None)):
                with self.subTest(hour=hour, timestamp=timestamp):
                    details.write(self.entry(timestamp))
                    result = request_content('a' * 32, timestamp, 'success', timestamp)
                    self.assertTrue(result['available'])
                    self.assertEqual(result['request'], self.entry()['request'])
                    self.assertEqual(result['response'], self.entry()['response'])
                    self.assertTrue((self.root / '2026-10-24' / f'{"a" * 32}.json').is_file())

    def test_legacy_utc_day_is_read_without_moving_user_files(self):
        at = NOW.replace(hour=0).astimezone(timezone.utc)
        legacy = self.root / '2026-10-23' / f'{"a" * 32}.json'
        legacy.parent.mkdir(parents=True)
        legacy.write_text(json.dumps(self.entry(at)), encoding='utf-8')
        self.assertEqual(details.read('a' * 32, at)['response'], self.entry()['response'])
        self.assertTrue(legacy.is_file())

    def test_missing_today_is_not_reported_as_expired(self):
        self.assertEqual(request_content('a' * 32, NOW, 'success', NOW)['reason'], 'not_found')
        self.assertEqual(request_content('a' * 32, NOW - timedelta(days=30), 'success', NOW)['reason'], 'expired')
        with override_settings(TOKEN_USAGE_DETAILS_ENABLED=False):
            self.assertEqual(request_content('a' * 32, NOW, 'success', NOW)['reason'], 'disabled')

    def test_invalid_unreadable_and_unfinished_snapshots_have_distinct_reasons(self):
        details.write(self.entry())
        path = self.root / '2026-10-24' / f'{"a" * 32}.json'
        path.write_text('[1]', encoding='utf-8')
        self.assertEqual(request_content('a' * 32, NOW, 'success', NOW)['reason'], 'invalid')
        path.write_text('{', encoding='utf-8')
        self.assertEqual(request_content('a' * 32, NOW, 'success', NOW)['reason'], 'invalid')
        with patch.object(Path, 'open', side_effect=PermissionError):
            self.assertEqual(request_content('a' * 32, NOW, 'success', NOW)['reason'], 'unreadable')
        details.write({**self.entry(), 'status': 'running'})
        result = request_content('a' * 32, NOW, 'success', NOW)
        self.assertEqual(result['reason'], 'incomplete')
        self.assertNotIn('response', result)
        self.assertFalse(request_content('../bad', NOW, 'success', NOW)['available'])


class CaptureRecoveryTests(TestCase):
    def setUp(self):
        temporary = TemporaryDirectory(prefix='odoc-token-recovery-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / 'details'
        self.enterContext(override_settings(TOKEN_USAGE_DETAILS_ENABLED=True, TOKEN_USAGE_DETAIL_DIR=self.root))

    def test_transient_write_failure_does_not_disable_rest_of_request(self):
        actual_write = details.write
        for failed_call in (1, 2, 3):
            calls = 0
            def write(entry):
                nonlocal calls
                calls += 1
                if calls == failed_call:
                    raise OSError('temporary storage failure')
                actual_write(entry)
            with self.subTest(stage=failed_call), usage_scope(purpose='planning'), \
                    patch.object(details, 'write', side_effect=write), \
                    self.assertLogs('system_settings.token_usage.capture', level='WARNING'):
                capture = Capture({'model_name': 'fake'})
                capture.set_request({'input': '输入'})
                capture.set_response({'output': '输出'})
                capture.finish('success')
                body = request_content(capture.row.pk, capture.row.started_at, 'success', capture.row.ended_at)
                self.assertTrue(body['available'])
                self.assertEqual(body['request'], {'input': '输入'})
                self.assertEqual(body['response'], {'output': '输出'})
                self.assertEqual(calls, 4)

    def test_synced_request_missing_on_current_device_is_explicit(self):
        from system_settings.models import SystemSetting
        from system_settings.sync_state import DEVICE_SETTING_KEY
        SystemSetting.objects.update_or_create(key=DEVICE_SETTING_KEY, defaults={'value': {'device_id': 'current'}})
        self.assertEqual(request_content('a' * 32, NOW, 'success', NOW, device_id='remote')['reason'], 'other_device')
        self.assertEqual(request_content('a' * 32, NOW, 'success', NOW, device_id='current')['reason'], 'not_found')

    def test_content_api_returns_specific_reason_with_unchanged_usage(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIRequestFactory, force_authenticate
        from system_settings.agent_world.life_time import storage_time
        from .models import AgentTokenUsage
        from .views import TokenUsageView
        from system_settings.sync_state import get_device_id
        row = AgentTokenUsage.objects.create(device_id=get_device_id(), started_at=storage_time(NOW),
            status='success', input_tokens=744, output_tokens=0, total_tokens=744, usage_complete=True)
        request = APIRequestFactory().get('/')
        force_authenticate(request, get_user_model().objects.create_user(username='content-reason'))
        result = TokenUsageView.as_view(kind='content')(request, request_id=row.pk)
        result.render()
        body = json.loads(result.content)['data']
        self.assertEqual(result.status_code, 200)
        self.assertEqual(body['reason'], 'not_found')
        self.assertFalse(body['available'])
        self.assertNotIn('response', body)
        row.refresh_from_db()
        self.assertEqual(row.total_tokens, 744)
