from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIRequestFactory

from anthology.models import Anthology
from article.models import Article, Image
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

    def test_grouped_image_page_uses_matching_representative_and_latest_match(self):
        collection = Anthology.objects.create(title='图片搜索', type='image', permission='public')
        def photo(title, index, group='trip'):
            return Image.objects.create(title=title, coll_id=collection.pk, group_index=index, photo_group_id=group)
        photo('未命中的封面', 0)
        representative = photo('花园第一张', 1)
        photo('花园独立照片', 0, '')
        latest = photo('花园最后一张', 8)
        request = APIRequestFactory().get('/api/search', {'keyword': '花园', 'types': 'image', 'limit': 1})
        with CaptureQueriesContext(connection) as queries:
            data = GlobalSearchView.as_view()(request).data['data']
        self.assertEqual(data['counts']['image'], 2)
        self.assertEqual([row['id'] for row in data['items']], [f'image:{representative.pk}'])
        self.assertEqual(data['items'][0]['updated_at'], latest.updated_at)
        self.assertTrue(any('ROW_NUMBER()' in q['sql'].upper() for q in queries))
