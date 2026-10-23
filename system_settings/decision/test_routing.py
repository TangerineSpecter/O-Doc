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
        self.assertEqual(run_models(self.agent, invoke, task=self.task), 'ok')
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
        result = complete_json(self.agent, '选择', validate, task=self.task)
        self.assertEqual(result['choice'], 'ok')
        self.assertEqual([call.args[0]['model_id'] for call in completion.call_args_list], [self.models[i].pk for i in (0,0,2)])
        self.assertTrue(all(call.kwargs['allow_retries'] is False for call in completion.call_args_list))
        self.assertTrue(all(call.kwargs['deadline_seconds'] <= 60 and call.kwargs['max_deadline_seconds'] <= 60
                            for call in completion.call_args_list))

    @patch('system_settings.decision.routing.complete')
    def test_each_provider_gets_its_own_repair_and_a_fresh_prompt(self, completion):
        completion.side_effect = ['{"choice":"bad"}', '{"choice":"bad"}', '{"choice":"bad"}', '{"choice":"ok"}']

        def validate(value):
            if value['choice'] != 'ok':
                raise ValueError('bad')
            return value

        result = complete_json(self.agent, '选择', validate, task=self.task)
        self.assertEqual(result['choice'], 'ok')
        prompts = [call.args[1] for call in completion.call_args_list]
        self.assertEqual([call.args[0]['model_id'] for call in completion.call_args_list], [self.models[i].pk for i in (0, 0, 2, 2)])
        self.assertNotIn('上次输出未通过校验', prompts[0])
        self.assertIn('上次输出未通过校验', prompts[1])
        self.assertNotIn('上次输出未通过校验', prompts[2])
        self.assertIn('上次输出未通过校验', prompts[3])
        self.assertTrue(all(call.kwargs['deadline_seconds'] <= 60 for call in completion.call_args_list))

    @patch('system_settings.decision.routing.complete')
    def test_empty_output_does_not_skip_the_next_provider(self, completion):
        completion.side_effect = ['', '', '{"choice":"ok"}']

        def validate(value):
            return value

        result = complete_json(self.agent, '选择', validate, task=self.task)
        self.assertEqual(result['choice'], 'ok')
        self.assertEqual([call.args[0]['model_id'] for call in completion.call_args_list], [self.models[i].pk for i in (0, 0, 2)])
        self.assertNotIn('上次输出未通过校验', completion.call_args_list[2].args[1])
        self.assertIn('模型返回内容为空', completion.call_args_list[1].args[1])

    @patch('system_settings.decision.routing.complete')
    def test_each_model_keeps_its_own_minute_after_earlier_hangs(self, completion):
        clock = {'now': 1000.0}

        def monotonic():
            return clock['now']

        def respond(config, prompt, **kwargs):
            self.assertGreaterEqual(kwargs['deadline_seconds'], 59)
            self.assertLessEqual(kwargs['deadline_seconds'], 60)
            self.assertGreaterEqual(kwargs['max_deadline_seconds'], 59)
            self.assertLessEqual(kwargs['max_deadline_seconds'], 60)
            if config['model_id'] != self.models[3].pk:
                clock['now'] += 60
                raise TimeoutError('模型调用达到 60 秒硬时限')
            return '{"choice":"ok"}'

        completion.side_effect = respond
        with patch('system_settings.decision.routing.time.monotonic', side_effect=monotonic):
            result = complete_json(self.agent, '选择', lambda value: value, task=self.task)
        self.assertEqual(result['choice'], 'ok')
        self.assertEqual([call.args[0]['model_id'] for call in completion.call_args_list],
                         [self.models[i].pk for i in (0, 2, 3)])

    @patch('system_settings.decision.jev.choose', side_effect=AssertionError('截止时间已过时不应发起决策请求'))
    def test_expired_caller_deadline_falls_back_instead_of_aborting(self, choose):
        result = choose_scene('owner', self.agent, 'social_action', {}, {'reply': '回复', 'rest': '休息'},
                              deadline=time.monotonic() - 1)
        self.assertIsNone(result)
        choose.assert_not_called()

    @patch('system_settings.decision.routing.complete', return_value='{"choice":"rest"}')
    def test_expired_stage_clock_still_reaches_the_text_model(self, completion):
        from system_settings.agent_world.life_choices import choose as life_choose
        result = life_choose(self.agent, 'owner', 'life_activity', {}, {'rest': '休息', 'farm': '农场'},
                             deadline=time.monotonic() - 1)
        self.assertEqual(result, 'rest')
        completion.assert_called()

    @patch('system_settings.decision.jev.choose', side_effect=TimeoutError('决策请求达到执行时限'))
    def test_decision_timeout_returns_none_for_text_fallback(self, choose):
        from system_settings.decision.config import save_key
        save_key('owner', 'secret')
        result = choose_scene('owner', self.agent, 'social_action', {}, {'reply': '回复', 'rest': '休息'},
                              deadline=time.monotonic() + 30)
        self.assertIsNone(result)
        choose.assert_called_once()

    @patch('system_settings.decision.jev.choose', side_effect=DecisionUnavailable('fixture'))
    def test_jev_failure_exclusion_and_solo_candidate(self, choose):
        from system_settings.decision.config import save_key
        save_key('owner', 'secret')
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

    def test_combat_preparation_shares_the_exploration_prepare_purpose(self):
        from utils.token_usage import usage_context
        seen = []

        def observe(*args, **kwargs):
            seen.append(usage_context())
            return 'a', .9

        with patch('system_settings.decision.routing.choose_connections', side_effect=observe):
            choose_scene('owner', self.agent, 'combat_preparation', {}, {'a': 'A', 'b': 'B'},
                         deadline=time.monotonic() + 10)
            choose_scene('owner', self.agent, 'market', {}, {'a': 'A', 'b': 'B'},
                         deadline=time.monotonic() + 10)
        self.assertEqual([row['purpose'] for row in seen], ['exploration_prepare', 'planning'])
        self.assertEqual([row['phase'] for row in seen], ['迷宫探索准备', '市场选择'])

    def test_scene_answered_for_a_task_belongs_to_that_task(self):
        from utils.token_usage import usage_context
        seen = []

        def observe(*args, **kwargs):
            seen.append(usage_context())
            return 'a', .9

        with patch('system_settings.decision.routing.choose_connections', side_effect=observe):
            choose_scene('owner', self.agent, 'farm_queue', {}, {'a': 'A', 'b': 'B'},
                         deadline=time.monotonic() + 10, task=self.task)
        self.assertEqual((seen[0]['task_key'], seen[0]['task_name']), (self.task.pk, self.task.name))
        self.assertEqual((seen[0]['purpose'], seen[0]['phase']), ('task', '农场种植队列规划'))

    def test_task_scene_records_the_task_on_the_usage_row(self):
        from types import SimpleNamespace
        from system_settings.models import AgentTokenUsage
        from system_settings.token_usage.capture import Capture

        def observe(*args, **kwargs):
            captured = Capture({'model_name': 'fixture', 'model_id': 'm', 'provider_id': 'p',
                                'provider_name': 'fixture', 'provider_type': 'OpenAi'})
            captured.usage(SimpleNamespace(prompt_tokens=3, completion_tokens=2, total_tokens=5))
            captured.finish('success')
            return 'a', .9

        with patch('system_settings.decision.routing.choose_connections', side_effect=observe):
            choose_scene('owner', self.agent, 'farm_queue', {}, {'a': 'A', 'b': 'B'},
                         deadline=time.monotonic() + 10, task=self.task)
        row = AgentTokenUsage.objects.get()
        self.assertEqual((row.task_key, row.task_name, row.purpose, row.phase),
                         (self.task.pk, self.task.name, 'task', '农场种植队列规划'))

    def test_tool_failure_is_not_replayed_on_another_model(self):
        from .routing import ToolOperationFailure
        invoke = Mock(side_effect=ToolOperationFailure('工具状态待核实'))
        with self.assertRaises(ToolOperationFailure):
            run_models(self.agent, invoke, task=self.task)
        self.assertEqual(invoke.call_count, 1)
