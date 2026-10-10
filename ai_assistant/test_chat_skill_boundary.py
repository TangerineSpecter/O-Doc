"""对话与任务技能边界；模型、MCP、记忆和数据库查询均隔离。"""
import json
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from ai_assistant.views import ChatView
from system_settings.agent_task_scheduler import AgentTaskScheduler


class ChatSkillBoundaryTests(SimpleTestCase):
    def test_chat_ignores_bound_and_legacy_selected_skills(self):
        agent = SimpleNamespace(pk='maomao', name='猫猫', prompt='角色设定', skills=['bound-skill'],
                                mcp_servers=[], model_id=None)
        for agent_id in (None, 'maomao'):
            for with_tools in (False, True):
                for skill_key in ('skills', 'skillIds'):
                    with self.subTest(agent=agent_id, tools=with_tools, key=skill_key):
                        captured = {}

                        def capture(messages, *args, **kwargs):
                            captured['messages'] = messages
                            return (text for text in ['正常对话']) if not with_tools else '正常对话'

                        request = APIRequestFactory().post('/api/ai/chat/', {
                            'message': '你好', 'agent_id': agent_id,
                            skill_key: ['selected-skill'],
                        }, format='json')
                        context = {'tools': [{'name': 'memo'}] if with_tools else [], 'tool_map': {}}
                        with patch('ai_assistant.views.Agent.objects.get', return_value=agent), \
                                patch('system_settings.agent_world.travel_memory.travel_memory_context', return_value=''), \
                                patch.object(ChatView, '_build_mcp_tool_context', return_value=context), \
                                patch('system_settings.models.Skill.objects.filter', side_effect=AssertionError('聊天不应查询技能')), \
                                patch('ai_assistant.views.AIService.stream_chat_completion', side_effect=capture), \
                                patch('ai_assistant.views.AIService.chat_completion_messages_with_tools', side_effect=capture):
                            response = ChatView.as_view()(request)
                            events = [json.loads(line) for line in b''.join(response.streaming_content).decode().splitlines()]
                        self.assertEqual(response.status_code, 200)
                        self.assertNotIn('系统技能', captured['messages'][0]['content'])
                        if agent_id:
                            self.assertIn(agent.prompt, captured['messages'][0]['content'])
                        self.assertNotIn('skills_loaded', [event['type'] for event in events])
                        self.assertTrue(any(event['type'] == 'answer' for event in events))
                        self.assertEqual(events[-1]['type'], 'done')

    def test_task_still_injects_bound_enabled_skill(self):
        agent = SimpleNamespace(pk='maomao', name='猫猫', prompt='角色设定', skills=['polish'])
        task = SimpleNamespace(agent=agent, name='润色', prompt='润色文章正文')
        skill = SimpleNamespace(name='文章润色', prompt='TASK_SKILL_CONTENT')
        with patch('system_settings.agent_task_scheduler.Skill.objects.filter', return_value=[skill]) as query, \
                patch('system_settings.agent_world.travel_memory.travel_memory_context', return_value=''), \
                patch.object(AgentTaskScheduler, '_has_agent_post_markdown_skill', return_value=True), \
                patch.object(AgentTaskScheduler, '_relation_behavior_note', return_value=''):
            prompt = AgentTaskScheduler()._build_prompt(task)
        query.assert_called_once_with(id__in=['polish'], enabled=True)
        self.assertIn(skill.prompt, prompt)
        self.assertIn(task.prompt, prompt)
