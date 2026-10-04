from unittest import skipUnless

from django.db import connection, DataError, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

from article.models import Article
from utils.test_source_urls import LONG_URL


@skipUnless(connection.vendor == 'postgresql', 'PostgreSQL column enforcement test')
class SourceURLMigrationTests(TransactionTestCase):
    def test_existing_column_is_widened_without_truncation(self):
        old = [('article', '0025_articlepostcomment_parent_comment_id_and_more')]
        new = [('article', '0026_alter_article_source_url')]
        MigrationExecutor(connection).migrate(old)
        try:
            short = Article.objects.create(title='迁移前', coll_id='synthetic', source_url='https://example.com/')
            with self.assertRaises(DataError), transaction.atomic():
                Article.objects.create(title='旧列拒绝', coll_id='synthetic', source_url=LONG_URL)
            MigrationExecutor(connection).migrate(new)
            short.refresh_from_db()
            self.assertEqual(short.source_url, 'https://example.com/')
            for index, url in enumerate([LONG_URL, 'https://example.com/' + 'x' * (2048 - len('https://example.com/'))]):
                article = Article.objects.create(title=f'新列允许{index}', coll_id='synthetic', source_url=url)
                article.refresh_from_db()
                self.assertEqual(article.source_url, url)
            with self.assertRaises(DataError), transaction.atomic():
                Article.objects.create(title='新列仍有上限', coll_id='synthetic', source_url='https://example.com/' + 'x' * 2048)
            with connection.cursor() as cursor:
                cursor.execute("SELECT character_maximum_length FROM information_schema.columns WHERE table_name='articles' AND column_name='source_url'")
                self.assertEqual(cursor.fetchone()[0], 2048)
        finally:
            MigrationExecutor(connection).migrate(new)
