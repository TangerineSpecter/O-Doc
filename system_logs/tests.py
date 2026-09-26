"""Diagnostics tests never initialize Django apps or touch user databases/media."""
import json
import logging
import multiprocessing
import sqlite3
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.conf import settings
if not settings.configured:
    settings.configure(USE_I18N=False, SECRET_KEY='diagnostic-test-only', REST_FRAMEWORK={}, SYSTEM_LOG_DIR='/invalid/test-only')

from . import store
from .capture import capture, exception_metadata, request_context, sanitize, DiagnosticHandler


def writer(root, index):
    settings.SYSTEM_LOG_DIR = root
    store.write({'id': uuid.uuid4().hex, 'created': time.time(), 'title': f'worker {index}', 'module': 'test', 'error_type': 'test'})


class IsolatedStore(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.override = patch.object(settings, 'SYSTEM_LOG_DIR', self.temp.name)
        self.override.start()
        self.outside = Path(self.temp.name).parent / f'log-untouched-{uuid.uuid4().hex}'
        self.outside.write_text('unchanged')

    def tearDown(self):
        self.assertEqual(self.outside.read_text(), 'unchanged')
        self.outside.unlink()
        self.override.stop()
        self.temp.cleanup()

    def event(self, **kwargs):
        return {'id': uuid.uuid4().hex, 'created': time.time(), 'title': '文章提交失败', 'module': 'article', 'error_type': 'http_502', **kwargs}



class StoreTests(IsolatedStore):
    def test_merge_independent_events_query_and_restart(self):
        original = self.event(fault_key='request:0', http_status=502)
        store.write(original)
        store.write(self.event(fault_key='request:0', operation='submit'))
        store.write(self.event(fault_key='another:0'))
        page = store.list_events({'q': '提交', 'module': 'article'})
        self.assertEqual(page['total'], 2)
        detail = store.detail(original['id'])
        self.assertEqual(detail['http_status'], 502)
        self.assertEqual(detail['operation'], 'submit')
        self.assertEqual(detail['captures'], 2)
        with store.connection() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM events').fetchone()[0], 2)

    def test_backend_diagnosis_wins_when_browser_arrives_first(self):
        browser = self.event(fault_key='request:0', source='frontend', error_type='http', title='浏览器操作异常')
        backend = self.event(fault_key='request:0', source='backend', exception_class='APIStatusError', provider_code='upstream_failure')
        store.write(browser); store.write(backend)
        detail = store.detail(browser['id'])
        self.assertEqual(detail['source'], 'backend')
        self.assertEqual(detail['error_type'], 'http_502')
        self.assertEqual(store.list_events({})['list'][0]['title'], backend['title'])
        self.assertEqual(detail['id'], browser['id'])

    def test_delete_reclaims_and_clear_idempotent(self):
        event = self.event(stack='x' * 500000)
        store.write(event)
        before = store.size()
        store.delete([event['id']])
        self.assertLess(store.size(), before)
        self.assertIsNone(store.detail(event['id']))
        store.delete([event['id']])
        store.delete()
        self.assertEqual(store.overview()['total'], 0)

    def test_retention_and_capacity(self):
        store.write(self.event(created=time.time() - 31 * 86400))
        self.assertEqual(store.overview()['total'], 0)
        store.set_policy(10, 1)
        for _ in range(8):
            store.write(self.event(stack='x' * 300000))
        self.assertLessEqual(store.size(), 1024 * 1024)
        self.assertEqual(store.overview()['policy'], {'days': 10, 'max_mb': 1})

    def test_concurrent_processes(self):
        # Fork inherits deliberately isolated settings; real application processes use the same lock protocol.
        context = multiprocessing.get_context('fork')
        processes = [context.Process(target=writer, args=(self.temp.name, n)) for n in range(4)]
        for process in processes: process.start()
        for process in processes:
            process.join(10)
            self.assertEqual(process.exitcode, 0)
        self.assertEqual(store.overview()['total'], 4)


class CaptureTests(unittest.TestCase):
    def test_provider_classification_and_no_body(self):
        class ProviderError(Exception): pass
        for status, expected in [(401, 'authentication'), (429, 'rate_limit'), (502, 'http_502')]:
            exc = ProviderError('prompt: private article sk-secret')
            exc.status_code = status
            exc.body = {'error': {'code': 'upstream_failure', 'message': 'private content'}}
            data = exception_metadata(exc)
            self.assertEqual(data['error_type'], expected)
            self.assertEqual(data['http_status'], status)
            self.assertNotIn('private', json.dumps(data))
        exc.body = {'error': {'code': 'insufficient_balance'}}
        self.assertEqual(exception_metadata(exc)['error_type'], 'insufficient_balance')
        self.assertEqual(exception_metadata(TimeoutError('private'))['error_type'], 'timeout')

    def test_sanitize_credentials(self):
        raw = 'api_key=sk-abcdef password=secret Authorization: Bearer abcdef https://user:pass@example.com?token=abcd'
        result = sanitize(raw)
        for value in ('sk-abcdef', 'abcdef', 'user:pass', 'token=abcd', 'password=secret'):
            self.assertNotIn(value, result)

    def test_fail_open_and_request_correlation(self):
        inbox = SimpleNamespace(put_nowait=lambda event: (_ for _ in ()).throw(RuntimeError()))
        with patch('system_logs.capture.start', return_value=inbox), patch('system_logs.capture._fallback'):
            capture('文章异常', exc=ValueError('private'))
        events = []
        token = request_context.set({'request_id': 'abc', 'operation': 'POST'})
        try:
            with patch('system_logs.capture.start', return_value=SimpleNamespace(put_nowait=events.append)):
                capture('异常', exc=ValueError('private'))
                handler = DiagnosticHandler()
                try: raise ValueError('private')
                except ValueError:
                    handler.emit(logging.LogRecord('article.views', logging.ERROR, '', 1, 'body private', (), None))
        finally: request_context.reset(token)
        self.assertEqual(events[0]['fault_key'], events[1]['fault_key'])
        self.assertNotIn('private', json.dumps(events))

    def test_cancel_and_broken_stderr_do_not_affect_business(self):
        from .capture import _fallback
        with patch('system_logs.capture.sys.stderr.write', side_effect=OSError()):
            _fallback()
        class Cancelled(Exception):
            status = 499
        with patch('system_logs.capture.start') as start:
            capture('用户停止任务', exc=Cancelled())
            start.assert_not_called()

    def test_model_stream_and_return_contract(self):
        from .ai import model_operation
        @model_operation
        def plain(): return 42
        @model_operation
        def stream():
            yield 'first'
            raise TimeoutError('private')
        with patch('system_logs.ai.capture') as collect:
            self.assertEqual(plain(), 42)
            iterator = stream()
            self.assertEqual(next(iterator), 'first')
            with self.assertRaises(TimeoutError): next(iterator)
            self.assertEqual(collect.call_count, 1)

    def test_permissions_export_validation(self):
        from .views import Administrator, render_event
        from .serializers import ReportSerializer, PolicySerializer, SelectionSerializer
        self.assertFalse(Administrator().has_permission(SimpleNamespace(user=SimpleNamespace(is_authenticated=True, is_superuser=False)), None))
        self.assertTrue(Administrator().has_permission(SimpleNamespace(user=SimpleNamespace(is_authenticated=True, is_superuser=True)), None))
        serializer = ReportSerializer(data={'event_id': 'a' * 32, 'module': 'frontend', 'error_type': 'runtime', 'path': '/article/1'})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertFalse(PolicySerializer(data={'days': 0, 'max_mb': -1}).is_valid())
        self.assertFalse(SelectionSerializer(data={'ids': ['../../user']}).is_valid())
        self.assertEqual(json.loads(render_event({'title': '文章异常'})), {'title': '文章异常'})


class ApiTests(IsolatedStore):
    def request(self, view, method='get', data=None, admin=True, **kwargs):
        from rest_framework.test import APIRequestFactory, force_authenticate
        factory = APIRequestFactory()
        request = getattr(factory, method)('/api/system/logs/', data or {}, format='json')
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True, is_superuser=admin, pk=17))
        response = view.as_view()(request, **kwargs)
        response.render() if hasattr(response, 'render') else None
        return response

    def test_api_permissions_list_detail_exports_and_delete(self):
        from .views import LogsView, DetailView, DownloadView, DeleteView, ClearView, OverviewView, PolicyView
        first, second = self.event(), self.event()
        store.write(first); store.write(second)
        self.assertEqual(self.request(LogsView, admin=False).status_code, 403)
        self.assertEqual(self.request(LogsView).data['data']['total'], 2)
        response = self.request(DetailView, event_id=first['id'])
        self.assertEqual(response.data['data']['id'], first['id'])
        text = self.request(DownloadView, 'post', {'ids': [first['id']]})
        self.assertEqual(json.loads(text.content)['id'], first['id'])
        archive = self.request(DownloadView, 'post', {'ids': [first['id'], second['id']]})
        import io, zipfile
        with zipfile.ZipFile(io.BytesIO(archive.content)) as bundle:
            self.assertEqual(len(bundle.namelist()), 2)
            self.assertEqual(json.loads(bundle.read(f"exception-{first['id']}.txt"))['title'], first['title'])
        self.assertEqual(self.request(DeleteView, 'post', {'ids': [first['id']]}).status_code, 200)
        self.assertEqual(self.request(DetailView, event_id=first['id']).status_code, 404)
        self.request(PolicyView, 'put', {'days': 10, 'max_mb': 2})
        self.assertEqual(self.request(OverviewView).data['data']['policy'], {'days': 10, 'max_mb': 2})
        self.request(ClearView, 'post')
        self.assertEqual(store.overview()['total'], 0)

    def test_report_authenticated_restricted_and_throttled(self):
        from .views import ReportView, ReportThrottle
        payload = {'event_id': 'c' * 32, 'module': 'frontend', 'error_type': 'runtime', 'stack': 'at app.ts:1'}
        with patch('system_logs.views.capture') as collect, patch.object(ReportThrottle, 'allow_request', return_value=True):
            self.assertEqual(self.request(ReportView, 'post', payload, admin=False).status_code, 200)
            self.assertEqual(collect.call_args.kwargs['user_id'], 17)
        with patch('system_logs.views.capture') as collect, patch.object(ReportThrottle, 'allow_request', return_value=True):
            camel = {'eventId': 'd' * 32, 'module': 'frontend', 'errorType': 'runtime'}
            self.assertEqual(self.request(ReportView, 'post', camel, admin=False).status_code, 200)
            oversized = {**payload, 'stack': 'x' * 70000}
            self.assertEqual(self.request(ReportView, 'post', oversized, admin=False).status_code, 400)
            self.assertEqual(collect.call_count, 1)
        with patch.object(ReportThrottle, 'allow_request', return_value=False), patch.object(ReportThrottle, 'wait', return_value=60):
            self.assertEqual(self.request(ReportView, 'post', payload, admin=False).status_code, 429)
        from rest_framework.test import APIRequestFactory
        from django.test import override_settings
        with override_settings(REST_FRAMEWORK={'UNAUTHENTICATED_USER': None, 'DEFAULT_AUTHENTICATION_CLASSES': []}):
            response = ReportView.as_view()(APIRequestFactory().post('/api/system/logs/report/', payload, format='json'))
            self.assertIn(response.status_code, (401, 403))

    def test_middleware_correlates_stream(self):
        from django.http import StreamingHttpResponse
        from .middleware import DiagnosticMiddleware
        request = SimpleNamespace(headers={'X-Request-ID': 'a' * 32}, path='/api/ai/chat/', method='POST')
        observed = []
        def stream():
            observed.append(request_context.get()['request_id'])
            yield b'first'
            raise TimeoutError()
        with patch('system_logs.middleware.capture') as collect:
            response = DiagnosticMiddleware(lambda request: StreamingHttpResponse(stream()))(request)
            self.assertEqual(response['X-Request-ID'], 'a' * 32)
            iterator = iter(response.streaming_content)
            self.assertEqual(next(iterator), b'first')
            with self.assertRaises(TimeoutError): next(iterator)
            self.assertEqual(observed, ['a' * 32])
            self.assertEqual(collect.call_count, 1)
        self.assertEqual(request_context.get(), {})


class ModelAttemptTests(unittest.TestCase):
    def test_bounded_retry_recovers_and_records_first_failure(self):
        import httpx
        from openai import APIStatusError
        from utils.bounded_completion import complete
        exc = APIStatusError('private prompt', response=httpx.Response(502, request=httpx.Request('POST', 'https://model.test')), body={'error': {'code': 'upstream_failure'}})
        config = {'provider_name': 'test', 'model_name': 'test-model', 'provider_type': 'OpenAi'}
        with patch('utils.bounded_completion._drive', side_effect=[exc, 'done']) as drive, patch('system_logs.capture.capture') as collect:
            self.assertEqual(complete(config, 'private article', json_output=False, max_tokens=100, extra_body={}), 'done')
            self.assertEqual(drive.call_count, 2)
            self.assertEqual(collect.call_count, 1)
            self.assertEqual(collect.call_args.kwargs['attempt'], 1)
            self.assertIs(collect.call_args.kwargs['exc'], exc)

    def test_bounded_timeout_no_retry(self):
        from utils.bounded_completion import complete
        with patch('utils.bounded_completion._drive', side_effect=TimeoutError('private')) as drive, patch('system_logs.capture.capture') as collect:
            with self.assertRaises(TimeoutError):
                complete({'provider_name': 'test', 'model_name': 'test'}, 'private article', json_output=False, max_tokens=100, extra_body={})
            self.assertEqual(drive.call_count, 1)
            self.assertEqual(collect.call_count, 1)

    def test_worker_context_ids_and_contract(self):
        from .context import diagnostic_operation
        seen = []
        @diagnostic_operation('agent_task')
        def operation(task, record):
            seen.append(dict(request_context.get()))
            return 42
        self.assertEqual(operation(SimpleNamespace(pk='task-1'), SimpleNamespace(pk='run-1')), 42)
        self.assertEqual(seen[0]['task_id'], 'task-1')
        self.assertEqual(seen[0]['run_id'], 'run-1')
        self.assertEqual(request_context.get(), {})


class DelayedDiagnosticCursor(sqlite3.Cursor):
    def fetchone(self):
        row = super().fetchone()
        # Hold both writers between their read and write; this exposed lost inserts/updates.
        time.sleep(.15)
        return row


class DelayedDiagnosticConnection(sqlite3.Connection):
    def execute(self, sql, parameters=()):
        if sql.startswith('SELECT id,detail FROM events WHERE fault_key='):
            return self.cursor(factory=DelayedDiagnosticCursor).execute(sql, parameters)
        return super().execute(sql, parameters)


def correlated_writer(root, barrier, result_queue, source):
    settings.SYSTEM_LOG_DIR = root
    with store.connection():
        pass
    original_connect = sqlite3.connect
    def delayed_connect(*args, **kwargs):
        return original_connect(*args, **kwargs, factory=DelayedDiagnosticConnection)
    event = {'id': uuid.uuid4().hex, 'created': time.time(), 'fault_key': 'shared-fault',
             'request_id': 'shared-request', 'module': 'ai', 'source': source,
             'title': source, 'error_type': 'http_401', 'http_status': 401,
             'provider_code': 'authentication_failed' if source == 'backend' else '',
             'user_id': 17 if source == 'frontend' else None}
    try:
        barrier.wait(timeout=5)
        with patch('system_logs.store.sqlite3.connect', delayed_connect):
            store.write(event)
        result_queue.put('ok')
    except Exception as exc:
        result_queue.put(f'{type(exc).__name__}: {exc}')


class ReviewRegressionTests(IsolatedStore):
    def test_provider_diagnosis_wins_in_either_arrival_order(self):
        for raw_first in (False, True):
            with self.subTest(raw_first=raw_first):
                store.delete()
                raw = self.event(fault_key='provider-fault', provider_http_status=401,
                                 http_status=401, error_type='http_401', title='upstream 401',
                                 reason='HTTP 401', source='backend')
                normalized = self.event(fault_key='provider-fault', exception_class='GrsaiImageError',
                                        http_status=502, error_type='http_502', title='normalized 502',
                                        reason='HTTP 502', stack='safe stack', source='backend')
                for event in ((raw, normalized) if raw_first else (normalized, raw)):
                    store.write(event)
                detail = store.detail(store.list_events({})['list'][0]['id'])
                self.assertEqual(detail['http_status'], 401)
                self.assertEqual(detail['error_type'], 'http_401')
                self.assertEqual(detail['title'], 'upstream 401')
                self.assertEqual(detail['reason'], 'HTTP 401')
                self.assertEqual(detail['stack'], 'safe stack')
                self.assertEqual(detail['captures'], 2)

    def test_parallel_correlated_inserts_and_updates_keep_both_captures(self):
        context = multiprocessing.get_context('fork')
        for existing in (False, True):
            with self.subTest(existing=existing):
                store.delete()
                if existing:
                    store.write(self.event(fault_key='shared-fault', source='frontend'))
                barrier, result_queue = context.Barrier(2), context.Queue()
                processes = [context.Process(target=correlated_writer,
                             args=(self.temp.name, barrier, result_queue, source))
                             for source in ('frontend', 'backend')]
                for process in processes:
                    process.start()
                for process in processes:
                    process.join(10)
                    if process.is_alive():
                        process.terminate()
                        process.join()
                        self.fail('Concurrent diagnostic write did not finish')
                    self.assertEqual(process.exitcode, 0)
                results = [result_queue.get(timeout=2) for _ in processes]
                result_queue.close()
                result_queue.join_thread()
                self.assertEqual(results, ['ok', 'ok'])
                rows = store.list_events({})
                self.assertEqual(rows['total'], 1)
                detail = store.detail(rows['list'][0]['id'])
                self.assertEqual(detail['captures'], 3 if existing else 2)
                self.assertEqual(detail['provider_code'], 'authentication_failed')
                self.assertEqual(detail['user_id'], 17)

    def test_separate_bounded_calls_in_same_task_keep_their_failures(self):
        from utils.bounded_completion import complete
        config = {'provider_name': 'test', 'model_name': 'test'}
        token = request_context.set({'request_id': 'a' * 32, 'task_id': 'task-1'})
        try:
            with patch('system_logs.capture.start', return_value=SimpleNamespace(put_nowait=store.write)), \
                    patch('utils.bounded_completion._drive', side_effect=[TimeoutError(), TimeoutError()]):
                for _ in range(2):
                    with self.assertRaises(TimeoutError):
                        complete(config, 'isolated placeholder', json_output=False, max_tokens=100, extra_body={})
        finally:
            request_context.reset(token)
        rows = store.list_events({})
        self.assertEqual(rows['total'], 2)
        details = [store.detail(row['id']) for row in rows['list']]
        self.assertEqual(len({detail['model_request_id'] for detail in details}), 2)
        self.assertEqual({detail['request_id'] for detail in details}, {'a' * 32})
        self.assertEqual({detail['task_id'] for detail in details}, {'task-1'})

    def test_plain_model_calls_are_independent_and_propagation_is_deduplicated(self):
        from .ai import model_operation
        @model_operation
        def failure():
            raise TimeoutError()
        token = request_context.set({'request_id': 'b' * 32})
        try:
            with patch('system_logs.capture.start', return_value=SimpleNamespace(put_nowait=store.write)):
                for _ in range(2):
                    try:
                        failure()
                    except TimeoutError as exc:
                        capture('外层业务捕获', exc=exc)
        finally:
            request_context.reset(token)
        rows = store.list_events({})
        self.assertEqual(rows['total'], 2)
        for row in rows['list']:
            self.assertEqual(store.detail(row['id'])['captures'], 2)

    def test_image_adapters_keep_upstream_http_status_after_normalization(self):
        import sys
        from contextlib import nullcontext
        fake_models = SimpleNamespace(AIModel=object, SystemSetting=object)
        with patch.dict(sys.modules, {'system_settings.models': fake_models}):
            from system_settings.grsai_images import GrsaiImageClient, GrsaiImageError
            from system_settings.newapi_images import NewApiImageClient
            for provider, client_class in (('Grsai', GrsaiImageClient), ('NewAPI', NewApiImageClient)):
                for status in (401, 403, 429, 500, 502):
                    with self.subTest(provider=provider, status=status):
                        model = SimpleNamespace(type='image_generation', name='test-model', provider=SimpleNamespace(
                            type=provider, api_key='mock-only', base_url='https://model.example/v1'))
                        response = SimpleNamespace(status_code=status)
                        token = request_context.set({'request_id': uuid.uuid4().hex})
                        try:
                            with patch('system_logs.capture.start', return_value=SimpleNamespace(put_nowait=store.write)), \
                                    patch('system_settings.grsai_images.requests.request', return_value=response), \
                                    patch('system_settings.newapi_images.requests.post', return_value=nullcontext(response)):
                                with self.assertRaises(GrsaiImageError) as raised:
                                    client_class(model).generate('isolated placeholder')
                                # Keep the original, safe user-facing exception contract unchanged.
                                expected = 400 if provider == 'Grsai' and status in (401, 403) else 502
                                self.assertEqual(raised.exception.status_code, expected)
                        finally:
                            request_context.reset(token)
                        row = store.list_events({})['list'][0]
                        detail = store.detail(row['id'])
                        self.assertEqual(detail['http_status'], status)
                        self.assertEqual(detail['error_type'], f'http_{status}')
                        self.assertIn(f'http_{status}', row['title'])
                        self.assertTrue(detail['stack'])
                        self.assertEqual(detail['captures'], 2)
                        store.delete()
