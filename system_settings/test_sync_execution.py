"""终止与重启后的本机同步存活状态，使用隔离数据库和真实进程文件锁。"""
import subprocess
import sys
import tempfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import Mock, patch

from django.test import TestCase
from django.utils import timezone

from system_settings.models import SystemSetting
from system_settings.sync_execution import acquire_execution, execution_is_alive, release_execution
from system_settings.sync_scheduler import (
    WebDavAutoSyncScheduler, cancel_running_sync, generate_runner_id, get_runtime_state,
    is_sync_running, mark_sync_started, remote_lock_recovery_runner,
)
from utils.sync_manager import SyncError


class SyncExecutionTests(TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='odoc-sync-owner-')
        self.addCleanup(temporary.cleanup)
        override = self.settings(MEDIA_ROOT=temporary.name)
        override.enable()
        self.addCleanup(override.disable)
        self.root = Path(temporary.name)

    def state(self, runner_id, *, age=0):
        SystemSetting.objects.update_or_create(
            key='system_webdav_sync_runtime', defaults={'value': {
                'status': 'running', 'runner_id': runner_id, 'cancel_requested': True,
                'last_started_at': (timezone.now() - timedelta(hours=age)).isoformat(),
                'last_error': '用户终止同步：正在释放同步锁',
            }},
        )

    def test_expired_legacy_cancel_state_is_persistently_finished(self):
        runner = 'scheduler:old-container:1'
        self.state(runner, age=4)
        self.assertFalse(is_sync_running())
        current = get_runtime_state()
        self.assertEqual(current['status'], 'idle')
        self.assertFalse(current['cancel_requested'])
        self.assertEqual(current['last_error'], '')
        self.assertEqual(remote_lock_recovery_runner(), runner)

    def test_alive_pid_cannot_keep_an_abandoned_execution_running(self):
        runner = generate_runner_id('manual-pull')
        self.state(runner)
        self.assertFalse(is_sync_running())
        self.assertEqual(get_runtime_state()['status'], 'idle')

    def test_repeated_cancel_cannot_release_a_live_execution(self):
        runner = generate_runner_id('manual-pull')
        self.addCleanup(release_execution, runner)
        acquired, _ = mark_sync_started(trigger='manual-pull', runner_id=runner, initial_message='download')
        self.assertTrue(acquired)
        for _ in range(2):
            cancelled, state = cancel_running_sync()
            self.assertTrue(cancelled)
            self.assertTrue(state['cancel_requested'])
            self.assertEqual(state['status'], 'running')
        self.assertTrue(execution_is_alive(runner))
        second = generate_runner_id('manual')
        self.addCleanup(release_execution, second)
        self.assertFalse(acquire_execution(second))
        release_execution(runner)
        self.assertFalse(is_sync_running())
        self.assertEqual(get_runtime_state()['status'], 'idle')

    def test_process_exit_releases_execution_even_after_hostname_change(self):
        runner = 'manual-pull:old-container:1:lease:old-process'
        self.state(runner)
        path = self.root / '.sync-v2-runtime' / 'active.lock'
        path.parent.mkdir()
        script = '''
import fcntl, sys
handle = open(sys.argv[1], 'a+')
fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
handle.write(sys.argv[2])
handle.flush()
print('locked', flush=True)
sys.stdin.read()
'''
        process = subprocess.Popen(
            [sys.executable, '-c', script, str(path), runner],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        try:
            self.assertEqual(process.stdout.readline().strip(), 'locked')
            self.assertTrue(is_sync_running())
        finally:
            process.terminate()
            process.communicate(timeout=5)
        self.assertFalse(is_sync_running())
        self.assertEqual(get_runtime_state()['status'], 'idle')
        self.assertEqual(remote_lock_recovery_runner(), runner)

    def test_scheduler_cancel_is_not_an_automatic_sync_failure(self):
        scheduler = WebDavAutoSyncScheduler()
        manager = Mock()

        def cancel(**kwargs):
            cancel_running_sync()
            raise SyncError('同步已取消')

        manager.sync_v2.side_effect = cancel
        with patch.object(scheduler, '_build_sync_manager', return_value=manager):
            scheduler._run_sync({'interval': 30}, {})
        state = get_runtime_state()
        self.assertEqual(state['status'], 'idle')
        self.assertFalse(state['cancel_requested'])
        self.assertEqual(state.get('auto_sync_consecutive_failures', 0), 0)
        self.assertFalse(execution_is_alive(scheduler.runner_id))
