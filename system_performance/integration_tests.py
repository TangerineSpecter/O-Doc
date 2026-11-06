"""PostgreSQL checks in a random transactional schema; never operate on user tables."""
import io
import json
import unittest
import uuid
import zipfile
from types import SimpleNamespace
from unittest.mock import patch

from django.db import connection, transaction
from rest_framework.test import APIRequestFactory, force_authenticate
from .models import PerformancePolicy, PerformanceBucket, PerformanceSample, PerformanceFlushBatch, DatabaseStatSnapshot, PerformanceInflight
from .storage import load_policy, persist, save_policy, maintain, checkpoint_inflight, save_database_snapshot
from .views import PerformanceView
from .queries import baseline


class PostgreSQLIntegration(unittest.TestCase):
    def setUp(self):
        self.assertEqual(connection.vendor, 'postgresql')
        self.atomic = transaction.atomic()
        self.atomic.__enter__()
        self.schema = 'performance_test_' + uuid.uuid4().hex
        with connection.cursor() as cursor:
            cursor.execute(f'CREATE SCHEMA "{self.schema}"')
            cursor.execute(f'SET LOCAL search_path TO "{self.schema}"')
            cursor.execute('SELECT current_schema()')
            self.assertEqual(cursor.fetchone()[0], self.schema)
        with connection.schema_editor() as editor:
            for model in (PerformancePolicy, PerformanceBucket, PerformanceSample, PerformanceFlushBatch, DatabaseStatSnapshot, PerformanceInflight):
                editor.create_model(model)
        self.factory = APIRequestFactory()
        load_policy()

    def tearDown(self):
        transaction.set_rollback(True)
        self.atomic.__exit__(None, None, None)
        with connection.cursor() as cursor:
            cursor.execute('SELECT count(*) FROM pg_namespace WHERE nspname=%s', [self.schema])
            self.assertEqual(cursor.fetchone()[0], 0, 'Test schema must roll back completely')

    def event(self, **changes):
        import time
        return dict(id=uuid.uuid4().hex, root_id='root', parent_id=None, kind='request',
                    operation='test/route/', method='GET', started=time.time(), duration_ms=1500,
                    status='success', slow=True, sql_count=2, sql_ms=500, build={},
                    policy_version=1, generation=1, children=[], **changes)

    def test_atomic_batches_and_clear_generation(self):
        event = self.event()
        batch = uuid.uuid4().hex
        persist([event], batch)
        persist([event], batch)
        self.assertEqual(PerformanceBucket.objects.get().count, 1)
        self.assertEqual(PerformanceSample.objects.count(), 1)
        self.assertEqual(sum(PerformanceBucket.objects.get().histogram), 1)
        save_policy({}, clear=True)
        persist([event], uuid.uuid4().hex)
        self.assertFalse(PerformanceBucket.objects.exists())
        self.assertFalse(PerformanceSample.objects.exists())

    def test_legacy_histogram_is_read_but_not_updated_in_place(self):
        from datetime import datetime, timezone
        from .metrics import distribution, summarize, digest
        event = self.event()
        dimensions = {key: event.get(key) for key in ('kind', 'operation', 'status', 'policy_version', 'method', 'model_name', 'provider_name')}
        dimensions['build'] = event['build']
        legacy = PerformanceBucket.objects.create(key=digest(dimensions), minute=datetime.fromtimestamp(event['started'], timezone.utc).replace(second=0, microsecond=0),
            dimensions=dimensions, count=1, total_ms=1500, max_ms=1500, histogram=distribution([1500]))
        persist([event], uuid.uuid4().hex)
        legacy.refresh_from_db()
        self.assertEqual(legacy.count, 1)
        self.assertEqual(PerformanceBucket.objects.count(), 2)
        summary = summarize(list(PerformanceBucket.objects.values()))
        self.assertEqual(summary['count'], 2)
        self.assertEqual(summary['histogram_status'], 'available')

    def test_corrupt_histogram_does_not_truncate_next_batch_or_break_queries(self):
        from .metrics import summarize
        persist([self.event()], uuid.uuid4().hex)
        PerformanceBucket.objects.update(histogram=[1])
        persist([self.event()], uuid.uuid4().hex)
        row = PerformanceBucket.objects.get()
        self.assertEqual(row.count, 2)
        self.assertEqual(row.histogram, [])
        summary = summarize(list(PerformanceBucket.objects.values()))
        self.assertEqual(summary['count'], 2)
        self.assertIsNone(summary['p95'])
        self.assertEqual(summary['histogram_status'], 'invalid')

    def test_dimension_overflow_keeps_histogram_schema_across_batches(self):
        from django.utils import timezone
        from .metrics import histogram_schema, summarize
        event = self.event()
        with patch('system_performance.storage._dimension_day', timezone.now().date()), \
                patch('system_performance.storage._dimension_keys', {str(i) for i in range(2048)}):
            persist([event], uuid.uuid4().hex)
            persist([{**event, 'id': uuid.uuid4().hex}], uuid.uuid4().hex)
        row = PerformanceBucket.objects.get()
        self.assertIn('超过本进程每日维度上限', row.dimensions['operation'])
        self.assertEqual(row.dimensions['histogram_schema'], histogram_schema())
        self.assertEqual(row.count, 2)
        self.assertEqual(summarize(list(PerformanceBucket.objects.values()))['histogram_status'], 'available')

    def test_error_denominator_and_admin_report(self):
        import time
        first = self.event()
        failure = {**self.event(), 'status': 'failed'}
        persist([first, failure], uuid.uuid4().hex)
        data = baseline(first)
        self.assertEqual(data['duration_comparison']['count'], 1)
        self.assertEqual(data['all_results']['error_ratio'], .5)
        request = self.factory.get('/api/system/performance/samples/x/report/')
        self.assertEqual(PerformanceView.as_view(action='report')(request, sample_id=first['id']).status_code, 403)
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True, is_superuser=True))
        with patch('system_performance.reports.associated_errors', return_value={'status': 'not_found', 'rows': []}):
            response = PerformanceView.as_view(action='report')(request, sample_id=first['id'])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Cache-Control'], 'no-store')
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            self.assertEqual(json.loads(archive.read('evidence.json'))['event']['id'], first['id'])

    def test_policy_validation_and_camel_case_contract(self):
        request = self.factory.put('/api/system/performance/policy/', {'requestMs': 2000, 'enabled': True}, format='json')
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True, is_superuser=True))
        response = PerformanceView.as_view(action='policy')(request)
        response.render()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content)['data']['requestMs'], 2000)
        request = self.factory.put('/api/system/performance/policy/', {'requestMs': -1}, format='json')
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True, is_superuser=True))
        self.assertEqual(PerformanceView.as_view(action='policy')(request).status_code, 400)

    def test_capacity_limits_samples_before_aggregates_and_recovers(self):
        save_policy({'max_mb': 1})
        events = [self.event(padding='x' * 30000) for _ in range(50)]
        first_batch = uuid.uuid4().hex
        result = persist(events, first_batch)
        self.assertGreater(result['discarded_samples'], 0)
        self.assertEqual(PerformanceBucket.objects.get().count, 50)
        saved = PerformanceSample.objects.count()
        self.assertGreater(saved, 0)
        self.assertLess(saved, 50)
        self.assertLessEqual(result['capacity']['used_bytes'], result['capacity']['limit_bytes'])
        # Sustained pressure cannot keep adding samples, even while metadata and
        # aggregates still fit. A retry of an admitted batch is still idempotent.
        persist(events, first_batch)
        self.assertEqual(PerformanceBucket.objects.get().count, 50)
        for _ in range(20):
            persist([self.event(padding='y' * 30000) for _ in range(50)], uuid.uuid4().hex)
        self.assertEqual(PerformanceSample.objects.count(), saved)
        protected = set(PerformanceFlushBatch.objects.values_list('pk', flat=True))
        capacity = maintain()
        self.assertFalse(capacity['limited'])
        self.assertLess(PerformanceSample.objects.count(), saved)
        self.assertEqual(set(PerformanceFlushBatch.objects.values_list('pk', flat=True)), protected)
        fresh = self.event(padding='z' * 30000)
        persist([fresh], uuid.uuid4().hex)
        self.assertTrue(PerformanceSample.objects.filter(pk=fresh['id']).exists())

    def test_budget_below_protected_floor_blocks_every_new_record_type(self):
        save_policy({'max_mb': 1})
        # Simulate lowering the budget below unexpired dedup metadata already
        # stored by other workers. These markers must not be evicted for space.
        PerformanceFlushBatch.objects.bulk_create([PerformanceFlushBatch(id=uuid.uuid4().hex) for _ in range(512)])
        protected = set(PerformanceFlushBatch.objects.values_list('pk', flat=True))
        result = persist([self.event()], uuid.uuid4().hex)
        self.assertEqual(result['rejected_events'], 1)
        self.assertEqual(PerformanceBucket.objects.count(), 0)
        self.assertEqual(PerformanceSample.objects.count(), 0)
        checkpoint_inflight([dict(id='live', started=1, generation=1)])
        save_database_snapshot({'status': 'enabled', 'rows': []})
        self.assertFalse(PerformanceInflight.objects.exists())
        self.assertFalse(DatabaseStatSnapshot.objects.exists())
        self.assertTrue(maintain()['limited'])
        self.assertEqual(set(PerformanceFlushBatch.objects.values_list('pk', flat=True)), protected)
