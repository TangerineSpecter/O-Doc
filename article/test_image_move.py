from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Image
from system_settings.models import SyncEntityState
from system_settings.sync_state import record_bulk_change
from user.models import UserProfile


class ImageMoveTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(username='move-photo-owner')
        self.owner = f'user_{user.pk}'
        UserProfile.objects.update_or_create(user=user, defaults={'userid': self.owner})
        self.source = Anthology.objects.create(coll_id='move-source', title='原相册', type='image',
                                               user_id=self.owner, permission='private', count=2)
        self.target = Anthology.objects.create(coll_id='move-target', title='目标相册', type='image',
                                               user_id=self.owner, permission='private', count=1)
        self.photos = [Image.objects.create(image_id=f'move-photo-{i}', title=f'照片{i}', image_url=f'image-{i}.png',
            coll_id=self.source.pk, author=self.owner, photo_group_id='move-group', group_index=i) for i in range(2)]
        Image.objects.create(image_id='target-photo', title='目标照片', image_url='target.png',
                             coll_id=self.target.pk, author=self.owner)
        self.client = APIClient()
        self.client.force_authenticate(user)

    def sync_states(self):
        return list(SyncEntityState.objects.filter(model_label__in=['article.image', 'anthology.anthology'])
                    .order_by('model_label', 'object_pk').values())

    def test_move_detaches_group_and_updates_both_collection_counts(self):
        response = self.client.put(f'/api/article/image/update/{self.photos[0].pk}',
                                   {'collId': self.target.pk}, format='json')
        self.assertEqual(response.data['code'], 200)
        for photo in self.photos:
            photo.refresh_from_db()
        self.source.refresh_from_db()
        self.target.refresh_from_db()
        self.assertEqual(self.photos[0].coll_id, self.target.pk)
        self.assertEqual(self.photos[0].photo_group_id, '')
        self.assertEqual(self.photos[1].photo_group_id, '')
        self.assertEqual((self.source.count, self.target.count), (1, 2))
        self.assertTrue(SyncEntityState.objects.filter(model_label='anthology.anthology', object_pk=self.source.pk).exists())
        self.assertTrue(SyncEntityState.objects.filter(model_label='anthology.anthology', object_pk=self.target.pk).exists())

    def test_same_collection_edit_does_not_change_counts_or_group(self):
        response = self.client.put(f'/api/article/image/update/{self.photos[0].pk}',
                                   {'collId': self.source.pk, 'title': '新标题'}, format='json')
        self.assertEqual(response.data['code'], 200)
        self.photos[0].refresh_from_db()
        self.source.refresh_from_db()
        self.target.refresh_from_db()
        self.assertEqual(self.photos[0].photo_group_id, 'move-group')
        self.assertEqual((self.source.count, self.target.count), (2, 1))

    def test_move_from_larger_group_keeps_the_other_members_grouped(self):
        third = Image.objects.create(image_id='move-photo-2', title='照片2', image_url='image-2.png',
            coll_id=self.source.pk, author=self.owner, photo_group_id='move-group', group_index=2)
        self.source.count = 3
        self.source.save(update_fields=['count'])
        response = self.client.put(f'/api/article/image/update/{self.photos[0].pk}',
                                   {'collId': self.target.pk}, format='json')
        self.assertEqual(response.data['code'], 200)
        self.photos[1].refresh_from_db()
        third.refresh_from_db()
        self.assertEqual(self.photos[1].photo_group_id, 'move-group')
        self.assertEqual(third.photo_group_id, 'move-group')
        self.source.refresh_from_db()
        self.target.refresh_from_db()
        self.assertEqual((self.source.count, self.target.count), (2, 2))

    def test_move_failure_rolls_back_images_counts_and_sync_states(self):
        before = self.sync_states()
        calls = 0

        def fail_after_first_count(queryset):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError('isolated move failure')
            return record_bulk_change(queryset)

        with patch('system_settings.sync_state.record_bulk_change', side_effect=fail_after_first_count):
            response = self.client.put(f'/api/article/image/update/{self.photos[0].pk}',
                                       {'collId': self.target.pk}, format='json')
        self.assertNotEqual(response.data['code'], 200)
        for photo in self.photos:
            photo.refresh_from_db()
            self.assertEqual(photo.photo_group_id, 'move-group')
            self.assertEqual(photo.coll_id, self.source.pk)
        self.source.refresh_from_db()
        self.target.refresh_from_db()
        self.assertEqual((self.source.count, self.target.count), (2, 1))
        self.assertEqual(self.sync_states(), before)

    def test_numeric_collection_id_is_normalized_before_selecting_locks(self):
        target = Anthology.objects.create(coll_id='123', title='数字 ID 相册', type='image',
                                         user_id=self.owner, permission='private', count=0)
        lock_queryset = Anthology.objects.all()
        with patch.object(Anthology.objects, 'select_for_update', return_value=lock_queryset), \
                patch.object(lock_queryset, 'filter', wraps=lock_queryset.filter) as lock_filter:
            response = self.client.put(f'/api/article/image/update/{self.photos[0].pk}',
                                       {'collId': 123}, format='json')
        self.assertEqual(response.data['code'], 200)
        lock_filter.assert_called_once_with(coll_id__in={self.source.pk, '123'})
        self.photos[0].refresh_from_db()
        self.source.refresh_from_db()
        target.refresh_from_db()
        self.assertEqual(self.photos[0].coll_id, '123')
        self.assertEqual((self.source.count, target.count), (1, 1))

    def test_invalid_collection_id_is_rejected_before_locking_or_writing(self):
        before = self.sync_states()
        for value in (None, [], {}, True, ''):
            with self.subTest(value=value), patch.object(Anthology.objects, 'select_for_update') as lock:
                response = self.client.put(f'/api/article/image/update/{self.photos[0].pk}',
                                           {'collId': value, 'title': '不应保存'}, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data['code'], 400)
                lock.assert_not_called()
                self.photos[0].refresh_from_db()
                self.assertEqual(self.photos[0].coll_id, self.source.pk)
                self.assertEqual(self.photos[0].title, '照片0')
                self.assertEqual(self.sync_states(), before)
