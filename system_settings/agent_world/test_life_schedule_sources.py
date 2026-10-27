"""Filtering precedes pagination; today and status totals include the whole day."""
from datetime import datetime, timedelta
from django.test import TestCase, override_settings
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from .life_models import LifeItem
from .life_time import SHANGHAI


@override_settings(USE_TZ=True)
class ScheduleSourceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_superuser('admin', password='test'))
        self.at = datetime(2026, 10, 24, tzinfo=SHANGHAI)
        self.url = '/api/settings/agent-world/life/schedule/'
        self.params = {'start': '2026-10-24', 'end': '2026-10-25'}
        for i in range(122):
            main = i < 10 or 100 <= i < 110
            LifeItem.objects.create(pk=f'source-{i:03}', owner_id='admin', actor_id='a' if i % 2 else 'b',
                original_at=self.at, scheduled_at=self.at + timedelta(minutes=i),
                activity='farm' if main else 'cooking', status='completed' if i < 100 else 'pending',
                context={} if main else {'interleaving': {'version': 1}})
        LifeItem.objects.create(pk='foreign', owner_id='other', actor_id='a', original_at=self.at, scheduled_at=self.at)

    def get(self, **params):
        response = self.client.get(self.url, {**self.params, **params})
        self.assertEqual(response.status_code, 200)
        return response.data['data']

    def test_today_includes_all_122_and_selected_sources_before_status(self):
        all_rows = self.get(view='today', source='all', page=2)
        self.assertEqual((all_rows['total'], len(all_rows['items']), all_rows['page']), (122, 122, 1))
        self.assertEqual(all_rows['counts'], {'main': 20, 'interleaved': 102})
        main = self.get(view='today', source='main')
        self.assertEqual((main['total'], main['summary']['pending']), (20, 10))
        completed = self.get(view='today', source='main', status='completed')
        self.assertEqual(completed['total'], 10)
        self.assertEqual(completed['summary']['pending'], 10)
        self.assertTrue(all(row['activity'] == 'farm' for row in main['items']))

    def test_source_and_actor_filter_before_list_pagination(self):
        first = self.get(source='interleaved')
        second = self.get(source='interleaved', page=2)
        self.assertEqual((first['total'], len(first['items']), len(second['items'])), (102, 100, 2))
        self.assertTrue(all(row['source'] == 'interleaved' for row in first['items']))
        actor = self.get(source='main', actor_id='a')
        self.assertEqual(actor['total'], 10)
        self.assertTrue(all(row['actor_id'] == 'a' for row in actor['items']))

    def test_invalid_source_and_full_range_fail_closed(self):
        for params in ({'source': 'bad'}, {'view': 'today', 'end': '2026-10-26'}):
            self.assertEqual(self.client.get(self.url, {**self.params, **params}).status_code, 400)

    def test_list_and_detail_show_latest_deferred_reason_and_cancel_result(self):
        from .life_models import LifeRevision
        item = LifeItem.objects.get(pk='source-000')
        item.status = 'deferred'; item.result = {'reason': '旧结果'}; item.save()
        LifeRevision.objects.create(item=item, reason='先前原因', created_at=self.at)
        LifeRevision.objects.create(item=item, reason='居民正在执行其他任务', created_at=self.at + timedelta(minutes=1))
        cancelled = LifeItem.objects.get(pk='source-001')
        cancelled.status = 'cancelled'; cancelled.result = {'reason': '预约时间已过'}; cancelled.save()
        rows = {row['id']: row for row in self.get(view='today')['items']}
        self.assertEqual(rows[item.pk]['status_reason'], '居民正在执行其他任务')
        self.assertEqual(rows[cancelled.pk]['status_reason'], '预约时间已过')
        detail = self.client.get(self.url + item.pk + '/')
        self.assertEqual(detail.data['data']['status_reason'], '居民正在执行其他任务')
        self.assertEqual(len(detail.data['data']['revisions']), 2)
        self.assertEqual(self.client.get(self.url + 'foreign/').status_code, 404)

    def test_deferred_without_revision_has_no_invented_reason(self):
        item = LifeItem.objects.get(pk='source-000')
        item.status = 'deferred'; item.result = {'reason': '上次活动结果'}; item.save()
        row = next(row for row in self.get(view='today')['items'] if row['id'] == item.pk)
        self.assertEqual(row['status_reason'], '')
