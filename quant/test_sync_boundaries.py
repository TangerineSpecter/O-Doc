"""Regression boundaries for private evidence and concurrent snapshot commits."""
import json
import tempfile
import threading
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.core import serializers
from django.test import TestCase, override_settings

from anthology.models import Anthology, Book
from assets.models import Asset
from utils.sync_manager import SyncError, SyncManager
from .locking import collection_lock
from .models import Attachment, Entry
from .sync import validate


class QuantSyncBoundaryTests(TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='odoc-quant-sync-boundary-')
        self.addCleanup(directory.cleanup)
        self.media_root = Path(directory.name).resolve()
        override = override_settings(MEDIA_ROOT=self.media_root, QUANT_DISABLE_WORKERS=True)
        override.enable()
        self.addCleanup(override.disable)
        self.assertEqual(Path(settings.MEDIA_ROOT).resolve(), self.media_root)
        self.manager = SyncManager.__new__(SyncManager)

    def asset(self, identity, *, metadata=None):
        relative = f'code/{identity}.py'
        target = (Path(settings.MEDIA_ROOT) / relative).resolve()
        self.assertTrue(target.is_relative_to(self.media_root))
        self.assertFalse(target.exists())
        return Asset.objects.create(id=identity, name=identity + '.py', original_name=identity + '.py',
            file_type='code', file_size=10, file_path=relative, file_extension='.py', mime_type='text/plain',
            uploader='admin', file_hash='not-required-for-missing-fixture', source_type='other',
            metadata=metadata or {})

    def test_missing_evidence_stays_valid_after_soft_deletion_and_cover_reuse(self):
        collection = Anthology.objects.create(title='量化同步边界', type='quant', permission='private', user_id='admin', is_valid=False)
        entry = Entry.objects.create(anthology=collection, title='已归档研究', is_valid=False)
        evidence = self.asset('quant-missing-evidence')
        cover = self.asset('quant-shared-book-cover', metadata={'book_cover': True})
        for asset in (evidence, cover):
            Attachment.objects.create(entry=entry, asset=asset)
        unrelated = self.asset('unrelated-missing-evidence')
        books = Anthology.objects.create(title='隔离书架', type='book', user_id='admin')
        body = self.asset('book-body')
        book = Book.objects.create(anthology=books, title='共享封面测试', asset=body, cover_asset=cover, book_format='txt')

        self.manager.reconcile_missing_book_media(drop_missing_assets=True)
        for asset in (evidence, cover, body):
            asset.refresh_from_db()
            self.assertTrue(asset.is_valid, asset.pk)
        unrelated.refresh_from_db()
        self.assertFalse(unrelated.is_valid)
        book.refresh_from_db()
        self.assertEqual(book.local_state, 'cloud_only')
        self.assertEqual(Attachment.objects.count(), 2)
        # A temporarily missing file must not turn its complete research snapshot invalid.
        data = json.loads(serializers.serialize('json', [collection, evidence, cover, entry, *Attachment.objects.all()]))
        validate(data)
        self.assertEqual(list(self.media_root.rglob('*')), [])

    def test_merge_keeps_quant_writes_blocked_through_media_restore_and_publish(self):
        attempted, acquired = threading.Event(), threading.Event()
        threads = []
        failures = []

        def contender():
            # File locks only: this thread must never open the test or a real database.
            try:
                attempted.set()
                with collection_lock('quant-concurrent-merge-fixture'):
                    acquired.set()
            except Exception as exc:
                failures.append(exc)

        def restore_media(*_args, **_kwargs):
            thread = threading.Thread(target=contender, daemon=True)
            threads.append(thread)
            thread.start()
            self.assertTrue(attempted.wait(2), 'contender did not reach the lock')
            self.assertFalse(acquired.wait(.15), 'quant write acquired its lock between snapshot and restore')

        def publish(**_kwargs):
            self.assertFalse(acquired.wait(.05), 'quant write acquired its lock before merged snapshot was published')
            return {'meta': {'snapshot_id': 'isolated-snapshot'}}

        remote = {'meta': {'snapshot_id': 'isolated-base'}, 'data': [], 'revisions': {}, 'media': {}}
        try:
            with ExitStack() as stack:
                stubs = {'get_v2_current': remote, 'build_snapshot_data': [], '_build_revision_manifest': {},
                    'merge_v2_data': ([], {}, {}), 'apply_snapshot_data': 0, '_apply_v2_revisions': None,
                    'reconcile_missing_book_media': {}, '_book_body_paths_from_snapshot': set()}
                for name, result in stubs.items():
                    stack.enter_context(patch.object(self.manager, name, return_value=result))
                stack.enter_context(patch.object(self.manager, '_restore_v2_media', side_effect=restore_media))
                stack.enter_context(patch.object(self.manager, 'publish_v2_snapshot', side_effect=publish))
                stack.enter_context(patch('article.version_service.enforce_article_version_retention'))
                stack.enter_context(patch('utils.sync_manager.enforce_novel_revision_retention'))
                self.manager._merge_while_locked(lambda *_args: None, base_snapshot_id='', source='test',
                    runner_id='isolated-test', should_abort=None)
            self.assertTrue(acquired.wait(2), 'quant write remained blocked after merge completed')
        finally:
            for thread in threads:
                thread.join(timeout=2)
        self.assertFalse(failures)
        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual(list(self.media_root.rglob('*')), [])

    def test_legacy_snapshot_rejects_broken_quant_reference_before_media_restore(self):
        self.manager.data_file = 'isolated-legacy-data.json'
        invalid = [{'model': 'quant.entry', 'pk': 'orphan-entry', 'fields': {
            'anthology': 'missing-private-collection', 'title': '来源缺失', 'kind': 'factor',
            'content': '', 'tags': [], 'source_url': '', 'is_valid': True}}]
        with patch.object(self.manager, '_read_remote_json', return_value=invalid), \
                patch.object(self.manager, 'get_remote_snapshot_meta', return_value={'app_version': '1.4.22'}), \
                patch.object(self.manager, '_restore_v2_media') as restore_media:
            with self.assertRaises(SyncError):
                self.manager._get_legacy_snapshot()
            restore_media.assert_not_called()
        self.assertEqual(list(self.media_root.rglob('*')), [])

    def test_merged_quant_references_are_checked_before_media_download(self):
        invalid = [{'model': 'quant.entry', 'pk': 'new-offline-entry', 'fields': {
            'anthology': 'collection-deleted-on-other-device', 'title': '离线研究', 'kind': 'factor',
            'content': '', 'tags': [], 'source_url': '', 'is_valid': True}}]
        remote = {'meta': {'snapshot_id': 'remote'}, 'data': [], 'revisions': {}, 'media': {}}
        with ExitStack() as stack:
            stubs = {'get_v2_current': remote, 'build_snapshot_data': [], '_build_revision_manifest': {},
                     'merge_v2_data': (invalid, {}, {})}
            for name, result in stubs.items():
                stack.enter_context(patch.object(self.manager, name, return_value=result))
            restore = stack.enter_context(patch.object(self.manager, '_restore_v2_media'))
            apply = stack.enter_context(patch.object(self.manager, 'apply_snapshot_data'))
            with self.assertRaises(SyncError):
                self.manager._merge_while_locked(lambda *_args: None, base_snapshot_id='', source='test',
                    runner_id='isolated-test', should_abort=None)
            restore.assert_not_called()
            apply.assert_not_called()
        self.assertEqual(list(self.media_root.rglob('*')), [])
