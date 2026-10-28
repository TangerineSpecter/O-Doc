from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from types import SimpleNamespace
from unittest.mock import patch
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Article
from article.agent_post_projection import creator_profession_cache
from article.serializers import ArticleSerializer
from system_settings.models import Agent
from system_settings.agent_world.models import WorldProfession


class ArticleListProfessionTests(TestCase):
    def setUp(self):
        self.collection = Anthology.objects.create(
            coll_id='profession-list', title='帖子', type='agent', permission='public',
        )
        self.profession = WorldProfession.objects.create(name='研究者')
        for index in range(8):
            agent = Agent.objects.create(id=f'agent-{index}', name=f'居民{index}', profession=self.profession)
            Article.objects.create(
                article_id=f'profession-post-{index}', title=f'帖子{index}', content='正文',
                coll_id=self.collection.pk, permission='public',
                agent_post_creator_id=f'agent-id:{agent.pk}', agent_post_creator_name=agent.name,
            )

    def test_list_resolves_professions_in_bounded_queries(self):
        with CaptureQueriesContext(connection) as queries:
            response = APIClient().get('/api/article/list', {'coll_id': self.collection.pk})
        self.assertEqual(response.status_code, 200)
        rows = response.data['data']
        self.assertEqual(len(rows), 8)
        self.assertTrue(all(row['agent_post_creator_profession'] == '研究者' for row in rows))
        agent_queries = [query['sql'] for query in queries if 'FROM "sys_agent"' in query['sql']]
        self.assertEqual(len(agent_queries), 1, agent_queries)
        self.assertNotIn('"sys_agent"."feishu_app_secret"', agent_queries[0])

    def test_list_preserves_id_and_legacy_name_fallback(self):
        Agent.objects.create(id='no-profession', name='无职业')
        cases = [
            ('missing-id', '居民0'),
            ('', '居民1'),
            ('no-profession', '居民2'),
            ('does-not-exist', '不存在'),
        ]
        for index, (creator_id, creator_name) in enumerate(cases):
            Article.objects.create(
                article_id=f'legacy-profession-{index}', title=f'旧帖子{index}', content='正文',
                coll_id=self.collection.pk, permission='public',
                agent_post_creator_id=creator_id, agent_post_creator_name=creator_name,
            )
        expected = {
            post.pk: ArticleSerializer(post).data['agent_post_creator_profession']
            for post in Article.objects.filter(article_id__startswith='legacy-profession-')
        }
        rows = APIClient().get('/api/article/list', {'coll_id': self.collection.pk}).data['data']
        actual = {row['article_id']: row['agent_post_creator_profession'] for row in rows if row['article_id'] in expected}
        self.assertEqual(actual, expected)
        self.assertEqual([actual[f'legacy-profession-{i}'] for i in range(4)], ['研究者', '研究者', '', ''])

    def test_batch_limit_and_original_lookup_fallback(self):
        Agent.objects.bulk_create([
            Agent(id=f'bulk-{index}', name=f'批量{index}', profession=self.profession)
            for index in range(401)
        ])
        posts = [SimpleNamespace(agent_post_creator_id=f'agent-id:bulk-{index}', agent_post_creator_name=f'批量{index}')
                 for index in range(401)]
        with CaptureQueriesContext(connection) as queries:
            cache = creator_profession_cache(posts)
        self.assertEqual(len(cache), 401)
        self.assertTrue(all(value == '研究者' for value in cache.values()))
        self.assertEqual(len(queries), 2)
        with patch('article.views.creator_profession_cache', side_effect=RuntimeError('batch unavailable')):
            with self.assertLogs('article.views', level='WARNING'):
                response = APIClient().get('/api/article/list', {'coll_id': self.collection.pk})
        self.assertTrue(all(row['agent_post_creator_profession'] == '研究者' for row in response.data['data']))
