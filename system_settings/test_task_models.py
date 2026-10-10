import json
import time
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.core import serializers as django_serializers
from django.test import TestCase

from system_settings.agent_task_models import task_model_id, task_model_name
from system_settings.agent_task_scheduler import AgentTaskScheduler
from system_settings.models import AIModel, AIProvider, Agent, AgentTask, AgentLongTermMemory
from system_settings.serializers import AgentTaskSerializer


class TaskModelTests(TestCase):
    def setUp(self):
        provider = AIProvider.objects.create(name='models', type='NewAPI')
        self.default = AIModel.objects.create(provider=provider, name='default', type='chat')
        self.cheap = AIModel.objects.create(provider=provider, name='cheap', type='chat')
        self.agent = Agent.objects.create(name='同一个居民', model=self.default, prompt='保持我的角色')
        self.task = AgentTask.objects.create(name='日报', agent=self.agent, agent_ids=[self.agent.pk])

    def test_override_and_clear_preserve_identity_and_memories(self):
        memory = AgentLongTermMemory.objects.create(agent=self.agent, content='我的经历')
        serializer = AgentTaskSerializer(self.task, data={'model': self.cheap.pk}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        task = serializer.save()
        self.assertEqual(task_model_id(task, self.agent), self.cheap.pk)
        self.agent.refresh_from_db()
        self.assertEqual(self.agent.model_id, self.default.pk)
        self.assertEqual(memory.agent_id, self.agent.pk)
        serializer = AgentTaskSerializer(task, data={'model': None}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(task_model_id(serializer.save(), self.agent), self.default.pk)

    def test_reject_non_chat_and_missing_models(self):
        image = AIModel.objects.create(provider=self.default.provider, name='image', type='image_generation')
        for value in (image.pk, 'missing-model'):
            serializer = AgentTaskSerializer(self.task, data={'model': value}, partial=True)
            self.assertFalse(serializer.is_valid())
            self.assertIn('model', serializer.errors)

    def test_sync_snapshot_and_legacy_default(self):
        self.task.model = self.cheap
        self.task.save()
        rows = json.loads(django_serializers.serialize('json', [self.task]))
        self.assertEqual(rows[0]['fields']['model'], self.cheap.pk)
        restored = next(django_serializers.deserialize('json', json.dumps(rows))).object
        self.assertEqual(restored.model_id, self.cheap.pk)
        del rows[0]['fields']['model']
        legacy = next(django_serializers.deserialize('json', json.dumps(rows))).object
        self.assertIsNone(legacy.model_id)

    def test_delete_override_returns_to_inheritance(self):
        self.task.model = self.cheap
        self.task.save()
        self.cheap.delete()
        self.task.refresh_from_db()
        self.assertEqual(task_model_id(self.task, self.agent), self.default.pk)

    def test_inheritance_is_per_agent_override_is_per_task(self):
        other = Agent.objects.create(name='另一居民', model=self.cheap)
        self.assertEqual(task_model_id(self.task, other), self.cheap.pk)
        self.task.model = self.default
        self.assertEqual(task_model_id(self.task, other), self.default.pk)

    def test_model_snapshot_follows_override_inheritance_and_missing_default(self):
        self.assertEqual(task_model_name(self.task, self.agent), self.default.name)
        self.task.model = self.cheap
        self.assertEqual(task_model_name(self.task, self.agent), self.cheap.name)
        self.agent.model = None
        self.assertEqual(task_model_name(self.task, self.agent), self.cheap.name)
        self.task.model = None
        self.assertEqual(task_model_name(self.task, self.agent), '未知')
        self.assertEqual(task_model_name(None, self.agent, default=''), '')

    def test_custom_task_record_uses_overridden_model_name(self):
        self.task.model = self.cheap
        self.task.execution_mode = 'serial'
        scheduler = MagicMock()
        scheduler._get_task_agents.return_value = [self.agent]
        scheduler._format_agent_names.return_value = self.agent.name
        scheduler._format_duration.return_value = '1秒'
        scheduler._build_multi_agent_summary.return_value = '完成'
        scheduler._build_multi_agent_output.return_value = 'done'
        scheduler._run_task_for_agent.return_value = {'agent': self.agent.pk, 'status': 'success', 'content': 'done'}
        record = AgentTaskScheduler._run_task(scheduler, self.task)
        self.assertEqual(record.status, 'success', record.summary)
        record.refresh_from_db()
        self.assertEqual(record.agent_runs[0]['modelName'], self.cheap.name)

    def test_plain_and_tool_execution_use_task_model(self):
        self.task.model = self.cheap
        scheduler = MagicMock()
        scheduler._build_prompt.return_value = '角色、记忆与任务上下文'
        scheduler._build_completion_summary.return_value = '完成'
        scheduler._format_duration.return_value = '1秒'
        with patch('system_settings.agent_task_scheduler.create_work_activity'), patch('system_settings.agent_task_scheduler.update_work_activity'), patch('system_settings.agent_task_scheduler.AIService.chat_completion_messages', return_value='done') as plain, patch('system_settings.agent_task_scheduler.AIService.chat_completion_with_tools', return_value='done') as tools:
            for has_tools in (False, True):
                scheduler._append_agent_context_steps.return_value = {'tools': [{'name': 'search'}] if has_tools else [], 'tool_map': {}}
                result = AgentTaskScheduler._run_task_for_agent_body(scheduler, MagicMock(), self.task, self.agent)
                self.assertEqual(result['status'], 'success')
                call = tools if has_tools else plain
                self.assertEqual(call.call_args.kwargs['model_id'], self.cheap.pk)
            self.assertEqual(self.agent.model_id, self.default.pk)

    def test_publish_uses_task_model(self):
        from system_settings.agent_world.publish_workflow import Workflow
        flow = object.__new__(Workflow)
        self.task.model = self.cheap
        flow.task, flow.agent = self.task, self.agent
        flow.state, flow.prompt, flow.deadline = {}, '角色上下文', time.monotonic() + 30
        flow.repairs = 0
        with patch('system_settings.agent_world.publish_workflow.AIService.get_client_config_for_model', return_value={}) as config, patch('system_settings.agent_world.publish_workflow.complete', return_value='{"ok":true}'), patch('utils.completion_options.thinking_options', return_value={}):
            self.assertTrue(flow.ask('任务', {}, lambda value: value)['ok'])
            config.assert_called_once_with(self.cheap.pk)

    def test_travel_nodes_use_task_model(self):
        from system_settings.agent_world.travel_ai import ask
        self.task.model = self.cheap
        journey = SimpleNamespace(pk='no-life-item', task=self.task, agent=self.agent, snapshot={'role_prompt': '角色'})
        with patch('system_settings.agent_world.travel_ai.AIService.get_client_config_for_model', return_value={}) as config, patch('system_settings.agent_world.travel_ai.complete', return_value='{"ok":true}'), patch('utils.completion_options.thinking_options', return_value={}):
            self.assertTrue(ask(journey, '节点', {}, lambda value: value)['ok'])
            config.assert_called_once_with(self.cheap.pk)
