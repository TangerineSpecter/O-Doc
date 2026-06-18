from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory
from unittest.mock import patch

from ai_assistant.views import ChatView
from system_settings.models import MCPServer


class ChatViewMCPContextTests(TestCase):
    def test_tool_chat_includes_current_time_context(self):
        server = MCPServer.objects.create(
            name='tavily搜索',
            transport='streamableHttp',
            url='http://testserver/mcp/',
            enabled=True,
            available_in_chat=True,
            tools=[{
                'name': 'tavily_search',
                'description': '搜索工具',
                'enabled': True,
                'inputSchema': {'type': 'object', 'properties': {'query': {'type': 'string'}}},
            }],
        )
        captured = {}

        def fake_tool_chat(messages, tools, execute_tool, **kwargs):
            captured['system_prompt'] = messages[0]['content']
            execute_tool('tavily_search', {'query': '今年利率决议'})
            return '完成'

        request = APIRequestFactory().post('/api/ai/chat/', {
            'message': '搜索昨晚美联储加息报告情况',
            'mcp_server_ids': [server.id],
        }, format='json')

        with patch('ai_assistant.views.fetch_mcp_tools', return_value=(server.tools, None)), \
                patch('ai_assistant.views.call_mcp_tool', return_value=({'ok': True}, None)), \
                patch('ai_assistant.views.AIService.chat_completion_messages_with_tools', side_effect=fake_tool_chat):
            response = ChatView.as_view()(request)
            payload = b''.join(response.streaming_content).decode('utf-8')

        now = timezone.now()
        current_year = (timezone.localtime(now) if timezone.is_aware(now) else now).strftime('%Y')
        self.assertIn('当前对话时间上下文', captured['system_prompt'])
        self.assertIn(f'当前日期：{current_year}-', captured['system_prompt'])
        self.assertIn('昨天', captured['system_prompt'])
        self.assertIn('"arguments": {"query": "今年利率决议"}', payload)

    def test_agent_bound_mcp_does_not_require_available_in_chat(self):
        server = MCPServer.objects.create(
            name='Agent 私有 MCP',
            transport='streamableHttp',
            url='http://testserver/mcp/',
            enabled=True,
            available_in_chat=False,
            tools=[{
                'name': 'private_tool',
                'description': 'Agent 私有工具',
                'enabled': True,
                'inputSchema': {'type': 'object', 'properties': {}},
            }],
        )

        with patch('ai_assistant.views.fetch_mcp_tools', return_value=(server.tools, None)):
            tool_context = ChatView._build_mcp_tool_context(agent_server_ids=[server.id])

        self.assertEqual(len(tool_context['tools']), 1)
        self.assertIn('private_tool', tool_context['tool_map'])

    def test_public_chat_mcp_still_requires_available_in_chat(self):
        server = MCPServer.objects.create(
            name='未开放聊天 MCP',
            transport='streamableHttp',
            url='http://testserver/mcp/',
            enabled=True,
            available_in_chat=False,
            tools=[{
                'name': 'hidden_tool',
                'description': '未开放给公共聊天',
                'enabled': True,
                'inputSchema': {'type': 'object', 'properties': {}},
            }],
        )

        with patch('ai_assistant.views.fetch_mcp_tools') as mock_fetch_tools:
            tool_context = ChatView._build_mcp_tool_context(chat_server_ids=[server.id])

        self.assertEqual(tool_context['tools'], [])
        self.assertEqual(tool_context['tool_map'], {})
        mock_fetch_tools.assert_not_called()
