import json
from unittest.mock import patch

from django.core import serializers
from django.db import connection
from django.test import TestCase, TransactionTestCase

from article.models import Article
from stats.models import ReadStat
from utils.sync_manager import SyncManager
from utils.sync_restore import SnapshotRestorer


class ReadStatSequenceTests(TestCase):
    def test_snapshot_restore_resets_read_stat_sequence(self):
        article = Article.objects.create(
            article_id='art_sequence_test',
            title='序列测试',
            content='测试正文',
            coll_id='coll_sequence_test',
        )
        read_stat = ReadStat.objects.create(
            article=article,
            user_identifier='admin',
            duration=10,
        )
        snapshot = json.loads(serializers.serialize('json', [article, read_stat]))

        with patch.object(
            connection.ops,
            'sequence_reset_sql',
            return_value=['SELECT 1'],
        ) as sequence_reset_sql:
            SyncManager().apply_snapshot_data(snapshot)

        restored_models = sequence_reset_sql.call_args.args[1]
        self.assertIn(ReadStat, restored_models)

    def test_postgresql_restore_locks_auto_sequence_tables(self):
        class FakeCursor:
            def __init__(self):
                self.statements = []

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def execute(self, statement):
                self.statements.append(statement)

        cursor = FakeCursor()
        with patch.object(connection, 'vendor', 'postgresql'), \
                patch.object(connection, 'cursor', return_value=cursor):
            SnapshotRestorer._lock_restored_sequence_tables([Article, ReadStat])

        self.assertEqual(cursor.statements, [
            'LOCK TABLE "stats_read_record" IN SHARE ROW EXCLUSIVE MODE',
        ])


class ReadDurationTests(TestCase):
    url = '/api/stats/report/duration'

    def setUp(self):
        from rest_framework.test import APIClient
        self.client = APIClient()
        self.article = Article.objects.create(title='阅读测试', coll_id='collection')

    def test_existing_duplicates_remain_readable_and_next_heartbeat_is_counted_once(self):
        rows = ReadStat.objects.filter(article=self.article)
        for seconds in (4, 6):
            ReadStat.objects.create(article=self.article, user_identifier='127.0.0.1', duration=seconds)
        result = self.client.post(self.url, {'articleId': self.article.pk, 'duration': 8}, format='json')
        self.assertEqual(result.json()['code'], 200)
        self.assertEqual(list(rows.order_by('pk').values_list('duration', flat=True)), [12, 6])

    def test_bad_inputs_and_missing_article(self):
        for data in ([], {'articleId': self.article.pk, 'duration': []},
                     {'articleId': self.article.pk, 'duration': True}):
            self.assertEqual(self.client.post(self.url, data, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.url, {'articleId': 'missing', 'duration': 5}, format='json').status_code, 404)
        self.assertFalse(ReadStat.objects.exists())

    def test_dashboard_aggregates_only_valid_articles(self):
        from categories.models import Category
        from django.utils import timezone
        category = Category.objects.create(name='阅读分类')
        self.article.category = category
        self.article.save(update_fields=['category'])
        deleted = Article.objects.create(title='已删除', coll_id='collection', category=category, is_valid=False)
        for article in (self.article, deleted):
            ReadStat.objects.create(article=article, user_identifier='reader', duration=1800)
        result = self.client.get('/api/stats/dashboard', {'year': -1}).json()['data']
        self.assertEqual(result['kpi']['totalDurationHours'], 0.5)
        self.assertEqual(result['selectedYear'], timezone.now().year)
        self.assertEqual(sum(row['visits'] for row in result['hourlyData']), 1)
        self.assertEqual(result['categoryStats'], [{'name': '阅读分类', 'value': 1}])

    def test_heatmap_counts_only_active_whiteboards_of_signed_in_reader(self):
        from datetime import datetime
        from django.contrib.auth.models import User
        from django.test.utils import CaptureQueriesContext
        from whiteboard.models import Whiteboard
        reader = User.objects.create_superuser('admin', password='test')
        at = datetime(2020, 1, 7, 12)
        for owner, valid in [('admin', True), ('admin', True), ('other', True), ('admin', False)]:
            Whiteboard.objects.create(user_id=owner, is_valid=valid, created_at=at)
        url = '/api/stats/dashboard?year=2020'
        self.assertEqual(self.client.get(url).json()['data']['dailyCreation'], [])
        self.client.force_authenticate(reader)
        with CaptureQueriesContext(connection) as queries:
            day, = self.client.get(url).json()['data']['dailyCreation']
        query, = [row['sql'] for row in queries if 'FROM "whiteboards"' in row['sql']]
        self.assertNotIn('"nodes"', query)
        self.assertNotIn('"insights"', query)
        self.assertEqual((day['date'], day['whiteboards'], day['total']), ('2020-01-07', 2, 2))


class ConcurrentHeartbeatTests(TransactionTestCase):
    def test_simultaneous_first_heartbeats_share_a_daily_row(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from django.db import connections
        from stats.read_duration import record_duration
        if connection.vendor != 'postgresql':
            self.skipTest('Requires PostgreSQL row locks')
        article = Article.objects.create(title='并发阅读', coll_id='collection')
        barrier = Barrier(2)

        def send(seconds):
            initial_lookup = True

            def wait_for_both_readers(execute, sql, params, many, context):
                nonlocal initial_lookup
                result = execute(sql, params, many, context)
                if initial_lookup and sql.startswith('SELECT') and 'FROM "stats_read_record"' in sql:
                    initial_lookup = False
                    barrier.wait(timeout=10)
                return result

            try:
                with connection.execute_wrapper(wait_for_both_readers):
                    return record_duration(article.pk, 'reader', seconds)
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(send, [7, 11])), [True, True])
        self.assertEqual(ReadStat.objects.get(article=article).duration, 18)
