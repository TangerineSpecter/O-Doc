"""Queue waits use temporary local coordination and never call a real model."""
import json
import tempfile
from concurrent.futures import Future
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from anthology.models import Anthology
from .models import AIRun, Job
from .services import Conflict, create_implementation, queue
from . import worker


class DeferredExecutor:
    def __init__(self):
        self.tasks = []

    def submit(self, function, *args):
        future = Future()
        self.tasks.append((future, function, args))
        return future

    def execute_next(self):
        future, function, args = self.tasks.pop(0)
        if future.set_running_or_notify_cancel():
            try:
                future.set_result(function(*args))
            except BaseException as exc:
                future.set_exception(exc)
                raise


@override_settings(QUANT_DISABLE_WORKERS=False)
class QueueWaitTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='odoc-quant-queue-')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.enterContext(patch('tempfile.gettempdir', return_value=str(self.root)))
        self.executor = DeferredExecutor()
        self.enterContext(patch.object(worker, 'executor', self.executor))
        self.addCleanup(self.cancel_queued)

    def cancel_queued(self):
        for future, _function, _args in self.executor.tasks:
            future.cancel()

    def run_for(self, title='排队研究', *, collection=None):
        collection = collection or Anthology.objects.create(type='quant', title=title, permission='private', user_id='queue-owner')
        from .models import Entry
        entry = Entry.objects.create(anthology=collection, title=title)
        implementation = create_implementation(entry, {'name': '脚本', 'language': 'python', 'code': 'factor = 1'})
        run = AIRun.objects.create(entry=entry, source_version_id=implementation.current_version_id,
            request_key='queue_wait_request_0001', input_hash='queue-test', kind='explain', model_id='fake-model')
        Job.objects.create(run=run, lease_until=timezone.now() + timedelta(minutes=3))
        return run

    def expire(self, run):
        Job.objects.filter(run=run).update(lease_until=timezone.now() - timedelta(seconds=1))

    def test_live_queue_wait_can_exceed_initial_lease_across_collections(self):
        runs = [self.run_for(f'文集 {index}') for index in range(6)]
        for run in runs:
            worker.dispatch(run.pk)
            self.expire(run)
        for run in runs:
            self.assertEqual(worker.recover(run).status, 'pending')
        self.assertFalse(Job.objects.filter(cancelled=True).exists())

    def test_live_delayed_tasks_still_count_toward_collection_limit(self):
        first = self.run_for()
        runs = [first, *(self.run_for(collection=first.entry.anthology) for _ in range(3))]
        for run in runs:
            worker.dispatch(run.pk)
            self.expire(run)
        with patch('quant.services.model_config') as config:
            with self.assertRaises(Conflict):
                queue(first.entry, {'kind': 'explain', 'source_version_id': first.source_version_id,
                    'request_key': 'queue_over_limit_0001', 'model_id': 'fake-model'})
            config.assert_not_called()
        self.assertEqual(AIRun.objects.count(), 4)
        self.assertEqual(AIRun.objects.filter(status='pending').count(), 4)

    def test_delayed_callback_starts_once_and_uses_a_fresh_running_lease(self):
        run = self.run_for()
        worker.dispatch(run.pk)
        worker.dispatch(run.pk)
        self.assertEqual(len(self.executor.tasks), 1)
        self.expire(run)
        config = {'model_name': 'fake', 'model_id': 'fake-model', 'provider_id': 'fake-provider',
                  'provider_name': 'fake', 'provider_type': 'OpenAi'}
        with patch.object(worker, 'model_config', return_value=config), \
             patch.object(worker, 'complete', return_value=json.dumps({'explanation': '说明'})) as completion:
            self.executor.execute_next()
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        completion.assert_called_once()
        self.assertEqual(completion.call_args.kwargs['deadline_seconds'], 120)

    def test_cancelled_queue_future_releases_liveness_and_old_work_is_recoverable(self):
        run = self.run_for()
        worker.dispatch(run.pk)
        self.executor.tasks[0][0].cancel()
        self.expire(run)
        self.assertEqual(worker.recover(run).status, 'interrupted')
        self.assertTrue(Job.objects.get(run=run).cancelled)

    def test_queue_owner_does_not_extend_running_lease(self):
        run = self.run_for()
        worker.dispatch(run.pk)
        run.status = 'running'
        run.save(update_fields=['status'])
        self.expire(run)
        self.assertEqual(worker.recover(run).status, 'interrupted')

    def test_failed_submission_releases_queue_owner(self):
        run = self.run_for()
        with patch.object(self.executor, 'submit', side_effect=RuntimeError('executor stopped')):
            with self.assertRaisesRegex(RuntimeError, 'executor stopped'):
                worker.dispatch(run.pk)
        self.expire(run)
        self.assertEqual(worker.recover(run).status, 'interrupted')
