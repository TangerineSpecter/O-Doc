from datetime import timedelta
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import AgentRunRecord


class AgentRunPaginationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user('record-reader'))
        self.url = '/api/settings/agent-run-records/'
        self.now = timezone.now()
        AgentRunRecord.objects.bulk_create([
            AgentRunRecord(id=f'run-{index:03}', task_name='分页测试', started_at=self.now - timedelta(minutes=index),
                           status='success', output='完整结果', steps=[{'title': '执行完成'}])
            for index in range(45)
        ])

    def page(self, **params):
        response = self.client.get(self.url, params)
        self.assertEqual(response.status_code, 200)
        # Check the public camelCase contract after rendering.
        return response.json()['data']

    def test_default_pages_and_end(self):
        seen, cursor = [], None
        for expected in (20, 20, 5):
            page = self.page(**({'cursor': cursor} if cursor else {}))
            self.assertEqual(len(page['items']), expected)
            seen.extend(item['id'] for item in page['items'])
            cursor = page['nextCursor']
        self.assertEqual(seen, [f'run-{index:03}' for index in range(45)])
        self.assertFalse(page['hasMore'])
        self.assertIsNone(cursor)

    def test_equal_timestamps_and_new_insert_do_not_repeat_or_skip(self):
        AgentRunRecord.objects.all().update(started_at=self.now)
        first = self.page(limit=20)
        AgentRunRecord.objects.create(id='new-run', task_name='新记录', started_at=self.now + timedelta(seconds=1))
        second = self.page(limit=20, cursor=first['nextCursor'])
        third = self.page(limit=20, cursor=second['nextCursor'])
        ids = [item['id'] for page in (first, second, third) for item in page['items']]
        self.assertEqual(ids, [f'run-{index:03}' for index in reversed(range(45))])

    def test_page_size_is_bounded(self):
        AgentRunRecord.objects.bulk_create([
            AgentRunRecord(id=f'extra-{index}', task_name='限制测试') for index in range(30)
        ])
        self.assertEqual(len(self.page(limit=9999)['items']), 50)
        self.assertEqual(len(self.page(limit=0)['items']), 1)

    def test_invalid_parameters_are_rejected(self):
        for params in ({'limit': 'bad'}, {'cursor': 'bad'}, {'cursor': '2026-99-99|id'}):
            response = self.client.get(self.url, params)
            self.assertEqual(response.status_code, 400)
            self.assertIn('msg', response.json())

    def test_empty_page_and_detail_remain_available(self):
        response = self.client.get(f'{self.url}run-000/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data']['output'], '完整结果')
        self.assertEqual(len(response.json()['data']['steps']), 1)
        AgentRunRecord.objects.all().delete()
        self.assertEqual(self.page(), {'items': [], 'nextCursor': None, 'hasMore': False})
