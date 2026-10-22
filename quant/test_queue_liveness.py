"""Exercise real OS queue locks using only a temporary directory and no database."""
import os
import select
import subprocess
import sys
import tempfile
import threading
from pathlib import Path
from unittest.mock import patch

from django.test import SimpleTestCase

from . import queue_liveness


class QueueLivenessTests(SimpleTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='odoc-quant-liveness-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name).resolve()
        self.enterContext(patch('quant.queue_liveness.tempfile.gettempdir', return_value=str(self.root)))
        self.run_id, self.token = 'isolated-run', 'isolated-job-token'
        self.path = queue_liveness._path(self.run_id, self.token)
        self.assertTrue(self.path.resolve().is_relative_to(self.root))

    def claim(self):
        lease = queue_liveness.claim(self.run_id, self.token)
        self.assertIsNotNone(lease)
        self.addCleanup(lease.close)
        return lease

    def test_close_removes_marker_and_is_idempotent(self):
        lease = self.claim()
        self.assertTrue(self.path.is_file())
        self.assertTrue(queue_liveness.alive(self.run_id, self.token))
        self.assertIsNone(queue_liveness.claim(self.run_id, self.token))
        lease.close()
        self.assertTrue(lease.stream.closed)
        self.assertFalse(self.path.exists())
        self.assertFalse(queue_liveness.alive(self.run_id, self.token))
        lease.close()
        replacement = self.claim()
        self.assertTrue(queue_liveness.alive(self.run_id, self.token))
        replacement.close()

    def test_process_exit_releases_lock_without_reauthorizing_work(self):
        script = '''
import os
import sys
from unittest.mock import patch
from quant import queue_liveness
with patch('quant.queue_liveness.tempfile.gettempdir', return_value=sys.argv[1]):
    lease = queue_liveness.claim(sys.argv[2], sys.argv[3])
    if lease is None:
        raise RuntimeError('isolated child could not claim queue marker')
    print('claimed', flush=True)
    sys.stdin.readline()
    # Simulate an abrupt worker exit, with no PendingLease.close() cleanup.
    os._exit(0)
'''
        process = subprocess.Popen(
            [sys.executable, '-c', script, str(self.root), self.run_id, self.token],
            cwd=Path(__file__).resolve().parents[1], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )

        def stop_child():
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            for stream in (process.stdin, process.stdout, process.stderr):
                stream.close()

        self.addCleanup(stop_child)
        ready, _, _ = select.select([process.stdout], [], [], 5)
        self.assertTrue(ready, 'isolated child did not signal lock acquisition')
        self.assertEqual(process.stdout.readline().strip(), 'claimed')
        self.assertTrue(queue_liveness.alive(self.run_id, self.token))
        self.assertIsNone(queue_liveness.claim(self.run_id, self.token))
        _stdout, stderr = process.communicate(input='exit\n', timeout=5)
        self.assertEqual(process.returncode, 0, stderr)
        self.assertTrue(self.path.is_file(), 'abrupt exit should leave an unlocked marker')
        self.assertFalse(queue_liveness.alive(self.run_id, self.token))
        replacement = self.claim()
        self.assertTrue(queue_liveness.alive(self.run_id, self.token))
        replacement.close()
        self.assertFalse(self.path.exists())

    def test_marker_cleanup_cannot_race_a_claim_on_an_old_inode(self):
        owner = self.claim()
        opened, resume_claim, close_started, closed = (threading.Event() for _ in range(4))
        errors, duplicates = [], []
        real_open = os.open

        def paused_open(path, flags, *args, **kwargs):
            descriptor = real_open(path, flags, *args, **kwargs)
            if Path(path) == self.path and threading.current_thread().name == 'stale-queue-claim':
                opened.set()
                if not resume_claim.wait(5):
                    os.close(descriptor)
                    raise TimeoutError('isolated duplicate claim was not resumed')
            return descriptor

        def duplicate_claim():
            try:
                duplicate = queue_liveness.claim(self.run_id, self.token)
                if duplicate is not None:
                    self.addCleanup(duplicate.close)
                duplicates.append(duplicate)
            except BaseException as exc:
                errors.append(exc)

        def finish_owner():
            try:
                close_started.set()
                owner.close()
                closed.set()
            except BaseException as exc:
                errors.append(exc)

        claimant = threading.Thread(target=duplicate_claim, name='stale-queue-claim', daemon=True)
        closer = threading.Thread(target=finish_owner, name='close-queue-owner', daemon=True)
        with patch('quant.queue_liveness.os.open', side_effect=paused_open):
            try:
                claimant.start()
                self.assertTrue(opened.wait(5), 'duplicate claim did not open the existing marker')
                closer.start()
                self.assertTrue(close_started.wait(5))
                self.assertFalse(closed.wait(.2), 'cleanup unlinked a marker while a claim was opening it')
            finally:
                resume_claim.set()
                claimant.join(timeout=5)
                if closer.ident is not None:
                    closer.join(timeout=5)
        self.assertFalse(claimant.is_alive())
        self.assertFalse(closer.is_alive())
        self.assertFalse(errors)
        self.assertEqual(duplicates, [None], 'the duplicate must not own a detached inode')
        self.assertTrue(closed.is_set())
        replacement = self.claim()
        # Repeated cleanup of the original owner cannot remove a new owner's file.
        owner.close()
        self.assertTrue(queue_liveness.alive(self.run_id, self.token))
        replacement.close()
