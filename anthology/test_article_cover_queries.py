from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Article
from user.models import UserProfile


class ArticleCoverQueryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='article-cover-owner')
        owner = f'user_{self.user.pk}'
        UserProfile.objects.update_or_create(user=self.user, defaults={'userid': owner})
        self.collections = [Anthology.objects.create(
            coll_id=f'article-cover-{index}', title=f'文章文集{index}', type='article', permission='public',
            user_id=owner, hide_cover_content=index == 3, count=6,
        ) for index in range(4)]
        self.private = Anthology.objects.create(coll_id='article-cover-private', title='个人文集', type='article',
                                                permission='private', user_id=owner, count=6)
        self.foreign = Anthology.objects.create(coll_id='article-cover-foreign', title='他人文集', type='article',
                                                permission='private', user_id='someone-else', count=6)
        self.base = timezone.now() - timedelta(days=1)
        for collection in [*self.collections, self.private, self.foreign]:
            for index, sort in enumerate((0, 1, 1, 2, 3, 0)):
                article = Article.objects.create(
                    article_id=f'{collection.pk}-{index}', title=f'文章{index}', content='长正文' * 100,
                    coll_id=collection.pk, author=owner, sort=sort, is_valid=index != 5,
                    content_format='html' if index == 0 else 'markdown', enforce_note_privacy=index == 0,
                    permission='private' if index == 0 else 'public',
                )
                Article.objects.filter(pk=article.pk).update(updated_at=self.base + timedelta(minutes=index))
        self.client = APIClient()

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_article_covers_preserve_visibility_and_sort_with_one_query(self, _pending):
        for authenticated in (False, True):
            self.client.force_authenticate(self.user if authenticated else None)
            with self.subTest(authenticated=authenticated), CaptureQueriesContext(connection) as queries:
                response = self.client.get('/api/anthology/list', {'type': 'article'})
            self.assertEqual(response.data['code'], 200)
            rows = {item['coll_id']: item for item in response.data['data']}
            expected = {collection.pk for collection in self.collections}
            if authenticated:
                expected.add(self.private.pk)
            self.assertEqual(set(rows), expected)
            expected_indexes = (0, 2, 1) if authenticated else (2, 1, 3)
            for collection_id, row in rows.items():
                self.assertEqual(row['count'], 6)
                if collection_id == self.collections[3].pk:
                    self.assertEqual(row['articles'], [])
                    continue
                self.assertEqual([item['article_id'] for item in row['articles']],
                                 [f'{collection_id}-{index}' for index in expected_indexes])
                for item, index in zip(row['articles'], expected_indexes):
                    self.assertEqual(item['title'], f'文章{index}')
                    self.assertEqual(item['date'], (self.base + timedelta(minutes=index)).strftime('%m-%d'))
                    self.assertEqual(set(item), {'article_id', 'title', 'date'})
            statements = [query['sql'] for query in queries if 'FROM "articles"' in query['sql']]
            self.assertEqual(len(statements), 1, statements)
            self.assertNotIn('"content"', statements[0])
            self.assertNotIn('"mind_map"', statements[0])

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_hidden_article_collections_skip_cover_lookup(self, _pending):
        Anthology.objects.filter(type='article').update(hide_cover_content=True)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/anthology/list', {'type': 'article'})
        self.assertEqual(response.data['code'], 200)
        self.assertTrue(all(not item['articles'] for item in response.data['data']))
        self.assertFalse(any('FROM "articles"' in query['sql'] for query in queries))
