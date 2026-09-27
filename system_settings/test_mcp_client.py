from types import SimpleNamespace

from django.test import SimpleTestCase

from utils.mcp_client import normalize_mcp_headers


class MCPHeaderNormalizationTests(SimpleTestCase):
    def test_tavily_raw_key_gets_bearer_prefix(self):
        server = SimpleNamespace(
            name='Tavily 搜索',
            url='https://mcp.tavily.com/mcp/',
            description='',
            headers={'Authorization': 'tvly-test-key'},
        )

        self.assertEqual(
            normalize_mcp_headers(server),
            {'Authorization': 'Bearer tvly-test-key'},
        )

    def test_generic_mcp_headers_are_unchanged(self):
        server = SimpleNamespace(
            name='其他 MCP',
            url='https://example.com/mcp',
            description='',
            headers={'Authorization': 'token'},
        )

        self.assertEqual(normalize_mcp_headers(server), {'Authorization': 'token'})
