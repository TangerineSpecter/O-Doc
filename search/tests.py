from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIRequestFactory

from anthology.models import Anthology
from article.models import Article
from search.views import GlobalSearchView
from tags.models import Tag


class SearchQueryTests(TestCase):
    def test_article_tag_queries_do_not_grow_with_result_count(self):
        collection = Anthology.objects.create(title='公开搜索', type='article', permission='public')
        tags = [Tag.objects.create(name=f'标签{index}') for index in range(5)]
        article = Article.objects.create(title='搜索样例', content='正文', coll_id=collection.pk)
        article.tags.set(tags)
        factory = APIRequestFactory()

        def search():
            with CaptureQueriesContext(connection) as queries:
                response = GlobalSearchView.as_view()(factory.get('/api/search', {
                    'keyword': '搜索样例', 'types': 'article', 'limit': 12,
                }))
            self.assertEqual(response.status_code, 200)
            return response.data['data'], len(queries)

        first, initial_queries = search()
        for index in range(8):
            article = Article.objects.create(title=f'搜索样例{index}', content='正文', coll_id=collection.pk)
            article.tags.set(tags)
        results, expanded_queries = search()
        self.assertEqual(results['counts']['article'], 9)
        self.assertEqual(len(results['items']), 9)
        self.assertEqual(initial_queries, expanded_queries)
        self.assertEqual(len(first['items']), 1)
