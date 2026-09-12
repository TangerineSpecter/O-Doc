import importlib
from unittest.mock import patch

from django.apps import apps as django_apps
from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from anthology.models import Anthology
from article.models import Article, ArticleAnnotation, ArticleAnnotationComment
from system_settings.agent_activity import record_tool_activity
from system_settings.agent_task_scheduler import AgentTaskScheduler
from system_settings.agent_views import AgentActivityViewSet
from system_settings.models import Agent, AgentActivity, AgentRunRecord, AgentTask
from system_settings.serializers import AgentTaskSerializer


class AgentWorldSchedulerTests(TestCase):
    def setUp(self):
        self.source = Agent.objects.create(name='猫猫')
        self.reviewer = Agent.objects.create(name='哈哈')
        self.task = AgentTask.objects.create(
            name='每日科技热点',
            agent=self.source,
            agent_ids=[self.source.id],
            trigger='手动执行',
            prompt='整理今天值得关注的科技变化',
        )

    @patch('system_settings.agent_task_scheduler.AIService.chat_completion_messages', return_value='今天有三个值得关注的变化。')
    def test_plain_output_creates_one_completed_work_activity(self, _completion):
        record = AgentTaskScheduler()._run_task(self.task, trigger='手动执行')

        activities = AgentActivity.objects.filter(run_record=record, agent=self.source, activity_type='work')
        self.assertEqual(activities.count(), 1)
        activity = activities.get()
        self.assertEqual(activity.status, 'success')
        self.assertIn('三个值得关注', activity.metadata['outputPreview'])
        self.assertFalse(Article.objects.exists())

    @patch('system_settings.agent_task_scheduler.AIService.chat_completion_messages', return_value='完成')
    def test_serial_multi_agent_task_creates_one_work_activity_per_agent(self, _completion):
        self.task.agent_ids = [self.source.id, self.reviewer.id]
        self.task.execution_mode = 'serial'
        self.task.save(update_fields=['agent_ids', 'execution_mode'])

        record = AgentTaskScheduler()._run_task(self.task, trigger='手动执行')

        activities = AgentActivity.objects.filter(run_record=record, activity_type='work')
        self.assertEqual(activities.count(), 2)
        self.assertEqual(set(activities.values_list('agent_id', flat=True)), {self.source.id, self.reviewer.id})

    @patch('system_settings.agent_task_scheduler.AIService.chat_completion_messages')
    def test_continue_research_runs_once_without_recursion(self, completion):
        completion.side_effect = ['初步调查结果', '补充调查结果']
        self.task.followup_enabled = True
        self.task.followup_agent = self.reviewer
        self.task.followup_action = 'continue_research'
        self.task.save(update_fields=['followup_enabled', 'followup_agent', 'followup_action'])

        root = AgentTaskScheduler()._run_task(self.task, trigger='手动执行')

        followups = AgentRunRecord.objects.filter(parent_record=root, followup_depth=1)
        self.assertEqual(followups.count(), 1)
        self.assertEqual(followups.get().agent, self.reviewer)
        self.assertEqual(AgentRunRecord.objects.filter(followup_depth__gt=1).count(), 0)

    @patch('system_settings.agent_task_scheduler.AIService.chat_completion_messages', return_value='没有发布作品')
    def test_review_followup_skips_when_no_post_was_published(self, _completion):
        self.task.followup_enabled = True
        self.task.followup_agent = self.reviewer
        self.task.followup_action = 'review'
        self.task.save(update_fields=['followup_enabled', 'followup_agent', 'followup_action'])

        root = AgentTaskScheduler()._run_task(self.task, trigger='手动执行')

        self.assertFalse(AgentRunRecord.objects.filter(parent_record=root).exists())

    def test_followup_record_has_database_level_idempotency(self):
        root = AgentRunRecord.objects.create(
            task=self.task,
            task_name=self.task.name,
            agent=self.source,
            agent_name=self.source.name,
            followup_depth=0,
        )
        values = {
            'task': self.task,
            'task_name': '继续调查',
            'agent': self.reviewer,
            'agent_name': self.reviewer.name,
            'parent_record': root,
            'source_agent': self.source,
            'followup_depth': 1,
        }
        AgentRunRecord.objects.create(**values)

        with self.assertRaises(IntegrityError), transaction.atomic():
            AgentRunRecord.objects.create(**values)


class AgentWorldActivityTests(TestCase):
    def setUp(self):
        self.agent = Agent.objects.create(name='猫猫')
        self.task = AgentTask.objects.create(name='写作', agent=self.agent, agent_ids=[self.agent.id], prompt='写作')
        self.record = AgentRunRecord.objects.create(
            task=self.task,
            task_name=self.task.name,
            agent=self.agent,
            agent_name=self.agent.name,
        )
        self.collection = Anthology.objects.create(title='Agent 世界', type='agent')
        self.article = Article.objects.create(
            title='新鲜事',
            content='正文',
            coll_id=self.collection.coll_id,
            agent_post_creator_id=f'agent:{self.agent.name}',
            agent_post_creator_name=self.agent.name,
        )

    def test_successful_post_tool_creates_idempotent_publication(self):
        result = {'post': {'article_id': self.article.article_id, 'post_summary': '一条新发现'}}
        record_tool_activity(self.record, self.agent, 'create_agent_post', result, 1)
        record_tool_activity(self.record, self.agent, 'create_agent_post', result, 1)

        activities = AgentActivity.objects.filter(activity_type='publication')
        self.assertEqual(activities.count(), 1)
        self.assertEqual(activities.get().artifact_article_id, self.article.article_id)

    def test_activity_api_requires_login_and_supports_filters(self):
        AgentActivity.objects.create(
            event_key='test:publication',
            activity_type='publication',
            status='success',
            agent=self.agent,
            title='发布了作品',
            artifact_kind='agentPost',
            artifact_id=self.article.article_id,
            artifact_article_id=self.article.article_id,
            artifact_coll_id=self.collection.coll_id,
        )
        AgentActivity.objects.create(
            event_key='test:work',
            activity_type='work',
            status='success',
            agent=self.agent,
            title='完成了任务',
        )
        view = AgentActivityViewSet.as_view({'get': 'list'})
        anonymous_response = view(APIRequestFactory().get('/api/settings/agent-activities/'))
        self.assertEqual(anonymous_response.status_code, 401)

        request = APIRequestFactory().get('/api/settings/agent-activities/', {'type': 'publication', 'limit': 1})
        force_authenticate(request, user=User.objects.create_user('world-user', password='password'))
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['data']['items']), 1)
        self.assertEqual(response.data['data']['items'][0]['type'], 'publication')

    @override_settings(USE_TZ=False)
    def test_today_summary_supports_naive_datetimes(self):
        AgentActivity.objects.create(
            event_key='test:naive-today',
            activity_type='work',
            status='success',
            agent=self.agent,
            title='完成了任务',
            occurred_at=timezone.now(),
        )
        request = APIRequestFactory().get('/api/settings/agent-activities/today-summary/')
        force_authenticate(request, user=User.objects.create_user('summary-user', password='password'))

        response = AgentActivityViewSet.as_view({'get': 'today_summary'})(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['todayActivityCount'], 1)

    def test_cursor_does_not_skip_activities_with_same_timestamp(self):
        occurred_at = timezone.now()
        for activity_id in ['activity_zzz', 'activity_yyy', 'activity_xxx']:
            AgentActivity.objects.create(
                id=activity_id,
                event_key=f'test:{activity_id}',
                activity_type='work',
                status='success',
                agent=self.agent,
                title='完成了任务',
                occurred_at=occurred_at,
            )
        view = AgentActivityViewSet.as_view({'get': 'list'})
        user = User.objects.create_user('cursor-user', password='password')
        first_request = APIRequestFactory().get('/api/settings/agent-activities/', {'limit': 2})
        force_authenticate(first_request, user=user)
        first_response = view(first_request)
        first_data = first_response.data['data']

        second_request = APIRequestFactory().get('/api/settings/agent-activities/', {
            'limit': 2,
            'cursor': first_data['nextCursor'],
        })
        force_authenticate(second_request, user=user)
        second_response = view(second_request)

        first_ids = {item['id'] for item in first_data['items']}
        second_ids = {item['id'] for item in second_response.data['data']['items']}
        self.assertTrue(first_ids.isdisjoint(second_ids))
        self.assertEqual(first_ids | second_ids, {'activity_zzz', 'activity_yyy', 'activity_xxx'})

    def test_followup_agent_must_differ_from_primary_agent(self):
        serializer = AgentTaskSerializer(instance=self.task, data={
            'followup_enabled': True,
            'followup_agent': self.agent.id,
        }, partial=True)

        self.assertFalse(serializer.is_valid())
        self.assertIn('followup_agent', serializer.errors)

    def test_private_artifact_activity_is_hidden_from_other_users(self):
        private_collection = Anthology.objects.create(
            title='私密世界',
            type='agent',
            permission='private',
            user_id='another-user',
        )
        AgentActivity.objects.create(
            event_key='test:private-artifact',
            activity_type='publication',
            status='success',
            agent=self.agent,
            title='私密作品',
            summary='不应向其他用户展示',
            artifact_kind='agentPost',
            artifact_id='private-article',
            artifact_article_id='private-article',
            artifact_coll_id=private_collection.coll_id,
        )
        visible_activity = AgentActivity.objects.create(
            event_key='test:public-artifact',
            activity_type='publication',
            status='success',
            agent=self.agent,
            title='公开作品',
            artifact_kind='agentPost',
            artifact_id=self.article.article_id,
            artifact_article_id=self.article.article_id,
            artifact_coll_id=self.collection.coll_id,
        )
        request = APIRequestFactory().get('/api/settings/agent-activities/')
        force_authenticate(request, user=User.objects.create_user('permission-user', password='password'))

        response = AgentActivityViewSet.as_view({'get': 'list'})(request)

        activity_ids = {item['id'] for item in response.data['data']['items']}
        self.assertIn(visible_activity.id, activity_ids)
        self.assertNotIn(AgentActivity.objects.get(event_key='test:private-artifact').id, activity_ids)

    def test_backfill_includes_agent_replies_to_existing_annotations(self):
        annotation = ArticleAnnotation.objects.create(
            article=self.article,
            selected_text='正文',
            start_offset=0,
            end_offset=2,
            creator_type='user',
            creator_id='admin',
            creator_name='管理员',
        )
        comment = ArticleAnnotationComment.objects.create(
            annotation=annotation,
            content='来自 Agent 的追加回复',
            creator_type='agent',
            creator_id=f'agent:{self.agent.name}',
            creator_name=self.agent.name,
        )

        migration = importlib.import_module('system_settings.migrations.0021_agent_world')
        migration.backfill_agent_activities(django_apps, None)

        activity = AgentActivity.objects.get(event_key=f'legacy:annotation-comment:{comment.comment_id}')
        self.assertEqual(activity.agent, self.agent)
        self.assertEqual(activity.artifact_id, annotation.annotation_id)
