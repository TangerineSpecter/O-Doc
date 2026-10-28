from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import transaction
from django.test import TestCase
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Image
from system_settings.models import SyncEntityState
from user.models import UserProfile


class ImageCreateAtomicTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(username='create-photo-owner')
        self.owner = f'user_{user.pk}'
        UserProfile.objects.update_or_create(user=user, defaults={'userid': self.owner})
        self.collection = Anthology.objects.create(coll_id='create-atomic', title='照片', type='image',
                                                   user_id=self.owner, permission='private', count=0)
        self.client = APIClient()
        self.client.force_authenticate(user)
        self.payload = {'collId': self.collection.pk, 'title': '照片', 'imageUrl': 'https://example.test/photo.png'}

    def sync_states(self):
        return list(SyncEntityState.objects.filter(model_label__in=['article.image', 'anthology.anthology'])
                    .order_by('model_label', 'object_pk').values())

    def test_failure_after_create_rolls_back_image_count_and_sync_state(self):
        before = self.sync_states()
        with patch('system_settings.sync_state.record_bulk_change', side_effect=RuntimeError('isolated count failure')):
            response = self.client.post('/api/article/image/create', self.payload, format='json')
        self.assertNotEqual(response.data['code'], 200)
        self.assertFalse(Image.objects.filter(coll_id=self.collection.pk).exists())
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 0)
        self.assertEqual(self.sync_states(), before)

    def test_create_respects_outer_transaction_rollback(self):
        before = self.sync_states()
        with self.assertRaisesRegex(RuntimeError, 'rollback'):
            with transaction.atomic():
                response = self.client.post('/api/article/image/create', self.payload, format='json')
                self.assertEqual(response.data['code'], 200)
                self.assertEqual(Image.objects.filter(coll_id=self.collection.pk).count(), 1)
                raise RuntimeError('rollback')
        self.assertFalse(Image.objects.filter(coll_id=self.collection.pk).exists())
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 0)
        self.assertEqual(self.sync_states(), before)

    def test_create_success_updates_count_and_sync(self):
        response = self.client.post('/api/article/image/create', self.payload, format='json')
        self.assertEqual(response.data['code'], 200)
        self.assertEqual(Image.objects.filter(coll_id=self.collection.pk, is_valid=True).count(), 1)
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 1)
        self.assertTrue(SyncEntityState.objects.filter(model_label='article.image', object_pk=response.data['data']['image_id']).exists())
