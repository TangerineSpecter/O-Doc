"""HTML list projection should keep download selection without per-note queries."""
import uuid

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Article, ArticleAsset
from article.serializers import ArticleSerializer
from assets.models import Asset


class HtmlListQueriesTests(TestCase):
    def setUp(self):
        self.collection = Anthology.objects.create(
            coll_id='html-list-query', title='网页笔记', type='article', permission='public',
        )
        self.articles = [Article.objects.create(
            article_id=f'html-list-{index}', title=f'HTML {index}', content='正文',
            coll_id=self.collection.pk, permission='public', content_format='html',
        ) for index in range(5)]

        def reference(article_index, role, asset_id, reference_id, valid=True):
            asset = Asset.objects.create(
                id=asset_id, name=asset_id, original_name=asset_id, file_type='document', file_size=1,
                file_path=asset_id, file_extension='.html', mime_type='text/html',
                file_hash=asset_id, is_valid=valid,
            )
            ArticleAsset.objects.create(
                id=uuid.UUID(int=reference_id), article=self.articles[article_index], asset=asset, role=role,
            )

        reference(0, 'source', 'html-source-0', 1)
        reference(0, 'package', 'html-package-0', 2)
        reference(1, 'source', 'html-source-1', 3)
        reference(2, 'package', 'html-invalid-2', 4, valid=False)
        reference(2, 'source', 'html-source-2', 5)
        reference(4, 'package', 'html-later-4', 7)
        reference(4, 'package', 'html-first-4', 6)

    def test_html_list_uses_bounded_queries_and_matches_detail_selection(self):
        expected = {article.pk: ArticleSerializer(article).data['download_url'] for article in self.articles}
        self.assertEqual(expected, {
            'html-list-0': '/api/resource/download/html-package-0',
            'html-list-1': '/api/resource/download/html-source-1',
            'html-list-2': '/api/resource/download/html-source-2',
            'html-list-3': None,
            'html-list-4': '/api/resource/download/html-first-4',
        })
        for summary in (None, 1):
            params = {'coll_id': self.collection.pk}
            if summary:
                params['summary'] = summary
            with self.subTest(summary=summary), CaptureQueriesContext(connection) as queries:
                response = APIClient().get('/api/article/list', params)
            self.assertEqual(response.data['code'], 200)
            self.assertEqual({row['article_id']: row['download_url'] for row in response.data['data']}, expected)
            source_queries = [query['sql'] for query in queries if 'FROM "article_articleasset"' in query['sql']]
            self.assertEqual(len(source_queries), 1, source_queries)

    def test_markdown_only_list_does_not_query_html_sources(self):
        collection = Anthology.objects.create(
            coll_id='markdown-list-query', title='普通笔记', type='article', permission='public',
        )
        Article.objects.create(title='普通文章', content='正文', coll_id=collection.pk, permission='public')
        with CaptureQueriesContext(connection) as queries:
            response = APIClient().get('/api/article/list', {'coll_id': collection.pk, 'summary': 1})
        self.assertEqual(response.data['code'], 200)
        self.assertEqual(len(response.data['data']), 1)
        self.assertFalse(any('FROM "article_articleasset"' in query['sql'] for query in queries))
