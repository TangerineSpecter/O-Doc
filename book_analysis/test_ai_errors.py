from types import SimpleNamespace
from unittest.mock import patch

import httpx
from django.test import SimpleTestCase
from openai import AuthenticationError

from utils.ai_service import AIAuthenticationError, AIService


class ModelAuthenticationContextTests(SimpleTestCase):
    def get_config(self, settings, simple):
        provider = SimpleNamespace(api_key='private-test-key', base_url='https://example.invalid/v1', type='test', id='provider-test', name='测试提供商')
        model = SimpleNamespace(name='test-chat', provider=provider)
        with patch('utils.ai_service.SystemSetting.objects.get', return_value=SimpleNamespace(value=settings)), patch('utils.ai_service.AIModel.objects.get', return_value=model) as lookup:
            config = AIService.get_default_client_config(use_simple_model=simple)
        return config, lookup.call_args.kwargs['id']

    def test_simple_role_is_actual_selected_model(self):
        for settings in ({'simpleChatModelId': 'simple', 'defaultChatModelId': 'main'}, {'simple_chat_model_id': 'simple', 'default_chat_model_id': 'main'}):
            config, identity = self.get_config(settings, True)
            self.assertEqual(config['model_role'], 'simple')
            self.assertEqual(identity, 'simple')

    def test_missing_simple_model_is_labeled_as_main(self):
        config, identity = self.get_config({'defaultChatModelId': 'main'}, True)
        self.assertEqual(config['model_role'], 'default')
        self.assertEqual(identity, 'main')

    def test_summary_uses_main_even_with_simple_configured(self):
        config, identity = self.get_config({'simpleChatModelId': 'simple', 'defaultChatModelId': 'main'}, False)
        self.assertEqual(config['model_role'], 'default')
        self.assertEqual(identity, 'main')

    def test_authentication_exception_carries_safe_request_context(self):
        config, _ = self.get_config({'simpleChatModelId': 'simple'}, True)
        response = httpx.Response(401, request=httpx.Request('POST', 'https://example.invalid/v1/chat/completions'))
        error = AuthenticationError('response containing private-test-key', response=response, body=None)
        with patch('utils.ai_service.AIService.get_default_client_config', return_value=config), patch('utils.ai_service.OpenAI') as client:
            client.return_value.chat.completions.create.side_effect = error
            with self.assertRaises(AIAuthenticationError) as raised:
                AIService.chat_completion('测试正文', use_simple_model=True)
        self.assertEqual(raised.exception.model_role, 'simple')
        self.assertEqual(raised.exception.model_name, 'test-chat')
        self.assertEqual(raised.exception.provider_name, '测试提供商')
        self.assertNotIn('private-test-key', str(raised.exception))
