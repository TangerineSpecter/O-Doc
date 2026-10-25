"""Persisted execution, revocation and restore, using synthetic data only."""
import copy
import json
from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from quant import test_factor_curation as fixtures
from quant import test_experiment_search as search_fixtures
from quant.experiments.datasets import create_dataset
from quant.experiments.worker import execute
from quant.experiments.search import run_batch
from quant.experiments.jobs import request_data
from quant.models import ExperimentRequest, ExperimentJob, ExperimentResult, ExperimentCheckpoint
from quant.sync import metadata, validate, reset_execution
from utils.sync_manager import SyncManager, SyncError


class ExperimentJobsTests(TestCase):
    setUp = fixtures.CurationTests.setUp
    collect = fixtures.CurationTests.collect
    publish = fixtures.CurationTests.publish

    def prepare(self):
        candidate = self.publish('experiment_factor_00001')
        rows = search_fixtures.data()['rows']
        csv = 'timestamp,open,high,low,close,volume\n' + '\n'.join(','.join(str(row[key]) for key in ('timestamp', 'open', 'high', 'low', 'close', 'volume')) for row in rows)
        dataset = create_dataset(self.collection, {'name': 'Synthetic test fixture', 'csv_text': csv,
            'symbol': 'SYNTHETIC', 'timeframe': '1d', 'timezone': 'UTC', 'source': 'test', 'price_adjustment': 'not applicable'})
        self.path = f'/api/quant/{self.collection.pk}/experiments/'
        self.input = {'request_key': 'experiment_request_00001', 'name': '参数与组合实验', 'dataset_id': dataset.pk,
            'seeds': [{'candidate_id': candidate.pk, 'bindings': [{'name': 'close', 'column': 'close'}],
                'parameters': [{'name': 'N', 'value': 5}], 'variants': [[{'name': 'N', 'value': n}] for n in (3, 8, 0)]}],
            'config': search_fixtures.SearchTests.config}
        return candidate, dataset

    def start(self):
        response = self.client.post(self.path, self.input, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return ExperimentRequest.objects.get(pk=response.data['data']['id'])

    def test_execution_checkpoint_roundtrip_and_idempotence(self):
        self.prepare()
        request = self.start()
        self.assertEqual(self.start().pk, request.pk)
        self.assertEqual(ExperimentJob.objects.count(), 1)
        execute(request.job.pk)
        body = self.client.get(self.path + request.pk + '/').json()['data']
        self.assertEqual(body['status'], 'completed', body)
        output = json.loads(body['resultJson'])['output']
        self.assertEqual(output['seed_plan'][0]['parameters'], {'N': 5})
        self.assertEqual(len(output['attempts']), body['attemptCount'])
        self.assertTrue(any(item['status'] == 'rejected' for item in output['attempts']))
        self.assertEqual(self.client.get(self.path).data['data']['total'], 1)
        self.assertEqual(self.client.get(self.path + request.pk + '/cancel/').status_code, 405)
        snapshot = SyncManager().build_snapshot_data()
        self.assertNotIn('quant.experimentjob', {row['model'] for row in snapshot})
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(ExperimentJob.objects.exists())
        self.assertEqual(request_data(request)['status'], 'completed')
        self.start()
        self.assertFalse(ExperimentJob.objects.exists())
        self.input['name'] = 'different'
        self.assertEqual(self.client.post(self.path, self.input, format='json').status_code, 409)

    def test_cancel_pending_survives_restore_and_never_runs(self):
        self.prepare(); request = self.start()
        self.assertEqual(self.client.post(self.path + request.pk + '/cancel/').data['data']['status'], 'cancelled')
        with patch('quant.experiments.worker.run_batch') as calculate:
            execute(request.job.pk)
        calculate.assert_not_called()
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        reset_execution()
        self.assertEqual(request_data(request)['status'], 'cancelled')

    def test_cancel_running_retains_attempts_and_revocation_cannot_publish(self):
        self.prepare(); request = self.start()
        def cancel_after_attempt(snapshot, seeds, config, **kwargs):
            original = kwargs['checkpoint']
            def save(item):
                original(item)
                self.client.post(self.path + request.pk + '/cancel/')
            kwargs['checkpoint'] = save
            return run_batch(snapshot, seeds, config, **kwargs)
        with patch('quant.experiments.worker.run_batch', side_effect=cancel_after_attempt):
            execute(request.job.pk)
        self.assertEqual(request_data(request)['status'], 'cancelled')
        self.assertGreater(ExperimentCheckpoint.objects.filter(request=request).count(), 0)
        self.assertIsNone(request.result.data['output']['holdout'])
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        self.input['request_key'] = 'experiment_restore_00001'
        restored = self.start()
        def revoke(*args, **kwargs):
            reset_execution()
            return run_batch(*args, **kwargs)
        with patch('quant.experiments.worker.run_batch', side_effect=revoke):
            execute(restored.job.pk)
        self.assertFalse(ExperimentResult.objects.filter(request=restored).exists())
        self.assertEqual(request_data(restored)['status'], 'interrupted')
        self.start()
        self.assertFalse(ExperimentJob.objects.exists())

    def test_expiry_queue_budget_foreign_data_and_tamper(self):
        self.prepare(); request = self.start()
        job = request.job
        job.lease_until = timezone.now() - timedelta(seconds=1); job.save()
        with patch('quant.experiments.worker.run_batch') as calculate:
            execute(job.pk)
        calculate.assert_not_called()
        self.assertEqual(request_data(request)['status'], 'interrupted')
        for i in range(4):
            self.input['request_key'] = f'experiment_budget_{i:06d}'
            self.start()
        self.input['request_key'] = 'experiment_budget_999999'
        self.assertEqual(self.client.post(self.path, self.input, format='json').status_code, 409)
        self.client.force_authenticate(get_user_model().objects.create_user('experiment-outsider'))
        self.assertIn(self.client.get(self.path).status_code, (403, 404))
        self.assertIn(self.client.post(self.path + request.pk + '/cancel/').status_code, (403, 404))
        snapshot = SyncManager().build_snapshot_data()
        row = next(row for row in snapshot if row['model'] == 'quant.experimentrequest')
        row['fields']['plan']['seeds'][0]['parameters']['N'] = 100
        with self.assertRaises(SyncError): validate(snapshot, metadata(snapshot))

    def test_checkpoint_failure_keeps_finished_attempts_and_sync_rejects_loss(self):
        self.prepare(); request = self.start()
        def crash(snapshot, seeds, config, **kwargs):
            original = kwargs['checkpoint']
            def save(item):
                original(item)
                raise RuntimeError('simulated executor crash')
            kwargs['checkpoint'] = save
            return run_batch(snapshot, seeds, config, **kwargs)
        with patch('quant.experiments.worker.run_batch', side_effect=crash):
            execute(request.job.pk)
        self.assertEqual(request_data(request)['status'], 'failed')
        self.assertEqual(request.checkpoints.count(), 1)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        altered = copy.deepcopy(snapshot)
        altered[:] = [row for row in altered if row['model'] != 'quant.experimentcheckpoint']
        with self.assertRaises(SyncError): validate(altered, metadata(altered))


    def test_dispatch_failure_and_invalid_numeric_inputs_are_reviewable(self):
        self.prepare()
        original = copy.deepcopy(self.input)
        self.input['config'] = self.input['config'] | {'threshold': 10 ** 1000}
        self.assertEqual(self.client.post(self.path, self.input, format='json').status_code, 400)
        self.assertFalse(ExperimentRequest.objects.exists())
        self.input = original
        request = self.start()
        from quant.experiments.worker import dispatch
        with override_settings(QUANT_DISABLE_WORKERS=False), patch('quant.experiments.worker.executor.submit', side_effect=RuntimeError('unavailable')):
            dispatch(request.job.pk)
        self.assertEqual(request_data(request)['status'], 'failed')
        self.assertEqual(request.checkpoints.count(), 0)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
