"""验证网页对话的 Agent 模型传递及流式服务实际配置选择。"""
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from ai_assistant.views import ChatView
from utils.ai_service import AIService


class ChatModelRoutingTests(SimpleTestCase):
    def test_agent_and_default_chat_model_routing_with_and_without_tools(self):
        for agent_model in ('agent-model-id', None, 'default-assistant'):
            for with_tools in (False, True):
                with self.subTest(model=agent_model, tools=with_tools):
                    is_default = agent_model == 'default-assistant'
                    agent = SimpleNamespace(pk='maomao', name='猫猫', prompt='角色设定',
                                            skills=[], mcp_servers=[], model_id=agent_model)
                    captured = {}

                    def capture(messages, *args, **kwargs):
                        captured.update(kwargs)
                        return '完成' if with_tools else (text for text in ['完成'])

                    context = {'tools': [{'name': 'memo'}] if with_tools else [], 'tool_map': {}}
                    request = APIRequestFactory().post('/api/ai/chat/', {
                        'message': '你好', 'agent_id': None if is_default else 'maomao',
                        'use_simple_model': True,
                    }, format='json')
                    with patch('ai_assistant.views.Agent.objects.get', return_value=agent), \
                            patch('system_settings.agent_world.travel_memory.travel_memory_context', return_value=''), \
                            patch.object(ChatView, '_build_mcp_tool_context', return_value=context), \
                            patch('ai_assistant.views.AIService.stream_chat_completion', side_effect=capture), \
                            patch('ai_assistant.views.AIService.chat_completion_messages_with_tools', side_effect=capture):
                        response = ChatView.as_view()(request)
                        events = [json.loads(line) for line in b''.join(response.streaming_content).decode().splitlines()]
                    self.assertEqual(captured['model_id'], None if is_default else agent_model)
                    self.assertEqual(captured['use_simple_model'], is_default)
                    self.assertEqual(events[-1]['type'], 'done')
                    self.assertTrue(any(event['type'] == 'answer' for event in events))

    def test_stream_uses_selected_provider_and_model_or_system_fallback(self):
        config = {'api_key': 'test-key', 'base_url': 'https://provider.invalid/v1',
                  'model_name': 'agent-model-name'}
        for model_id in ('model-id-as-string', None):
            with self.subTest(model_id=model_id), \
                    patch.object(AIService, 'get_client_config_for_model', return_value=config) as selected, \
                    patch.object(AIService, 'get_default_client_config', return_value=config) as default, \
                    patch.object(AIService, '_thinking_options', return_value={}), \
                    patch('utils.ai_service.OpenAI') as factory, \
                    patch('utils.ai_service.create_completion', return_value=MagicMock(__iter__=lambda _: iter([]))) as completion:
                list(AIService.stream_chat_completion([], model_id=model_id, use_simple_model=True))
                if model_id:
                    selected.assert_called_once_with(model_id)
                    default.assert_not_called()
                else:
                    selected.assert_not_called()
                    default.assert_called_once_with(use_simple_model=True)
                self.assertEqual(factory.call_args.kwargs['base_url'], config['base_url'])
                self.assertEqual(completion.call_args.kwargs['model'], config['model_name'])
                factory.return_value.close.assert_called_once()
