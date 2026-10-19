import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from tempfile import TemporaryDirectory, SpooledTemporaryFile
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from .models import AgentTokenUsage
from .views import TokenUsageView
from . import details
from utils.drf_utils import get_current_user_identifier
from system_settings.agent_world.life_time import storage_time

SHANGHAI = ZoneInfo('Asia/Shanghai')


class TokenReportTests(TestCase):
    def setUp(self):
        temporary = TemporaryDirectory(prefix='token-report-tests-')
        self.addCleanup(temporary.cleanup)
        self.detail_dir = Path(temporary.name) / 'details'
        isolated = override_settings(TOKEN_USAGE_DETAIL_DIR=self.detail_dir,
                                     TOKEN_USAGE_DETAILS_ENABLED=True)
        isolated.enable()
        self.addCleanup(isolated.disable)
        self.user = get_user_model().objects.create_user(username='token-report')
        self.factory = APIRequestFactory()
        request = self.factory.get('/')
        request.user = self.user
        self.owner = get_current_user_identifier(request)

    def row(self, **changes):
        data = dict(agent_key='9007199254740993', agent_name='菲伦', task_key='farm-task',
                    task_name='农场经营', record_key='run-1', owner_key=self.owner,
                    purpose='task', phase='选择操作', model_key='model-1', model_name='test-model',
                    provider_key='provider-1', provider_name='test-provider', device_id='device-1',
                    status='success', usage_complete=True, input_tokens=10, output_tokens=5,
                    total_tokens=15, cached_tokens=3, reasoning_tokens=2,
                    started_at=datetime(2026, 10, 10, 12, tzinfo=SHANGHAI),
                    ended_at=datetime(2026, 10, 10, 12, 0, 2, tzinfo=SHANGHAI))
        data.update(changes)
        for field in ('started_at', 'ended_at'):
            if data[field] is not None:
                data[field] = storage_time(data[field])
        return AgentTokenUsage.objects.create(**data)

    def api(self, params=None, authenticated=True):
        request = self.factory.get('/', params or {'all': '1'})
        if authenticated:
            force_authenticate(request, self.user)
        return TokenUsageView.as_view(kind='export')(request)

    def report(self, params=None):
        response = self.api(params)
        self.assertEqual(response.status_code, 200)
        self.assertIn('attachment;', response['Content-Disposition'])
        try:
            return json.loads(b''.join(response.streaming_content))
        finally:
            response.close()

    def test_all_rows_beyond_page_and_consistent_summary(self):
        for index in range(55):
            self.row(id=f'request-{index:03}', record_key=f'run-{index % 2}')
        value = self.report()
        self.assertEqual(len(value['requests']), 55)
        self.assertEqual(len({row['id'] for row in value['requests']}), 55)
        self.assertEqual(value['summary']['total_tokens'], 825)
        self.assertEqual(value['summary']['execution_count'], 2)
        self.assertEqual(value['by_task'][0]['request_count'], 55)
        self.assertEqual(value['by_phase'][0]['total_tokens'], 825)
        row = value['requests'][0]
        self.assertEqual(row['agent_key'], '9007199254740993')
        self.assertEqual(row['elapsed_seconds'], 2)
        self.assertEqual(row['model_key'], 'model-1')
        self.assertNotIn('owner_key', row)
        self.assertNotIn('api_key', row)

    def test_filters_shanghai_boundaries_and_visibility(self):
        midnight = datetime(2026, 10, 10, tzinfo=SHANGHAI)
        wanted = self.row(started_at=midnight, ended_at=midnight + timedelta(seconds=1))
        self.row(started_at=midnight - timedelta(seconds=1))
        self.row(started_at=midnight + timedelta(days=1))
        self.row(agent_key='other-agent')
        self.row(task_key='other-task')
        self.row(owner_key='another-user')
        value = self.report({'start_date': '2026-10-10', 'end_date': '2026-10-10',
                             'agent_id': wanted.agent_key, 'task_id': wanted.task_key})
        self.assertEqual([row['id'] for row in value['requests']], [wanted.pk])
        self.assertEqual(value['metadata']['filters']['agent_id'], wanted.agent_key)
        self.assertEqual(value['requests'][0]['started_at'], '2026-10-10T00:00:00+08:00')

    def test_unknown_zero_failed_running_and_other_calls(self):
        unknown = self.row(status='failed', usage_complete=False, input_tokens=None,
                           output_tokens=None, total_tokens=None, ended_at=None, attempt=2)
        zero = self.row(input_tokens=0, output_tokens=0, total_tokens=0)
        self.row(status='running', usage_complete=True)
        self.row(status='failed', input_tokens=20, output_tokens=10, total_tokens=30)
        self.row(task_key='', record_key='', purpose='planning')
        value = self.report()
        requests = {row['id']: row for row in value['requests']}
        self.assertIsNone(requests[unknown.pk]['total_tokens'])
        self.assertIsNone(requests[unknown.pk]['elapsed_seconds'])
        self.assertEqual(requests[unknown.pk]['attempt'], 2)
        self.assertEqual(requests[zero.pk]['total_tokens'], 0)
        self.assertEqual(value['summary']['total_tokens'], 60)
        self.assertEqual(value['summary']['incomplete_count'], 2)
        self.assertEqual(value['summary']['failed_count'], 2)
        self.assertEqual(value['summary']['running_count'], 1)
        other = self.report({'all': '1', 'other': '1', 'purpose': 'planning'})
        self.assertEqual(other['summary']['request_count'], 1)

    def test_system_actor_and_shared_usage(self):
        wanted = self.row(agent_key='', owner_key='')
        self.row(agent_key='other')
        value = self.report({'all': '1', 'agent_id': ''})
        self.assertEqual([row['id'] for row in value['requests']], [wanted.pk])
        self.assertEqual(value['metadata']['filters']['agent_id'], '')

    def test_empty_report_is_valid(self):
        value = self.report({'start_date': '2026-10-10', 'end_date': '2026-10-10'})
        self.assertEqual(value['requests'], [])
        self.assertEqual(value['summary']['request_count'], 0)
        self.assertFalse(value['summary']['collected'])
        self.assertEqual(value['by_task'], [])

    def test_invalid_filters_and_authentication(self):
        for params in ({'start_date': 'invalid'}, {'purpose': 'invalid'},
                       {'start_date': '2026-10-11', 'end_date': '2026-10-10'}):
            with self.subTest(params=params):
                self.assertEqual(self.api(params).status_code, 400)
        self.assertIn(self.api(authenticated=False).status_code, (401, 403))

    def save_content(self, row, status=None):
        details.write({'id': row.pk, 'started_at': row.started_at.isoformat(),
                       'status': status or row.status,
                       'request': {'messages': [{'role': 'user', 'content': '分析持仓'}]},
                       'response': {'choices': [{'message': {'content': '分析结果',
                           'tool_calls': [{'id': 'tool-1', 'function': {'name': 'holdings'}}]}}]},
                       'error_type': 'TimeoutError' if row.status == 'failed' else None})

    def test_execution_content_export_is_complete_ordered_and_repeatable(self):
        for index in range(55):
            row = self.row(id=f'{index:032x}', attempt=index % 3 + 1)
            self.save_content(row)
        hidden = self.row(owner_key='another-user')
        self.save_content(hidden)
        self.row(record_key='unrelated-run')
        params = {'all': '1', 'record_id': 'run-1', 'include_content': '1'}
        value = self.report(params)
        self.assertEqual(value, self.report(params) | {'metadata': value['metadata']})
        self.assertEqual(value['metadata']['format_version'], 2)
        self.assertEqual(value['summary']['request_count'], 55)
        self.assertEqual(value['summary']['content_available_count'], 55)
        self.assertEqual(value['summary']['content_unavailable_count'], 0)
        self.assertEqual([r['sequence'] for r in value['requests']], list(range(1, 56)))
        self.assertEqual([r['id'] for r in value['requests']], [f'{i:032x}' for i in range(55)])
        self.assertEqual(value['requests'][0]['content']['request']['messages'][0]['content'], '分析持仓')
        self.assertEqual(value['requests'][0]['content']['response']['choices'][0]['message']['tool_calls'][0]['id'], 'tool-1')
        self.assertEqual(value['summary']['total_tokens'], 825)
        with patch('system_settings.token_usage.content.details.read') as read:
            self.assertNotIn('content', self.report()['requests'][0])
            read.assert_not_called()
        response = self.api(params)
        self.assertEqual(response['Cache-Control'], 'no-store')
        response.close()

    def test_content_missing_stale_failed_running_disabled_and_empty(self):
        missing = self.row()
        stale = self.row()
        self.save_content(stale, status='running')
        failed = self.row(status='failed', usage_complete=False, attempt=2)
        self.save_content(failed)
        running = self.row(status='running', ended_at=None)
        self.save_content(running)
        params = {'all': '1', 'record_id': 'run-1', 'include_content': '1'}
        value = self.report(params)
        rows = {r['id']: r['content'] for r in value['requests']}
        self.assertFalse(rows[missing.pk]['available'])
        self.assertFalse(rows[stale.pk]['available'])
        self.assertEqual(rows[failed.pk]['error_type'], 'TimeoutError')
        self.assertEqual(rows[running.pk]['status'], 'running')
        self.assertEqual(value['summary']['content_unavailable_count'], 2)
        with override_settings(TOKEN_USAGE_DETAILS_ENABLED=False):
            self.assertEqual(self.report(params)['summary']['content_unavailable_count'], 4)
        empty = self.report({**params, 'record_id': 'missing'})
        self.assertEqual(empty['requests'], [])
        self.assertEqual(empty['summary']['content_available_count'], 0)
        for invalid in ({'include_content': '1'}, {'include_content': 'invalid'},
                        {'include_content': '1', 'record_id': ''}):
            self.assertEqual(self.api(invalid).status_code, 400)
        self.assertIn(self.api(params, authenticated=False).status_code, (401, 403))

    def test_content_export_failure_closes_temporary_file(self):
        self.row()
        report_file = SpooledTemporaryFile(mode='w+b')
        self.addCleanup(report_file.close)
        with patch('system_settings.token_usage.report.request_content', side_effect=OSError), \
                patch('system_settings.token_usage.report.SpooledTemporaryFile', return_value=report_file):
            with self.assertRaises(OSError):
                self.report({'all': '1', 'record_id': 'run-1', 'include_content': '1'})
            # 构建失败必须关闭文件；不在媒体或备份目录落地。
            self.assertTrue(report_file.closed)
