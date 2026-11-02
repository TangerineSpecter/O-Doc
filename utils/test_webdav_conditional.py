from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from webdav3.exceptions import RemoteResourceNotFound, ResponseErrorCode
from webdav3.urn import Urn

from .sync_policy import SyncError
from .webdav_conditional import WebDavConditional


class FakeConditionalWebDav:
    def __init__(self, *, ignore_match=False, weak=False, fail_delete=False):
        self.client = self
        self.objects = {}
        self.counter = 0
        self.ignore_match = ignore_match
        self.weak = weak
        self.fail_delete = fail_delete
        self.deleted = []

    def execute_request(self, action, path, data=None, headers_ext=None):
        if action == 'download':
            if path not in self.objects:
                raise RemoteResourceNotFound(path)
            content, etag = self.objects[path]
            return SimpleNamespace(iter_content=lambda chunk_size: iter((content,)),
                                   headers={'ETag': ('W/' if self.weak else '') + etag}, close=lambda: None)
        header = (headers_ext or [''])[0]
        if header == 'If-None-Match: *' and path in self.objects:
            raise ResponseErrorCode(path, 412, 'precondition')
        if header.startswith('If-Match: ') and not self.ignore_match:
            expected = header.removeprefix('If-Match: ')
            if path not in self.objects or self.objects[path][1] != expected:
                raise ResponseErrorCode(path, 412, 'precondition')
        self.counter += 1
        self.objects[path] = (data, f'"version-{self.counter}"')
        return SimpleNamespace(close=lambda: None)

    def delete_path(self, path):
        self.deleted.append(path)
        if self.fail_delete:
            return False
        self.objects.pop(Urn(path).quote(), None)
        return True


class WebDavConditionalTests(SimpleTestCase):
    def test_probe_verifies_preconditions_and_removes_its_temporary_file(self):
        adapter = FakeConditionalWebDav()
        self.assertTrue(WebDavConditional(adapter).probe('/backup/sync-v2'))
        self.assertEqual(adapter.objects, {})
        self.assertEqual(len(adapter.deleted), 1)

    def test_ignored_preconditions_and_weak_etags_are_rejected(self):
        for adapter in (FakeConditionalWebDav(ignore_match=True), FakeConditionalWebDav(weak=True)):
            with self.subTest(adapter=adapter), self.assertRaises(SyncError):
                WebDavConditional(adapter).probe('/backup/sync-v2')
            self.assertEqual(adapter.objects, {})

    def test_collision_does_not_remove_existing_remote_object(self):
        adapter = FakeConditionalWebDav()
        path = '/backup/sync-v2/.odoc-cas-probe-fixed'
        adapter.objects[path] = (b'existing', '"existing"')
        with patch('utils.webdav_conditional.uuid.uuid4', return_value=SimpleNamespace(hex='fixed')):
            with self.assertRaisesMessage(SyncError, '已存在'):
                WebDavConditional(adapter).probe('/backup/sync-v2')
        self.assertEqual(adapter.objects[path][0], b'existing')
        self.assertEqual(adapter.deleted, [])

    def test_probe_reports_cleanup_failure_and_never_uses_the_root(self):
        adapter = FakeConditionalWebDav(fail_delete=True)
        with self.assertRaisesMessage(SyncError, '未能清理'):
            WebDavConditional(adapter).probe('/backup/sync-v2')
        self.assertEqual(len(adapter.objects), 1)
        for directory in ('', '/', '/backup/../other', 'relative'):
            with self.subTest(directory=directory), self.assertRaises(SyncError):
                WebDavConditional(FakeConditionalWebDav()).probe(directory)

    def test_probe_reports_both_original_failure_and_cleanup_path(self):
        adapter = FakeConditionalWebDav(ignore_match=True, fail_delete=True)
        with self.assertRaises(SyncError) as raised:
            WebDavConditional(adapter).probe('/backup/sync-v2')
        self.assertIn('没有正确执行条件写入', str(raised.exception))
        self.assertIn('未能清理', str(raised.exception))
        self.assertIn('/backup/sync-v2/.odoc-cas-probe-', str(raised.exception))
        self.assertIsInstance(raised.exception.__cause__, SyncError)
        self.assertIn('没有正确执行条件写入', str(raised.exception.__cause__))
        self.assertEqual(len(adapter.objects), 1)

    def test_unexpected_cleanup_error_still_identifies_temporary_file(self):
        adapter = FakeConditionalWebDav()
        with patch.object(adapter, 'delete_path', side_effect=OSError('private detail')):
            with self.assertRaises(SyncError) as raised:
                WebDavConditional(adapter).probe('/backup/sync-v2')
        self.assertIn('清理或确认失败', str(raised.exception))
        self.assertIn('/backup/sync-v2/.odoc-cas-probe-', str(raised.exception))
        self.assertNotIn('private detail', str(raised.exception))

    def test_interrupt_keeps_its_type_and_cleanup_path(self):
        adapter = FakeConditionalWebDav(fail_delete=True)
        probe = WebDavConditional(adapter)
        with patch.object(probe, 'read', side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt) as raised:
                probe.probe('/backup/sync-v2')
        self.assertIn('/backup/sync-v2/.odoc-cas-probe-', ' '.join(raised.exception.__notes__))
