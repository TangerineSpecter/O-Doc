"""World recovery ordering and local execution authorization, without external I/O."""
from contextlib import contextmanager
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from system_settings.agent_task_scheduler import AgentTaskScheduler
from system_settings.models import Agent, AgentTask, WorldAction, WorldActionRuntime
from .world_cycle import tick


class WorldCycleTests(TestCase):
    def setUp(self):
        self.events = []
        self.scheduler = object()
        self.token = 'world-token'
        self.runtime = WorldActionRuntime.objects.create(pk='world', enabled=False)
        callbacks = {
            'tournament_runner.tick': 'tournaments',
            'market_sessions.cleanup': 'market_cleanup',
            'market_tick.run': 'market_tick',
            'bounty_runner.tick': 'bounties',
            'publish_media.recover_photos': 'post_photos',
            'investment_lifecycle.recover': 'investment_recovery',
            'cooking_runner.tick_cooking': 'cooking',
            'alchemy_runner.tick_alchemy': 'alchemy',
            'blacksmith_runner.tick_blacksmith': 'blacksmith',
            'life_runner.tick_life': 'life',
            'travel_runner.tick_travel': 'travel',
            'farm_runner.tick_farms': 'farm',
            'publish_runner.run_publish_opportunity': 'publications',
            'social_runner.tick_social': 'social',
        }
        self.work = {}
        for target, label in callbacks.items():
            def record(*args, _label=label, **kwargs):
                self.events.append(_label)
            self.work[label] = self.enterContext(patch(
                'system_settings.agent_world.' + target, side_effect=record))

        @contextmanager
        def lease(*args, **kwargs):
            self.events.append('lease_entered')
            try:
                yield self.token
            finally:
                self.events.append('lease_released')
        self.enterContext(patch('system_settings.agent_world.world_cycle.execution_lease', side_effect=lease))

    def test_world_off_keeps_recovery_and_manual_work_in_existing_order(self):
        tick(self.scheduler)

        self.assertEqual(self.events, [
            'tournaments', 'market_cleanup', 'market_tick', 'bounties', 'post_photos',
            'investment_recovery', 'cooking', 'alchemy', 'blacksmith', 'life',
            'lease_entered', 'travel', 'farm', 'lease_released',
        ])
        self.work['travel'].assert_called_once_with(self.scheduler, self.token, manual_only=True)
        self.work['farm'].assert_called_once_with(self.scheduler, self.token, False)
        self.work['publications'].assert_not_called()
        self.work['social'].assert_not_called()

    def test_world_busy_still_recovers_and_checks_life_before_claiming_execution(self):
        self.token = None
        tick(self.scheduler)

        self.assertLess(self.events.index('investment_recovery'), self.events.index('life'))
        self.assertLess(self.events.index('life'), self.events.index('lease_entered'))
        self.assertEqual(self.events[-1], 'lease_released')
        for label in ('travel', 'farm', 'publications', 'social'):
            self.work[label].assert_not_called()

    def test_publication_recovery_uses_world_lease_and_social_starts_after_release(self):
        self.runtime.enabled = True
        self.runtime.save(update_fields=['enabled'])
        agent = Agent.objects.create(name='发帖居民')
        task = AgentTask.objects.create(name='恢复发帖', task_kind='post_publish', agent=agent)
        action = WorldAction.objects.create(pk='pending-post', task=task, agent=agent,
                                            actor_id=agent.pk, status='claimed')
        WorldAction.objects.filter(pk=action.pk).update(updated_at=timezone.now() - timedelta(minutes=16))

        tick(self.scheduler)

        self.work['travel'].assert_called_once_with(self.scheduler, self.token, manual_only=False)
        self.work['farm'].assert_called_once_with(self.scheduler, self.token, True)
        resumed = self.work['publications']
        resumed.assert_called_once()
        self.assertEqual(resumed.call_args.args[0].pk, task.pk)
        self.assertEqual(resumed.call_args.kwargs, {'key': action.pk, 'manual': False, 'locked': self.token})
        self.assertLess(self.events.index('lease_entered'), self.events.index('publications'))
        self.assertLess(self.events.index('publications'), self.events.index('lease_released'))
        self.assertLess(self.events.index('lease_released'), self.events.index('social'))
        action.refresh_from_db()
        self.assertEqual(action.status, 'claimed')

    def test_scheduler_uses_the_world_cycle_entry(self):
        scheduler = AgentTaskScheduler()
        with patch.object(scheduler, '_advance_post_illustrations'), \
                patch('system_settings.agent_world.world_cycle.tick') as cycle:
            scheduler._maybe_run_due_tasks()
        cycle.assert_called_once_with(scheduler)
