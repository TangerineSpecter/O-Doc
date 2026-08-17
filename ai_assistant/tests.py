import json
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from ai_assistant.views import ChatView, WhiteboardInsightView
from ai_assistant.whiteboard_insight import extract_json_object, normalize_insight_payload
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


class WhiteboardInsightHelperTests(TestCase):
    def test_extract_json_from_fenced_output(self):
        payload = extract_json_object('好的\n```json\n{"findings": [], "questions": [{"text": "为什么 A 推不出 B？"}]}\n```')
        self.assertEqual(payload['questions'][0]['text'], '为什么 A 推不出 B？')

    def test_normalize_filters_invalid_items(self):
        payload = normalize_insight_payload({
            'findings': [
                {'type': 'theme', 'title': '主线', 'detail': '两张便签都在谈时间', 'nodeIds': ['n1', '[n2]']},
                {'type': 'unknown', 'title': '丢弃'},
                {'title': '没有类型'},
            ],
            'questions': [
                {'text': '如果把前提反过来，结论还成立吗？', 'why': '材料互相打架', 'node_ids': ['n1']},
                {'text': '   '},
            ],
        })
        self.assertEqual(len(payload['findings']), 1)
        self.assertEqual(payload['findings'][0]['node_ids'], ['n1', 'n2'])
        self.assertEqual(len(payload['questions']), 1)
        self.assertEqual(payload['questions'][0]['why'], '材料互相打架')

    def test_normalize_drops_meta_board_commentary(self):
        payload = normalize_insight_payload({
            'questions': [
                {'text': '白板为什么没有连接这两张卡？', 'why': '白板没有连接'},
                {'text': '多租户和旧版注入怎么衔接？', 'why': '用户没有表态自己的目标'},
            ],
        })
        self.assertEqual(len(payload['questions']), 1)
        self.assertEqual(payload['questions'][0]['text'], '多租户和旧版注入怎么衔接？')
        self.assertEqual(payload['questions'][0]['why'], '')


class WhiteboardInsightViewTests(TestCase):
    def test_digest_returns_normalized_payload(self):
        request = APIRequestFactory().post('/api/ai/whiteboard/insight/', {
            'mode': 'digest',
            'boardBrief': '# 白板\n- [n1] (便签) 睡眠债',
        }, format='json')

        with patch('ai_assistant.views.AIService.chat_completion_messages', return_value=json.dumps({
            'findings': [{'type': 'clue', 'title': '睡眠', 'detail': '只出现在一张便签', 'nodeIds': ['n1']}],
            'questions': [{'text': '睡眠债和创作节奏怎么互相拖累？', 'why': '只有单点，没有反证', 'nodeIds': ['n1']}],
        })):
            response = WhiteboardInsightView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['findings'][0]['type'], 'clue')
        self.assertEqual(response.data['questions'][0]['node_ids'], ['n1'])

    def test_digest_accepts_braces_in_brief(self):
        request = APIRequestFactory().post('/api/ai/whiteboard/insight/', {
            'mode': 'digest',
            'boardBrief': '# 白板\n- [n1] (便签) 配置里写了 {foo} 和 {',
        }, format='json')

        with patch('ai_assistant.views.AIService.chat_completion_messages', return_value=json.dumps({
            'findings': [{'type': 'clue', 'title': '配置', 'detail': '花括号不是格式串', 'nodeIds': ['n1']}],
            'questions': [{'text': '{foo} 是占位符还是字面量？', 'why': '正文里有花括号', 'nodeIds': ['n1']}],
        })) as mocked:
            response = WhiteboardInsightView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        user_prompt = mocked.call_args[0][0][1]['content']
        self.assertIn('{foo}', user_prompt)
        self.assertIn('{', user_prompt)

    def test_digest_rejects_empty_board(self):
        request = APIRequestFactory().post('/api/ai/whiteboard/insight/', {
            'mode': 'digest',
            'boardBrief': '   ',
        }, format='json')
        response = WhiteboardInsightView.as_view()(request)
        self.assertEqual(response.status_code, 400)

    def test_answer_requires_question(self):
        request = APIRequestFactory().post('/api/ai/whiteboard/insight/', {
            'mode': 'answer',
            'boardBrief': '# 白板\n- [n1] (便签) 睡眠债',
        }, format='json')
        response = WhiteboardInsightView.as_view()(request)
        self.assertEqual(response.status_code, 400)
