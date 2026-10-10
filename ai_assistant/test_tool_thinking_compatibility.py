from types import SimpleNamespace
from unittest.mock import MagicMock, patch
import json

from django.test import SimpleTestCase

from ai_assistant.views import ChatView
from utils.ai_service import AIService
from utils.tool_completion_options import tool_thinking_options, ToolThinkingCompatibilityError


class ToolThinkingCompatibilityTests(SimpleTestCase):
    def config(self, **overrides):
        return {'base_url': 'https://4sapi.org/v1', 'model_name': 'gpt-6-luna',
                'provider_type': 'custom', 'thinking_mode': 'default',
                'thinking_protocol': 'auto', 'api_key': 'test-key', **overrides}

    def test_known_model_default_and_disabled_always_send_none(self):
        for mode in ('default', 'disabled'):
            for protocol in ('auto', 'reasoning_effort'):
                with self.subTest(mode=mode, protocol=protocol):
                    config = self.config(thinking_mode=mode, thinking_protocol=protocol)
                    self.assertEqual(tool_thinking_options(config, has_tools=True), {'reasoning_effort': 'none'})

    def test_explicit_enabled_returns_safe_actionable_error(self):
        with self.assertRaises(ToolThinkingCompatibilityError) as error:
            tool_thinking_options(self.config(thinking_mode='enabled'), has_tools=True)
        self.assertIn('默认或关闭', str(error.exception))
        self.assertEqual(error.exception.diagnostics['error_type'], 'tool_thinking_incompatible')

    def test_other_models_providers_and_plain_chat_keep_original_policy(self):
        for config, tools in [(self.config(model_name='other-model'), True),
                              (self.config(base_url='https://other.invalid/v1'), True),
                              (self.config(base_url='https://4sapi.org.attacker.invalid/v1'), True),
                              (self.config(), False)]:
            self.assertEqual(tool_thinking_options(config, has_tools=tools), {})

    def test_real_tool_loop_keeps_none_on_every_round(self):
        tool_call = SimpleNamespace(id='call-1', function=SimpleNamespace(name='weather', arguments='{}'))
        responses = [SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='', tool_calls=[tool_call]))]),
                     SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='完成', tool_calls=[]))])]
        executor = MagicMock(return_value='test result')
        with patch.object(AIService, 'get_client_config_for_model', return_value=self.config()), \
                patch('utils.ai_service.OpenAI'), \
                patch('utils.ai_service.create_completion', side_effect=responses) as create:
            self.assertEqual(AIService.chat_completion_messages_with_tools(
                [{'role': 'user', 'content': '测试'}], [{'type': 'function'}], executor, model_id='model'), '完成')
        self.assertEqual(create.call_count, 2)
        for call in create.call_args_list:
            self.assertEqual(call.kwargs['extra_body'], {'reasoning_effort': 'none'})
        executor.assert_called_once_with('weather', {})

    def test_error_event_shows_configuration_hint(self):
        with patch('ai_assistant.views.AIService.chat_completion_messages_with_tools',
                   side_effect=ToolThinkingCompatibilityError()):
            events = [json.loads(line) for line in ChatView._stream_tool_response_generator([], {'tools': [], 'tool_map': {}})]
        self.assertEqual(events[0]['type'], 'error')
        self.assertIn('默认或关闭', events[0]['content'])
        self.assertEqual(events[-1]['type'], 'done')
