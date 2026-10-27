import json
import gzip
import io
import socket
import time
from unittest.mock import MagicMock, patch
from django.test import TestCase, SimpleTestCase
from quant import test_research_analysis as fixtures
from quant.connectors.mapping import map_response, render
from quant.models import ExternalResponse
from quant.sync import validate, metadata
from utils.sync_manager import SyncManager
from rest_framework.exceptions import ValidationError
from quant.connectors.transport import target


def configuration():
    return {'version': 1, 'method': 'POST', 'url': 'http://127.0.0.1:8600/research/backtest', 'timeout': 20,
        'headers': {'Authorization': 'Bearer {{secret.api_key}}'}, 'query': {'symbol': '{{symbol}}'},
        'body': {'params': '{{parameters}}'}, 'mappings': [
            {'target': 'metrics.total_return', 'source': '$.data.returnPct', 'type': 'number', 'scale': .01, 'required': True},
            {'target': 'parameters.N', 'source': '/data/Settings/N', 'type': 'number'},
            {'target': 'trades', 'source': '$.data.orders', 'type': 'array', 'fields': [
                {'target': 'price', 'source': '$.p', 'type': 'number'}, {'target': 'side', 'source': '$.direction', 'type': 'string'}]},
            {'target': 'metrics.sharpe', 'source': '$.data.sharpe', 'type': 'number'}]}


SAMPLE = {'data': {'returnPct': '12.5', 'Settings': {'N': 10}, 'orders': [{'p': '123.4', 'direction': 'buy'}]}}


class MappingTests(SimpleTestCase):
    def test_nested_response_arrays_literal_names_scale_and_missing_values(self):
        result, warnings = map_response(SAMPLE, configuration()['mappings'])
        self.assertEqual(result, {'metrics': {'total_return': .125, 'sharpe': None}, 'parameters': {'N': 10.0}, 'trades': [{'price': 123.4, 'side': 'buy'}]})
        self.assertTrue(warnings)
        self.assertEqual(render({'params': '{{parameters}}'}, {'parameters': {'N': 10}}), {'params': {'N': 10}})


class ConnectorTransportTests(SimpleTestCase):
    @staticmethod
    def addresses(*ips):
        return [(socket.AF_INET6 if ':' in ip else socket.AF_INET, socket.SOCK_STREAM, 6, '', (ip, 80)) for ip in ips]

    def test_rejects_encoded_mapped_and_mixed_metadata_destinations(self):
        for host, ips in [('2852039166', ('169.254.169.254',)),
                          ('metadata-alias.example', ('169.254.169.254',)),
                          ('mapped.example', ('::ffff:169.254.169.254',)),
                          ('nat64.example', ('64:ff9b::a9fe:a9fe',)),
                          ('v6-metadata.example', ('fd00:ec2::254',)),
                          ('other-metadata.example', ('100.100.100.200',)),
                          ('mixed.example', ('192.168.1.3', '169.254.169.254')),
                          ('invalid.example', ('::',)), ('multicast.example', ('224.0.0.1',))]:
            with self.subTest(host=host), patch('quant.connectors.transport.socket.getaddrinfo', return_value=self.addresses(*ips)):
                with self.assertRaises(ValidationError):
                    target(f'http://{host}/', time.monotonic() + 5)

    def test_safe_local_and_public_targets_are_pinned_without_second_dns_resolution(self):
        from quant.connectors.transport import open_connection
        for host, ip in [('localhost', '127.0.0.1'), ('private.example', '192.168.1.3'), ('example.com', '93.184.216.34')]:
            with self.subTest(host=host), patch('quant.connectors.transport.socket.getaddrinfo', return_value=self.addresses(ip)) as dns:
                connection = open_connection(f'https://{host}/', time.monotonic() + 5)
                self.assertEqual(connection.ip, ip)
                self.assertEqual(connection.host, host)
                self.assertTrue(connection.secure)
                dns.assert_called_once()

    def test_pin_retains_original_tls_identity(self):
        from quant.research.web_source import PinnedHTTP
        sock, context = MagicMock(), MagicMock()
        with patch('quant.research.web_source.socket.create_connection', return_value=sock) as connect, \
                patch('quant.research.web_source.ssl.create_default_context', return_value=context):
            PinnedHTTP('example.com', 443, '93.184.216.34', 5, True).connect()
        connect.assert_called_once_with(('93.184.216.34', 443), 5)
        context.wrap_socket.assert_called_once_with(sock, server_hostname='example.com')

    def test_zero_port_is_not_silently_replaced(self):
        with self.assertRaises(ValidationError), patch('quant.connectors.transport.socket.getaddrinfo') as dns:
            target('http://localhost:0/', time.monotonic() + 5)
        dns.assert_not_called()


class ConnectorTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp

    def test_config_preview_explicit_request_and_sync_without_local_secrets(self):
        path = f'/api/quant/{self.collection.pk}/connectors/'
        cfg = configuration()
        saved = self.client.post(path, {'name': '个人量化系统', 'config_json': json.dumps(cfg),
            'secrets_json': json.dumps({'api_key': 'test-only-local-key'})}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        identity = saved.json()['data']['id']
        context = {'symbol': 'SYNTHETIC', 'parameters': {'N': 10}}
        preview = self.client.post(path + identity + '/preview/', {'context_json': json.dumps(context), 'response_json': json.dumps(SAMPLE)}, format='json')
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(json.loads(preview.json()['data']['normalizedJson'])['metrics']['total_return'], .125)
        response = MagicMock(); response.status = 200
        response.getheader.return_value = 'identity'
        response.read1.side_effect = [json.dumps(SAMPLE).encode(), b'']
        connection = MagicMock(); connection.sock = None; connection.getresponse.return_value = response
        with patch('quant.connectors.services.open_connection', return_value=connection):
            called = self.client.post(path + identity + '/execute/', {'context_json': json.dumps(context)}, format='json')
        self.assertEqual(called.status_code, 200, called.data)
        request = connection.request.call_args
        self.assertEqual(json.loads(request.kwargs['body']), {'params': {'N': 10}})
        self.assertEqual(request.kwargs['headers']['Authorization'], 'Bearer test-only-local-key')
        self.assertEqual(request.args[1], '/research/backtest?symbol=SYNTHETIC')
        self.assertEqual(ExternalResponse.objects.count(), 1)
        snapshot = SyncManager().build_snapshot_data()
        self.assertNotIn('test-only-local-key', json.dumps(snapshot))
        self.assertFalse(any(r['model'] == 'quant.connectorsecret' for r in snapshot))
        validate(snapshot, metadata(snapshot))

    def test_metadata_dns_rejection_never_opens_socket_or_archives_response(self):
        path = f'/api/quant/{self.collection.pk}/connectors/'
        cfg = configuration() | {'url': 'http://2852039166/'}
        saved = self.client.post(path, {'name': '目标校验', 'config_json': json.dumps(cfg),
            'secrets_json': json.dumps({'api_key': 'test-only-local-key'})}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        identity = saved.json()['data']['id']
        addresses = ConnectorTransportTests.addresses('169.254.169.254')
        with patch('quant.connectors.transport.socket.getaddrinfo', return_value=addresses), \
                patch('quant.research.web_source.socket.create_connection') as connect:
            result = self.client.post(path + identity + '/execute/', {'context_json': '{"symbol":"TEST","parameters":{}}'}, format='json')
        self.assertEqual(result.status_code, 400)
        connect.assert_not_called()
        self.assertEqual(ExternalResponse.objects.count(), 0)

    def test_gzip_response_is_decoded_before_mapping(self):
        path = f'/api/quant/{self.collection.pk}/connectors/'
        saved = self.client.post(path, {'name': '压缩响应', 'config_json': json.dumps(configuration()),
            'secrets_json': json.dumps({'api_key': 'test-only-local-key'})}, format='json')
        identity = saved.json()['data']['id']
        encoded = io.BytesIO(gzip.compress(json.dumps(SAMPLE).encode()))
        response = MagicMock(); response.status = 200; response.getheader.return_value = 'gzip'
        response.read.side_effect = encoded.read
        connection = MagicMock(); connection.sock = None; connection.getresponse.return_value = response
        with patch('quant.connectors.services.open_connection', return_value=connection):
            result = self.client.post(path + identity + '/execute/', {'context_json': '{"symbol":"TEST","parameters":{}}'}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(ExternalResponse.objects.get().data['normalized']['metrics']['total_return'], .125)

    def test_redirect_and_oversized_compressed_response_are_not_archived(self):
        path = f'/api/quant/{self.collection.pk}/connectors/'
        saved = self.client.post(path, {'name': '响应边界', 'config_json': json.dumps(configuration()),
            'secrets_json': json.dumps({'api_key': 'test-only-local-key'})}, format='json')
        identity = saved.json()['data']['id']
        for kind in ('redirect', 'oversized'):
            with self.subTest(kind=kind):
                response = MagicMock(); response.status = 302 if kind == 'redirect' else 200
                response.getheader.return_value = 'gzip'
                encoded = io.BytesIO(gzip.compress(b'x' * (2 * 1024 * 1024 + 1)))
                response.read.side_effect = encoded.read
                connection = MagicMock(); connection.sock = None; connection.getresponse.return_value = response
                with patch('quant.connectors.services.open_connection', return_value=connection) as factory:
                    result = self.client.post(path + identity + '/execute/', {'context_json': '{"symbol":"TEST","parameters":{}}'}, format='json')
                self.assertEqual(result.status_code, 400)
                factory.assert_called_once()
                connection.close.assert_called_once()
                self.assertEqual(ExternalResponse.objects.count(), 0)
