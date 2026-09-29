from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from system_logs.capture import request_context
from .grsai_images import GrsaiImageClient, GrsaiImageError


@override_settings(SYSTEM_LOG_ENABLED=True)
class GrsaiDiagnosticsTests(SimpleTestCase):
    def setUp(self):
        self.model = SimpleNamespace(pk='selected-model', type='image_generation', name='gpt-image-2.5',
            provider=SimpleNamespace(type='Grsai', api_key='sk-private-key', base_url='https://example.invalid/v1'))
        self.events = []
        self.context = request_context.set({'task_id': 'local-task', 'image_request_id': 'travel:trip:1',
                                           'agent_id': 'agent'})
        self.capture = patch('system_logs.capture.start',
                             return_value=SimpleNamespace(put_nowait=self.events.append))
        self.capture.start()

    def tearDown(self):
        self.capture.stop()
        request_context.reset(self.context)

    def test_failed_result_records_real_http_and_business_status_separately(self):
        response = SimpleNamespace(status_code=200, json=lambda: {'id': 'provider-task', 'status': 'failed',
            'error': {'code': 'upstream_error', 'message': 'upstream error private prompt sk-secret'},
            'prompt': 'private prompt', 'images': ['private image']})
        with patch('system_settings.grsai_images.requests.request', return_value=response), self.assertRaises(GrsaiImageError):
            GrsaiImageClient(self.model).get_result('provider-task')
        event = self.events[0]
        self.assertEqual(event['error_type'], 'provider_task_failed')
        self.assertEqual(event['http_status'], 200)
        self.assertEqual(event['provider_http_status'], 200)
        self.assertEqual(event['business_status'], 422)
        self.assertEqual(event['provider_code'], 'upstream_error')
        self.assertEqual(event['model_name'], 'gpt-image-2.5')
        self.assertEqual(event['model_id'], 'selected-model')
        self.assertEqual(event['provider_task_id'], 'provider-task')
        self.assertEqual(event['provider_task_status'], 'failed')
        self.assertEqual(event['task_id'], 'local-task')
        self.assertEqual(event['provider_endpoint'], 'GET /v1/api/result')
        self.assertNotIn('private prompt', str(event))
        self.assertNotIn('sk-secret', str(event))
        self.assertEqual(request_context.get().get('model_id'), None)

    def test_unknown_failure_does_not_blame_prompt_or_expose_message(self):
        response = SimpleNamespace(status_code=200, json=lambda: {'id': 'provider-task', 'status': 'failed',
            'failure_reason': 'private input content sk-secret'})
        with patch('system_settings.grsai_images.requests.request', return_value=response), self.assertRaises(GrsaiImageError) as caught:
            GrsaiImageClient(self.model).get_result('provider-task')
        self.assertNotIn('调整提示词', str(caught.exception))
        self.assertIn('未提供可识别', self.events[0]['reason'])
        self.assertNotIn('private input', str(self.events))

    def test_http_error_records_provider_code_without_body(self):
        response = SimpleNamespace(status_code=400, json=lambda: {'error': {
            'code': 'invalid_parameter', 'message': 'private prompt sk-secret'}})
        with patch('system_settings.grsai_images.requests.request', return_value=response), self.assertRaises(GrsaiImageError):
            GrsaiImageClient(self.model).generate('private prompt')
        self.assertEqual(self.events[0]['provider_http_status'], 400)
        self.assertEqual(self.events[0]['provider_code'], 'invalid_parameter')
        self.assertEqual(self.events[0]['reference_image_count'], 0)
        self.assertNotIn('private prompt', str(self.events))
