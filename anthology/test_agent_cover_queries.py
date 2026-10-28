from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Article, ArticlePostComment, ArticlePostRating
from user.models import UserProfile


class AgentCoverQueryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='agent-cover-owner')
        owner = f'user_{self.user.pk}'
        UserProfile.objects.update_or_create(user=self.user, defaults={'userid': owner})
        self.collections = [Anthology.objects.create(
            coll_id=f'agent-cover-{index}', title=f'居民文集{index}', type='agent', permission='public',
            user_id=owner, hide_cover_content=index == 3,
        ) for index in range(4)]
        self.private = Anthology.objects.create(coll_id='agent-cover-private', title='个人居民文集', type='agent',
                                                permission='private', user_id=owner)
        self.foreign = Anthology.objects.create(coll_id='agent-cover-foreign', title='他人居民文集', type='agent',
                                                permission='private', user_id='someone-else')
        self.base = timezone.now() - timedelta(days=1)
        for collection in [*self.collections, self.private, self.foreign]:
            for index in range(6):
                post = Article.objects.create(
                    article_id=f'{collection.pk}-{index}', title=f'帖子{index}', content='大正文' * 100,
                    coll_id=collection.pk, author=owner, created_at=self.base + timedelta(minutes=index),
                    content_format='html' if index == 4 else 'markdown', enforce_note_privacy=index == 4,
                    permission='private' if index == 4 else 'public', is_valid=index != 5,
                    post_summary=f'摘要{index}', agent_post_creator_id=f'agent-{index}',
                    agent_post_creator_name='' if index == 2 else f'居民{index}',
                    agent_post_creator_avatar=f'/avatar-{index}.png', agent_post_category='话题', agent_post_rating=8,
                )
                for comment_index in range(3):
                    ArticlePostComment.objects.create(article=post, content='评论正文' * 50,
                                                      is_valid=comment_index < 2)
                ArticlePostRating.objects.create(article=post, rating=8, rater_id='valid', is_valid=True)
                ArticlePostRating.objects.create(article=post, rating=5, rater_id='removed', is_valid=False)
        self.client = APIClient()

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_agent_covers_keep_visibility_order_and_counts_with_bounded_queries(self, _pending):
        for authenticated in (False, True):
            self.client.force_authenticate(self.user if authenticated else None)
            with self.subTest(authenticated=authenticated), CaptureQueriesContext(connection) as queries:
                response = self.client.get('/api/anthology/list', {'type': 'agent'})
            self.assertEqual(response.data['code'], 200)
            rows = {row['coll_id']: row for row in response.data['data']}
            expected = {collection.pk for collection in self.collections}
            if authenticated:
                expected.add(self.private.pk)
            self.assertEqual(set(rows), expected)
            expected_indexes = (4, 3, 2) if authenticated else (3, 2, 1)
            for coll_id, row in rows.items():
                if coll_id == self.collections[3].pk:
                    self.assertEqual(row['articles'], [])
                    continue
                self.assertEqual([post['article_id'] for post in row['articles']],
                                 [f'{coll_id}-{index}' for index in expected_indexes])
                for post, index in zip(row['articles'], expected_indexes):
                    self.assertEqual(post['title'], f'帖子{index}')
                    self.assertEqual(post['summary'], f'摘要{index}')
                    self.assertEqual(post['agent_name'], 'Agent' if index == 2 else f'居民{index}')
                    self.assertEqual(post['agent_id'], f'agent-{index}')
                    self.assertEqual(post['agent_avatar'], f'/avatar-{index}.png')
                    self.assertEqual(post['category'], '话题')
                    self.assertEqual((post['rating'], post['rating_count'], post['comment_count']), (8, 1, 2))
                    self.assertEqual(post['date'], (self.base + timedelta(minutes=index)).strftime('%m-%d'))
                    self.assertEqual(post['created_at'], (self.base + timedelta(minutes=index)).isoformat())
            for table in ('articles', 'article_post_comments', 'article_post_ratings'):
                statements = [query['sql'] for query in queries if f'FROM "{table}"' in query['sql']]
                self.assertEqual(len(statements), 1, (table, statements))
                self.assertNotIn('"content"', statements[0])

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_hidden_agent_covers_skip_post_and_interaction_queries(self, _pending):
        Anthology.objects.filter(type='agent').update(hide_cover_content=True)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/anthology/list', {'type': 'agent'})
        self.assertTrue(all(not row['articles'] for row in response.data['data']))
        for table in ('articles', 'article_post_comments', 'article_post_ratings'):
            self.assertFalse(any(f'FROM "{table}"' in query['sql'] for query in queries))

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_empty_agent_collection_skips_interaction_queries(self, _pending):
        Anthology.objects.filter(type='agent').update(hide_cover_content=True)
        empty = Anthology.objects.create(coll_id='agent-cover-empty', title='空居民文集', type='agent',
                                         permission='public', user_id=f'user_{self.user.pk}')
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/anthology/list', {'type': 'agent'})
        rows = {row['coll_id']: row for row in response.data['data']}
        self.assertEqual(rows[empty.pk]['articles'], [])
        for table in ('article_post_comments', 'article_post_ratings'):
            self.assertFalse(any(f'FROM "{table}"' in query['sql'] for query in queries))

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_mixed_article_and_agent_cards_keep_their_own_sort_and_fields(self, _pending):
        collection = Anthology.objects.create(coll_id='ordinary-cover', title='普通文集', type='article',
                                              permission='public', user_id=f'user_{self.user.pk}')
        for index, sort in enumerate((4, 1, 3, 2)):
            Article.objects.create(article_id=f'ordinary-cover-{index}', title=f'普通文章{index}', content='正文',
                                   coll_id=collection.pk, sort=sort, permission='public')
        response = self.client.get('/api/anthology/list')
        self.assertEqual(response.data['code'], 200)
        rows = {row['coll_id']: row for row in response.data['data']}
        self.assertEqual([article['article_id'] for article in rows[collection.pk]['articles']],
                         ['ordinary-cover-1', 'ordinary-cover-3', 'ordinary-cover-2'])
        self.assertNotIn('agent_id', rows[collection.pk]['articles'][0])
        self.assertEqual(rows[self.collections[0].pk]['articles'][0]['article_id'], f'{self.collections[0].pk}-3')
        self.assertEqual(rows[self.collections[0].pk]['articles'][0]['comment_count'], 2)

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_new_post_without_interactions_has_zero_counts(self, _pending):
        Article.objects.create(article_id='agent-cover-no-interactions', title='新帖子', content='正文',
                               coll_id=self.collections[0].pk, permission='public',
                               created_at=self.base + timedelta(minutes=10))
        response = self.client.get('/api/anthology/list', {'type': 'agent'})
        rows = {row['coll_id']: row for row in response.data['data']}
        newest = rows[self.collections[0].pk]['articles'][0]
        self.assertEqual(newest['article_id'], 'agent-cover-no-interactions')
        self.assertEqual((newest['rating_count'], newest['comment_count']), (0, 0))
