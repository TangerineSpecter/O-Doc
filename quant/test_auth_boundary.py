"""Reject unauthorized requests before creating locks; recheck owners under lock."""
import tempfile
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import serializers
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from anthology.models import Anthology
from user.models import UserProfile
from .access import owned_collection
from .locking import collection_lock
from .models import AIRun, Entry
from .views import QuantView


class QuantAuthBoundaryTests(TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='odoc-quant-auth-boundary-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name).resolve()
        self.media = self.root / 'media'
        self.lock_base = self.root / 'locks'
        self.media.mkdir()
        self.lock_base.mkdir()
        self.enterContext(override_settings(MEDIA_ROOT=self.media, QUANT_DISABLE_WORKERS=True))
        self.assertTrue(Path(settings.MEDIA_ROOT).resolve().is_relative_to(self.root))
        # All real lock files used by these requests stay in the temporary tree.
        self.enterContext(patch('quant.locking.tempfile.gettempdir', return_value=str(self.lock_base)))
        self.owner = get_user_model().objects.create_user('quant-auth-owner')
        self.other = get_user_model().objects.create_user('quant-auth-other')
        for user in (self.owner, self.other):
            UserProfile.objects.update_or_create(user=user, defaults={'userid': user.username})
        self.collection = Anthology.objects.create(title='鉴权边界', type='quant', permission='private',
                                                   user_id=self.owner.username)
        self.entry = Entry.objects.create(anthology=self.collection, title='初始研究')
        self.client = APIClient()

    def url(self, collection=None, *, detail=False):
        base = f'/api/quant/{collection or self.collection.pk}/entries/'
        return base + (f'{self.entry.pk}/' if detail else '')

    def test_anonymous_requests_never_acquire_or_create_collection_locks(self):
        with patch('quant.views.collection_lock', wraps=collection_lock) as lock:
            for identity in (self.collection.pk, 'anonymous-random-one', 'anonymous-random-two'):
                response = self.client.get(self.url(identity))
                self.assertEqual(response.status_code, 401, response.data)
            lock.assert_not_called()
        self.assertEqual(list(self.lock_base.rglob('*')), [])
        # A rejection before the view's transaction must not poison an outer one.
        self.assertTrue(Entry.objects.filter(pk=self.entry.pk).exists())

    def test_other_account_and_missing_collections_never_create_locks(self):
        self.client.force_authenticate(self.other)
        with patch('quant.views.collection_lock', wraps=collection_lock) as lock:
            for identity in (self.collection.pk, 'foreign-random-one', 'foreign-random-two'):
                response = self.client.get(self.url(identity))
                self.assertEqual(response.status_code, 404, response.data)
            lock.assert_not_called()
        self.assertEqual(list(self.lock_base.rglob('*')), [])
        self.assertTrue(Entry.objects.filter(pk=self.entry.pk).exists())

    def test_owner_can_read_and_update_with_a_collection_lock(self):
        self.client.force_authenticate(self.owner)
        with patch('quant.views.collection_lock', wraps=collection_lock) as lock:
            response = self.client.get(self.url(detail=True))
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['data']['id'], self.entry.pk)
            response = self.client.patch(self.url(detail=True), {'title': '更新研究'}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(lock.call_count, 2)
            # 概览纯读使用共享锁，任务恢复仅在独立状态入口执行。
            self.assertFalse(lock.call_args_list[0].kwargs.get('exclusive', True))
            self.assertTrue(lock.call_args_list[1].kwargs.get('exclusive', True))
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.title, '更新研究')

    def test_status_reads_recover_under_exclusive_lock(self):
        self.client.force_authenticate(self.owner)
        run = AIRun.objects.create(entry=self.entry, status='running')
        base = self.url(detail=True) + 'runs/'
        for url in (base + f'{run.pk}/', base, self.url(detail=True)+'status/'):
            AIRun.objects.filter(pk=run.pk).update(status='running')
            with patch('quant.views.collection_lock', wraps=collection_lock) as lock:
                response = self.client.get(url)
            self.assertEqual(response.status_code, 200, response.data)
            recovers=url.endswith('/status/')
            lock.assert_called_once_with(self.collection.pk, exclusive=recovers)
            run.refresh_from_db()
            self.assertEqual(run.status, 'interrupted' if recovers else 'running')

    def test_index_and_experiment_reads_use_exclusive_locks(self):
        self.client.force_authenticate(self.owner)
        for path in ('graph/index/', 'experiments/'):
            with self.subTest(path=path), patch('quant.views.collection_lock', wraps=collection_lock) as lock:
                # Isolate expensive index projection; test the actual HTTP lock boundary.
                with patch('quant.graph.views.index_status', return_value={}):
                    response = self.client.get(f'/api/quant/{self.collection.pk}/{path}')
                self.assertEqual(response.status_code, 200, response.data)
                lock.assert_called_once_with(self.collection.pk, exclusive=True)

    def test_pure_reads_keep_shared_lock(self):
        self.client.force_authenticate(self.owner)
        with patch('quant.views.collection_lock', wraps=collection_lock) as lock:
            response = self.client.get(self.url(detail=True) + 'backtests/')
        self.assertEqual(response.status_code, 200, response.data)
        lock.assert_called_once_with(self.collection.pk, exclusive=False)

    def test_entry_deleted_before_lock_is_rechecked_and_never_resurrected(self):
        self.client.force_authenticate(self.owner)

        @contextmanager
        def delete_before_lock(identity, **kwargs):
            Entry.objects.filter(pk=self.entry.pk).update(is_valid=False)
            with collection_lock(identity, **kwargs):
                yield

        with patch('quant.views.collection_lock', side_effect=delete_before_lock):
            response = self.client.patch(self.url(detail=True), {'title': '不应写入'}, format='json')
        self.assertEqual(response.status_code, 404, response.data)
        self.entry.refresh_from_db()
        self.assertFalse(self.entry.is_valid)
        self.assertEqual(self.entry.title, '初始研究')

    def test_owner_changed_after_precheck_is_rechecked_under_lock(self):
        self.client.force_authenticate(self.owner)
        checked = []

        def check_owner(*args):
            checked.append(True)
            return owned_collection(*args)

        @contextmanager
        def change_owner_before_lock(identity, **kwargs):
            self.assertEqual(len(checked), 1, '归属预查应在创建锁文件之前完成')
            Anthology.objects.filter(pk=self.collection.pk).update(user_id=self.other.username)
            with collection_lock(identity, **kwargs):
                yield

        with patch('quant.views.owned_collection', side_effect=check_owner), \
                patch('quant.views.collection_lock', side_effect=change_owner_before_lock):
            response = self.client.patch(self.url(detail=True), {'title': '不应写入'}, format='json')
        self.assertEqual(response.status_code, 404, response.data)
        self.assertEqual(len(checked), 2, '进入锁后必须重新校验归属')
        self.collection.refresh_from_db()
        self.entry.refresh_from_db()
        self.assertEqual(self.collection.user_id, self.other.username)
        self.assertEqual(self.entry.title, '初始研究')

    def test_handler_error_rolls_back_its_writes_and_releases_lock(self):
        class RejectedWriteView(QuantView):
            def post(view, request, coll_id, entry_id):
                view.entry.title = '失败写入'
                view.entry.save()
                raise serializers.ValidationError('拒绝本次写入')

        request = APIRequestFactory().post('/', {}, format='json')
        force_authenticate(request, self.owner)
        events = []

        @contextmanager
        def tracking_lock(identity, **kwargs):
            with collection_lock(identity, **kwargs):
                events.append('entered')
                try:
                    yield
                finally:
                    events.append('released')

        with patch('quant.views.collection_lock', side_effect=tracking_lock):
            response = RejectedWriteView.as_view()(request, coll_id=self.collection.pk, entry_id=self.entry.pk)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(events, ['entered', 'released'])
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.title, '初始研究')
