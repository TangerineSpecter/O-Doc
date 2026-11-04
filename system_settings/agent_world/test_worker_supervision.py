import threading
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from . import worker


class WorkerSupervisionTests(SimpleTestCase):
    def test_unexpected_exception_and_return_are_retried_until_stopped(self):
        for failure in ('exception', 'return'):
            with self.subTest(failure=failure):
                stop = threading.Event()
                attempts = []

                def run():
                    attempts.append(len(attempts) + 1)
                    if len(attempts) == 1:
                        if failure == 'exception':
                            raise RuntimeError('test failure')
                        return
                    stop.set()

                with patch.object(worker, '_stop', stop), patch.object(worker, '_WORKER_RETRY_SECONDS', 0), \
                        self.assertLogs(worker.logger, level='WARNING'):
                    worker._supervise_loop(run, '测试维护')
                self.assertEqual(attempts, [1, 2])

    def test_repeated_start_only_replaces_missing_worker(self):
        months = MagicMock()
        months.is_alive.return_value = True
        daily = MagicMock()
        daily.is_alive.return_value = True
        stop = threading.Event()
        with patch.object(worker, '_stop', stop), patch.object(worker, '_thread', months), \
                patch.object(worker, '_daily_thread', None), patch.object(worker, '_is_server_process', return_value=True), \
                patch.object(worker.threading, 'Thread', return_value=daily) as create:
            worker.start_world_worker()
            worker.start_world_worker()
            create.assert_called_once()
            daily.start.assert_called_once()
            self.assertIs(worker._thread, months)
            self.assertIs(worker._daily_thread, daily)

    def test_start_does_not_revive_worker_while_stopping(self):
        stop = threading.Event()
        stop.set()
        months = MagicMock()
        months.is_alive.return_value = True
        with patch.object(worker, '_stop', stop), patch.object(worker, '_thread', months), \
                patch.object(worker, '_daily_thread', None), patch.object(worker, '_is_server_process', return_value=True), \
                patch.object(worker.threading, 'Thread') as create:
            worker.start_world_worker()
            create.assert_not_called()
            self.assertTrue(stop.is_set())
