from django.test import TestCase
from unittest.mock import patch

from ai_assistant.views import ChatView
from system_settings.models import MCPServer


class ChatViewMCPContextTests(TestCase):
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
