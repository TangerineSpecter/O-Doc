import os
import tempfile
from datetime import timedelta

from django.contrib.auth.models import User
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from anthology.models import Anthology, Book, BookReadingProgress
from article.models import Article
from assets.models import Asset
from memos.models import Memo

from .models import DailyReviewItem


class KnowledgeMaintenanceApiTests(APITestCase):
    def setUp(self):
        self.media_dir = tempfile.TemporaryDirectory()
        self.settings_override = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.settings_override.enable()
        self.user = User.objects.create_superuser(username='admin', password='password')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        self.article_collection = Anthology.objects.create(
            coll_id='review_articles', title='回顾文章', user_id='admin', type='article', permission='private',
        )
        self.book_collection = Anthology.objects.create(
            coll_id='review_books', title='回顾图书', user_id='admin', type='book', permission='private',
        )

    def tearDown(self):
        self.settings_override.disable()
        self.media_dir.cleanup()

    def create_old_article(self, article_id='old_article', title='旧文章', content='值得重新阅读的正文'):
        article = Article.objects.create(
            article_id=article_id,
            title=title,
            content=content,
            coll_id=self.article_collection.coll_id,
            author='admin',
        )
        old_time = timezone.now() - timedelta(days=45)
        Article.objects.filter(pk=article.pk).update(created_at=old_time, updated_at=old_time)
        article.refresh_from_db()
        return article

    def create_book(self):
        path = 'document/review.txt'
        os.makedirs(os.path.join(self.media_dir.name, 'document'), exist_ok=True)
        with open(os.path.join(self.media_dir.name, path), 'wb') as book_file:
            book_file.write(b'review book')
        asset = Asset.objects.create(
            id='review_book_asset', name='review.txt', original_name='review.txt', file_type='document',
            file_size=11, file_path=path, file_extension='.txt', mime_type='text/plain', uploader='admin',
            file_hash='book-hash', source_type='other',
        )
        book = Book.objects.create(
            book_id='review_book', anthology=self.book_collection, asset=asset,
            title='在读图书', author='作者', book_format='txt',
        )
        progress = BookReadingProgress.objects.create(book=book, user_id='admin', progress=35, location='chapter-2')
        BookReadingProgress.objects.filter(pk=progress.pk).update(last_read_at=timezone.now() - timedelta(days=2))
        return book

    def test_daily_review_is_stable_and_supports_status_and_refresh(self):
        self.create_old_article()
        memo = Memo.objects.create(content='一条沉淀已久的闪念', user_id='admin')
        Memo.objects.filter(pk=memo.pk).update(updated_at=timezone.now() - timedelta(days=20))
        self.create_book()

        first = self.client.get('/api/maintenance/reviews')
        second = self.client.get('/api/maintenance/reviews')

        self.assertEqual(first.status_code, 200)
        first_ids = [item['id'] for item in first.data['data']['items']]
        self.assertEqual(first_ids, [item['id'] for item in second.data['data']['items']])
        self.assertGreaterEqual(len(first_ids), 3)

        update = self.client.put(
            f'/api/maintenance/reviews/items/{first_ids[0]}',
            {'status': 'completed'},
            format='json',
        )
        self.assertEqual(update.data['data']['completed'], 1)

        refreshed = self.client.post('/api/maintenance/reviews/refresh', {}, format='json')
        refreshed_ids = [item['id'] for item in refreshed.data['data']['items']]
        self.assertIn(first_ids[0], refreshed_ids)
        self.assertEqual(set(refreshed_ids), set(first_ids))
        self.assertEqual(DailyReviewItem.objects.get(id=first_ids[0]).status, 'completed')

    def test_completed_book_is_not_used_as_fallback(self):
        completed_book = self.create_book()
        BookReadingProgress.objects.filter(book=completed_book, user_id='admin').update(progress=100)

        response = self.client.get('/api/maintenance/reviews')

        self.assertEqual(response.data['data']['total'], 0)

    def test_invalid_review_date_uses_http_bad_request(self):
        response = self.client.get('/api/maintenance/reviews?date=2000-01-01')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 400)

    def test_health_rules_ignore_and_content_change(self):
        article = self.create_old_article(content='有内容但没有分类和标签')
        missing_asset = Asset.objects.create(
            id='missing_asset', name='missing.pdf', original_name='missing.pdf', file_type='document',
            file_size=20, file_path='document/missing.pdf', file_extension='.pdf', mime_type='application/pdf',
            uploader='admin', file_hash='missing-hash', source_type='other',
        )
        Asset.objects.filter(pk=missing_asset.pk).update(upload_time=timezone.now() - timedelta(days=8))

        response = self.client.get('/api/maintenance/health')
        issues = response.data['data']['items']
        rule_codes = {issue['rule_code'] for issue in issues}
        self.assertIn('article_uncategorized', rule_codes)
        self.assertIn('article_untagged', rule_codes)
        self.assertIn('asset_missing', rule_codes)
        self.assertNotIn('rag_pending', rule_codes)

        issue = next(item for item in issues if item['rule_code'] == 'article_untagged')
        ignored = self.client.post('/api/maintenance/health/ignore', {
            'ruleCode': issue['rule_code'],
            'sourceType': issue['source_type'],
            'sourceId': issue['source_id'],
            'fingerprint': issue['fingerprint'],
        }, format='json')
        self.assertEqual(ignored.status_code, 200)
        after_ignore = self.client.get('/api/maintenance/health')
        self.assertNotIn('article_untagged', {
            item['rule_code'] for item in after_ignore.data['data']['items'] if item['source_id'] == article.article_id
        })

        Article.objects.filter(pk=article.pk).update(title='标题发生变化', updated_at=timezone.now())
        after_change = self.client.get('/api/maintenance/health')
        self.assertIn('article_untagged', {
            item['rule_code'] for item in after_change.data['data']['items'] if item['source_id'] == article.article_id
        })

    def test_cloud_only_book_file_is_not_reported_missing(self):
        asset = Asset.objects.create(
            id='cloud_book_asset', name='cloud.txt', original_name='cloud.txt', file_type='document',
            file_size=10, file_path='books/cloud.txt', file_extension='.txt', mime_type='text/plain',
            uploader='admin', file_hash='cloud-hash', source_type='other',
        )
        Book.objects.create(
            book_id='cloud_book', anthology=self.book_collection, asset=asset, title='云端图书',
            book_format='txt', local_state='cloud_only', remote_available=True, remote_hash='cloud-hash',
        )
        response = self.client.get('/api/maintenance/health')
        missing_ids = {
            item['source_id'] for item in response.data['data']['items'] if item['rule_code'] == 'asset_missing'
        }
        self.assertNotIn(asset.id, missing_ids)

    def test_reading_article_does_not_change_updated_at(self):
        article = self.create_old_article()
        original_updated_at = article.updated_at

        response = self.client.get(f'/api/article/detail/{article.article_id}')

        self.assertEqual(response.status_code, 200)
        article.refresh_from_db()
        self.assertEqual(article.read_count, 1)
        self.assertEqual(article.updated_at, original_updated_at)
