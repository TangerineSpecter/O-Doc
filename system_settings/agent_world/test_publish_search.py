"""Tavily MCP 新闻检索参数兼容回归；所有外部调用均使用 mock。"""
import time
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from .publish_search import search


class NewsSearchSchemaTests(SimpleTestCase):
    def search_with_schema(self, topic_spec, *, time_spec=None, strict=True):
        properties = {
            'query': {'type': 'string'},
            'max_results': {'minimum': 5, 'maximum': 20},
            'topic': topic_spec,
            **({'time_range': time_spec} if time_spec is not None else {}),
        }
        server = SimpleNamespace(pk='search', tools=[{
            'name': 'tavily_search', 'inputSchema': {
                'properties': properties, 'required': ['query', 'topic'],
            },
        }])
        with patch('system_settings.agent_world.publish_search.search_server', return_value=server), \
             patch('system_settings.agent_world.publish_search.call_mcp_tool',
                   return_value=({'results': []}, None)) as call:
            try:
                rows = search({}, '今日科技新闻', 'news', 1, time.monotonic() + 10,
                              max_results=10, time_range='day', require_news_filters=strict)
            except ValueError:
                call.assert_not_called()
                raise
        self.assertEqual(rows, [])
        call.assert_called_once()
        return call.call_args.args[2]

    def test_general_only_enum_and_const_can_search_today_news(self):
        for topic_spec in ({'enum': ['general']}, {'const': 'general'}):
            with self.subTest(topic_spec=topic_spec):
                args = self.search_with_schema(topic_spec, time_spec={'enum': ['day', 'week']})
                self.assertEqual(args, {'query': '今日科技新闻', 'max_results': 10,
                                        'topic': 'general', 'time_range': 'day'})

    def test_news_is_preferred_when_supported(self):
        args = self.search_with_schema({'enum': ['general', 'news']}, time_spec={'enum': ['day']})
        self.assertEqual(args['topic'], 'news')

    def test_general_compatibility_also_applies_to_publication_news_search(self):
        args = self.search_with_schema({'const': 'general'}, strict=False)
        self.assertEqual(args['topic'], 'general')

    def test_general_fallback_keeps_day_alias(self):
        args = self.search_with_schema({'enum': ['general']}, time_spec={'enum': ['d', 'w']})
        self.assertEqual(args['time_range'], 'd')

    def test_general_fallback_does_not_bypass_required_date_window(self):
        with self.assertRaisesMessage(ValueError, '不支持今日时间范围'):
            self.search_with_schema({'const': 'general'})

    def test_unrelated_fixed_topic_is_not_used_for_news(self):
        with self.assertRaisesMessage(ValueError, '不支持 topic=news 或 topic=general'):
            self.search_with_schema({'const': 'finance'}, time_spec={'enum': ['day']})
