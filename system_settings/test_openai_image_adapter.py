import base64
import json
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from system_settings.grsai_images import GrsaiImageError
from system_settings.newapi_images import compatible_image_client


class OpenAIImageAdapterTests(SimpleTestCase):
    def model(self, provider='OpenAi'):
        return SimpleNamespace(type='image_generation', name='gpt-image-2.5-flare', provider=SimpleNamespace(
            type=provider, api_key='fake-key', base_url='https://api.openai.com/v1'))

    def test_text_generation_uses_images_endpoint_and_decodes_response(self):
        encoded = base64.b64encode(b'image-bytes').decode()
        response = SimpleNamespace(status_code=200, iter_content=lambda chunk_size: [json.dumps({'data': [{'b64_json': encoded}]}).encode()])
        with patch('system_settings.newapi_images.requests.post', return_value=nullcontext(response)) as post:
            result = compatible_image_client(self.model()).generate('a small orange')
        self.assertEqual(result.images, (b'image-bytes',))
        self.assertEqual(post.call_args.args[0], 'https://api.openai.com/v1/images/generations')
        self.assertEqual(post.call_args.kwargs['json'], {'model': 'gpt-image-2.5-flare', 'prompt': 'a small orange', 'n': 1})
        self.assertFalse(post.call_args.kwargs['allow_redirects'])

    def test_invalid_or_unauthorized_result_does_not_look_like_success(self):
        response = SimpleNamespace(status_code=403)
        with patch('system_settings.newapi_images.requests.post', return_value=nullcontext(response)), patch('system_settings.newapi_images.capture'):
            with self.assertRaisesRegex(GrsaiImageError, '无权'):
                compatible_image_client(self.model()).generate('test')

    def test_oversized_result_identifies_actual_provider(self):
        response = SimpleNamespace(status_code=200, iter_content=lambda chunk_size: [b'12345'])
        for provider, label in (('OpenAi', 'OpenAI'), ('NewAPI', 'New API')):
            with self.subTest(provider=provider), \
                    patch('system_settings.newapi_images.MAX_RESPONSE_BYTES', 4), \
                    patch('system_settings.newapi_images.requests.post', return_value=nullcontext(response)):
                with self.assertRaisesRegex(GrsaiImageError, label + ' 返回内容过大'):
                    compatible_image_client(self.model(provider)).generate('test')
