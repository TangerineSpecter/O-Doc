from django.test import TestCase

from .mcp_skill_views import (
    TAVILY_MCP_DESCRIPTION,
    TAVILY_MCP_NAME,
    _normalize_tavily_mcp_server,
)
from .models import Agent, MCPServer


class TavilyMCPMigrationTests(TestCase):
    def test_existing_external_tavily_is_promoted_without_changing_binding_or_credentials(self):
        server = MCPServer.objects.create(
            name='tavily搜索',
            transport='streamableHttp',
            url='https://mcp.tavily.com/mcp/',
            headers={
                'Content-Type': 'application/json',
                'Authorization': 'Bearer tvly-test-secret',
            },
            source='external',
            description='搜索工具',
            tools=[{'name': 'tavily_search', 'enabled': True}],
        )
        agent = Agent.objects.create(name='测试 Agent', prompt='测试')
        agent.mcp_servers = [server.id]
        agent.save(update_fields=['mcp_servers', 'updated_at'])

        migrated = _normalize_tavily_mcp_server()

        self.assertEqual(migrated.id, server.id)
        migrated.refresh_from_db()
        self.assertEqual(migrated.name, TAVILY_MCP_NAME)
        self.assertEqual(migrated.source, 'system')
        self.assertEqual(migrated.url, 'https://mcp.tavily.com/mcp/')
        self.assertEqual(migrated.headers['Authorization'], 'Bearer tvly-test-secret')
        self.assertEqual(migrated.tools[0]['name'], 'tavily_search')
        self.assertEqual(migrated.description, TAVILY_MCP_DESCRIPTION)
        agent.refresh_from_db()
        self.assertEqual(agent.mcp_servers, [server.id])

    def test_normalization_does_not_create_unconfigured_tavily_row(self):
        self.assertIsNone(_normalize_tavily_mcp_server())
        self.assertFalse(MCPServer.objects.filter(name=TAVILY_MCP_NAME).exists())
