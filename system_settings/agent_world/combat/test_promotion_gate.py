from datetime import timedelta
from unittest.mock import Mock, patch

from django.test import TestCase

from system_settings.agent_availability import agent_operation
from system_settings.models import Agent, AgentExecutionLease, AIModel, AIProvider
from ..execution import execution_lease
from ..life_time import local_time, storage_time
from . import attributes, explorations, worker
from .models import CombatProfile, CombatRuntime
from .preparation import promotion
from .queries import profile_view
from .store import current, install


class PromotionGateTests(TestCase):
    def setUp(self):
        provider = AIProvider.objects.create(name='test', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='test', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='转职冒险者', model=model)
        self.now = storage_time(local_time())
        install()
        self.run = explorations.request('admin', self.agent, 'promotion-trip', {}, now=self.now)
        self.run = explorations.depart(self.run.pk, {
            'dungeon_id': 'dungeon.moss_cave', 'style_id': 'style.balanced',
            'duration_seconds': 1800, 'potions': {},
        }, now=self.now)

    def pause_at_gate(self):
        profile = CombatProfile.objects.get(pk=self.agent.pk)
        catalog = current(profile.catalog_id)
        experience = sum(int(catalog.row('level_experience', f'level.{level}')['experience_to_next'])
                         for level in range(1, 10))
        profile.progression, _ = attributes.award(catalog, profile.progression, experience, stop_at_promotion=True)
        profile.save()
        explorations.hold_for_promotion(self.run, profile)
        self.job = attributes.promotion_options(catalog, profile.progression)[0]['id']

    def test_paused_promotion_can_choose_and_resume(self):
        self.pause_at_gate()
        with self.assertRaisesMessage(ValueError, '转职选择尚未完成'):
            explorations.resume(self.run.pk)
        with self.assertRaisesMessage(ValueError, '居民正在执行其他任务'):
            with agent_operation(self.agent):
                self.fail('Ordinary operations must remain blocked by the paused exploration')
        planner = Mock(return_value={'job_id': self.job, 'reason': '适合现有装备'})
        promotion(self.run.pk, planner=planner)
        self.run.refresh_from_db()
        profile = CombatProfile.objects.get(pk=self.agent.pk)
        self.assertEqual(planner.call_count, 1)
        self.assertEqual(profile.progression['job'], self.job)
        self.assertEqual(self.run.status, 'active')
        self.assertEqual(self.run.state['player']['skills'], profile.progression['skills'])
        self.assertEqual(self.run.snapshot['progression'], profile.progression)
        self.assertTrue(AgentExecutionLease.objects.get(pk=self.agent.pk).token.startswith('combat:'))

    def test_promotion_still_respects_another_task_lease(self):
        self.pause_at_gate()
        AgentExecutionLease.objects.filter(pk=self.agent.pk).update(
            token='another-task', until=self.now + timedelta(minutes=10))
        planner = Mock()
        with self.assertRaisesMessage(ValueError, '居民正在执行其他任务'):
            promotion(self.run.pk, planner=planner)
        planner.assert_not_called()
        self.assertEqual(AgentExecutionLease.objects.get(pk=self.agent.pk).token, 'another-task')

    def test_exclusion_does_not_bypass_active_or_another_exploration(self):
        AgentExecutionLease.objects.filter(pk=self.agent.pk).update(token='', until=None)
        with execution_lease(AgentExecutionLease, {'agent': self.agent}, promotion_run_id=self.run.pk) as token:
            self.assertIsNone(token)
        self.pause_at_gate()
        with execution_lease(AgentExecutionLease, {'agent': self.agent}, promotion_run_id='another-run') as token:
            self.assertIsNone(token)

    def test_worker_failure_waits_for_explicit_retry_and_success_is_not_requeued(self):
        self.pause_at_gate()

        def synchronous_thread(*args, **kwargs):
            thread = Mock()
            if kwargs.get('name') == 'combat-promotion':
                thread.start.side_effect = lambda: kwargs['target'](*kwargs['args'])
            return thread

        with patch('system_settings.agent_world.combat.worker.threading.Thread', side_effect=synchronous_thread), \
             patch('system_settings.agent_world.combat.worker.close_old_connections'), \
             patch('system_settings.agent_world.combat.worker.logger.exception'), \
             patch('system_settings.agent_world.combat.preparation.ask', side_effect=ValueError('模型暂不可用')) as planner:
            worker.advance()
            runtime = CombatRuntime.objects.get(pk=self.run.pk)
            self.assertFalse(runtime.promotion_pending)
            self.assertNotIn('promotion_allowed', runtime.requests)
            self.assertFalse(profile_view('admin', self.agent)['promotion_busy'])
            self.run.refresh_from_db()
            self.assertEqual(self.run.status, 'paused')
            worker.advance()
            self.assertEqual(planner.call_count, 1)

            explorations.request_promotion_retry('admin', self.agent, 'retry-promotion')
            planner.side_effect = None
            planner.return_value = {'job_id': self.job, 'reason': '重试后选定职业'}
            worker.advance()
            self.run.refresh_from_db()
            self.assertEqual(self.run.status, 'active')
            self.assertEqual(CombatProfile.objects.get(pk=self.agent.pk).progression['job'], self.job)
            self.assertFalse(CombatRuntime.objects.get(pk=self.run.pk).promotion_pending)
            worker.advance()
            self.assertEqual(planner.call_count, 2)
