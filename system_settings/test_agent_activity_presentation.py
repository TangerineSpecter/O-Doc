from uuid import uuid4

from django.test import TestCase

from .agent_activity_presentation import activity_title, activity_rating, grouped_activities
from .models import Agent, AgentActivity, AgentRunRecord
from .serializers import AgentActivitySerializer


class ActivityPresentationTests(TestCase):
    def setUp(self):
        self.agent = Agent.objects.create(name='菲伦')
        self.record = AgentRunRecord.objects.create(agent=self.agent, task_name='阅读互动')

    def activity(self, action, **overrides):
        data = dict(event_key=str(uuid4()), agent=self.agent, run_record=self.record, activity_type='interaction',
                    action=action, artifact_article_id='post-1', artifact_coll_id='coll-1',
                    artifact_title='新帖', title=action, summary='评论正文' if action == 'comment' else '',
                    score_delta_basis='7' if action == 'rate' else 'neutral')
        return AgentActivity.objects.create(**{**data, **overrides})

    def test_pair_is_one_card_with_comment_and_score_and_keeps_facts(self):
        comment = self.activity('comment')
        self.activity('rate')
        rows = list(grouped_activities(AgentActivity.objects.all()))
        self.assertEqual([row.pk for row in rows], [comment.pk])
        data = AgentActivitySerializer(rows[0]).data
        self.assertEqual(data['title'], comment.title)
        self.assertEqual(data['rating'], 7)
        self.assertIsInstance(data['rating'], int)
        self.assertEqual(data['summary'], '评论正文')
        self.assertEqual(AgentActivity.objects.count(), 2)

    def test_other_run_actor_article_and_unlinked_history_stay_separate(self):
        self.activity('comment')
        other = AgentRunRecord.objects.create(agent=self.agent, task_name='另一次互动')
        self.activity('rate', run_record=other)
        self.activity('rate', agent=Agent.objects.create(name='其他居民'))
        self.activity('rate', artifact_article_id='post-2')
        self.activity('rate', run_record=None)
        self.assertEqual(grouped_activities(AgentActivity.objects.all()).count(), 5)

    def test_rating_without_comment_is_visible(self):
        rating = self.activity('rate')
        row = grouped_activities(AgentActivity.objects.all()).get()
        self.assertEqual(activity_title(row), '菲伦评分了《新帖》')
        self.assertEqual(activity_rating(row), 7)

    def test_grouping_happens_before_pagination(self):
        for index in range(3):
            self.activity('comment', artifact_article_id=f'post-{index}')
            self.activity('rate', artifact_article_id=f'post-{index}')
        rows = grouped_activities(AgentActivity.objects.all()).order_by('-occurred_at', '-id')
        self.assertEqual(rows.count(), 3)
        self.assertEqual(len(list(rows[:2])), 2)

    def test_invalid_or_missing_rating_has_no_badge_value(self):
        for value in ('', 'neutral', '7 分', '7.5', '0', '11'):
            row = self.activity('rate', score_delta_basis=value)
            self.assertIsNone(activity_rating(row))
        self.assertIsNone(activity_rating(self.activity('comment')))

    def test_numeric_rating_uses_execution_fact_instead_of_title(self):
        row = self.activity('rate', title='打了 10 分', score_delta_basis='3')
        self.assertEqual(activity_rating(row), 3)
        self.assertNotIn('10', activity_title(row))
