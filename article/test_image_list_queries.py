from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Image
from article.serializers import ImageSerializer
from system_settings.models import GeoLocation
from user.models import UserProfile


class ImageListQueryTests(TestCase):
    def setUp(self):
        self.collection = Anthology.objects.create(
            coll_id='photo-list-queries', title='图片', type='image', permission='public',
        )
        self.user = User.objects.create_user(username='photographer', first_name='摄影者')
        UserProfile.objects.create(user=self.user, userid='author-id', nickname='橘子')
        self.location = GeoLocation.objects.create(country='中国', city='上海', latitude=31, longitude=121)
        for index in range(12):
            Image.objects.create(image_id=f'query-image-{index}', title=f'照片{index}',
                                 image_url=f'/api/resource/view/{index}', coll_id=self.collection.pk,
                                 author='author-id', location=self.location)

    def test_list_reuses_author_and_location_without_changing_projection(self):
        with CaptureQueriesContext(connection) as queries:
            response = APIClient().get(f'/api/article/image/list/{self.collection.pk}')
        self.assertEqual(response.status_code, 200)
        rows = response.data['data']
        self.assertEqual(len(rows), 12)
        self.assertTrue(all(row['author_nickname'] == '橘子' for row in rows))
        self.assertTrue(all(row['location_detail']['id'] == self.location.pk for row in rows))
        profile_queries = [q['sql'] for q in queries if 'FROM "user_profile"' in q['sql']]
        location_queries = [q['sql'] for q in queries if 'FROM "sys_geo_location"' in q['sql']]
        self.assertEqual(len(profile_queries), 1)
        self.assertEqual(len(location_queries), 0)

    def test_legacy_nickname_fallback_matches_individual_serialization(self):
        admin = User.objects.create_user(username='admin', first_name='管理员')
        UserProfile.objects.create(user=admin, userid='legacy-admin', nickname='')
        no_name = User.objects.create_user(username='no-nickname')
        UserProfile.objects.create(user=no_name, userid='no-name', nickname='')
        authors = ['author-id', 'admin', 'missing-author', 'no-name']
        for index, author in enumerate(authors):
            Image.objects.create(image_id=f'legacy-image-{index}', title=f'旧图片{index}',
                                 image_url=f'/api/resource/view/legacy-{index}', coll_id=self.collection.pk,
                                 author=author)
        expected = {image.pk: ImageSerializer(image).data['author_nickname']
                    for image in Image.objects.filter(image_id__startswith='legacy-image-')}
        response = APIClient().get(f'/api/article/image/list/{self.collection.pk}')
        actual = {row['image_id']: row['author_nickname'] for row in response.data['data'] if row['image_id'] in expected}
        self.assertEqual(actual, expected)
        self.assertEqual([actual[f'legacy-image-{i}'] for i in range(4)],
                         ['橘子', '管理员', 'missing-author', 'no-nickname'])
        rendered = response.json()['data']
        self.assertTrue(any(row['authorNickname'] == '橘子' for row in rendered))

    def test_empty_and_private_collections_keep_their_existing_contract(self):
        empty = Anthology.objects.create(coll_id='empty-photos', title='空图片', type='image', permission='public')
        response = APIClient().get(f'/api/article/image/list/{empty.pk}')
        self.assertEqual(response.data['data'], [])
        self.collection.permission = 'private'
        self.collection.save(update_fields=['permission'])
        response = APIClient().get(f'/api/article/image/list/{self.collection.pk}')
        self.assertNotEqual(response.data['code'], 200)
        self.assertIsNone(response.data['data'])
