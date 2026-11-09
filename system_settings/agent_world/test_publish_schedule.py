"""Quota admission, model input and model-free repair on the existing schedule facts."""
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.test import TestCase, override_settings

from system_settings.models import Agent, WorldAction, WorldActionRuntime
from .life_config import DEFAULTS, ensure_profiles
from .life_daily_facts import build, task_reason
from .life_models import LifeConfig, LifeItem, LifeRevision
from .life_time import SHANGHAI
from .publish_schedule import repair_quota_failures, replan_if_blocked, replan_quota_intentions
from .test_publish import PublicationTests as _Fixtures


@override_settings(USE_TZ=True)
class PublishScheduleTests(TestCase):
    quota_config = _Fixtures.quota_config

    def quota_post(self, title):
        return _Fixtures.quota_post(self, title, created_at=self.now)

    def setUp(self):
        self.now = datetime(2026, 11, 9, 10, tzinfo=SHANGHAI)
        self.enterContext(patch('django.utils.timezone.now', return_value=self.now))
        _Fixtures.setUp(self)
        WorldActionRuntime.objects.filter(pk='world').update(enabled=True)
        self.task.prompt = '发帖专用要求'
        self.task.publish_config = self.quota_config(quota_total=1)
        self.task.save()
        self.life_config = LifeConfig.objects.create(pk='admin', migrated=True,
            settings={**DEFAULTS, 'agent_ids': [self.agent.pk]})
        ensure_profiles('admin', [self.agent.pk])

    def item(self, key='item', **kwargs):
        at = kwargs.pop('scheduled_at', self.now + timedelta(hours=2))
        actor = kwargs.pop('actor_id', self.agent.pk)
        return LifeItem.objects.create(pk=key, owner_id='admin', actor_id=actor,
                                      original_at=at, scheduled_at=at, **kwargs)

    def test_total_cap_removes_candidates_and_task_requirements(self):
        self.quota_post('已发布')
        context = build('admin', self.agent, [self.item()], {})
        self.assertEqual(context['slots'][0]['allowed_activities'], [])
        self.assertNotIn('post_publish', context['requirements'])
        self.assertNotIn('post_publish', context['activity_energy'])
        self.assertNotIn('publishing', context)
        self.assertEqual(context['activities'], [])

    def test_personal_cap_only_filters_that_resident(self):
        other = Agent.objects.create(name='未达到上限', model=self.agent.model)
        self.task.agent_ids = [self.agent.pk, other.pk]
        self.task.publish_config = self.quota_config(quota_total=5, quota_per_agent=1)
        self.task.save()
        self.quota_post('已发布')
        item = self.item()
        self.assertEqual(build('admin', self.agent, [item], {})['activities'], [])
        item.actor_id = other.pk; item.save()
        self.life_config.settings['agent_ids'].append(other.pk)
        self.life_config.save()
        ensure_profiles('admin', [other.pk])
        context = build('admin', other, [item], {})
        self.assertIn('post_publish', context['slots'][0]['allowed_activities'])
        self.assertEqual(context['requirements']['post_publish'], '发帖专用要求')

    def test_target_period_resets_for_day_week_and_month(self):
        self.quota_post('本期已发布')
        for period, future in [('daily', self.now + timedelta(days=1)),
                               ('weekly', self.now + timedelta(days=7)),
                               ('monthly', self.now.replace(month=12))]:
            with self.subTest(period=period):
                self.task.publish_config = self.quota_config(quota_total=1, quota_period=period)
                self.task.save()
                self.assertIn('上限', task_reason('admin', self.agent, self.task, self.now))
                self.assertEqual(task_reason('admin', self.agent, self.task, future), '')
                context = build('admin', self.agent, [self.item(period, scheduled_at=future)], {})
                self.assertIn('post_publish', context['slots'][0]['allowed_activities'])
                self.assertEqual(context['publishing']['remaining_quota'], 1)

    def test_outstanding_intention_requeued_but_future_period_preserved(self):
        self.quota_post('已发布')
        item = self.item(activity='post_publish', task_id=self.task.pk,
                         context={'planned_on': '2026-11-09'})
        future = self.item('tomorrow', activity='post_publish', task_id=self.task.pk,
                           scheduled_at=self.now + timedelta(days=1))
        replan_quota_intentions(self.life_config, self.now)
        item.refresh_from_db(); future.refresh_from_db()
        self.assertEqual(item.activity, 'unplanned')
        self.assertEqual(item.status, 'pending')
        self.assertNotIn('planned_on', item.context)
        self.assertEqual(future.activity, 'post_publish')
        revisions = LifeRevision.objects.count()
        replan_quota_intentions(self.life_config, self.now)
        self.assertEqual(LifeRevision.objects.count(), revisions)

    def test_scan_reaches_blocked_actor_after_full_page_of_allowed_rows(self):
        from .publish_config import quota_usage
        other = Agent.objects.create(name='仍有额度', model=self.agent.model)
        self.task.agent_ids = [self.agent.pk, other.pk]
        self.task.publish_config = self.quota_config(quota_total=5, quota_per_agent=1)
        self.task.save()
        self.quota_post('已发布')
        for key in ('a', 'b'):
            self.item(key, actor_id=other.pk, activity='post_publish')
        blocked = self.item('z', activity='post_publish')
        with patch('system_settings.agent_world.publish_schedule.INTENTION_BATCH_SIZE', 2), patch(
            'system_settings.agent_world.publish_config.quota_usage', wraps=quota_usage,
        ) as usage:
            with CaptureQueriesContext(connection) as queries:
                replan_quota_intentions(self.life_config, self.now)
            self.assertFalse(any('FOR UPDATE' in q['sql'] for q in queries))
            self.assertEqual(usage.call_count, 1)
            blocked.refresh_from_db()
            self.assertEqual(blocked.activity, 'post_publish')
            replan_quota_intentions(self.life_config, self.now)
        blocked.refresh_from_db()
        self.assertEqual(blocked.activity, 'unplanned')

    def test_saved_choice_is_cleared_before_retry(self):
        self.quota_post('已发布')
        item = self.item()
        item.context = {'daily_choice': {'time': item.scheduled_at.isoformat(),
            'plan': {'id': item.pk, 'activity': 'post_publish', 'reason': '原意向'}}}
        item.save()
        self.assertTrue(replan_if_blocked(item, now=self.now))
        self.assertNotIn('daily_choice', item.context)

    def test_old_quota_failure_becomes_rest_without_replaying_or_losing_record(self):
        item = self.item(activity='post_publish', status='failed', task_id=self.task.pk,
                         record_id='original-record', result={'reason': '本期发帖总量已达到上限'})
        WorldAction.objects.create(pk=item.pk, task=self.task, agent=self.agent,
            actor_id=self.agent.pk, status='skipped', result=item.result)
        repair_quota_failures(self.life_config)
        item.refresh_from_db()
        self.assertEqual(item.status, 'rest')
        self.assertEqual(item.record_id, 'original-record')
        self.assertEqual(item.result['reason'], '本期发帖总量已达到上限')
        self.assertEqual(WorldAction.objects.get(pk=item.pk).status, 'skipped')
        from article.models import Article
        self.assertEqual(Article.objects.count(), 0)

    def test_manual_started_successful_and_unrelated_failures_are_preserved(self):
        self.quota_post('已发布')
        manual = self.item('manual', activity='post_publish', context={'manual': True})
        started = self.item('started', activity='post_publish', context={'execution_started': 'yes'})
        failed = self.item('failed', activity='post_publish', status='failed', result={'reason': '搜索失败'})
        success = self.item('success', activity='post_publish', status='failed', result={'reason': '本期发帖总量已达到上限'})
        WorldAction.objects.create(pk=success.pk, task=self.task, agent=self.agent, actor_id=self.agent.pk,
                                   status='success', energy_cost=Decimal(20))
        repair_quota_failures(self.life_config)
        replan_quota_intentions(self.life_config, self.now)
        for row, status in [(manual, 'pending'), (started, 'pending'), (failed, 'failed'), (success, 'failed')]:
            row.refresh_from_db()
            self.assertEqual(row.status, status)
            self.assertEqual(row.activity, 'post_publish')

    def test_disabled_tick_repairs_history_and_preserves_future_intention(self):
        from .life_runner import tick_life

        self.quota_post('已发布')
        WorldActionRuntime.objects.update_or_create(pk='world', defaults={'enabled': False})
        context = {'daily_choice': {'plan': {'activity': 'post_publish'}}, 'planned_on': '2026-11-09'}
        future = self.item('future', activity='post_publish', task_id=self.task.pk, context=context)
        failed = self.item('old', activity='post_publish', status='failed',
                           result={'reason': '本期发帖总量已达到上限'})
        tick_life(Mock())
        failed.refresh_from_db()
        future.refresh_from_db()
        self.assertEqual(failed.status, 'rest')
        self.assertEqual((future.activity, future.task_id, future.context), ('post_publish', self.task.pk, context))
        self.assertFalse(LifeRevision.objects.filter(item=future).exists())

    def test_protected_failures_do_not_fill_repair_batch(self):
        reason = {'reason': '本期发帖总量已达到上限'}
        at = self.now - timedelta(days=1)
        rows = [LifeItem(pk=f'protected-{i}', owner_id='admin', actor_id=self.agent.pk,
                         original_at=at, scheduled_at=at, activity='post_publish', status='failed',
                         result=reason, context={'execution_key': f'action-{i}'}) for i in range(200)]
        LifeItem.objects.bulk_create(rows)
        WorldAction.objects.bulk_create([
            WorldAction(pk=row.context['execution_key'], task=self.task, agent=self.agent, actor_id=self.agent.pk,
                        status='skipped', result={}) for row in rows
        ])
        eligible = self.item('eligible', status='failed', result=reason,
                             context={'daily_choice': {'plan': {'activity': 'post_publish'}}})
        repair_quota_failures(self.life_config)
        eligible.refresh_from_db()
        self.assertEqual(eligible.status, 'rest')
        self.assertEqual(LifeItem.objects.filter(status='failed').count(), 200)

    def test_quota_changes_during_planning_become_rest(self):
        from .life_daily_planner import prepare_detail
        item = self.item()
        self.quota_post('刚发布')
        plan = prepare_detail(self.life_config, self.agent, item,
                              {'activity': 'post_publish', 'reason': '原意向'}, Mock())
        self.assertEqual(plan['activity'], 'rest')

    def test_direct_execution_invalidates_before_any_model_or_publication(self):
        from .life_runner import execute_item
        self.quota_post('已发布')
        item = self.item(activity='post_publish', task_id=self.task.pk)
        with patch('system_settings.agent_world.publish_runner.run_publish_opportunity') as run, \
             patch('system_settings.agent_world.life_planner.ask') as ask:
            execute_item(item, Mock())
        run.assert_not_called(); ask.assert_not_called()
        item.refresh_from_db()
        self.assertEqual(item.activity, 'unplanned')
        self.assertEqual(item.status, 'pending')

    def test_interrupted_quota_skip_finishes_as_rest(self):
        from .life_runner import finish_running
        item = self.item(activity='post_publish', status='running', task_id=self.task.pk)
        WorldAction.objects.create(pk=item.pk, task=self.task, agent=self.agent, actor_id=self.agent.pk,
            status='skipped', result={'reason': '该 Agent 本期发帖量已达到上限'})
        finish_running(self.life_config, self.now)
        item.refresh_from_db()
        self.assertEqual(item.status, 'rest')
