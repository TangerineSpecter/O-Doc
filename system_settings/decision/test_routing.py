import json
import time
from types import SimpleNamespace
from unittest.mock import patch, Mock
from django.test import TestCase, SimpleTestCase
from system_settings.models import AIProvider, AIModel, Agent, AgentTask, SystemSetting
from system_settings.agent_world.life_models import LifeConfig, LifeProfile
from .routing import candidates, run_models, complete_json, choose_scene, jev_enabled, InvalidModelOutput
from .jev import DecisionUnavailable


class RoutingTests(TestCase):
    def setUp(self):
        provider = AIProvider.objects.create(name='fixture', type='openai', base_url='https://invalid.local', api_key='test')
        self.models = [AIModel.objects.create(provider=provider, name=name, type='chat') for name in ('task', 'world', 'agent', 'system')]
        self.agent = Agent.objects.create(name='角色', model=self.models[2], prompt='公共要求', role_profile={'personality': '细心'})
        self.task = AgentTask.objects.create(name='任务', agent=self.agent, model=self.models[0])
        SystemSetting.objects.create(key='system_ai_config', value={'defaultChatModelId': self.models[3].pk})
        LifeConfig.objects.create(pk='owner', settings={'decision_model_id': self.models[1].pk, 'jev_enabled': True, 'jev_excluded_scenes': []})
        LifeProfile.objects.create(pk=self.agent.pk, owner_id='owner')

    def test_priority_dedup_and_expression_avoids_world(self):
        self.assertEqual(candidates(self.agent, task=self.task, decision=True), [self.models[i].pk for i in (0,2,3)])
        self.assertEqual(candidates(self.agent, decision=True), [self.models[i].pk for i in (1,2,3)])
        self.assertEqual(candidates(self.agent), [self.models[i].pk for i in (2,3)])
        self.task.model = self.agent.model
        self.assertEqual(candidates(self.agent, task=self.task), [self.models[i].pk for i in (2,3)])

    def test_failures_fallback_and_control_never_falls_back(self):
        used = []
        def invoke(config):
            used.append(config['model_id'])
            if len(used) < 3:
                raise TimeoutError('fixture')
            return 'ok'
        self.assertEqual(run_models(self.agent, invoke, task=self.task, deadline=time.monotonic()+10), 'ok')
        self.assertEqual(used, [self.models[i].pk for i in (0,2,3)])
        with self.assertRaisesRegex(ValueError, '取消'):
            run_models(self.agent, invoke, check=lambda: (_ for _ in ()).throw(ValueError('取消')))
        self.assertEqual(len(used), 3)

    @patch('system_settings.decision.routing.complete')
    def test_one_repair_then_fallback_validates_before_success(self, completion):
        completion.side_effect = ['{"choice":"bad"}', '{"choice":"bad"}', '{"choice":"ok"}']
        def validate(value):
            if value['choice'] != 'ok':
                raise ValueError('bad')
            return value
        result = complete_json(self.agent, '选择', validate, task=self.task, seconds=10)
        self.assertEqual(result['choice'], 'ok')
        self.assertEqual([call.args[0]['model_id'] for call in completion.call_args_list], [self.models[i].pk for i in (0,0,2)])
        self.assertTrue(all(call.kwargs['allow_retries'] is False for call in completion.call_args_list))

    @patch('system_settings.decision.jev.choose', side_effect=DecisionUnavailable('fixture'))
    def test_jev_failure_exclusion_and_solo_candidate(self, choose):
        result = choose_scene('owner', self.agent, 'social_action', {}, {'reply':'回复','rest':'休息'}, deadline=time.monotonic()+10)
        self.assertIsNone(result)
        self.assertIn('公共要求', choose.call_args.args[1]['role'])
        self.assertEqual(choose_scene('owner', self.agent, 'social_action', {}, {'rest':'休息'}, deadline=time.monotonic()+10), 'rest')
        config = LifeConfig.objects.get(pk='owner')
        config.settings['jev_excluded_scenes'] = ['social_action']; config.save()
        self.assertFalse(jev_enabled('owner', 'social_action'))
        self.assertEqual(choose.call_count, 1)

    def test_legacy_setting_does_not_override_new_world_policy(self):
        self.task.task_kind = 'market'; self.task.market_config = {'owner_id':'owner','decision_enabled':True}; self.task.save()
        config = LifeConfig.objects.get(pk='owner'); config.settings['jev_enabled'] = False; config.save()
        self.assertFalse(jev_enabled('owner', 'market'))

    def test_policy_migration_preserves_explicit_settings(self):
        from importlib import import_module
        from django.apps import apps
        self.task.task_kind = 'market'; self.task.market_config = {'owner_id':'legacy','decision_enabled':True}; self.task.save()
        import_module('system_settings.migrations.0073_world_jev_policy').migrate_policy(apps, None)
        config = LifeConfig.objects.get(pk='legacy')
        self.assertTrue(config.settings['jev_enabled'])
        self.assertEqual(config.settings['mode'], 'fixed')
        self.assertEqual(config.settings['jev_excluded_scenes'], [])
        config.settings['jev_enabled'] = False; config.save()
        import_module('system_settings.migrations.0073_world_jev_policy').migrate_policy(apps, None)
        config.refresh_from_db(); self.assertFalse(config.settings['jev_enabled'])

    def test_tool_failure_is_not_replayed_on_another_model(self):
        from .routing import ToolOperationFailure
        invoke = Mock(side_effect=ToolOperationFailure('工具状态待核实'))
        with self.assertRaises(ToolOperationFailure):
            run_models(self.agent, invoke, task=self.task)
        self.assertEqual(invoke.call_count, 1)
