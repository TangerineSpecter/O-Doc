from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from anthology.models import Anthology, Book
from article.models import Image
from assets.models import Asset
from user.models import UserProfile


class BookCoverQueryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='book-cover-owner')
        owner = f'user_{self.user.pk}'
        UserProfile.objects.update_or_create(user=self.user, defaults={'userid': owner})
        self.collections = [Anthology.objects.create(
            coll_id=f'book-cover-{index}', title=f'图书文集{index}', type='book', permission='public',
            user_id=owner, hide_cover_content=index == 3,
        ) for index in range(4)]
        self.private = Anthology.objects.create(coll_id='book-cover-private', title='个人书架', type='book',
                                                permission='private', user_id=owner)
        self.foreign = Anthology.objects.create(coll_id='book-cover-foreign', title='他人书架', type='book',
                                                permission='private', user_id='someone-else')
        asset = Asset.objects.create(id='book-cover-fixture', name='book.txt', original_name='book.txt',
            file_type='document', file_size=1, file_path='book.txt', file_extension='.txt',
            mime_type='text/plain', file_hash='book-cover-fixture')
        self.base = timezone.now() - timedelta(days=1)
        for collection in [*self.collections, self.private, self.foreign]:
            for index in range(15):
                book = Book.objects.create(book_id=f'{collection.pk}-{index}', anthology=collection,
                    title=f'书{index}', asset=asset, cover_asset=asset if index % 2 else None,
                    book_format='txt', is_valid=index != 14)
                Book.objects.filter(pk=book.pk).update(updated_at=self.base + timedelta(minutes=index))
        self.client = APIClient()

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_visible_book_covers_are_bounded_and_preserve_order(self, _pending):
        for authenticated in (False, True):
            self.client.force_authenticate(self.user if authenticated else None)
            with self.subTest(authenticated=authenticated), CaptureQueriesContext(connection) as queries:
                response = self.client.get('/api/anthology/list', {'type': 'book'})
            self.assertEqual(response.data['code'], 200)
            rows = {item['coll_id']: item for item in response.data['data']}
            expected = {collection.pk for collection in self.collections}
            if authenticated:
                expected.add(self.private.pk)
            self.assertEqual(set(rows), expected)
            for collection_id, row in rows.items():
                self.assertEqual(row['count'], 14)
                if collection_id == self.collections[3].pk:
                    self.assertEqual(row['articles'], [])
                    continue
                self.assertEqual([item['book_id'] for item in row['articles']],
                                 [f'{collection_id}-{index}' for index in range(13, 1, -1)])
                for item, index in zip(row['articles'], range(13, 1, -1)):
                    self.assertEqual(item['bookId'], item['book_id'])
                    self.assertEqual(item['title'], f'书{index}')
                    self.assertEqual(item['date'], (self.base + timedelta(minutes=index)).strftime('%m-%d'))
                    self.assertEqual(item['cover_url'], f"/api/anthology/book/{item['book_id']}/cover")
                    self.assertEqual(item['coverUrl'], item['cover_url'])
            book_queries = [query['sql'] for query in queries if 'FROM "books"' in query['sql']]
            self.assertEqual(len(book_queries), 2, book_queries)
            cover_query = next(query for query in book_queries if 'ROW_NUMBER' in query)
            self.assertNotIn('"metadata"', cover_query)
            self.assertNotIn('JOIN "assets"', cover_query)

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_hidden_only_book_collections_skip_cover_lookup(self, _pending):
        Anthology.objects.filter(type='book').update(hide_cover_content=True)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/anthology/list', {'type': 'book'})
        self.assertEqual(response.data['code'], 200)
        self.assertTrue(all(not item['articles'] for item in response.data['data']))
        self.assertEqual(len([query for query in queries if 'FROM "books"' in query['sql']]), 1)

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_mixed_image_and_book_list_keeps_each_cover_type(self, _pending):
        collection = Anthology.objects.create(coll_id='mixed-image-cover', title='混合相册', type='image',
                                               permission='public', user_id=f'user_{self.user.pk}')
        Image.objects.create(image_id='mixed-image-1', title='混合照片', image_url='/sample.png', coll_id=collection.pk)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/anthology/list')
        self.assertEqual(response.data['code'], 200)
        rows = {item['coll_id']: item for item in response.data['data']}
        self.assertEqual(rows[collection.pk]['articles'][0]['image_id'], 'mixed-image-1')
        self.assertEqual(rows[self.collections[0].pk]['articles'][0]['book_id'], f'{self.collections[0].pk}-13')
        self.assertEqual(len([q for q in queries if 'FROM "books"' in q['sql']]), 2)
        self.assertEqual(len([q for q in queries if 'FROM "images"' in q['sql']]), 2)
