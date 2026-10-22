"""Deletion commits and HTTP refusals use isolated DB rows and temporary files."""
import hashlib
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import OperationalError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient

from anthology.models import Anthology, Book
from assets.models import Asset
from quant.models import Attachment, Entry
from user.models import UserProfile
from utils.error_codes import ErrorCode
from utils.resource_assets import delete_asset_record_and_file


class ResourceDeletionTests(TransactionTestCase):
    def setUp(self):
        temporary = TemporaryDirectory(prefix='odoc-resource-delete-')
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.media = self.root / 'media'
        self.media.mkdir()
        self.outside = self.root / 'outside-sentinel.bin'
        self.outside.write_bytes(b'unrelated file outside MEDIA_ROOT')
        self.outside_hash = self.digest(self.outside)
        self.enterContext(override_settings(MEDIA_ROOT=self.media, SYSTEM_LOG_ENABLED=False))
        self.addCleanup(self.assert_outside_unchanged)
        self.owner = get_user_model().objects.create_user('resource-delete-owner')
        self.other = get_user_model().objects.create_user('resource-delete-other')
        for user in (self.owner, self.other):
            UserProfile.objects.update_or_create(user=user, defaults={'userid': user.username})
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    @staticmethod
    def digest(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def assert_outside_unchanged(self):
        self.assertEqual(self.digest(self.outside), self.outside_hash)

    def create_asset(self, *, icon=False, owner=None):
        identity = uuid.uuid4().hex
        relative = f'isolated/{identity}.bin'
        path = (self.media / relative).resolve()
        # Every file handed to deletion must be inside this test's media tree.
        self.assertTrue(path.is_relative_to(self.media))
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(b'isolated resource bytes')
        asset = Asset.objects.create(id=identity, name='test resource', original_name='test.bin',
            file_type='image' if icon else 'other', file_size=path.stat().st_size, file_path=relative,
            file_extension='.bin', mime_type='application/octet-stream',
            uploader=(owner or self.owner).username, source_type='item_icon' if icon else 'other',
            file_hash=self.digest(path))
        return asset, path

    def assert_retained(self, identity, path, digest):
        self.assertTrue(path.resolve().is_relative_to(self.media))
        self.assertTrue(Asset.objects.filter(pk=identity).exists())
        self.assertTrue(path.is_file())
        self.assertEqual(self.digest(path), digest)

    @staticmethod
    def delete_url(identity, *, icon=False):
        return (f'/api/settings/agent-world/item-icons/{identity}/' if icon
                else f'/api/resource/delete/{identity}')

    def test_file_is_removed_only_after_outermost_transaction_commits(self):
        asset, path = self.create_asset()
        identity = asset.pk
        with transaction.atomic():
            with transaction.atomic():
                self.assertTrue(delete_asset_record_and_file(asset))
            self.assertFalse(Asset.objects.filter(pk=identity).exists())
            self.assertTrue(path.is_file(), '内层提交不能提前删除外层事务仍可回滚的文件')
        self.assertFalse(Asset.objects.filter(pk=identity).exists())
        self.assertFalse(path.exists())

    def test_outer_transaction_rollback_preserves_record_and_file(self):
        asset, path = self.create_asset()
        identity, digest = asset.pk, self.digest(path)
        with self.assertRaisesRegex(RuntimeError, 'rollback outer'):
            with transaction.atomic():
                self.assertTrue(delete_asset_record_and_file(asset))
                raise RuntimeError('rollback outer')
        self.assert_retained(identity, path, digest)

    def test_inner_savepoint_rollback_cancels_file_cleanup_after_outer_commit(self):
        asset, path = self.create_asset()
        identity, digest = asset.pk, self.digest(path)
        with transaction.atomic():
            with self.assertRaisesRegex(RuntimeError, 'rollback savepoint'):
                with transaction.atomic():
                    self.assertTrue(delete_asset_record_and_file(asset))
                    raise RuntimeError('rollback savepoint')
            self.assert_retained(identity, path, digest)
        self.assert_retained(identity, path, digest)

    def test_database_write_failure_never_unlinks_file(self):
        asset, path = self.create_asset()
        identity, digest = asset.pk, self.digest(path)
        with patch.object(Asset, 'delete', side_effect=OperationalError('isolated database write failure')):
            with self.assertRaisesRegex(OperationalError, 'isolated database write failure'):
                delete_asset_record_and_file(asset)
        self.assert_retained(identity, path, digest)

    def test_real_protected_foreign_key_failure_preserves_file(self):
        asset, path = self.create_asset()
        identity, digest = asset.pk, self.digest(path)
        collection = Anthology.objects.create(title='isolated books', description='test', type='book',
                                               permission='private', user_id=self.owner.username)
        book = Book.objects.create(anthology=collection, asset=asset, title='retained book',
                                   book_format='txt', is_valid=False)
        with self.assertRaises(ProtectedError):
            delete_asset_record_and_file(asset)
        self.assertTrue(Book.objects.filter(pk=book.pk).exists())
        self.assert_retained(identity, path, digest)

    def test_quant_reference_refuses_cleanup_even_after_soft_deletion(self):
        asset, path = self.create_asset()
        identity, digest = asset.pk, self.digest(path)
        collection = Anthology.objects.create(title='isolated research', description='test', type='quant',
                                               permission='private', user_id=self.owner.username, is_valid=False)
        entry = Entry.objects.create(anthology=collection, title='retained research', is_valid=False)
        Attachment.objects.create(entry=entry, asset=asset)
        self.assertFalse(delete_asset_record_and_file(asset))
        self.assertFalse(delete_asset_record_and_file(asset))
        self.assert_retained(identity, path, digest)

    def test_repeated_cleanup_of_deleted_row_does_not_delete_another_file(self):
        asset, path = self.create_asset()
        identity = asset.pk
        stale = Asset.objects.get(pk=identity)
        self.assertTrue(delete_asset_record_and_file(asset))
        self.assertFalse(path.exists())
        # A stale model instance must refuse before scheduling another unlink.
        with patch('utils.resource_assets.delete_asset_physical_file') as unlink:
            self.assertFalse(delete_asset_record_and_file(stale))
        unlink.assert_not_called()

    def test_failed_post_commit_file_cleanup_logs_and_keeps_database_deleted(self):
        asset, path = self.create_asset()
        identity = asset.pk
        with patch('utils.resource_assets.os.remove', side_effect=PermissionError('isolated permission failure')):
            with self.assertLogs('utils.resource_assets', level='ERROR'):
                self.assertTrue(delete_asset_record_and_file(asset))
        self.assertFalse(Asset.objects.filter(pk=identity).exists())
        self.assertTrue(path.is_file(), '提交后的清理失败只能留下待重试文件，不能恢复已删除记录')

    def test_resource_delete_propagates_helper_refusal(self):
        asset, path = self.create_asset()
        identity, digest = asset.pk, self.digest(path)
        with patch('assets.views.delete_asset_record_and_file', return_value=False):
            response = self.client.delete(self.delete_url(identity))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['code'], ErrorCode.RESOURCE_IS_LINKED.code)
        self.assert_retained(identity, path, digest)

    def test_icon_delete_propagates_helper_refusal(self):
        asset, path = self.create_asset(icon=True)
        identity, digest = asset.pk, self.digest(path)
        with patch('system_settings.agent_world.item_icon_views.delete_asset_record_and_file', return_value=False):
            response = self.client.delete(self.delete_url(identity, icon=True))
        self.assertEqual(response.status_code, 409)
        self.assertNotEqual(response.json()['code'], ErrorCode.SUCCESS.code)
        self.assert_retained(identity, path, digest)

    def test_explicit_delete_endpoints_remove_owned_unreferenced_resources(self):
        for icon in (False, True):
            with self.subTest(icon=icon):
                asset, path = self.create_asset(icon=icon)
                identity = asset.pk
                response = self.client.delete(self.delete_url(identity, icon=icon))
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['code'], ErrorCode.SUCCESS.code)
                self.assertFalse(Asset.objects.filter(pk=identity).exists())
                self.assertFalse(path.exists())

    def test_foreign_or_anonymous_requests_cannot_delete_resources(self):
        for icon in (False, True):
            asset, path = self.create_asset(icon=icon, owner=self.other)
            identity, digest = asset.pk, self.digest(path)
            response = self.client.delete(self.delete_url(identity, icon=icon))
            self.assertNotEqual(response.json()['code'], ErrorCode.SUCCESS.code)
            self.assert_retained(identity, path, digest)
            self.client.force_authenticate(None)
            response = self.client.delete(self.delete_url(identity, icon=icon))
            if icon:
                self.assertIn(response.status_code, (401, 403))
            else:
                # The legacy resource endpoint reports an unavailable owned row
                # with a business code; this change does not alter authentication.
                self.assertEqual(response.json()['code'], ErrorCode.RESOURCE_NOT_FOUND.code)
            self.assert_retained(identity, path, digest)
            self.client.force_authenticate(self.owner)
