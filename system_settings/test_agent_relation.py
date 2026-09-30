from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from anthology.models import Anthology
from article.models import Article, ArticlePostComment, ArticlePostRating
from system_settings.agent_activity import record_post_comment, record_post_rating, record_tool_activity
from system_settings.agent_relation import (
    apply_affinity_event,
    backfill_relation_events,
    creativity_score,
    directional_band,
    display_tier,
    list_agent_activity_events,
    relation_graph,
    replay_affinity,
)
from system_settings.agent_views import AgentRelationView
from system_settings.agent_world.social_models import SocialRelation
from system_settings.models import Agent, AgentActivity, AgentAffinity, AgentRunRecord, AgentTask, MCPServer, SyncEntityState
from utils.mcp_client import call_mcp_tool


class AffinityMathTests(TestCase):
    def test_approval_approaches_but_does_not_stick_at_one_hundred(self):
        score = 0
        for _ in range(30):
            score = apply_affinity_event(score, 'comment', 'approve')
        self.assertLess(score, 100)
        self.assertGreater(score, 80)

    def test_disapproval_lowers_a_high_score(self):
        score = apply_affinity_event(90, 'comment', 'disapprove')
        self.assertLess(score, 90)

    def test_neutral_comment_does_not_move_the_score(self):
        self.assertEqual(replay_affinity([('comment', 'neutral')]), 0)

    def test_one_way_relationship_stops_at_familiar(self):
        self.assertEqual(display_tier('知己', ''), '熟悉')
        self.assertEqual(display_tier('知己', '初识'), '初识')
        self.assertEqual(display_tier('知己', '知己'), '知己')

    def test_band_hysteresis_holds_near_the_boundary(self):
        self.assertEqual(directional_band(22, '熟悉'), '熟悉')
        self.assertEqual(directional_band(15, '熟悉'), '初识')

    def test_creativity_uses_recent_spread_and_ratings(self):
        burst = creativity_score(8, [10, 10], 2, 1)
        spread = creativity_score(8, [10, 10], 2, 8)
        empty = creativity_score(0, [], 0, 0)
        low = creativity_score(8, [1, 1], 8, 8)
        high = creativity_score(8, [10, 10], 8, 8)
        self.assertEqual(empty, 0)
        self.assertLess(burst, spread)
        self.assertLess(low, high)


class AgentRelationFlowTests(TestCase):
    def setUp(self):
        self.author = Agent.objects.create(name='作者')
        self.reader = Agent.objects.create(name='读者')
        self.collection = Anthology.objects.create(title='关系文集', type='agent')
        self.article = Article.objects.create(
            title='新帖',
            content='正文',
            coll_id=self.collection.coll_id,
            agent_post_author_id=self.author.pk,
            agent_post_creator_id='agent:作者',
            agent_post_creator_name='作者',
        )
        self.task = AgentTask.objects.create(name='互动', agent=self.reader, agent_ids=[self.reader.id], prompt='互动')
        self.record = AgentRunRecord.objects.create(task=self.task, task_name=self.task.name, agent=self.reader, agent_name=self.reader.name)

    def test_comments_change_affinity_but_content_rating_does_not(self):
        for index in range(6):
            record_post_comment(self.reader, self.article, {
                'comment_id': f'cmt_{index}',
                'content': '认可',
            }, 'approve', self.record)
        rising = SocialRelation.objects.get(actor_id=self.reader.pk, counterpart_id=f'agent-id:{self.author.pk}')
        self.assertEqual(rising.affinity, 18)
        self.assertEqual(rising.familiarity, 12)

        record_post_rating(self.reader, self.article, 'rate_1', 1, self.record)
        record_post_rating(self.reader, self.article, 'rate_1', 1, self.record)
        falling = SocialRelation.objects.get(actor_id=self.reader.pk, counterpart_id=f'agent-id:{self.author.pk}')
        self.assertEqual(falling.affinity, rising.affinity)
        self.assertEqual(AgentActivity.objects.filter(event_key='rating:rate_1').count(), 1)
        self.assertEqual(falling.band, '中性')

    def test_comment_tool_activity_is_idempotent_by_comment(self):
        result = {'comment': {'comment_id': 'cmt_same', 'article_id': self.article.article_id, 'content': '一次', 'stance': 'neutral'}}
        record_tool_activity(self.record, self.reader, 'add_agent_post_comment', result, 1)
        record_tool_activity(self.record, self.reader, 'add_agent_post_comment', result, 2)
        self.assertEqual(AgentActivity.objects.filter(action='comment').count(), 1)
        affinity = SocialRelation.objects.get(actor_id=self.reader.pk, counterpart_id=f'agent-id:{self.author.pk}')
        self.assertEqual(affinity.band, '中性')
        self.assertEqual(affinity.familiarity, 2)
        self.assertFalse(SocialRelation.objects.filter(actor_id=self.author.pk, counterpart_id=f'agent-id:{self.reader.pk}').exists())

    def test_activity_mcp_returns_only_recorded_events(self):
        record_post_comment(self.reader, self.article, {'comment_id': 'cmt_week', 'content': '本周'}, 'approve')
        server = MCPServer.objects.create(
            name='Agent 动态 MCP',
            transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/agent-activities/',
            source='system',
            enabled=True,
            tools=[],
        )
        result, error = call_mcp_tool(server, 'list_agent_activities', {'days': 7}, agent=self.reader)
        self.assertIsNone(error)
        self.assertEqual(result['count'], 1)
        self.assertEqual(result['events'][0]['counterpart_name'], '作者')

        inbound, error = call_mcp_tool(server, 'list_agent_activities', {'direction': 'inbound'}, agent=self.author)
        self.assertIsNone(error)
        self.assertEqual(inbound['count'], 1)

    def test_graph_requires_login_and_keeps_isolated_agents(self):
        view = AgentRelationView.as_view()
        anonymous = view(APIRequestFactory().get('/api/settings/agent-relations/'))
        self.assertEqual(anonymous.status_code, 401)
        request = APIRequestFactory().get('/api/settings/agent-relations/')
        force_authenticate(request, user=User.objects.create_user('relation-user', password='password'))
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['data']['nodes']), 2)
        self.assertEqual(response.data['data']['edges'], [])

    def test_old_posts_do_not_raise_creativity(self):
        self.article.created_at = timezone.now() - timedelta(days=40)
        self.article.save(update_fields=['created_at'])
        ArticlePostRating.objects.create(article=self.article, rating=10, rater_id='agent:读者', rater_name='读者')
        graph = relation_graph()
        author = next(node for node in graph['nodes'] if node['id'] == self.author.id)
        self.assertEqual(author['creativity'], 0)
        self.assertEqual(author['post_count'], 0)
        self.assertEqual(author['active_days'], 0)

    def test_graph_query_does_not_backfill_historical_comments(self):
        ArticlePostComment.objects.create(
            article=self.article,
            content='以前的评论',
            creator_id='agent:读者',
            creator_name='读者',
        )
        graph = relation_graph()
        self.assertEqual(graph['edges'], [])
        self.assertFalse(SocialRelation.objects.exists())

    def test_list_events_ignores_empty_action_work_rows(self):
        AgentActivity.objects.create(event_key='work-only', activity_type='work', agent=self.reader, title='开始任务')
        result = list_agent_activity_events(self.reader, days=7)
        self.assertEqual(result['count'], 0)

    def test_backfill_reuses_legacy_comment_activity_and_run_record(self):
        comment = ArticlePostComment.objects.create(
            article=self.article, content='旧评论', creator_id='agent:读者', creator_name='读者',
        )
        old = AgentActivity.objects.create(
            event_key=f'run:{self.record.pk}:agent:{self.reader.pk}:tool:6',
            activity_type='interaction', agent=self.reader, run_record=self.record,
            artifact_kind='articleComment', artifact_id=comment.pk,
            artifact_article_id=self.article.pk, artifact_coll_id=self.collection.pk,
            title='旧动态', summary=comment.content,
        )
        backfill_relation_events()
        backfill_relation_events()
        old.refresh_from_db()
        self.assertEqual(old.event_key, f'comment:{comment.pk}')
        self.assertEqual(old.run_record_id, self.record.pk)
        self.assertEqual(old.action, 'comment')
        self.assertEqual(old.counterpart_id, 'agent:作者')
        self.assertEqual(AgentActivity.objects.filter(artifact_id=comment.pk).count(), 1)

    def test_backfill_merges_duplicate_but_preserves_canonical_stance_and_id(self):
        comment = ArticlePostComment.objects.create(
            article=self.article, content='同一条评论', creator_id='agent:读者', creator_name='读者',
        )
        canonical = record_post_comment(self.reader, self.article, {
            'comment_id': comment.pk, 'content': comment.content,
        }, 'approve')
        old = AgentActivity.objects.create(
            event_key=f'run:{self.record.pk}:agent:{self.reader.pk}:tool:6',
            activity_type='interaction', agent=self.reader, run_record=self.record,
            artifact_kind='articleComment', artifact_id=comment.pk, title='旧动态',
            metadata={'toolSequence': 6},
        )
        backfill_relation_events()
        backfill_relation_events()
        canonical.refresh_from_db()
        self.assertEqual(canonical.stance, 'approve')
        self.assertEqual(canonical.run_record_id, self.record.pk)
        self.assertEqual(canonical.metadata['toolSequence'], 6)
        self.assertFalse(AgentActivity.objects.filter(pk=old.pk).exists())
        self.assertTrue(SyncEntityState.objects.get(
            model_label='system_settings.agentactivity', object_pk=old.pk,
        ).is_deleted)
        self.assertEqual(AgentActivity.objects.filter(artifact_id=comment.pk).count(), 1)

    def test_backfill_keeps_distinct_comments_with_identical_content(self):
        for _ in range(2):
            ArticlePostComment.objects.create(
                article=self.article, content='内容相同', creator_id='agent:读者', creator_name='读者',
            )
        backfill_relation_events()
        self.assertEqual(AgentActivity.objects.filter(action='comment').count(), 2)

    def test_backfill_reuses_migration_comment_key(self):
        comment = ArticlePostComment.objects.create(
            article=self.article, content='迁移评论', creator_id='agent:读者', creator_name='读者',
        )
        old = AgentActivity.objects.create(
            event_key=f'legacy:post-comment:{comment.pk}', agent=self.reader,
            activity_type='interaction', artifact_kind='articleComment', artifact_id=comment.pk,
            title='迁移动态',
        )
        backfill_relation_events()
        old.refresh_from_db()
        self.assertEqual(old.event_key, f'comment:{comment.pk}')
        self.assertEqual(AgentActivity.objects.filter(artifact_id=comment.pk).count(), 1)


class DepartedRelationGraphTests(TestCase):
    def setUp(self):
        self.current = Agent.objects.create(name='现在居民')
        self.departed = Agent.objects.create(name='旧居民', avatar='🐱')
        self.old_id = self.departed.pk
        self.relation = SocialRelation.objects.create(
            id='departed-relation', owner_id='owner', actor_id=self.current.pk,
            counterpart_id=f'agent-id:{self.old_id}',
            counterpart_identity={'name': '过期名字', 'avatar': ''},
        )
        self.departed.delete()

    def test_default_hides_departed_and_their_edges(self):
        graph = relation_graph('owner')
        self.assertNotIn(self.old_id, [node['id'] for node in graph['nodes']])
        self.assertEqual(graph['edges'], [])

    def test_opt_in_recovers_snapshot_and_edge_without_binding_namesake(self):
        namesake = Agent.objects.create(name='旧居民')
        graph = relation_graph('owner', include_departed=True)
        old = next(node for node in graph['nodes'] if node['id'] == self.old_id)
        self.assertTrue(old['departed'])
        self.assertEqual((old['name'], old['avatar']), ('旧居民', '🐱'))
        self.assertEqual(len(graph['edges']), 1)
        self.assertNotIn(namesake.pk, [graph['edges'][0]['source_id'], graph['edges'][0]['target_id']])
        self.relation.refresh_from_db()
        self.assertEqual(self.relation.counterpart_identity['name'], '旧居民')

    def test_old_user_snapshot_is_never_a_departed_resident(self):
        SocialRelation.objects.create(id='user-relation', owner_id='owner', actor_id=self.current.pk,
            counterpart_id='user:owner', counterpart_identity={'name': 'Agent'})
        graph = relation_graph('owner', include_departed=True)
        user = next(node for node in graph['nodes'] if node['id'] == 'user:owner')
        self.assertEqual(user['kind'], 'user')
        self.assertEqual(user['name'], '我')
        self.assertFalse(user.get('departed', False))

    def test_history_is_scoped_to_owner_even_when_both_endpoints_departed(self):
        self.current.delete()
        graph = relation_graph('owner', include_departed=True)
        self.assertEqual(len(graph['edges']), 1)
        self.assertTrue(all(node.get('departed') for node in graph['nodes']))
        other = relation_graph('other', include_departed=True)
        self.assertEqual(other, {'nodes': [], 'edges': []})

    def test_endpoint_accepts_explicit_history_switch(self):
        from unittest.mock import patch
        user = User.objects.create_user('history-switch')
        request = APIRequestFactory().get('/api/settings/agent-relations/', {'includeDeparted': 'true'})
        force_authenticate(request, user=user)
        with patch('system_settings.agent_relation.relation_graph', return_value={'nodes': [], 'edges': []}) as graph:
            response = AgentRelationView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(graph.call_args.kwargs['include_departed'])
