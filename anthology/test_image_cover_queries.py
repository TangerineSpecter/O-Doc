from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Image
from user.models import UserProfile


class ImageCoverQueryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='image-cover-owner')
        owner = f'user_{self.user.pk}'
        UserProfile.objects.update_or_create(user=self.user, defaults={'userid': owner})
        self.collections = [Anthology.objects.create(
            coll_id=f'image-cover-{index}', title=f'照片文集{index}', type='image',
            permission='public', user_id=owner, hide_cover_content=index == 3,
        ) for index in range(4)]
        self.private = Anthology.objects.create(coll_id='image-cover-private', title='个人相册', type='image',
                                                permission='private', user_id=owner)
        self.foreign = Anthology.objects.create(coll_id='image-cover-foreign', title='他人相册', type='image',
                                                permission='private', user_id='someone-else')
        self.base = timezone.now() - timedelta(days=1)
        for collection in [*self.collections, self.private, self.foreign]:
            for index in range(15):
                image = Image.objects.create(
                    image_id=f'{collection.pk}-{index}', title=f'图片{index}', image_url=f'/sample-{index}.png',
                    coll_id=collection.pk, author=owner, is_valid=index != 14,
                )
                Image.objects.filter(pk=image.pk).update(created_at=self.base + timedelta(minutes=index))
        self.client = APIClient()

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_visible_covers_are_bounded_and_keep_order_and_permissions(self, _pending):
        for authenticated in (False, True):
            self.client.force_authenticate(self.user if authenticated else None)
            with self.subTest(authenticated=authenticated), CaptureQueriesContext(connection) as queries:
                response = self.client.get('/api/anthology/list', {'type': 'image'})
            self.assertEqual(response.data['code'], 200)
            rows = {item['coll_id']: item for item in response.data['data']}
            expected_ids = {collection.pk for collection in self.collections}
            if authenticated:
                expected_ids.add(self.private.pk)
            self.assertEqual(set(rows), expected_ids)
            for collection_id, row in rows.items():
                self.assertEqual(row['count'], 14)
                if collection_id == self.collections[3].pk:
                    self.assertEqual(row['articles'], [])
                    continue
                self.assertEqual([item['image_id'] for item in row['articles']],
                                 [f'{collection_id}-{index}' for index in range(13, 1, -1)])
                for item, index in zip(row['articles'], range(13, 1, -1)):
                    self.assertEqual(item['title'], f'图片{index}')
                    self.assertEqual(item['date'], (self.base + timedelta(minutes=index)).strftime('%m-%d'))
                self.assertTrue(all(item['image_id'] == item['imageId'] and item['image_url'] == item['imageUrl']
                                    for item in row['articles']))
            image_queries = [query['sql'] for query in queries if 'FROM "images"' in query['sql']]
            self.assertEqual(len(image_queries), 2, image_queries)
            cover_query = next(query for query in image_queries if 'ROW_NUMBER' in query)
            self.assertNotIn('"ai_visual_description"', cover_query)
            self.assertNotIn('"visual_description_override"', cover_query)

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_hidden_only_collection_has_no_cover_lookup(self, _pending):
        Anthology.objects.filter(type='image').update(hide_cover_content=True)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/anthology/list', {'type': 'image'})
        self.assertEqual(response.data['code'], 200)
        self.assertTrue(all(not item['articles'] for item in response.data['data']))
        image_queries = [query['sql'] for query in queries if 'FROM "images"' in query['sql']]
        self.assertEqual(len(image_queries), 1, image_queries)
