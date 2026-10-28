from unittest.mock import patch
from pathlib import Path
from tempfile import TemporaryDirectory

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Image
from assets.models import Asset
from system_settings.models import SyncEntityState
from system_settings.sync_state import record_bulk_change


class ImageGroupMembershipTests(TestCase):
    def setUp(self):
        user = User.objects.create_user(username='group-owner', password='password')
        self.owner = f'user_{user.pk}'
        self.collection = Anthology.objects.create(
            coll_id='membership-photos', title='照片组', type='image', user_id=self.owner,
            permission='private', count=3,
        )
        self.images = [Image.objects.create(
            image_id=f'membership-{index}', title=f'图片{index}', image_url=f'image-{index}.png',
            coll_id=self.collection.pk, author=self.owner, photo_group_id='group-a' if index < 2 else 'group-b',
            group_index=index,
        ) for index in range(3)]
        self.client = APIClient()
        self.client.force_authenticate(user)

    def test_creating_group_with_existing_photo_preserves_its_original_url(self):
        self.images[2].photo_group_id = ''
        self.images[2].save(update_fields=['photo_group_id'])
        for supplied_url in [None, 'outdated-image.png']:
            with self.subTest(supplied_url=supplied_url):
                existing_photo = {'imageId': self.images[2].pk}
                if supplied_url is not None:
                    existing_photo['imageUrl'] = supplied_url
                response = self.client.post('/api/article/image/group/create', {
                    'collId': self.collection.pk,
                    'title': '拍摄组',
                    'photos': [existing_photo, {'imageUrl': 'new-photo.png'}],
                }, format='json')
                self.assertEqual(response.data['code'], 200)
                self.images[2].refresh_from_db()
                self.assertEqual(self.images[2].image_url, 'image-2.png')
                self.assertEqual(response.data['data'][0]['image_url'], 'image-2.png')
                Image.objects.filter(image_id=response.data['data'][1]['image_id']).delete()
                self.images[2].photo_group_id = ''
                self.images[2].save(update_fields=['photo_group_id'])

    def test_regrouping_one_photo_downgrades_the_original_singleton(self):
        response = self.client.post('/api/article/image/group/create', {
            'collId': self.collection.pk, 'title': '新拍摄组',
            'photos': [{'imageId': self.images[0].pk}, {'imageUrl': 'new-photo.png'}],
        }, format='json')
        self.assertEqual(response.data['code'], 200)
        self.images[0].refresh_from_db()
        self.images[1].refresh_from_db()
        self.assertTrue(self.images[0].photo_group_id)
        self.assertNotEqual(self.images[0].photo_group_id, 'group-a')
        self.assertEqual(self.images[1].photo_group_id, '')
        self.assertEqual(self.images[1].group_index, 0)
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 4)

    def test_regrouping_preserves_original_group_with_two_remaining_members(self):
        self.images[2].photo_group_id = 'group-a'
        self.images[2].save(update_fields=['photo_group_id'])
        response = self.client.post('/api/article/image/group/create', {
            'collId': self.collection.pk, 'title': '新拍摄组',
            'photos': [{'imageId': self.images[0].pk}, {'imageUrl': 'new-photo.png'}],
        }, format='json')
        self.assertEqual(response.data['code'], 200)
        for image in self.images[1:]:
            image.refresh_from_db()
            self.assertEqual(image.photo_group_id, 'group-a')

    def test_regrouping_failure_rolls_back_original_and_new_groups(self):
        before = list(SyncEntityState.objects.filter(model_label__in=['article.image', 'anthology.anthology'])
                      .order_by('model_label', 'object_pk').values())
        calls = 0

        def fail_after_original_group(queryset):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError('isolated regroup failure')
            return record_bulk_change(queryset)

        with patch('system_settings.sync_state.record_bulk_change', side_effect=fail_after_original_group):
            response = self.client.post('/api/article/image/group/create', {
                'collId': self.collection.pk, 'title': '新拍摄组',
                'photos': [{'imageId': self.images[0].pk}, {'imageUrl': 'new-photo.png'}],
            }, format='json')
        self.assertNotEqual(response.data['code'], 200)
        self.assertEqual(Image.objects.filter(coll_id=self.collection.pk, is_valid=True).count(), 3)
        for image in self.images[:2]:
            image.refresh_from_db()
            self.assertEqual(image.photo_group_id, 'group-a')
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 3)
        self.assertEqual(list(SyncEntityState.objects.filter(model_label__in=['article.image', 'anthology.anthology'])
                              .order_by('model_label', 'object_pk').values()), before)

    @patch('article.image_views.remove_image_index')
    @patch('article.image_views.cleanup_group_image_assets')
    def test_invalid_ids_and_duplicates_never_modify_or_clean_existing_photos(self, cleanup, remove_index):
        def revisions():
            return list(SyncEntityState.objects.filter(model_label__in=['article.image', 'anthology.anthology'])
                        .order_by('model_label', 'object_pk').values())
        before_revisions = revisions()
        for photos in [
            [{'imageId': 'missing-id'}],
            [{'imageId': self.images[0].pk}, {'imageId': self.images[2].pk}],
            [{'imageId': self.images[0].pk}, {'imageId': self.images[0].pk}],
            ['not-an-object'],
        ]:
            for _ in range(2):
                with self.subTest(photos=photos):
                    response = self.client.put('/api/article/image/group/group-a', {'photos': photos}, format='json')
                    self.assertNotEqual(response.data['code'], 200)
                    self.assertEqual(response.status_code, 400)
                    self.assertEqual(list(Image.objects.filter(image_id__in=[item.pk for item in self.images])
                                          .order_by('image_id').values_list('is_valid', flat=True)), [True, True, True])
                    self.collection.refresh_from_db()
                    self.assertEqual(self.collection.count, 3)
                    self.assertEqual(revisions(), before_revisions)
        cleanup.assert_not_called()
        remove_index.assert_not_called()

    @patch('article.image_views.remove_image_index')
    @patch('article.image_views.cleanup_group_image_assets')
    def test_valid_remove_and_add_keep_existing_group_behavior(self, cleanup, remove_index):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.put('/api/article/image/group/group-a', {
                'title': '更新标题',
                'photos': [
                    {'imageId': self.images[0].pk, 'focalLength': '50', 'groupIndex': 0},
                    {'imageUrl': 'new-image.png', 'focalLength': '85', 'groupIndex': 1},
                ],
            }, format='json')
        self.assertEqual(response.data['code'], 200)
        self.images[0].refresh_from_db()
        self.images[1].refresh_from_db()
        self.assertTrue(self.images[0].is_valid)
        self.assertEqual(self.images[0].focal_length, '50')
        self.assertFalse(self.images[1].is_valid)
        rows = list(Image.objects.filter(photo_group_id='group-a', is_valid=True).order_by('group_index'))
        self.assertEqual([row.focal_length for row in rows], ['50', '85'])
        self.assertEqual(len(response.data['data']), 2)
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 3)
        self.assertEqual([image.pk for image in cleanup.call_args.args[0]], [self.images[1].pk])
        remove_index.assert_called_once()

    @patch('article.image_views.remove_image_index')
    @patch('article.image_views.cleanup_group_image_assets')
    def test_replace_group_with_one_new_photo_returns_the_survivor(self, cleanup, remove_index):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.put('/api/article/image/group/group-a', {
                'title': '替换照片',
                'photos': [{'imageUrl': 'replacement.png', 'focalLength': '35', 'groupIndex': 0}],
            }, format='json')
        self.assertEqual(response.data['code'], 200)
        self.assertEqual(len(response.data['data']), 1)
        result = response.data['data'][0]
        replacement = Image.objects.get(pk=result['image_id'])
        self.assertEqual(response.json()['data'][0]['imageId'], replacement.pk)
        self.assertTrue(replacement.is_valid)
        self.assertEqual(replacement.image_url, 'replacement.png')
        self.assertEqual(replacement.photo_group_id, '')
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 2)
        self.assertEqual({image.pk for image in cleanup.call_args.args[0]}, {self.images[0].pk, self.images[1].pk})
        self.assertEqual(remove_index.call_count, 2)

    @patch('article.image_views.remove_image_index')
    @patch('article.image_views.cleanup_group_image_assets')
    def test_single_retained_photo_still_returns_ungrouped_photo(self, _cleanup, _remove_index):
        response = self.client.put('/api/article/image/group/group-a', {
            'photos': [{'imageId': self.images[0].pk, 'groupIndex': 0}],
        }, format='json')
        self.assertEqual(response.data['code'], 200)
        self.assertEqual(len(response.data['data']), 1)
        self.assertEqual(response.data['data'][0]['image_id'], self.images[0].pk)
        self.images[0].refresh_from_db()
        self.assertEqual(self.images[0].photo_group_id, '')

    @patch('article.image_views.remove_image_index')
    @patch('article.image_views.cleanup_group_image_assets')
    def test_other_user_cannot_modify_group(self, cleanup, remove_index):
        other = User.objects.create_user(username='another-user')
        self.client.force_authenticate(other)
        response = self.client.put('/api/article/image/group/group-a', {
            'photos': [{'imageId': self.images[0].pk}],
        }, format='json')
        self.assertNotEqual(response.data['code'], 200)
        self.assertEqual(Image.objects.filter(photo_group_id='group-a', is_valid=True).count(), 2)
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 3)
        cleanup.assert_not_called()
        remove_index.assert_not_called()

    @patch('article.image_views.remove_image_index')
    def test_rejected_edit_preserves_media_and_unrelated_file(self, _remove_index):
        with TemporaryDirectory(prefix='odoc-photo-guard-') as directory:
            root = Path(directory).resolve()
            media = root / 'media'
            media.mkdir()
            sentinel = root / 'outside-media.txt'
            sentinel.write_bytes(b'outside media')
            paths = []
            for index, image in enumerate(self.images[:2]):
                path = media / f'photo-{index}.png'
                self.assertTrue(path.resolve().is_relative_to(media.resolve()))
                self.assertTrue(path.resolve().is_relative_to(root))
                path.write_bytes(f'photo-{index}'.encode())
                asset = Asset.objects.create(
                    id=f'guard-asset-{index}', name=path.name, original_name=path.name,
                    file_type='image', file_size=path.stat().st_size, file_path=path.name,
                    file_extension='.png', mime_type='image/png', file_hash=f'guard-{index}', source_type='image',
                )
                image.image_url = f'/api/resource/view/{asset.pk}'
                image.save(update_fields=['image_url'])
                paths.append(path)
            self.assertTrue(sentinel.resolve().is_relative_to(root))
            before = {path: path.read_bytes() for path in [*paths, sentinel]}
            with self.settings(MEDIA_ROOT=media):
                with self.captureOnCommitCallbacks(execute=True):
                    response = self.client.put('/api/article/image/group/group-a', {
                        'photos': [{'imageId': 'missing-id'}],
                    }, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertEqual({path: path.read_bytes() for path in before}, before)
                self.assertEqual(Asset.objects.filter(pk__in=['guard-asset-0', 'guard-asset-1']).count(), 2)
