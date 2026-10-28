"""PostgreSQL-only group mutation race, against an explicitly isolated test database."""
import os
import threading
from contextlib import contextmanager
from unittest import skipUnless
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import close_old_connections, connection, connections, transaction
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from anthology.models import Anthology
from article.models import Image
from user.models import UserProfile


@skipUnless(os.getenv('ODOC_ISOLATED_PG_TEST') == '1', 'requires explicitly isolated PostgreSQL')
class ImageGroupConcurrencyTests(TransactionTestCase):
    def setUp(self):
        config = connection.settings_dict
        self.assertEqual(connection.vendor, 'postgresql')
        self.assertEqual(config['USER'], 'odoc_isolated')
        self.assertEqual(config['HOST'], '127.0.0.1')
        self.assertEqual(config['NAME'], 'test_odoc_isolated')
        self.user = User.objects.create_user(username='concurrent-owner')
        self.owner = f'user_{self.user.pk}'
        UserProfile.objects.update_or_create(user=self.user, defaults={'userid': self.owner})
        self.collection = Anthology.objects.create(
            coll_id='concurrent-images', title='照片', type='image', user_id=self.owner,
            permission='private', count=2,
        )
        self.images = [Image.objects.create(
            image_id=f'concurrent-photo-{i}', title=f'照片{i}', image_url=f'https://example.test/{i}.png',
            coll_id=self.collection.pk, author=self.owner, photo_group_id='concurrent-group', group_index=i,
        ) for i in range(2)]

    def run_concurrently(self, operations):
        barrier = threading.Barrier(2, timeout=10)
        original_atomic = transaction.atomic
        seen = threading.local()
        outcomes = {}
        errors = []

        @contextmanager
        def synchronized_atomic(*args, **kwargs):
            if not getattr(seen, 'entered', False):
                seen.entered = True
                barrier.wait()
            with original_atomic(*args, **kwargs):
                yield

        def run(index, method, path, payload):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(User.objects.get(pk=self.user.pk))
                response = getattr(client, method)(path, payload, format='json') if payload is not None else getattr(client, method)(path)
                outcomes[index] = response.data['code']
            except Exception as exc:
                errors.append(exc)
            finally:
                connections.close_all()

        with patch('article.image_views.transaction.atomic', synchronized_atomic), patch('article.image_views.remove_image_index'):
            threads = [threading.Thread(target=run, args=(index, *operation)) for index, operation in enumerate(operations)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=20)
            self.assertFalse(any(thread.is_alive() for thread in threads), 'concurrent requests failed to finish')
        self.assertFalse(errors, errors)
        return outcomes

    def test_two_group_deletions_cannot_both_decrement_count(self):
        outcomes = self.run_concurrently([
            ('delete', '/api/article/image/group/concurrent-group/delete', None),
            ('delete', '/api/article/image/group/concurrent-group/delete', None),
        ])
        self.assertCountEqual(outcomes.values(), [200, 404])
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 0)
        self.assertEqual(Image.objects.filter(photo_group_id='concurrent-group', is_valid=True).count(), 0)

    def test_group_and_single_deletions_do_not_double_delete(self):
        outcomes = self.run_concurrently([
            ('delete', '/api/article/image/group/concurrent-group/delete', None),
            ('delete', f'/api/article/image/delete/{self.images[0].pk}', None),
        ])
        self.assertCountEqual(outcomes.values(), [200, 404])
        self.collection.refresh_from_db()
        remaining = list(Image.objects.filter(coll_id=self.collection.pk, is_valid=True))
        self.assertEqual(self.collection.count, len(remaining))
        if remaining:
            self.assertEqual(len(remaining), 1)
            self.assertEqual(remaining[0].photo_group_id, '')

    def test_two_single_deletions_in_group_both_complete_without_deadlock(self):
        outcomes = self.run_concurrently([
            ('delete', f'/api/article/image/delete/{self.images[0].pk}', None),
            ('delete', f'/api/article/image/delete/{self.images[1].pk}', None),
        ])
        self.assertCountEqual(outcomes.values(), [200, 200])
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 0)
        self.assertFalse(Image.objects.filter(coll_id=self.collection.pk, is_valid=True).exists())

    def test_group_edit_and_group_delete_do_not_apply_stale_membership(self):
        outcomes = self.run_concurrently([
            ('delete', '/api/article/image/group/concurrent-group/delete', None),
            ('put', '/api/article/image/group/concurrent-group', {'photos': [{'imageId': self.images[0].pk}]}),
        ])
        self.assertCountEqual(outcomes.values(), [200, 404])
        self.collection.refresh_from_db()
        remaining = list(Image.objects.filter(coll_id=self.collection.pk, is_valid=True))
        self.assertEqual(self.collection.count, len(remaining))
        if remaining:
            self.assertEqual(len(remaining), 1)
            self.assertEqual(remaining[0].photo_group_id, '')

    def test_group_delete_and_single_edit_cannot_resurrect_photo(self):
        outcomes = self.run_concurrently([
            ('delete', '/api/article/image/group/concurrent-group/delete', None),
            ('put', f'/api/article/image/update/{self.images[0].pk}', {'title': '修改标题'}),
        ])
        self.assertEqual(outcomes[0], 200)
        self.assertIn(outcomes[1], (200, 404))
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 0)
        self.assertFalse(Image.objects.filter(coll_id=self.collection.pk, is_valid=True).exists())

    def test_group_create_and_single_delete_use_current_photo_state(self):
        self.images[0].photo_group_id = ''
        self.images[0].save(update_fields=['photo_group_id'])
        outcomes = self.run_concurrently([
            ('post', '/api/article/image/group/create', {'collId': self.collection.pk, 'title': '新组',
                'photos': [{'imageId': self.images[0].pk}, {'imageUrl': 'https://example.test/new.png'}]}),
            ('delete', f'/api/article/image/delete/{self.images[0].pk}', None),
        ])
        self.assertIn(outcomes[0], (200, 404))
        self.assertEqual(outcomes[1], 200)
        self.collection.refresh_from_db()
        self.assertFalse(Image.objects.get(pk=self.images[0].pk).is_valid)
        self.assertEqual(self.collection.count, Image.objects.filter(coll_id=self.collection.pk, is_valid=True).count())

    def test_regroup_and_old_group_delete_use_current_membership(self):
        outcomes = self.run_concurrently([
            ('delete', '/api/article/image/group/concurrent-group/delete', None),
            ('post', '/api/article/image/group/create', {'collId': self.collection.pk, 'title': '新组',
                'photos': [{'imageId': self.images[0].pk}, {'imageUrl': 'https://example.test/new.png'}]}),
        ])
        self.assertCountEqual(outcomes.values(), [200, 404])
        self.collection.refresh_from_db()
        active = list(Image.objects.filter(coll_id=self.collection.pk, is_valid=True))
        self.assertEqual(self.collection.count, len(active))
        self.assertFalse(any(image.photo_group_id == 'concurrent-group' for image in active))

    def test_move_and_group_delete_keep_both_collection_counts_consistent(self):
        target = Anthology.objects.create(coll_id='concurrent-target', title='目标', type='image',
                                          user_id=self.owner, permission='private', count=0)
        outcomes = self.run_concurrently([
            ('delete', '/api/article/image/group/concurrent-group/delete', None),
            ('put', f'/api/article/image/update/{self.images[0].pk}', {'collId': target.pk}),
        ])
        self.assertCountEqual(outcomes.values(), [200, 404])
        for collection in (self.collection, target):
            collection.refresh_from_db()
            self.assertEqual(collection.count, Image.objects.filter(coll_id=collection.pk, is_valid=True).count())

    def test_opposite_collection_moves_use_stable_lock_order(self):
        target = Anthology.objects.create(coll_id='concurrent-target', title='目标', type='image',
                                          user_id=self.owner, permission='private', count=1)
        target_photo = Image.objects.create(image_id='concurrent-target-photo', title='目标照片',
            image_url='https://example.test/target.png', coll_id=target.pk, author=self.owner)
        outcomes = self.run_concurrently([
            ('put', f'/api/article/image/update/{self.images[0].pk}', {'collId': target.pk}),
            ('put', f'/api/article/image/update/{target_photo.pk}', {'collId': self.collection.pk}),
        ])
        self.assertCountEqual(outcomes.values(), [200, 200])
        for collection in (self.collection, target):
            collection.refresh_from_db()
            self.assertEqual(collection.count, Image.objects.filter(coll_id=collection.pk, is_valid=True).count())
        self.images[0].refresh_from_db()
        target_photo.refresh_from_db()
        self.assertEqual(self.images[0].coll_id, target.pk)
        self.assertEqual(target_photo.coll_id, self.collection.pk)

    def test_single_create_and_group_delete_keep_count_consistent(self):
        outcomes = self.run_concurrently([
            ('delete', '/api/article/image/group/concurrent-group/delete', None),
            ('post', '/api/article/image/create', {'collId': self.collection.pk, 'title': '新照片',
                                                    'imageUrl': 'https://example.test/new.png'}),
        ])
        self.assertCountEqual(outcomes.values(), [200, 200])
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 1)
        self.assertEqual(Image.objects.filter(coll_id=self.collection.pk, is_valid=True).count(), 1)
