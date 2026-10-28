"""Unsafe stored asset paths must never delete records or files outside MEDIA_ROOT."""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.conf import settings
from django.db import OperationalError, transaction
from django.test import TransactionTestCase, override_settings

from assets.models import Asset
from utils.resource_assets import delete_asset_physical_file, delete_asset_record_and_file


class ResourcePathSafetyTests(TransactionTestCase):
    def setUp(self):
        temp = TemporaryDirectory(prefix='odoc-path-safety-')
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        self.media = self.root / 'media'
        self.media.mkdir()
        self.outside = self.root / 'outside'
        self.outside.mkdir()
        self.enterContext(override_settings(MEDIA_ROOT=self.media, SYSTEM_LOG_ENABLED=False))

    def create_asset(self, index, file_path):
        return Asset.objects.create(id=f'unsafe-{index}', name='test', original_name='test', file_type='other',
            file_size=1, file_path=file_path, file_extension='.bin', mime_type='application/octet-stream',
            file_hash=f'unsafe-{index}')

    def test_traversal_absolute_and_symlink_targets_are_refused(self):
        (self.media / 'alias').symlink_to(self.outside, target_is_directory=True)
        cases = ['../outside/traversal.bin', str(self.outside / 'absolute.bin'), 'alias/symlink.bin']
        for index, relative in enumerate(cases):
            with self.subTest(path=relative):
                target = (self.media / relative).resolve()
                self.assertTrue(target.is_relative_to(self.root), '测试只允许触及临时目录')
                self.assertFalse(target.is_relative_to(self.media), '样例必须位于媒体目录之外')
                target.write_bytes(b'untouched')
                asset = self.create_asset(index, relative)
                self.assertFalse(delete_asset_record_and_file(asset))
                self.assertTrue(Asset.objects.filter(pk=asset.pk).exists())
                self.assertEqual(target.read_bytes(), b'untouched')

    def test_empty_and_root_paths_do_not_delete_records(self):
        for index, relative in enumerate(['', '.', './']):
            with self.subTest(path=relative):
                asset = self.create_asset(10 + index, relative)
                self.assertFalse(delete_asset_record_and_file(asset))
                self.assertTrue(Asset.objects.filter(pk=asset.pk).exists())

    def test_unsafe_media_roots_refuse_before_scheduling_cleanup(self):
        for index, media_root in enumerate(['', 'relative-media', '/', str(Path.home()), str(settings.BASE_DIR)]):
            with self.subTest(media_root=media_root):
                asset = self.create_asset(20 + index, 'test.bin')
                with override_settings(MEDIA_ROOT=media_root):
                    with patch('utils.resource_assets.delete_asset_physical_file') as unlink:
                        self.assertFalse(delete_asset_record_and_file(asset))
                    unlink.assert_not_called()
                self.assertTrue(Asset.objects.filter(pk=asset.pk).exists())

    def test_commit_rechecks_path_after_parent_symlink_changes(self):
        folder = self.media / 'folder'
        folder.mkdir()
        original = folder / 'photo.bin'
        self.assertTrue(original.resolve().is_relative_to(self.media))
        original.write_bytes(b'original')
        outside = self.outside / 'photo.bin'
        self.assertTrue(outside.resolve().is_relative_to(self.root))
        self.assertFalse(outside.resolve().is_relative_to(self.media))
        outside.write_bytes(b'outside')
        asset = self.create_asset(30, 'folder/photo.bin')
        moved = self.root / 'moved'
        self.assertTrue(moved.resolve().is_relative_to(self.root))
        with transaction.atomic():
            self.assertTrue(delete_asset_record_and_file(asset))
            folder.rename(moved)
            folder.symlink_to(self.outside, target_is_directory=True)
        self.assertFalse(Asset.objects.filter(pk=asset.pk).exists())
        self.assertEqual(outside.read_bytes(), b'outside')
        self.assertEqual((moved / 'photo.bin').read_bytes(), b'original')

    def test_shared_file_path_remains_after_one_asset_is_deleted(self):
        path = (self.media / 'shared.bin').resolve()
        self.assertTrue(path.is_relative_to(self.media))
        self.assertTrue(path.is_relative_to(self.root))
        path.write_bytes(b'shared file')
        first = self.create_asset(40, 'shared.bin')
        second = self.create_asset(41, 'shared.bin')
        second.is_valid = False
        second.save(update_fields=['is_valid'])
        self.assertTrue(delete_asset_record_and_file(first))
        self.assertFalse(Asset.objects.filter(pk=first.pk).exists())
        self.assertTrue(Asset.objects.filter(pk=second.pk).exists())
        self.assertEqual(path.read_bytes(), b'shared file')

    def test_commit_checks_paths_created_after_deletion_was_scheduled(self):
        path = (self.media / 'late-share.bin').resolve()
        self.assertTrue(path.is_relative_to(self.media))
        self.assertTrue(path.is_relative_to(self.root))
        path.write_bytes(b'late reference')
        first = self.create_asset(42, 'late-share.bin')
        with transaction.atomic():
            self.assertTrue(delete_asset_record_and_file(first))
            self.create_asset(43, 'late-share.bin')
            self.assertEqual(path.read_bytes(), b'late reference')
        self.assertTrue(Asset.objects.filter(pk='unsafe-43').exists())
        self.assertEqual(path.read_bytes(), b'late reference')

    def test_failed_shared_path_check_leaves_the_file_in_place(self):
        path = (self.media / 'database-failure.bin').resolve()
        self.assertTrue(path.is_relative_to(self.media))
        self.assertTrue(path.is_relative_to(self.root))
        path.write_bytes(b'preserve on failure')
        asset = self.create_asset(44, path.name)
        with patch('assets.models.Asset.objects.filter', side_effect=OperationalError('isolated database failure')):
            with self.assertLogs('utils.resource_assets', level='ERROR'):
                delete_asset_physical_file(asset)
        self.assertEqual(path.read_bytes(), b'preserve on failure')
        self.assertTrue(Asset.objects.filter(pk=asset.pk).exists())
