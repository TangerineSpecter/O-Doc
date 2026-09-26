from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from ai_assistant.views import ChatView
from system_settings.agent_prompts import AGENT_CHARACTER_RULES, AGENT_CONVERSATION_RULES
from system_settings.agent_task_scheduler import AgentTaskScheduler
from system_settings.feishu_im import _build_agent_reply


class AgentPromptRoutingTests(SimpleTestCase):
    def setUp(self):
        self.agent = SimpleNamespace(
            name='菲伦', prompt='你是菲伦，沉静、有主见的魔法使。',
            skills=[], mcp_servers=[], model_id=None,
        )

    def assert_conversation_rules(self, prompt):
        self.assertIn(self.agent.prompt, prompt)
        self.assertIn(AGENT_CHARACTER_RULES.strip(), prompt)
        self.assertIn(AGENT_CONVERSATION_RULES.strip(), prompt)

    def test_web_chat_sends_shared_rules_with_persona_and_history(self):
        history = [{'role': 'assistant', 'content': '你今天来得很早。'}]
        request = APIRequestFactory().post('/api/ai/chat/', {
            'agent_id': 'fern', 'message': '你真的是菲伦吗？', 'history': history,
        }, format='json')
        with patch('ai_assistant.views.Agent.objects.get', return_value=self.agent), \
                patch.object(ChatView, '_build_mcp_tool_context', return_value={'tools': []}), \
                patch.object(ChatView, '_stream_response_generator', return_value=iter(['ok'])) as stream:
            response = ChatView.as_view()(request)
            self.assertEqual(response.status_code, 200)
            messages = stream.call_args.args[0]
        self.assert_conversation_rules(messages[0]['content'])
        self.assertEqual(messages[1], history[0])
        self.assertEqual(messages[-1]['content'], '你真的是菲伦吗？')

    def test_feishu_chat_sends_same_shared_rules(self):
        with patch('system_settings.feishu_im._build_context_messages',
                   side_effect=lambda agent, record, prompt, text: [{'role': 'system', 'content': prompt}]), \
                patch('system_settings.feishu_im._build_agent_mcp_tool_context',
                      return_value={'tools': [], 'errors': []}), \
                patch('system_settings.feishu_im.AIService.chat_completion_messages', return_value='嗯，是真的。') as chat:
            _build_agent_reply(self.agent, '你真的是菲伦吗？', SimpleNamespace())
        self.assert_conversation_rules(chat.call_args.args[0][0]['content'])

    def test_scheduled_task_keeps_character_and_task_output_contract(self):
        task = SimpleNamespace(agent=self.agent, name='写日记', prompt='写下今天的见闻。')
        with patch('system_settings.agent_task_scheduler.read_agent_post_markdown_guide', return_value=''), \
                patch.object(AgentTaskScheduler, '_relation_behavior_note', return_value=''):
            prompt = AgentTaskScheduler()._build_prompt(task)
        self.assertIn(self.agent.prompt, prompt)
        self.assertIn(AGENT_CHARACTER_RULES.strip(), prompt)
        self.assertNotIn(AGENT_CONVERSATION_RULES.strip(), prompt)
        self.assertIn('请直接输出最终内容', prompt)
        self.assertIn(task.prompt, prompt)
