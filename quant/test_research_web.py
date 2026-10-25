"""Network is always fake; acquisition persists only in the isolated test database."""
import json
import socket
import time
from unittest.mock import Mock, patch
from django.test import SimpleTestCase, TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from anthology.models import Anthology
from system_settings.models import AIModel, AIProvider, SystemSetting
from utils.sync_manager import SyncManager, SyncError
from quant.models import AIRun, ResearchReport, SourceRevision
from quant.worker import execute
from quant.sync import metadata, validate
from quant.test_research_analysis import result
from quant.research.contracts import digest
from quant.research.web_source import SourceFetchError, public_target, download, fetch_source, PinnedHTTP


def addresses(host, port, **kwargs):
    ip = '127.0.0.1' if host == '127.0.0.1' else '93.184.216.34'
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, '', (ip, port))]


class Reply:
    def __init__(self, body=b'hello', status=200, **headers):
        self.body, self.status = body, status
        self.headers = {'Content-Type': 'text/plain', **headers}

    def getheader(self, name, default=None):
        return self.headers.get(name, default)

    def read1(self, size):
        chunk, self.body = self.body[:size], self.body[size:]
        return chunk

    def close(self):
        pass


class FetchTransportTests(SimpleTestCase):
    def setUp(self):
        self.dns = patch('quant.research.web_source.socket.getaddrinfo', side_effect=addresses)
        self.dns.start()
        self.addCleanup(self.dns.stop)
        self.connection = Mock()
        self.transport = patch('quant.research.web_source.PinnedHTTP', return_value=self.connection)
        self.factory = self.transport.start()
        self.addCleanup(self.transport.stop)

    def test_public_address_is_pinned_and_credentials_never_sent(self):
        self.connection.getresponse.return_value = Reply(b'source')
        url, body, _ = download('https://example.com/指标?q=1')
        self.assertEqual(body, b'source')
        self.assertEqual(self.factory.call_args.args[:3], ('example.com', 443, '93.184.216.34'))
        args = self.connection.request.call_args
        self.assertIn('%E6%8C%87', args.args[1])
        self.assertNotIn('Cookie', args.kwargs['headers'])
        self.assertNotIn('Authorization', args.kwargs['headers'])
        self.connection.close.assert_called()

    def test_rejects_private_redirect_and_mixed_dns(self):
        self.connection.getresponse.return_value = Reply(status=302, Location='http://127.0.0.1/secret')
        with self.assertRaises(SourceFetchError):
            download('https://example.com/')
        self.assertEqual(self.factory.call_count, 1)
        with patch('quant.research.web_source.socket.getaddrinfo', return_value=addresses('example.com', 443) + addresses('127.0.0.1', 443)):
            with self.assertRaises(SourceFetchError):
                public_target('https://example.com/', time.monotonic() + 5)
        for url in ('file:///secret', 'https://user:password@example.com/', 'http://localhost/x', 'http://a.internal/x'):
            with self.assertRaises(SourceFetchError):
                public_target(url, time.monotonic() + 5)

    def test_limits_content_redirects_and_cancellation(self):
        for reply in (Reply(status=403), Reply(**{'Content-Type': 'application/pdf'}),
                      Reply(**{'Content-Length': str(3 * 1024 * 1024)}),
                      Reply(**{'Content-Encoding': 'gzip'})):
            self.connection.getresponse.return_value = reply
            with self.assertRaises(SourceFetchError):
                download('https://example.com/')
        self.connection.getresponse.return_value = Reply(b'x' * 21)
        with patch('quant.research.web_source.MAX_BYTES', 20), self.assertRaises(SourceFetchError):
            download('https://example.com/')
        self.connection.getresponse.return_value = Reply(status=302, Location='/again')
        with self.assertRaises(SourceFetchError):
            download('https://example.com/')
        with self.assertRaises(InterruptedError):
            download('https://example.com/', Mock(side_effect=InterruptedError()))

    def test_tls_verifies_original_hostname_on_pinned_socket(self):
        sock, context = Mock(), Mock()
        with patch('quant.research.web_source.socket.create_connection', return_value=sock) as connect, patch('quant.research.web_source.ssl.create_default_context', return_value=context):
            connection = PinnedHTTP('example.com', 443, '93.184.216.34', 5, True)
            connection.connect()
        connect.assert_called_once_with(('93.184.216.34', 443), 5)
        context.wrap_socket.assert_called_once_with(sock, server_hostname='example.com')

    def test_existing_proxy_setting_only_allows_hostname_fake_ip_range(self):
        fake = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('198.18.0.8', 443))]
        with patch('quant.research.web_source.socket.getaddrinfo', return_value=fake):
            with override_settings(WEB_IMPORT_ALLOW_PROXY_FAKE_IPS=False), self.assertRaises(SourceFetchError):
                public_target('https://example.com/', time.monotonic() + 5)
            with override_settings(WEB_IMPORT_ALLOW_PROXY_FAKE_IPS=True):
                self.assertEqual(public_target('https://example.com/', time.monotonic() + 5)[3], '198.18.0.8')
                with self.assertRaises(SourceFetchError):
                    public_target('https://198.18.0.8/', time.monotonic() + 5)

    def test_static_html_extracts_one_code_block_but_never_merges_alternatives(self):
        code = '//@version=5\nindicator("研究")\nlength = input.int(20)\nplot(ta.sma(close, length))'
        article = '<article><h1>公开指标研究</h1><p>' + '作者说明这是待验证的窗口指标。' * 20 + '</p><pre><code>' + code + '</code></pre></article>'
        with patch('quant.research.web_source.download', return_value=('https://example.com/', article.encode(), 'text/html')):
            parsed = fetch_source('https://example.com/')
        self.assertEqual(parsed['language'], 'pine')
        self.assertIn('input.int(20)', parsed['extracted_code'])
        article = article.replace('</article>', '<pre><code>def alternative(x): return x</code></pre></article>')
        with patch('quant.research.web_source.download', return_value=('https://example.com/', article.encode(), 'text/html')):
            self.assertEqual(fetch_source('https://example.com/')['extracted_code'], '')


class WebAcquisitionTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_superuser('admin', 'research@test.invalid', 'test')
        self.client = APIClient()
        self.client.force_authenticate(user)
        self.collection = Anthology.objects.create(type='quant', permission='private', user_id='admin', title='研究')
        provider = AIProvider.objects.create(name='测试', type='OpenAi', base_url='https://unused.invalid', api_key='fake')
        self.model = AIModel.objects.create(provider=provider, name='fake', type='chat')
        SystemSetting.objects.update_or_create(key='system_ai_config', defaults={'value': {'defaultChatModelId': self.model.pk}})
        self.fetch = patch('quant.research.acquisition.fetch_source', return_value=dict(final_url='https://example.com/final',
            web_markdown='def factor(close): return close.pct_change(20)', title='网页标题',
            extracted_code='def factor(close): return close.pct_change(20)', language='python',
            extraction_method='plain_text', extraction_confidence='unknown')).start()
        self.addCleanup(patch.stopall)

    def collect(self, **extra):
        response = self.client.post(f'/api/quant/{self.collection.pk}/intake/',
            dict(request_key='web_request_0000001', url='https://example.com/source', **extra), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return AIRun.objects.get()

    def test_url_analysis_records_exact_resolved_source_and_syncs(self):
        run = self.collect()
        original_id = run.source_id
        with patch('quant.worker.complete', return_value=json.dumps(result())) as model:
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(run.source_id, original_id)
        self.assertNotEqual(run.resolved_source_id, original_id)
        self.assertIn('pct_change', model.call_args_list[0].args[1])
        self.assertNotIn('pct_change', model.call_args_list[-1].args[1])
        self.assertEqual(model.call_args_list[0].args[1].count('def factor(close): return close.pct_change(20)'), 1)
        self.assertNotIn('origin_source_id', model.call_args.args[1])
        self.assertEqual(ResearchReport.objects.get().source_id, run.resolved_source_id)
        self.assertEqual(SourceRevision.objects.get(pk=original_id).payload['fetch_status'], 'not_fetched')
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(AIRun.objects.get().resolved_source.payload['final_url'], 'https://example.com/final')
        forged = next(row for row in snapshot if row['model'] == 'quant.sourcerevision' and row['pk'] == run.resolved_source_id)
        forged['fields']['payload']['origin_source_id'] = run.resolved_source_id
        forged['fields']['content_hash'] = digest(forged['fields']['payload'])
        with self.assertRaises(SyncError):
            validate(snapshot, metadata(snapshot))

    def test_resume_reuses_fetched_snapshot_without_fetching_again(self):
        old = self.collect()
        with patch('quant.worker.complete', side_effect=[json.dumps(result()), json.dumps(result()), RuntimeError]):
            execute(old.pk)
        old.refresh_from_db()
        self.assertEqual(old.status, 'failed')
        resolved_id = old.resolved_source_id
        self.fetch.reset_mock()
        response = self.client.post(f'/api/quant/{self.collection.pk}/entries/{old.entry_id}/runs/',
            dict(kind='analyze', source_id=old.source_id, model_id=self.model.pk,
                 resume_run_id=old.pk, request_key='web_resume_request_0001'), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        new = AIRun.objects.get(pk=response.data['data']['id'])
        with patch('quant.worker.complete', return_value=json.dumps(result())) as model:
            execute(new.pk)
        new.refresh_from_db()
        self.assertEqual(new.status, 'completed', new.error)
        self.assertEqual(new.resolved_source_id, resolved_id)
        self.assertEqual(model.call_count, 4)
        self.fetch.assert_not_called()
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_targeted_rerun_only_refetches_when_restarting_source_acquisition(self):
        old = self.collect()
        with patch('quant.worker.complete', return_value=json.dumps(result())):
            execute(old.pk)
        old.refresh_from_db()
        for stage, calls in [('plan', 1), ('normalize', 6)]:
            self.fetch.reset_mock()
            response = self.client.post(f'/api/quant/{self.collection.pk}/entries/{old.entry_id}/runs/',
                dict(kind='analyze', source_id=old.source_id, model_id=self.model.pk,
                     resume_run_id=old.pk, restart_stage=stage, request_key=f'web_restart_{stage}_0001'), format='json')
            self.assertEqual(response.status_code, 200, response.data)
            new = AIRun.objects.get(pk=response.data['data']['id'])
            with patch('quant.worker.complete', return_value=json.dumps(result())) as model:
                execute(new.pk)
            new.refresh_from_db()
            self.assertEqual(new.status, 'completed', new.error)
            self.assertEqual(model.call_count, calls)
            self.assertEqual(self.fetch.call_count, int(stage == 'normalize'))
            self.assertEqual(new.resolved_source_id == old.resolved_source_id, stage != 'normalize')
        self.assertEqual(ResearchReport.objects.count(), 3)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_failed_url_keeps_failure_snapshot_and_skips_model(self):
        run = self.collect()
        self.fetch.side_effect = SourceFetchError('登录限制，请粘贴正文')
        with patch('quant.worker.complete') as model:
            execute(run.pk)
        model.assert_not_called()
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')
        self.assertEqual(run.resolved_source.payload['fetch_status'], 'failed')
        self.assertIn('登录限制', run.error)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_submitted_code_survives_fetch_failure_and_still_analyzes(self):
        run = self.collect(code='def submitted(x): return x', description='我的关注点')
        self.fetch.side_effect = SourceFetchError('网页不可用')
        with patch('quant.worker.complete', return_value=json.dumps(result())):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(run.resolved_source.payload['code'], 'def submitted(x): return x')
        self.assertEqual(run.resolved_source.payload['description'], '我的关注点')
        self.assertEqual(run.resolved_source.payload['fetch_error'], '网页不可用')
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_cancellation_during_fetch_does_not_publish_a_source(self):
        run = self.collect()
        self.fetch.side_effect = InterruptedError('已取消')
        with patch('quant.worker.complete') as model:
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'interrupted')
        self.assertIsNone(run.resolved_source_id)
        self.assertEqual(SourceRevision.objects.count(), 1)
        model.assert_not_called()

    def test_reanalyzing_saved_web_snapshot_does_not_fetch_again(self):
        run = self.collect()
        with patch('quant.worker.complete', return_value=json.dumps(result())):
            execute(run.pk)
            run.refresh_from_db()
            queued = self.client.post(f'/api/quant/{self.collection.pk}/entries/{run.entry_id}/runs/',
                dict(kind='analyze', source_id=run.resolved_source_id, request_key='reanalyze_request_00001'), format='json')
            self.assertEqual(queued.status_code, 200, queued.data)
            execute(queued.data['data']['id'])
        self.assertEqual(self.fetch.call_count, 1)
        self.assertEqual(ResearchReport.objects.count(), 2)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
