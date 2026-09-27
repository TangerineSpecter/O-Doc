import json
import tempfile
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from .agent_random_schedule import has_active_random_period, initialize_runtime, make_plan, period_bounds, progress, run_random_task
from .agent_task_scheduler import AgentTaskScheduler
from .agent_views import AgentTaskViewSet
from .models import Agent, AgentRandomRuntime, AgentRunRecord, AgentTask, SyncEntityState
from .serializers import AgentTaskSerializer
from .sync_state import LOCAL_ONLY_MODEL_LABELS
from utils.sync_manager import SyncManager


class RandomScheduleTests(TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.temp.name, SYSTEM_LOG_ENABLED=False)
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.a = Agent.objects.create(name='A')
        self.b = Agent.objects.create(name='B')
        self.task = AgentTask.objects.create(name='随机研究', agent=self.a, agent_ids=[self.a.pk, self.b.pk],
                                             prompt='研究', schedule_mode='random', random_count=2)
        self.now = datetime(2026, 9, 27, 12)
        self.clock = patch('system_settings.agent_random_schedule.local_now', return_value=self.now)
        self.clock.start()
        self.addCleanup(self.clock.stop)

    def ready_plan(self):
        state = make_plan(self.task, self.now)
        for slot in state['slots']:
            slot['at'] = (self.now - timedelta(minutes=1)).isoformat()
        AgentRandomRuntime.objects.update_or_create(task=self.task, defaults={'state': state})
        return state

    def scheduler(self, outcomes):
        def execute(task, *, trigger, agents_override, random_context):
            results = [{'agent': agent.pk, 'status': outcomes.get(agent.pk, 'success')} for agent in agents_override]
            return AgentRunRecord.objects.create(task=self.task, task_name=self.task.name, trigger=trigger,
                random_context=random_context, agent_runs=results,
                status='success' if all(result['status'] == 'success' for result in results) else 'failed')
        scheduler = Mock()
        scheduler._run_task.side_effect = execute
        return scheduler

    def test_calendar_boundaries_and_leap_year(self):
        cases = [
            ('daily', datetime(2024, 2, 29, 23), datetime(2024, 2, 29), datetime(2024, 3, 1)),
            ('weekly', datetime(2026, 9, 27, 12), datetime(2026, 9, 21), datetime(2026, 9, 28)),
            ('monthly', datetime(2026, 12, 31), datetime(2026, 12, 1), datetime(2027, 1, 1)),
            ('yearly', datetime(2024, 2, 29), datetime(2024, 1, 1), datetime(2025, 1, 1)),
        ]
        for period, now, start, end in cases:
            with self.subTest(period=period):
                self.assertEqual(period_bounds(period, now), (start, end))

    def test_random_slots_are_spread_over_remaining_period(self):
        for period in ('daily', 'weekly', 'monthly', 'yearly'):
            self.task.random_period = period
            self.task.random_count = 10
            state = make_plan(self.task, self.now)
            end = datetime.fromisoformat(state['end'])
            width = (end - self.now) / 10
            for index, slot in enumerate(state['slots']):
                at = datetime.fromisoformat(slot['at'])
                self.assertGreaterEqual(at, self.now + width * index)
                self.assertLess(at, self.now + width * (index + 1))
            self.assertEqual(state, make_plan(self.task, self.now))

    def test_serial_default_allocation_and_rotation(self):
        self.task.execution_mode = 'serial'
        self.task.random_count = 5
        state = make_plan(self.task, self.now)
        self.assertEqual(state['config']['targets'], {self.a.pk: 3, self.b.pk: 2})
        self.assertEqual([slot['agents'] for slot in state['slots']], [[self.a.pk], [self.b.pk], [self.a.pk], [self.b.pk], [self.a.pk]])
        self.task.random_allocations = {self.a.pk: 1, self.b.pk: 2}
        self.assertEqual(len(make_plan(self.task, self.now)['slots']), 3)

    def test_parallel_partial_failure_retries_only_failed_agent(self):
        self.ready_plan()
        first = self.scheduler({self.b.pk: 'failed'})
        run_random_task(first, self.task, self.now)
        report = progress(self.task)
        self.assertEqual([item['success_count'] for item in report['agents']], [1, 0])
        self.assertEqual(report['status'], 'retrying')
        second = self.scheduler({})
        run_random_task(second, self.task, self.now + timedelta(minutes=4))
        second._run_task.assert_not_called()
        run_random_task(second, self.task, self.now + timedelta(minutes=5))
        self.assertEqual([agent.pk for agent in second._run_task.call_args.kwargs['agents_override']], [self.b.pk])
        run_random_task(second, self.task, self.now + timedelta(minutes=6))
        self.assertEqual([item['success_count'] for item in progress(self.task)['agents']], [2, 2])
        run_random_task(second, self.task, self.now + timedelta(minutes=7))
        self.assertEqual(second._run_task.call_count, 2)

    def test_failure_backoff_and_no_success_count(self):
        self.ready_plan()
        scheduler = self.scheduler({self.a.pk: 'failed', self.b.pk: 'failed'})
        now = self.now
        for delay in (5, 15, 30, 60, 60):
            with patch('system_settings.agent_random_schedule.local_now', return_value=now):
                run_random_task(scheduler, self.task, now)
            state = AgentRandomRuntime.objects.get(task=self.task).state
            self.assertEqual(datetime.fromisoformat(state['retry_at']), now + timedelta(minutes=delay))
            now += timedelta(minutes=delay)
        self.assertEqual([item['success_count'] for item in progress(self.task)['agents']], [0, 0])

    def test_active_lease_prevents_second_dispatch(self):
        self.ready_plan()
        AgentRandomRuntime.objects.filter(task=self.task).update(lease_token='other', lease_until=timezone.now() + timedelta(minutes=10))
        scheduler = self.scheduler({})
        run_random_task(scheduler, self.task, self.now)
        scheduler._run_task.assert_not_called()

    def test_unexpected_exception_is_not_counted_and_uses_backoff(self):
        self.ready_plan()
        scheduler = Mock()
        scheduler._run_task.side_effect = RuntimeError('模拟未预期异常')
        with self.assertLogs('system_settings.agent_random_schedule', level='ERROR'):
            run_random_task(scheduler, self.task, self.now)
        report = progress(self.task)
        self.assertEqual(report['status'], 'retrying')
        self.assertEqual([item['success_count'] for item in report['agents']], [0, 0])

    def test_recovered_success_does_not_delay_next_slot_with_old_backoff(self):
        state = self.ready_plan()
        state['retry_at'] = (self.now + timedelta(hours=1)).isoformat()
        state['retry_slot'] = 0
        AgentRandomRuntime.objects.filter(task=self.task).update(state=state)
        AgentRunRecord.objects.create(task=self.task, task_name='同步来的成功', status='success',
            random_context={'plan_id': state['id'], 'slot': 0},
            agent_runs=[{'agent': agent.pk, 'status': 'success'} for agent in (self.a, self.b)])
        scheduler = self.scheduler({})
        run_random_task(scheduler, self.task, self.now)
        self.assertEqual(scheduler._run_task.call_args.kwargs['random_context']['slot'], 1)

    def test_restart_preserves_plan_and_success_before_interruption(self):
        state = self.ready_plan()
        AgentRunRecord.objects.create(task=self.task, task_name='中断', status='running', random_context={'plan_id': state['id'], 'slot': 0},
                                      agent_runs=[{'agent': self.a.pk, 'status': 'success'}, {'agent': self.b.pk, 'status': 'running'}])
        scheduler = self.scheduler({})
        run_random_task(scheduler, self.task, self.now)
        self.assertEqual([agent.pk for agent in scheduler._run_task.call_args.kwargs['agents_override']], [self.b.pk])
        self.assertEqual(AgentRandomRuntime.objects.get(task=self.task).state['slots'], state['slots'])

    def test_manual_followups_and_duplicate_records_do_not_increase_quota(self):
        state = self.ready_plan()
        for context, depth in (({}, 0), ({'plan_id': state['id'], 'slot': 0}, 1),
                               ({'plan_id': state['id'], 'slot': 0}, 0), ({'plan_id': state['id'], 'slot': 0}, 0)):
            AgentRunRecord.objects.create(task=self.task, task_name='执行', status='success', random_context=context,
                followup_depth=depth, agent_runs=[{'agent': self.a.pk, 'status': 'success'}])
        self.assertEqual([item['success_count'] for item in progress(self.task)['agents']], [1, 0])

    def test_configuration_changes_take_effect_next_period(self):
        state = self.ready_plan()
        self.task.random_period = 'weekly'
        self.task.random_count = 3
        self.task.save()
        self.assertTrue(progress(self.task)['config_pending'])
        self.assertEqual(progress(self.task)['target_count'], 2)
        scheduler = self.scheduler({})
        end = datetime.fromisoformat(state['end'])
        with patch('system_settings.agent_random_schedule.local_now', return_value=end):
            run_random_task(scheduler, self.task, end)
            report = progress(self.task)
        self.assertEqual(report['target_count'], 3)
        self.assertEqual([item['success_count'] for item in report['agents']], [0, 0])
        self.assertFalse(report['config_pending'])

    def test_disabling_pauses_and_resuming_keeps_plan(self):
        state = self.ready_plan()
        self.task.enabled = False
        self.task.save()
        scheduler = AgentTaskScheduler()
        with patch.object(scheduler, '_advance_post_illustrations'), patch.object(scheduler, '_run_task') as execute:
            scheduler._maybe_run_due_tasks()
            execute.assert_not_called()
        self.task.enabled = True
        self.task.save()
        self.assertEqual(AgentRandomRuntime.objects.get(task=self.task).state['slots'], state['slots'])

    def test_allocations_validate_and_legacy_default_is_fixed(self):
        for count, allocations in ((0, []), (10001, []), (2, [{'agent_id': self.a.pk, 'count': 3}]),
                                    (2, [{'agent_id': self.a.pk, 'count': 0}]),
                                    (2, [{'agent_id': 'unknown', 'count': 1}]),
                                    (2, [{'agent_id': self.a.pk, 'count': 1.5}])):
            serializer = AgentTaskSerializer(self.task, data={'random_count': count, 'execution_mode': 'serial', 'random_allocations': allocations}, partial=True)
            self.assertFalse(serializer.is_valid(), serializer.errors)
        legacy = AgentTask.objects.create(name='旧任务', agent=self.a)
        self.assertEqual(legacy.schedule_mode, 'fixed')
        self.assertIsNone(AgentTaskSerializer(legacy).data['random_progress'])

    def test_camel_case_api_preserves_agent_ids_and_initializes_plan(self):
        user = User.objects.create_user(username='random-admin')
        factory = APIRequestFactory()
        request = factory.post('/settings/agent-tasks/', {'name': 'API随机', 'agent': self.a.pk,
            'agents': [self.a.pk, self.b.pk], 'executionMode': 'serial', 'scheduleMode': 'random',
            'randomPeriod': 'yearly', 'randomCount': 10,
            'randomAllocations': [{'agentId': self.a.pk, 'count': 6}, {'agentId': self.b.pk, 'count': 4}]}, format='json')
        force_authenticate(request, user=user)
        response = AgentTaskViewSet.as_view({'post': 'create'})(request)
        response.render()
        self.assertEqual(response.status_code, 200, response.content)
        data = json.loads(response.content)['data']
        self.assertEqual(data['randomAllocations'], [{'agentId': self.a.pk, 'count': 6}, {'agentId': self.b.pk, 'count': 4}])
        self.assertEqual(data['randomProgress']['agents'][0]['target'], 6)
        self.assertTrue(AgentRandomRuntime.objects.filter(task_id=data['id']).exists())

    def test_runtime_excluded_but_configuration_and_records_exported(self):
        self.ready_plan()
        run_random_task(self.scheduler({}), self.task, self.now)
        models = {model._meta.label_lower for model in SyncManager()._iter_target_models()}
        self.assertNotIn('system_settings.agentrandomruntime', models)
        self.assertIn('system_settings.agentrandomruntime', LOCAL_ONLY_MODEL_LABELS)
        self.assertIn('system_settings.agenttask', models)
        self.assertIn('system_settings.agentrunrecord', models)
        self.assertFalse(SyncEntityState.objects.filter(model_label='system_settings.agentrandomruntime').exists())
        snapshot = SyncManager().build_snapshot_data()
        self.assertFalse(any(item['model'] == 'system_settings.agentrandomruntime' for item in snapshot))
        task_data = next(item['fields'] for item in snapshot if item['model'] == 'system_settings.agenttask' and item['pk'] == self.task.pk)
        record_data = next(item['fields'] for item in snapshot if item['model'] == 'system_settings.agentrunrecord')
        self.assertEqual(task_data['schedule_mode'], 'random')
        self.assertEqual(task_data['random_cycle_snapshot']['id'], self.task.random_cycle_snapshot['id'])
        self.assertEqual(set(task_data['random_cycle_snapshot']), {'id', 'start', 'end', 'config', 'available_start'})
        self.assertIn('plan_id', record_data['random_context'])

    def test_restore_preserves_current_quota_after_pending_configuration_change(self):
        self.ready_plan()
        run_random_task(self.scheduler({}), self.task, self.now)
        original_id = self.task.random_cycle_snapshot['id']
        self.task.random_count = 3
        self.task.random_period = 'weekly'
        self.task.save()
        AgentRandomRuntime.objects.filter(task=self.task).delete()
        self.task.refresh_from_db()
        report = progress(self.task)
        self.assertEqual(report['target_count'], 2)
        self.assertEqual([agent['success_count'] for agent in report['agents']], [1, 1])
        self.assertTrue(report['config_pending'])
        self.assertEqual(make_plan(self.task, self.now)['id'], original_id)

    def test_restore_before_first_execution_preserves_slots_and_fixed_transition(self):
        initialize_runtime(self.task)
        original = AgentRandomRuntime.objects.get(task=self.task).state
        self.task.schedule_mode = 'fixed'
        self.task.random_count = 3
        self.task.save()
        AgentRandomRuntime.objects.filter(task=self.task).delete()
        self.task.refresh_from_db()
        self.assertEqual(make_plan(self.task, self.now + timedelta(hours=1))['slots'], original['slots'])
        self.assertTrue(has_active_random_period(self.task, self.now))
        self.assertEqual(progress(self.task)['target_count'], 2)
        end = datetime.fromisoformat(original['end'])
        with patch('system_settings.agent_random_schedule.local_now', return_value=end):
            self.assertFalse(has_active_random_period(self.task, end))
            self.assertIsNone(progress(self.task))

    def test_deleted_serial_agent_does_not_block_remaining_opportunities(self):
        self.task.execution_mode = 'serial'
        self.task.random_count = 4
        self.task.save()
        self.ready_plan()
        scheduler = self.scheduler({})
        run_random_task(scheduler, self.task, self.now)
        deleted_id = self.b.pk
        self.b.delete()
        run_random_task(scheduler, self.task, self.now)
        run_random_task(scheduler, self.task, self.now)
        self.assertEqual(scheduler._run_task.call_count, 2)
        report = progress(self.task)
        self.assertEqual(report['status'], 'complete')
        self.assertEqual([agent['success_count'] for agent in report['agents']], [2, 0])
        self.assertTrue(report['agents'][1]['unavailable'])
        self.assertEqual(report['agents'][1]['agent_id'], deleted_id)
        self.assertEqual(AgentRunRecord.objects.filter(task=self.task, status='failed').count(), 1)
        AgentRandomRuntime.objects.filter(task=self.task).delete()
        run_random_task(scheduler, self.task, self.now)
        self.assertEqual(scheduler._run_task.call_count, 2)
        self.assertEqual(AgentRunRecord.objects.filter(task=self.task, status='failed').count(), 1)
        self.assertEqual([agent['success_count'] for agent in progress(self.task)['agents']], [2, 0])

    def test_deleted_parallel_agent_does_not_block_next_round(self):
        self.ready_plan()
        scheduler = self.scheduler({})
        run_random_task(scheduler, self.task, self.now)
        self.b.delete()
        run_random_task(scheduler, self.task, self.now)
        self.assertEqual([agent.pk for agent in scheduler._run_task.call_args.kwargs['agents_override']], [self.a.pk])
        report = progress(self.task)
        self.assertEqual(report['status'], 'complete')
        self.assertEqual([agent['success_count'] for agent in report['agents']], [2, 1])
        self.assertTrue(report['agents'][1]['unavailable'])
