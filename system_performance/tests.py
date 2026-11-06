"""Pure/unit tests; no connection to any database or user runtime directories."""
import asyncio
import io
import json
import os
import unittest
import queue
import threading
import zipfile
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'system_performance.test_settings')
import django
django.setup()

from . import collector
from .instrumentation import CURRENT, operation, sql_wrapper
from .metrics import DEFAULT_POLICY, distribution, percentile, summarize
from .safety import sql_identity
from .database import snapshot_delta
from .operations import monitored_model
from .reports import make_bundle, associated_errors
from .middleware import PerformanceMiddleware
from .queries import baseline
from django.http import StreamingHttpResponse, HttpResponse


class MetricTests(unittest.TestCase):
    def test_management_commands_do_not_install_http_hooks(self):
        import sys
        from .apps import PerformanceConfig, is_capture_process
        config = PerformanceConfig('system_performance', sys.modules['system_performance'])
        for command in ('migrate', 'test', 'shell', 'collectstatic'):
            with patch.object(sys, 'argv', ['manage.py', command]), patch('system_performance.http.install') as install, patch('system_performance.collector.start') as start:
                config.ready()
                install.assert_not_called()
                start.assert_not_called()
        with patch.dict(os.environ, {'ODOC_ENABLE_PERFORMANCE_WORKER': 'true', 'RUN_MAIN': ''}):
            with patch.object(sys, 'argv', ['manage.py', 'runserver']):
                self.assertFalse(is_capture_process())
            with patch.object(sys, 'argv', ['manage.py', 'runserver', '--noreload']):
                self.assertTrue(is_capture_process())
            with patch.object(sys, 'argv', ['/env/lib/gunicorn/__main__.py']):
                self.assertTrue(is_capture_process())

    def test_project_path_cache_includes_negative_results_and_is_bounded(self):
        from .safety import _project_path, ROOT, Path
        _project_path.cache_clear()
        resolve = Path.resolve
        try:
            with patch('system_performance.safety.Path.resolve', autospec=True, side_effect=resolve) as calls:
                for _ in range(2):
                    self.assertEqual(_project_path(str(ROOT / 'article/views.py')), 'article/views.py')
                    self.assertIsNone(_project_path('/tmp/not-a-project-file.py'))
                self.assertEqual(calls.call_count, 2)
            self.assertEqual(_project_path.cache_info().maxsize, 4096)
        finally:
            _project_path.cache_clear()

    def test_histogram_schema_changes_do_not_shift_legacy_percentiles(self):
        from . import metrics
        row = dict(count=1, errors=0, slow=0, total_ms=15, max_ms=15, histogram=distribution([15]), sql_count=0, sql_ms=0)
        with patch.object(metrics, 'BOUNDS', [5, 10, 20]):
            result = summarize([row])
        self.assertEqual(result['p95'], {'lower_ms': 10, 'upper_ms': 20})
        self.assertEqual(result['histogram_status'], 'available')
        old = {**row, 'dimensions': {'histogram_schema': {'version': 1, 'bounds': [10, 20]}}, 'histogram': [0, 1, 0]}
        new = {**row, 'dimensions': {'histogram_schema': {'version': 1, 'bounds': [5, 10, 20]}}, 'histogram': [0, 0, 1, 0]}
        result = summarize([old, new])
        self.assertEqual(result['count'], 2)
        self.assertEqual(result['total_ms'], 30)
        self.assertIsNone(result['p95'])
        self.assertEqual(result['histogram_status'], 'incompatible')
        self.assertEqual(summarize([{**row, 'histogram': []}])['histogram_status'], 'invalid')

    def test_all_performance_models_excluded_in_both_sync_directions(self):
        from django.apps import apps
        from utils.sync_models import SnapshotModels
        from system_settings.sync_state import LOCAL_ONLY_MODEL_LABELS
        models = list(apps.get_app_config('system_performance').get_models())
        self.assertTrue(all(model._meta.label_lower in LOCAL_ONLY_MODEL_LABELS for model in models))
        selection = SnapshotModels(['system_performance'])
        self.assertFalse(any(model._meta.app_label == 'system_performance' for model in selection.iter_target_models()))
        incoming = [{'model': model._meta.label_lower, 'pk': '1', 'fields': {}} for model in models]
        self.assertEqual(selection.drop_local_only_settings(incoming), [])

    def test_aggregated_log_representative_is_not_exported_as_current_request(self):
        fake_path = SimpleNamespace(exists=lambda: True, as_uri=lambda: 'file:///not-used/events.sqlite3')
        class Directory:
            def __truediv__(self, name):
                return fake_path
        representative = dict(request_id='other-request', task_id='other-task', duration_ms=9999,
                              error_type='http_502', exception_class='ConnectionError', occurrence_count=2,
                              first_seen=1, last_seen=2)
        with patch('system_logs.store.directory', return_value=Directory()), patch('system_performance.reports.sqlite3.connect') as connect:
            connect.return_value.__enter__.return_value.execute.return_value.fetchall.return_value = [('aggregate', json.dumps(representative))]
            result = associated_errors({'request_id': 'target-request'})
        self.assertEqual(result['status'], 'matched')
        self.assertEqual(result['rows'][0]['occurrence_count'], 2)
        for field in ('request_id', 'task_id', 'duration_ms'):
            self.assertNotIn(field, result['rows'][0])
        self.assertNotIn('other-request', json.dumps(result))

    def test_merge_percentiles_from_distribution_not_average(self):
        self.assertEqual(percentile(distribution([1] * 99 + [10000]), .95), {'lower_ms': 0, 'upper_ms': 1})
        self.assertIsNone(percentile(distribution([]), .95))
        self.assertIsNone(percentile(distribution([99999999]), .99)['upper_ms'])

    def test_sql_literals_never_retained(self):
        for query in ["SELECT 'PRIVATE_MARKER'", 'SELECT $$PRIVATE_MARKER$$', '/* PRIVATE_MARKER */ SELECT 123', 'SELECT %(PRIVATE_MARKER)s']:
            projected = sql_identity(query)
            self.assertNotIn('PRIVATE_MARKER', json.dumps(projected))
            self.assertIsNone(projected['template'])
        self.assertEqual(sql_identity('SELECT 1')['fingerprint'], sql_identity('SELECT 2')['fingerprint'])

    def test_database_reset_and_gap_do_not_produce_false_deltas(self):
        old = dict(status='enabled', sampled_at=100, epoch=['a'], rows=[dict(identity='q', calls=10, total_ms=100)])
        new = dict(status='enabled', sampled_at=160, epoch=['a'], rows=[dict(identity='q', calls=12, total_ms=140, mean_ms=0, max_ms=100)])
        result = snapshot_delta(old, new)
        self.assertEqual(result['interval_rows'][0]['calls'], 2)
        self.assertEqual(result['interval_rows'][0]['mean_ms'], 20)
        self.assertIsNone(result['interval_rows'][0]['max_ms'])
        self.assertTrue(snapshot_delta(old, {**new, 'epoch': ['b']})['gap'])
        self.assertTrue(snapshot_delta(old, {**new, 'sampled_at': 240})['gap'])
        self.assertEqual(snapshot_delta(old, {**new, 'rows': []})['interval_rows'], [])

    def test_baseline_error_denominator_includes_all_results(self):
        def row(status, count, errors):
            return dict(dimensions=dict(kind='request', operation='route', build={}, policy_version=1, status=status),
                        count=count, errors=errors, slow=0, total_ms=count, max_ms=1, histogram=distribution([1] * count), sql_count=0, sql_ms=0)
        event = dict(started=100000, kind='request', operation='route', build={}, policy_version=1, status='success')
        with patch('system_performance.queries.buckets', return_value=([row('success', 9, 0), row('failed', 1, 1)], False)):
            data = baseline(event)
        self.assertEqual(data['duration_comparison']['count'], 9)
        self.assertEqual(data['all_results']['count'], 10)
        self.assertEqual(data['all_results']['error_ratio'], .1)


class InstrumentationTests(unittest.TestCase):
    def setUp(self):
        self.previous = collector.policy()
        collector.configure({**DEFAULT_POLICY, 'enabled': True, 'version': 1, 'generation': 1})
        self.events = []
        self.capture = patch('system_performance.collector.submit', side_effect=lambda event: self.events.append(json.loads(json.dumps(event))))
        self.capture.start()

    def tearDown(self):
        self.capture.stop()
        collector.configure(self.previous)
        self.assertIsNone(CURRENT.get())

    def test_nested_sql_counts_and_context_restore(self):
        with operation('task', 'root') as root:
            with operation('ai', 'child') as child:
                value = sql_wrapper(lambda *args: 42, 'SELECT 1', (), False, {})
                self.assertEqual(value, 42)
                self.assertEqual(root['sql_count'], 1)
                self.assertEqual(child['sql_count'], 1)
        self.assertEqual([row['kind'] for row in self.events], ['sql', 'ai', 'task'])
        self.assertEqual([row['kind'] for row in self.events[-1]['children']], ['ai', 'sql'])

    def test_inflight_registry_releases_completed_operations(self):
        with operation('task', 'running') as event:
            self.assertTrue(any(item['id'] == event['id'] for item in collector.live_snapshot()))
        self.assertFalse(any(item['id'] == event['id'] for item in collector.live_snapshot()))

    def test_generator_does_not_leak_context_and_closes_original(self):
        closed = []
        @monitored_model
        def generate():
            try:
                self.assertEqual(CURRENT.get()['kind'], 'ai')
                yield 'text'
                yield 'tail'
            finally:
                closed.append(True)
        iterator = generate()
        self.assertEqual(next(iterator), 'text')
        self.assertIsNone(CURRENT.get())
        iterator.close()
        self.assertEqual(closed, [True])
        self.assertEqual(self.events[0]['status'], 'cancelled')

    def test_sync_stream_finish_once_and_preserve_chunks(self):
        response = StreamingHttpResponse(iter([b'a', b'b']))
        middleware = PerformanceMiddleware(lambda request: response)
        request = SimpleNamespace(path='/api/example/', method='GET', resolver_match=None)
        result = middleware(request)
        self.assertEqual(list(result.streaming_content), [b'a', b'b'])
        result.close()
        streams = [event for event in self.events if event['kind'] == 'stream']
        self.assertEqual(len(streams), 1)
        self.assertEqual(streams[0]['status'], 'success')

    def test_async_stream_preserves_context_per_iteration(self):
        async def source():
            self.assertEqual(CURRENT.get()['kind'], 'stream')
            yield b'a'
        response = StreamingHttpResponse(source())
        result = PerformanceMiddleware(lambda request: response)(SimpleNamespace(path='/api/example/', method='GET', resolver_match=None))
        async def collect():
            output = []
            async for chunk in result.streaming_content:
                self.assertIsNone(CURRENT.get())
                output.append(chunk)
            return output
        self.assertEqual(asyncio.run(collect()), [b'a'])
        result.close()
        self.assertEqual(len([e for e in self.events if e['kind'] == 'stream']), 1)

    def test_async_early_close_reaches_original_and_finishes_once(self):
        closed = []
        async def source():
            try:
                yield 'first'
                yield 'second'
            finally:
                closed.append(CURRENT.get()['kind'])
        response = StreamingHttpResponse(source())
        result = PerformanceMiddleware(lambda request: response)(SimpleNamespace(path='/api/example/', method='GET', resolver_match=None))
        async def consume():
            self.assertEqual(await anext(result._iterator), b'first')
            await result._iterator.aclose()
            self.assertEqual(closed, ['stream'])
            with self.assertRaises(StopAsyncIteration):
                await anext(result._iterator)
        asyncio.run(consume())
        result.close()
        self.assertEqual(len(self.events), 1)
        self.assertEqual(self.events[0]['status'], 'cancelled')

    def test_async_response_close_and_unstarted_close_release_content(self):
        for consume_first in (False, True):
            closed = []
            class Source:
                def __aiter__(self):
                    return self
                async def __anext__(self):
                    return 'value'
                async def aclose(self):
                    closed.append(True)
            response = StreamingHttpResponse(Source())
            result = PerformanceMiddleware(lambda request: response)(SimpleNamespace(path='/api/example/', method='GET', resolver_match=None))
            async def consume():
                if consume_first:
                    self.assertEqual(await anext(result._iterator), b'value')
                result.close()
                await asyncio.sleep(0)
                self.assertEqual(closed, [True])
            asyncio.run(consume())
        self.assertEqual(len(self.events), 2)

    def test_sync_early_close_runs_cleanup_in_context(self):
        closed = []
        def source():
            try:
                yield 'first'
                yield 'second'
            finally:
                closed.append(CURRENT.get()['kind'])
        response = StreamingHttpResponse(source())
        result = PerformanceMiddleware(lambda request: response)(SimpleNamespace(path='/api/example/', method='GET', resolver_match=None))
        self.assertEqual(next(result._iterator), b'first')
        result.close()
        self.assertEqual(closed, ['stream'])
        self.assertEqual(len(self.events), 1)
        self.assertEqual(self.events[0]['status'], 'cancelled')

    def test_async_response_close_from_thread_runs_on_owner_loop(self):
        closed_on = []
        async def source():
            try:
                yield 'first'
                yield 'second'
            finally:
                closed_on.append(threading.get_ident())
        response = StreamingHttpResponse(source())
        result = PerformanceMiddleware(lambda request: response)(SimpleNamespace(path='/api/example/', method='GET', resolver_match=None))
        async def consume():
            owner = threading.get_ident()
            await anext(result._iterator)
            await asyncio.to_thread(result.close)
            self.assertEqual(closed_on, [owner])
        asyncio.run(consume())
        self.assertEqual(len(self.events), 1)

    def test_async_cleanup_error_does_not_replace_original_stream_error(self):
        class Source:
            def __aiter__(self):
                return self
            async def __anext__(self):
                raise ValueError('original stream failure')
            async def aclose(self):
                raise RuntimeError('cleanup failure')
        response = StreamingHttpResponse(Source())
        result = PerformanceMiddleware(lambda request: response)(SimpleNamespace(path='/api/example/', method='GET', resolver_match=None))
        async def consume():
            with self.assertRaisesRegex(ValueError, 'original stream failure'):
                await anext(result._iterator)
        with self.assertLogs('system_performance.streams', level='WARNING'):
            asyncio.run(consume())
        result.close()
        self.assertEqual(len(self.events), 1)
        self.assertEqual(self.events[0]['status'], 'failed')

    def test_failure_preserved_and_performance_api_excluded(self):
        with self.assertRaisesRegex(ValueError, 'expected'):
            with operation('task', 'bad'):
                raise ValueError('expected')
        self.assertEqual(self.events[0]['status'], 'failed')
        self.events.clear()
        result = PerformanceMiddleware(lambda request: HttpResponse())(SimpleNamespace(path='/api/system/performance/overview/', method='GET'))
        self.assertEqual(result.status_code, 200)
        self.assertEqual(self.events, [])

    def test_disabled_does_not_capture(self):
        collector.configure({**collector.policy(), 'enabled': False})
        with operation('task', 'off') as event:
            self.assertIsNone(event)
        self.assertEqual(self.events, [])

    def test_report_zip_is_self_contained_and_checksums_agree(self):
        with operation('task', 'report'):
            pass
        event = self.events[0]
        bundle = make_bundle(event, {}, {'status': 'not_found', 'rows': []})
        import hashlib
        with zipfile.ZipFile(io.BytesIO(bundle)) as archive:
            self.assertEqual(set(archive.namelist()), {'report.md', 'evidence.json', 'manifest.json'})
            manifest = json.loads(archive.read('manifest.json'))
            for name, checksum in manifest['files'].items():
                self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), checksum)
            evidence = json.loads(archive.read('evidence.json'))
            self.assertEqual(evidence['reportVersion'], 1)
            self.assertEqual(evidence['event']['id'], event['id'])
            self.assertLess(sum(info.file_size for info in archive.infolist()), 2 * 1024 * 1024)


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.state = patch.multiple(collector, _queue=queue.Queue(maxsize=2048), _bytes=0,
            _lock=threading.Lock(), _stop=threading.Event(), _wake=threading.Event(), _live={},
            _runtime_server=False, _thread=None, _policy={**DEFAULT_POLICY, 'version': 1, 'generation': 1},
            _health=dict(dropped=0, discarded_samples=0, failed_batches=0, last_flush=None, error=None))
        self.state.start()
        self.addCleanup(self.state.stop)

    def run_writer(self, on_persist, exercise):
        from contextlib import ExitStack
        from django.db import connections
        with ExitStack() as patches:
            patches.enter_context(patch('system_performance.storage.load_policy', return_value=collector.policy()))
            patches.enter_context(patch('system_performance.storage.persist', side_effect=on_persist))
            patches.enter_context(patch('system_performance.storage.maintain', return_value={'limited': False}))
            patches.enter_context(patch('system_performance.storage.checkpoint_inflight'))
            patches.enter_context(patch('system_performance.database.sample_database'))
            patches.enter_context(patch('django.db.close_old_connections'))
            patches.enter_context(patch.object(connections, 'close_all'))
            worker = threading.Thread(target=collector._run)
            worker.start()
            try:
                exercise(worker)
            finally:
                collector._stop.set()
                collector._wake.set()
                worker.join(timeout=2)
                self.assertFalse(worker.is_alive(), 'No test writer may survive teardown')

    def test_backlog_drains_without_five_second_per_batch_sleep(self):
        seen = []
        for i in range(1000):
            collector.submit({'id': str(i)})
        def persist(rows, batch_id):
            seen.extend(row['id'] for row in rows)
            if len(seen) == 1000:
                collector._stop.set()
                collector._wake.set()
        def exercise(worker):
            worker.join(timeout=2)
            self.assertFalse(worker.is_alive(), 'Healthy storage should not throttle 1000 queued events to 40/s')
            self.assertEqual(len(set(seen)), 1000)
            self.assertEqual(collector.health()['dropped'], 0)
        self.run_writer(persist, exercise)

    def test_full_batch_wakes_idle_writer(self):
        waiting, written = threading.Event(), threading.Event()
        original_wait = collector._wake.wait
        def wait(timeout):
            waiting.set()
            return original_wait(timeout)
        def persist(rows, batch_id):
            self.assertEqual(len(rows), 200)
            written.set()
        def exercise(worker):
            self.assertTrue(waiting.wait(timeout=2))
            for i in range(200):
                collector.submit({'id': str(i)})
            self.assertTrue(written.wait(timeout=2), 'Batch-full must wake the writer before the 5s timer')
        with patch.object(collector._wake, 'wait', side_effect=wait):
            self.run_writer(persist, exercise)

    def test_heartbeat_lock_timeout_does_not_pause_or_count_a_failed_batch(self):
        from psycopg.errors import LockNotAvailable
        collector.configure({**collector.policy(), 'enabled': True})
        collector.track({'id': 'live', 'kind': 'task', 'started': 1})
        def checkpoint(_):
            collector._stop.set(); collector._wake.set()
            raise LockNotAvailable('test-only message')
        from django.db import connections
        with patch('system_performance.storage.load_policy', return_value=collector.policy()), \
             patch('system_performance.storage.checkpoint_inflight', side_effect=checkpoint), \
             patch('system_performance.storage.maintain', return_value={'limited': False}), \
             patch('system_performance.database.sample_database'), patch('django.db.close_old_connections'), \
             patch.object(connections, 'close_all'), self.assertLogs('system_performance.collector', level='WARNING'):
            collector._run()
        self.assertTrue(collector.policy()['enabled'])
        self.assertEqual(collector.health()['failed_batches'], 0)
        self.assertEqual(collector.health()['heartbeat_errors'], 1)
        self.assertEqual(collector.health()['heartbeat_error'], 'lock_contention')

    def test_empty_heartbeat_does_not_touch_storage(self):
        from .storage import checkpoint_inflight
        with patch('system_performance.storage.transaction.atomic') as atomic:
            checkpoint_inflight([])
            atomic.assert_not_called()

    def test_maintenance_contention_does_not_disable_collection(self):
        from psycopg.errors import LockNotAvailable
        from django.db import connections
        collector.configure({**collector.policy(), 'enabled': True})
        def maintain():
            collector._stop.set(); collector._wake.set()
            raise LockNotAvailable()
        with patch('system_performance.storage.load_policy', return_value=collector.policy()), \
             patch('system_performance.storage.checkpoint_inflight') as heartbeat, \
             patch('system_performance.storage.maintain', side_effect=maintain), \
             patch('system_performance.database.sample_database'), patch('django.db.close_old_connections'), \
             patch.object(connections, 'close_all'), self.assertLogs('system_performance.collector', level='WARNING'):
            collector._run()
        heartbeat.assert_not_called()
        self.assertTrue(collector.policy()['enabled'])
        self.assertEqual(collector.health()['maintenance_error'], 'lock_contention')
        self.assertEqual(collector.health()['failed_batches'], 0)

    def test_only_repeated_write_failures_temporarily_pause_capture(self):
        collector.configure({**collector.policy(), 'enabled': True})
        collector.submit({'id': 'initial'})
        failures = []
        def persist(rows, batch_id):
            failures.append(batch_id)
            if len(failures) == 3:
                collector._stop.set(); collector._wake.set()
            raise RuntimeError('test-only')
        def wait(timeout):
            if timeout == 5 and len(failures) < 3:
                self.assertTrue(collector.policy()['enabled'])
                collector.submit({'id': str(len(failures))})
        with patch.object(collector._stop, 'wait', side_effect=wait), self.assertLogs('system_performance.collector', level='WARNING'):
            self.run_writer(persist, lambda worker: worker.join(timeout=2))
        self.assertEqual(len(failures), 3)
        self.assertFalse(collector.policy()['enabled'])
        self.assertEqual(collector.health()['consecutive_write_failures'], 3)
        self.assertEqual(collector.health()['failed_batches'], 3)

    def test_failed_batch_total_survives_a_successful_retry_cycle(self):
        from .failures import error_kind
        from psycopg.errors import LockNotAvailable
        self.assertEqual(error_kind(LockNotAvailable()), 'lock_contention')
        with patch('system_performance.collector.logger.warning'):
            collector._record_failure('write', RuntimeError())
        collector._health['failed_batches'] = 2
        collector._health['consecutive_write_failures'] = 2
        collector.submit({'id': 'after-error'})
        def persist(rows, batch_id):
            collector._stop.set(); collector._wake.set()
        self.run_writer(persist, lambda worker: worker.join(timeout=2))
        self.assertEqual(collector.health()['failed_batches'], 2)
        self.assertEqual(collector.health()['consecutive_write_failures'], 0)
        self.assertIsNone(collector.health()['write_error'])


if __name__ == '__main__':
    unittest.main()
