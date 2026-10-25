"""Isolated batch lifecycle, actual report publication and snapshot boundaries."""
import copy
import json
from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from django.contrib.auth import get_user_model
from quant import test_research_analysis as fixtures
from quant.models import Entry, AIRun, Job, SourceRevision, IntakeBatch, IntakeBatchJob, IntakeDispatch, IntakeOutcome
from quant.intake.worker import advance, dispatch
from quant.intake.services import recover
from quant.research.contracts import digest
from quant.worker import execute
from quant.sync import metadata, validate, reset_execution
from utils.sync_manager import SyncManager, SyncError


class IntakeBatchTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp

    def batch(self, count=6, **changes):
        self.path = f'/api/quant/{self.collection.pk}/intake-batches/'
        self.data = {'request_key': 'batch_materials_00001', 'name': '批量代码', 'analyze': True,
            'model_id': self.model.pk, 'wall_seconds': 600,
            'items': [{'title': f'材料 {i}', 'code': 'N=20\ndef factor(close): return close / close.shift(N) - 1'} for i in range(count)], **changes}
        response = self.client.post(self.path, self.data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        batch = IntakeBatch.objects.get(pk=response.data['data']['id'])
        return batch, IntakeBatchJob.objects.filter(batch=batch).first()

    def complete(self, step):
        with patch('quant.worker.complete', return_value=json.dumps(fixtures.result())):
            execute(step.run_id)
        step.run.refresh_from_db()
        self.assertEqual(step.run.status, 'completed', step.run.error)

    def snapshot(self):
        snapshot = SyncManager().build_snapshot_data()
        self.assertNotIn('quant.intakebatchjob', {row['model'] for row in snapshot})
        validate(snapshot, metadata(snapshot))
        return snapshot

    def test_six_sources_sequentially_publish_reports_and_restore_without_execution(self):
        batch, job = self.batch()
        self.assertEqual(Entry.objects.count(), 6)
        self.assertFalse(AIRun.objects.exists())
        replay = self.client.post(self.path, self.data, format='json')
        self.assertEqual(replay.data['data']['id'], batch.pk)
        for ordinal in range(1, 7):
            self.assertTrue(advance(job.pk, job.lease_token))
            step = batch.dispatches.get(ordinal=ordinal)
            self.assertTrue(advance(job.pk, job.lease_token))
            self.assertEqual(AIRun.objects.filter(status__in=['pending', 'running']).count(), 1)
            self.assertEqual(batch.dispatches.count(), ordinal)
            self.complete(step)
        self.assertFalse(advance(job.pk, job.lease_token))
        detail = self.client.get(self.path + batch.pk + '/').json()['data']
        self.assertEqual(detail['status'], 'completed')
        self.assertEqual(detail['reservedCalls'], 6)
        self.assertEqual(detail['completed'], 6)
        self.assertTrue(all(row['reportId'] for row in detail['items']))
        snapshot = self.snapshot()
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(IntakeBatchJob.objects.exists())
        self.assertFalse(Job.objects.exists())
        self.assertFalse(advance(job.pk, job.lease_token))
        self.client.post(self.path, self.data, format='json')
        self.assertFalse(IntakeBatchJob.objects.exists())
        self.assertEqual(AIRun.objects.count(), 6)
        response = self.client.post(self.path + batch.pk + '/retry/', {'request_key': 'nothing_to_retry_0001'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_cancel_retry_only_unfinished_and_idempotent_retry(self):
        batch, job = self.batch(count=3)
        advance(job.pk, job.lease_token)
        self.complete(batch.dispatches.get())
        advance(job.pk, job.lease_token)
        cancelled = batch.dispatches.get(ordinal=2)
        response = self.client.post(self.path + batch.pk + '/cancel/')
        self.assertEqual(response.data['data']['status'], 'cancelled')
        cancelled.run.refresh_from_db()
        self.assertEqual(cancelled.run.status, 'cancelled')
        with patch('quant.worker.complete') as model:
            execute(cancelled.run_id)
        model.assert_not_called()
        self.assertFalse(advance(job.pk, job.lease_token))
        data = {'request_key': 'batch_retry_request_01', 'model_id': self.model.pk, 'wall_seconds': 300}
        response = self.client.post(self.path + batch.pk + '/retry/', data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        retried = IntakeBatch.objects.get(pk=response.data['data']['id'])
        self.assertEqual(retried.plan['sources'], batch.plan['sources'][1:])
        self.assertEqual(Entry.objects.count(), 3)
        self.assertEqual(SourceRevision.objects.count(), 3)
        again = self.client.post(self.path + batch.pk + '/retry/', data, format='json')
        self.assertEqual(again.data['data']['id'], retried.pk)
        self.assertEqual(IntakeBatch.objects.count(), 2)
        self.assertEqual(self.client.post(self.path + batch.pk + '/retry/', {**data, 'request_key': 'another_retry_key_01'}, format='json').status_code, 409)
        self.snapshot()

    def test_invalid_batch_atomic_limits_permissions_and_request_conflicts(self):
        batch, _ = self.batch(count=2, analyze=False)
        self.assertEqual(batch.outcome.data['status'], 'archived')
        self.assertFalse(AIRun.objects.exists())
        response = self.client.post(self.path, {**self.data, 'name': 'changed'}, format='json')
        self.assertEqual(response.status_code, 409)
        for items in ([], [{}], [{'code': 'x'}] * 21, [{'code': '中' * 150000}] * 3):
            response = self.client.post(self.path, {**self.data, 'request_key': 'invalid_batch_key_01', 'items': items}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Entry.objects.count(), 2)
        self.client.force_authenticate(get_user_model().objects.create_user('foreign-batch-owner'))
        for suffix in ('', batch.pk + '/', batch.pk + '/retry/', batch.pk + '/cancel/'):
            response = self.client.post(self.path + suffix, self.data, format='json') if suffix.endswith(('retry/', 'cancel/')) else self.client.get(self.path + suffix)
            self.assertEqual(response.status_code, 404)
        self.snapshot()

    def test_waiting_model_archives_and_explicit_retry_after_configuration(self):
        batch, job = self.batch(count=2, model_id='missing-model')
        self.assertIsNone(job)
        self.assertEqual(batch.outcome.data['reason'], 'waiting_model')
        response = self.client.post(self.path + batch.pk + '/retry/',
            {'request_key': 'configured_retry_0001', 'model_id': self.model.pk}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        child = IntakeBatch.objects.get(pk=response.data['data']['id'])
        self.assertTrue(advance(child.job.pk, child.job.lease_token))
        self.assertEqual(Entry.objects.count(), 2)
        self.snapshot()

    def test_capacity_wait_deadline_expiry_and_no_permission_revival(self):
        batch, job = self.batch(count=2)
        from quant.services import QueueCapacity
        with patch('quant.intake.worker.queue', side_effect=QueueCapacity()):
            self.assertTrue(advance(job.pk, job.lease_token))
        self.assertFalse(IntakeDispatch.objects.exists())
        self.assertTrue(advance(job.pk, job.lease_token))
        IntakeBatchJob.objects.filter(pk=job.pk).update(deadline=timezone.now() - timedelta(seconds=1))
        recover(job)
        self.assertEqual(IntakeOutcome.objects.get(batch=batch).data['reason'], 'wall_budget')
        self.assertEqual(AIRun.objects.get().status, 'cancelled')
        self.snapshot()
        batch2, job2 = self.batch(count=1, request_key='fresh_batch_request_01')
        advance(job2.pk, job2.lease_token)
        reset_execution()
        self.assertFalse(advance(job2.pk, job2.lease_token))
        response = self.client.get(self.path + batch2.pk + '/')
        self.assertEqual(response.data['data']['status'], 'interrupted')
        self.snapshot()

    def test_failed_source_does_not_block_later_sources_and_retry_reuses_sources(self):
        batch, job = self.batch(count=3)
        Entry.objects.filter(pk=batch.plan['sources'][0]).update(is_valid=False)
        self.assertTrue(advance(job.pk, job.lease_token))
        self.assertEqual(batch.dispatches.get().reason, 'source_unavailable')
        advance(job.pk, job.lease_token)
        with patch('quant.worker.complete', return_value='invalid model result'):
            execute(batch.dispatches.get(ordinal=2).run_id)
        advance(job.pk, job.lease_token)
        self.complete(batch.dispatches.get(ordinal=3))
        self.assertFalse(advance(job.pk, job.lease_token))
        self.assertEqual(batch.outcome.data['status'], 'partial')
        self.assertEqual(batch.outcome.data['completed'], 1)
        self.snapshot()

    def test_sync_tampering_recomputed_hash_does_not_hide_wrong_membership_or_budget(self):
        batch, job = self.batch(count=2)
        advance(job.pk, job.lease_token)
        self.client.post(self.path + batch.pk + '/cancel/')
        snapshot = self.snapshot()
        for label, mutate in [
            ('quant.intakebatch', lambda fields: fields['plan']['sources'].reverse()),
            ('quant.intakebatch', lambda fields: fields['plan'].update(wall_seconds=10000)),
            ('quant.intakedispatch', lambda fields: fields.update(ordinal=2)),
            ('quant.intakeoutcome', lambda fields: fields['data'].update(completed=1)),
        ]:
            altered = copy.deepcopy(snapshot)
            fields = next(row['fields'] for row in altered if row['model'] == label)
            mutate(fields)
            if 'content_hash' in fields:
                fields['content_hash'] = digest(fields.get('plan', fields.get('data')))
            with self.assertRaises(SyncError):
                validate(altered, metadata(altered))
        altered = copy.deepcopy(snapshot)
        altered.append({'model': 'quant.intakebatchjob', 'pk': 'injected', 'fields': {}})
        with self.assertRaises(SyncError):
            validate(altered, metadata(altered))

    def test_lost_coordinator_and_executor_failure_are_terminal(self):
        batch, job = self.batch(count=1)
        IntakeBatchJob.objects.filter(pk=job.pk).update(lease_until=timezone.now() - timedelta(seconds=1))
        with patch('quant.queue_liveness.alive', return_value=True):
            self.assertEqual(recover(job).status, 'pending')
        with patch('quant.queue_liveness.alive', return_value=False):
            self.assertEqual(recover(job).status, 'interrupted')
        batch2, job2 = self.batch(count=1, request_key='executor_failure_001')
        with override_settings(QUANT_DISABLE_WORKERS=False), patch('quant.intake.worker.executor.submit', side_effect=RuntimeError('test')):
            dispatch(job2.pk)
        self.assertEqual(batch2.outcome.data['reason'], 'executor_failed')
        self.snapshot()
