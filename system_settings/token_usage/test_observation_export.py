import json
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from system_settings.agent_world.life_time import local_time, storage_time
from utils.drf_utils import get_current_user_identifier
from . import details
from .models import AgentTokenUsage
from .observation_export import ObservationExportView


class ObservationExportTests(TestCase):
    def setUp(self):
        temp = TemporaryDirectory(prefix='observation-export-')
        self.addCleanup(temp.cleanup)
        settings = override_settings(TOKEN_USAGE_DETAIL_DIR=Path(temp.name) / 'details', TOKEN_USAGE_DETAILS_ENABLED=True)
        settings.enable()
        self.addCleanup(settings.disable)
        self.factory = APIRequestFactory()
        self.user = get_user_model().objects.create_user(username='observation-export')
        request = self.factory.get('/')
        request.user = self.user
        self.owner = get_current_user_identifier(request)
        self.now = local_time()
        self.day = self.now.date().isoformat()
        self.params = {'agent_id': 'actor-1', 'start_date': self.day, 'end_date': self.day}

    def row(self, key, **changes):
        data = {'id': f'{key:032x}', 'agent_key': 'actor-1', 'agent_name': '居民', 'owner_key': self.owner,
                'task_key': 'task', 'task_name': '市场采购', 'record_key': 'run', 'purpose': 'task',
                'phase': '选择', 'model_name': 'test-model', 'device_id': 'test-device',
                'status': 'success', 'usage_complete': True, 'input_tokens': 10, 'output_tokens': 2,
                'total_tokens': 12, 'started_at': storage_time(self.now), 'ended_at': storage_time(self.now)}
        data.update(changes)
        return AgentTokenUsage.objects.create(**data)

    def save_content(self, row, request_value, response_value):
        details.write({'id': row.pk, 'started_at': row.started_at.isoformat(), 'status': row.status,
                       'request': request_value, 'response': response_value, 'error_type': None})

    def api(self, ids, *, selection='activity:市场采购', params=None, authenticated=True):
        query = '&'.join(f'{key}={value}' for key, value in (params or self.params).items())
        request = self.factory.post(f'/?{query}', {'request_ids': ids, 'activity_filter': selection,
                                                    'activity_label': '市场采购'}, format='json')
        if authenticated:
            force_authenticate(request, self.user)
        return ObservationExportView.as_view()(request)

    def read_report(self, response):
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Cache-Control'], 'no-store')
        try:
            return json.loads(b''.join(response.streaming_content))
        finally:
            # Closing a FileResponse emits request_finished, whose connection
            # cleanup would close PostgreSQL's surrounding TestCase transaction.
            with patch('django.http.response.signals.request_finished.send'):
                response.close()

    def test_selected_requests_beyond_one_page_include_original_content_and_missing_counts(self):
        rows = [self.row(index) for index in range(1036)]
        self.save_content(rows[0], {'messages': [{'role': 'user', 'content': '输入'}]},
                          {'tool_calls': [{'id': 'call-1', 'function': {'name': 'market'}}]})
        self.save_content(rows[1], {'messages': []}, None)
        self.row(2000)  # Same period and resident, but outside the selected activity.
        report = self.read_report(self.api([row.pk for row in rows]))
        self.assertEqual(report['metadata']['activity_filter'], 'activity:市场采购')
        self.assertEqual(report['summary']['request_count'], 1036)
        self.assertEqual(report['summary']['request_present_count'], 2)
        self.assertEqual(report['summary']['response_present_count'], 1)
        self.assertEqual(report['summary']['response_missing_count'], 1035)
        content = {row['id']: row['content'] for row in report['requests']}
        self.assertEqual(content[rows[0].pk]['response']['tool_calls'][0]['id'], 'call-1')
        self.assertTrue(content[rows[1].pk]['request_present'])
        self.assertFalse(content[rows[1].pk]['response_present'])
        self.assertFalse(content[rows[2].pk]['available'])

    def test_account_resident_and_date_are_checked_against_every_selected_id(self):
        visible = self.row(1)
        hidden = self.row(2, owner_key='other-owner')
        other_actor = self.row(3, agent_key='actor-2')
        earlier = self.row(4, started_at=storage_time(self.now - timedelta(days=2)))
        for inaccessible in (hidden, other_actor, earlier, 'does-not-exist'):
            key = inaccessible.pk if isinstance(inaccessible, AgentTokenUsage) else inaccessible
            with self.subTest(key=key):
                self.assertEqual(self.api([visible.pk, key]).status_code, 409)
        self.assertIn(self.api([visible.pk], authenticated=False).status_code, (401, 403))

    def test_fact_only_empty_and_invalid_filter(self):
        report = self.read_report(self.api([], selection='fact:farm'))
        self.assertEqual(report['requests'], [])
        self.assertEqual(report['summary']['request_count'], 0)
        row = self.row(1)
        self.assertEqual(self.api([row.pk], selection='fact:farm').status_code, 400)
        self.assertEqual(self.api([row.pk], selection='').status_code, 400)
        self.assertEqual(self.api([row.pk, row.pk]).status_code, 400)

    def test_rows_disappearing_after_validation_do_not_produce_partial_report(self):
        row = self.row(1)
        with patch('django.db.models.query.QuerySet.iterator', return_value=iter(())):
            self.assertEqual(self.api([row.pk]).status_code, 409)

    def test_large_export_uses_temporary_storage_without_truncating_input(self):
        row = self.row(1)
        text = 'x' * (8 * 1024 * 1024 + 1024)
        self.save_content(row, {'messages': [{'role': 'user', 'content': text}]}, {'content': '完成'})
        response = self.api([row.pk])
        self.assertTrue(response.file_to_stream._rolled)
        report = self.read_report(response)
        self.assertEqual(report['requests'][0]['content']['request']['messages'][0]['content'], text)
        self.assertEqual(report['requests'][0]['content']['response']['content'], '完成')
