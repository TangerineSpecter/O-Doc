"""SFTP protocol adapter smoke tests with an isolated, in-memory remote server."""
import errno
import io
import stat
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase

from utils.sftp_client import SftpClient
from utils.sync_manager import SyncError, SyncManager
from system_settings.sync_scheduler import WebDavAutoSyncScheduler, get_runtime_state
from .agent_world.combat import test_stock_sync as stock_fixture
from .tests import MemoryStorageClient


class MemorySftpServer:
    def __init__(self):
        self.storage = MemoryStorageClient()
        self.storage.directories.add('')
        self.fail_snapshot_upload = False

    def stat(self, path):
        if not self.storage.exists(path):
            raise FileNotFoundError(errno.ENOENT, 'missing', path)
        return SimpleNamespace(st_mode=stat.S_IFDIR if self.storage.is_directory(path) else stat.S_IFREG)

    def mkdir(self, path):
        if not self.storage.try_create_directory(path):
            raise FileExistsError(errno.EEXIST, 'exists', path)

    def listdir(self, path):
        entries = self.storage.list_directory(path)
        if entries is None:
            raise FileNotFoundError(errno.ENOENT, 'missing', path)
        return entries

    def put(self, local, remote):
        if self.fail_snapshot_upload and remote.endswith('/data_index.json'):
            raise ConnectionResetError('simulated interrupted SFTP transfer')
        self.storage.upload_file(local, remote)

    def get(self, remote, local):
        if not self.storage.download_file(remote, local):
            raise FileNotFoundError(errno.ENOENT, 'missing', remote)

    def open(self, path, mode):
        if path not in self.storage.files:
            raise FileNotFoundError(errno.ENOENT, 'missing', path)
        return io.BytesIO(self.storage.files[path])

    def remove(self, path):
        self.storage.delete_path(path)

    def rmdir(self, path):
        if self.listdir(path):
            raise OSError(errno.ENOTEMPTY, 'not empty', path)
        self.storage.delete_path(path)


class SftpSyncFlowTests(TestCase):
    operation = stock_fixture.MaterialStockSyncTests.operation
    data = stock_fixture.MaterialStockSyncTests.data
    check = stock_fixture.MaterialStockSyncTests.check
    listing = stock_fixture.MaterialStockSyncTests.listing

    def setUp(self):
        stock_fixture.MaterialStockSyncTests.setUp(self)
        self.server = MemorySftpServer()
        self.client = SftpClient('sftp.example.invalid', 22, 'test')
        self.enterContext(patch.object(self.client, '_connect', return_value=self.server))
        self.manager = SyncManager(self.client, '/backup')

    def test_manual_sftp_failure_releases_lock_and_retry_preserves_stock(self):
        self.listing()
        first, _, _ = self.manager.sync_v2(manual_upload=True, force_overwrite=True)
        pointer = self.server.storage.files[self.manager.v2_current_file]
        self.server.fail_snapshot_upload = True
        with self.assertRaises(SyncError):
            self.manager.sync_v2(manual_upload=True, force_overwrite=True)
        self.assertEqual(self.server.storage.files[self.manager.v2_current_file], pointer)
        self.assertNotIn(self.manager.v2_dir + '/.sync-lock', self.server.storage.directories)
        self.server.fail_snapshot_upload = False
        second, _, _ = self.manager.sync_v2(manual_upload=True, force_overwrite=True)
        self.assertNotEqual(first['meta']['snapshot_id'], second['meta']['snapshot_id'])
        self.check()

    def test_scheduler_sftp_initial_merge_delta_and_unchanged(self):
        from .agent_world.inventory_stock import stock_quantity
        scheduler = WebDavAutoSyncScheduler()
        self.enterContext(patch.object(scheduler, '_build_sync_manager', return_value=self.manager))
        config = {'protocol': 'sftp', 'interval': 1}
        scheduler._run_sync(config, {})
        first = get_runtime_state()
        self.assertEqual(first['status'], 'success', first.get('last_error'))
        self.listing()
        scheduler._run_sync(config, first)
        second = get_runtime_state()
        self.assertEqual(second['status'], 'success', second.get('last_error'))
        self.assertNotEqual(first['last_synced_snapshot_id'], second['last_synced_snapshot_id'])
        scheduler._run_sync(config, second)
        third = get_runtime_state()
        self.assertEqual(third['status'], 'success', third.get('last_error'))
        self.assertEqual(second['last_synced_snapshot_id'], third['last_synced_snapshot_id'])
        self.assertEqual(stock_quantity(self.a.pk, 'admin', self.sku), 4)
        self.assertFalse(third['auto_sync_paused'])
        self.assertEqual(third['auto_sync_consecutive_failures'], 0)
        # A changed remote head also exercises the full merge/restore route.
        scheduler._run_sync(config, {})
        self.assertEqual(get_runtime_state()['status'], 'success')
        self.check()

    def test_scheduler_transfer_failure_then_retry_clears_error(self):
        scheduler = WebDavAutoSyncScheduler()
        self.enterContext(patch.object(scheduler, '_build_sync_manager', return_value=self.manager))
        config = {'protocol': 'sftp', 'interval': 1}
        self.server.fail_snapshot_upload = True
        scheduler._run_sync(config, {})
        failed = get_runtime_state()
        self.assertEqual(failed['status'], 'error')
        self.assertEqual(failed['auto_sync_consecutive_failures'], 1)
        self.assertTrue(failed['auto_sync_next_retry_at'])
        self.assertNotIn(self.manager.v2_dir + '/.sync-lock', self.server.storage.directories)
        self.server.fail_snapshot_upload = False
        scheduler._run_sync(config, failed)
        recovered = get_runtime_state()
        self.assertEqual(recovered['status'], 'success', recovered.get('last_error'))
        self.assertEqual(recovered['auto_sync_consecutive_failures'], 0)
        self.assertFalse(recovered['auto_sync_paused'])
        self.assertEqual(recovered['auto_sync_next_retry_at'], '')

    def test_unreadable_sftp_destination_never_publishes_an_empty_replacement(self):
        self.manager.sync_v2(manual_upload=True, force_overwrite=True)
        pointer = self.server.storage.files[self.manager.v2_current_file]
        original = self.server.open

        def denied(path, mode):
            if path == self.manager.v2_current_file:
                raise PermissionError(errno.EACCES, 'denied', path)
            return original(path, mode)

        with patch.object(self.server, 'open', side_effect=denied):
            with self.assertRaises(OSError):
                self.manager.sync_v2(source='scheduler')
        self.assertEqual(self.server.storage.files[self.manager.v2_current_file], pointer)
        self.assertNotIn(self.manager.v2_dir + '/.sync-lock', self.server.storage.directories)


class SftpDirectoryErrorTests(TestCase):
    def test_listing_only_missing_directory_is_empty(self):
        client = SftpClient('sftp.example.invalid', 22, 'test')
        for error, expected in ((FileNotFoundError(errno.ENOENT, 'missing'), []),
                                (PermissionError(errno.EACCES, 'denied'), None),
                                (TimeoutError('timeout'), None),
                                (ConnectionResetError('reset'), None)):
            with self.subTest(error=type(error).__name__), patch.object(client, '_connect') as connect:
                connect.return_value.listdir.side_effect = error
                self.assertEqual(client.list_directory('/backup'), expected)

    def test_read_and_stat_errors_are_not_reported_as_missing(self):
        client = SftpClient('sftp.example.invalid', 22, 'test')
        for error in (PermissionError(errno.EACCES, 'denied'), TimeoutError('timeout'),
                      ConnectionResetError('reset')):
            with self.subTest(error=type(error).__name__), patch.object(client, '_connect') as connect:
                connect.return_value.stat.side_effect = error
                connect.return_value.open.side_effect = error
                with self.assertRaises(OSError):
                    client.exists('/backup/current.json')
                with self.assertRaises(OSError):
                    client.get_file_content('/backup/current.json')
                with self.assertRaises(OSError):
                    client.ensure_directory('/backup')

    def test_directory_creation_race_accepts_only_a_real_directory(self):
        client = SftpClient('sftp.example.invalid', 22, 'test')
        for mode in (stat.S_IFDIR, stat.S_IFREG):
            with self.subTest(mode=mode), patch.object(client, '_connect') as connect:
                connect.return_value.stat.side_effect = [FileNotFoundError(errno.ENOENT, 'missing'),
                                                        SimpleNamespace(st_mode=mode)]
                connect.return_value.mkdir.side_effect = FileExistsError(errno.EEXIST, 'created by peer')
                if mode == stat.S_IFDIR:
                    client.ensure_directory('/backup')
                else:
                    with self.assertRaises(OSError):
                        client.ensure_directory('/backup')
