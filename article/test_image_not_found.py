from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Image
from user.models import UserProfile


class ImageNotFoundTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='photo-owner-not-found')
        self.other = User.objects.create_user(username='photo-other-not-found')
        self.owner_id = f'user_{self.owner.pk}'
        UserProfile.objects.create(user=self.owner, userid=self.owner_id)
        UserProfile.objects.create(user=self.other, userid=f'user_{self.other.pk}')
        self.collection = Anthology.objects.create(coll_id='photo-private', title='私有图片', type='image',
            user_id=self.owner_id, permission='private', count=1)
        self.photo = Image.objects.create(image_id='photo-private-one', title='图片', image_url='sample.png',
            coll_id=self.collection.pk, author=self.owner_id)
        self.client = APIClient()
        self.client.force_authenticate(self.other)

    def assert_not_found(self, response):
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data['code'], 404)
        self.assertIsNone(response.data['data'])

    def test_missing_and_inaccessible_images_are_not_server_errors(self):
        self.assert_not_found(self.client.get('/api/article/image/detail/missing'))
        self.assert_not_found(self.client.put('/api/article/image/update/missing', {'title': '新标题'}, format='json'))
        self.assert_not_found(self.client.delete('/api/article/image/delete/missing'))
        self.assert_not_found(self.client.get(f'/api/article/image/detail/{self.photo.pk}'))
        self.assert_not_found(self.client.put(f'/api/article/image/update/{self.photo.pk}', {'title': '新标题'}, format='json'))
        self.assert_not_found(self.client.delete(f'/api/article/image/delete/{self.photo.pk}'))
        self.photo.refresh_from_db()
        self.assertTrue(self.photo.is_valid)
        self.assertEqual(self.photo.title, '图片')

    def test_owner_cannot_move_image_to_another_users_collection(self):
        foreign = Anthology.objects.create(coll_id='photo-other', title='他人的图片', type='image',
                                            user_id=f'user_{self.other.pk}', permission='private')
        self.client.force_authenticate(self.owner)
        response = self.client.put(f'/api/article/image/update/{self.photo.pk}', {'collId': foreign.pk}, format='json')
        self.assert_not_found(response)
        self.photo.refresh_from_db()
        self.assertEqual(self.photo.coll_id, self.collection.pk)

    @patch('article.image_views.remove_image_index')
    def test_repeated_delete_returns_not_found_without_changing_count(self, _remove_index):
        self.client.force_authenticate(self.owner)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.delete(f'/api/article/image/delete/{self.photo.pk}').data['code'], 200)
        self.assert_not_found(self.client.delete(f'/api/article/image/delete/{self.photo.pk}'))
        _remove_index.assert_called_once()
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 0)

    def test_group_missing_or_inaccessible_returns_http_404(self):
        self.photo.photo_group_id = 'private-group'
        self.photo.save()
        for group_id in ('missing', 'private-group'):
            self.assert_not_found(self.client.put(f'/api/article/image/group/{group_id}',
                {'photos': [{'imageId': self.photo.pk}]}, format='json'))
            self.assert_not_found(self.client.delete(f'/api/article/image/group/{group_id}/delete'))
        self.assert_not_found(self.client.post('/api/article/image/group/create',
            {'collId': self.collection.pk, 'photos': [{'imageUrl': 'sample.png'}]}, format='json'))
        self.assert_not_found(self.client.post('/api/article/image/create',
            {'collId': self.collection.pk, 'title': '图片', 'imageUrl': 'sample.png'}, format='json'))

    def test_group_conversion_of_missing_image_returns_http_404(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post('/api/article/image/group/create',
            {'collId': self.collection.pk, 'photos': [{'imageId': 'missing'}]}, format='json')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data['code'], 404)
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 1)
