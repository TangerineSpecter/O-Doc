"""Bounded automatic rounds with synthetic prices and fake model responses."""
import copy
import json
from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from quant import test_experiment_proposals as fixtures
from quant.models import ResearchCampaign, ResearchCampaignJob, ResearchOutcome, ExperimentJob, Job, AIRun
from quant.experiments.campaigns.worker import advance
from quant.experiments.campaigns.services import recover
from quant.experiments.worker import execute as calculate
from quant.worker import execute as analyze
from quant.experiments.datasets import create_dataset
from quant.sync import validate, metadata, reset_execution
from utils.sync_manager import SyncManager, SyncError


class ResearchCampaignTests(TestCase):
    setUp = fixtures.ExperimentProposalTests.setUp
    collect = fixtures.ExperimentProposalTests.collect
    publish = fixtures.ExperimentProposalTests.publish
    prepare = fixtures.ExperimentProposalTests.prepare
    start = fixtures.ExperimentProposalTests.start
    ready = fixtures.ExperimentProposalTests.ready
    reviewed = fixtures.ExperimentProposalTests.reviewed

    def campaign(self, **changes):
        dataset_count = changes.pop('dataset_count', 2)
        request, _, proposal = self.reviewed()
        extra = create_dataset(self.collection, {'name': 'Second synthetic dataset', 'csv_text': request.dataset.raw_csv,
            'symbol': 'SECOND', 'timeframe': '1d', 'timezone': 'UTC', 'source': 'test', 'price_adjustment': ''})
        self.campaign_path = f'/api/quant/{self.collection.pk}/campaigns/'
        self.campaign_input = {'request_key': 'campaign_start_test_01', 'name': '连续窗口研究', 'proposal_id': proposal.pk,
            'dataset_ids': [request.dataset_id, extra.pk][:dataset_count], 'max_rounds': 2, 'max_attempts': 64,
            'compute_seconds': 120, 'wall_seconds': 600, 'model_id': self.model.pk, **changes}
        response = self.client.post(self.campaign_path, self.campaign_input, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        campaign = ResearchCampaign.objects.get(pk=response.data['data']['id'])
        return campaign, campaign.job

    def step(self, campaign, job, *, no_proposal=False):
        self.assertTrue(advance(job.pk, job.lease_token))
        round = campaign.rounds.latest('ordinal')
        before = AIRun.objects.count()
        with self.captureOnCommitCallbacks(execute=True):
            calculate(round.experiment.job.pk)
        self.assertEqual(AIRun.objects.count(), before)  # The campaign, not auto_review, owns its review.
        self.assertTrue(advance(job.pk, job.lease_token))
        round.refresh_from_db()
        run = round.evaluation.run
        result = fixtures.proposed(round.experiment.result)
        if no_proposal:
            result['proposal'] = None
        with patch('quant.worker.complete', return_value=json.dumps(result)):
            analyze(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        return round

    def test_two_round_execution_budget_idempotence_and_sync(self):
        campaign, job = self.campaign()
        first = self.step(campaign, job)
        self.assertTrue(advance(job.pk, job.lease_token))  # Starts round two once.
        self.assertTrue(advance(job.pk, job.lease_token))
        self.assertEqual(campaign.rounds.count(), 2)
        second = campaign.rounds.latest('ordinal')
        self.assertNotEqual(first.experiment_id, second.experiment_id)
        self.assertEqual(second.experiment.plan['seeds'][0]['parameters'], first.experiment.plan['seeds'][0]['parameters'])
        with self.captureOnCommitCallbacks(execute=True):
            calculate(second.experiment.job.pk)
        self.assertTrue(advance(job.pk, job.lease_token))
        second.refresh_from_db()
        with patch('quant.worker.complete', return_value=json.dumps(fixtures.proposed(second.experiment.result))):
            analyze(second.evaluation.run_id)
        self.assertFalse(advance(job.pk, job.lease_token))
        self.assertEqual(ResearchOutcome.objects.get(campaign=campaign).data['reason'], 'round_budget')
        detail = self.client.get(self.campaign_path + campaign.pk + '/').json()['data']
        self.assertEqual(detail['modelCalls'], 2)
        self.assertLessEqual(detail['reservedAttempts'], 64)
        self.assertEqual(detail['status'], 'completed')
        snapshot = SyncManager().build_snapshot_data()
        self.assertNotIn('quant.researchcampaignjob', {row['model'] for row in snapshot})
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(ResearchCampaignJob.objects.exists())
        self.assertFalse(advance(job.pk, job.lease_token))
        replay = self.client.post(self.campaign_path, self.campaign_input, format='json')
        self.assertEqual(replay.data['data']['id'], campaign.pk)
        self.assertFalse(ResearchCampaignJob.objects.exists())
        self.assertFalse(ExperimentJob.objects.exists())

    def test_model_stop_and_dataset_exhaustion(self):
        campaign, job = self.campaign(max_rounds=3)
        self.step(campaign, job, no_proposal=True)
        self.assertFalse(advance(job.pk, job.lease_token))
        self.assertEqual(ResearchOutcome.objects.get(campaign=campaign).data['reason'], 'model_stop')
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_cancel_running_review_revokes_followup_and_keeps_history(self):
        campaign, job = self.campaign()
        self.assertTrue(advance(job.pk, job.lease_token))
        step = campaign.rounds.get()
        calculate(step.experiment.job.pk)
        self.assertTrue(advance(job.pk, job.lease_token))
        step.refresh_from_db()
        response = self.client.post(self.campaign_path + campaign.pk + '/cancel/')
        self.assertEqual(response.data['data']['status'], 'cancelled')
        with patch('quant.worker.complete') as provider:
            analyze(step.evaluation.run_id)
        provider.assert_not_called()
        self.assertFalse(advance(job.pk, job.lease_token))
        self.assertEqual(campaign.rounds.count(), 1)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_restore_and_expiry_do_not_spawn_more_work(self):
        campaign, job = self.campaign()
        self.assertTrue(advance(job.pk, job.lease_token))
        reset_execution()
        self.assertFalse(advance(job.pk, job.lease_token))
        self.assertFalse(Job.objects.exists())
        self.assertEqual(self.client.get(self.campaign_path + campaign.pk + '/').data['data']['status'], 'interrupted')

    def test_time_budget_cancels_child_and_tampered_budget_rejected(self):
        campaign, job = self.campaign()
        self.assertTrue(advance(job.pk, job.lease_token))
        ResearchCampaignJob.objects.filter(pk=job.pk).update(deadline=timezone.now() - timedelta(seconds=1))
        recover(job)
        self.assertEqual(ResearchOutcome.objects.get(campaign=campaign).data['reason'], 'wall_budget')
        self.assertFalse(advance(job.pk, job.lease_token))
        self.assertEqual(campaign.rounds.get().experiment.job.status, 'cancelled')
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        altered = copy.deepcopy(snapshot)
        fields = next(row['fields'] for row in altered if row['model'] == 'quant.researchcampaign')
        fields['plan']['max_attempts'] = 1
        from quant.research.contracts import digest
        fields['content_hash'] = digest(fields['plan'])
        with self.assertRaises(SyncError):
            validate(altered, metadata(altered))
        self.campaign_input['dataset_ids'] = ['missing']
        self.campaign_input['request_key'] = 'bad_campaign_dataset_01'
        self.assertEqual(self.client.post(self.campaign_path, self.campaign_input, format='json').status_code, 400)

    def test_attempt_budget_and_dataset_exhaustion_stop_after_completed_review(self):
        campaign, job = self.campaign(max_attempts=12)
        self.step(campaign, job)
        self.assertFalse(advance(job.pk, job.lease_token))
        self.assertEqual(ResearchOutcome.objects.get(campaign=campaign).data['reason'], 'attempt_budget')
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_single_preselected_dataset_stops_without_recycling(self):
        campaign, job = self.campaign(dataset_count=1)
        self.step(campaign, job)
        self.assertFalse(advance(job.pk, job.lease_token))
        self.assertEqual(ResearchOutcome.objects.get(campaign=campaign).data['reason'], 'datasets_exhausted')
        self.assertEqual(campaign.rounds.count(), 1)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_failed_review_and_executor_submission_are_visible(self):
        campaign, job = self.campaign()
        self.assertTrue(advance(job.pk, job.lease_token))
        step = campaign.rounds.get(); calculate(step.experiment.job.pk)
        self.assertTrue(advance(job.pk, job.lease_token)); step.refresh_from_db()
        with patch('quant.worker.complete', return_value='invalid'):
            analyze(step.evaluation.run_id)
        self.assertFalse(advance(job.pk, job.lease_token))
        self.assertEqual(ResearchOutcome.objects.get(campaign=campaign).data['reason'], 'review_failed')
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_missing_round_or_forged_evaluation_rejected(self):
        campaign, job = self.campaign()
        step = self.step(campaign, job)
        snapshot = SyncManager().build_snapshot_data()
        missing = [row for row in snapshot if row['model'] != 'quant.researchround']
        with self.assertRaises(SyncError):
            validate(missing, metadata(missing))
        altered = copy.deepcopy(snapshot)
        next(row for row in altered if row['model'] == 'quant.researchevaluation')['fields']['run'] = 'missing'
        with self.assertRaises(SyncError):
            validate(altered, metadata(altered))
        self.assertEqual(self.client.get(self.campaign_path + campaign.pk + '/cancel/').status_code, 405)

    def test_coordinator_loop_completes_without_browser_polling(self):
        campaign, job = self.campaign()
        from quant.experiments.campaigns.worker import execute
        ticks = []
        def child_progress(_seconds):
            ticks.append(1)
            self.assertLess(len(ticks), 15)
            for step in campaign.rounds.select_related('experiment', 'evaluation__run'):
                if step.experiment.job.status == 'pending':
                    calculate(step.experiment.job.pk)
                if hasattr(step, 'evaluation') and step.evaluation.run.status == 'pending':
                    with patch('quant.worker.complete', return_value=json.dumps(fixtures.proposed(step.experiment.result))):
                        analyze(step.evaluation.run_id)
        with patch('quant.experiments.campaigns.worker.time.sleep', side_effect=child_progress):
            execute(job.pk, job.lease_token)
        self.assertEqual(campaign.rounds.count(), 2)
        self.assertEqual(ResearchOutcome.objects.get(campaign=campaign).data['reason'], 'round_budget')

    def test_dispatch_failure_and_owner_revocation_create_no_child(self):
        campaign, job = self.campaign()
        from quant.experiments.campaigns.worker import dispatch
        from django.test import override_settings
        ResearchCampaignJob.objects.filter(pk=job.pk).update(owner_id='different-owner')
        self.assertFalse(advance(job.pk, job.lease_token))
        self.assertFalse(campaign.rounds.exists())
        ResearchCampaignJob.objects.filter(pk=job.pk).update(owner_id=self.collection.user_id)
        with override_settings(QUANT_DISABLE_WORKERS=False), patch('quant.experiments.campaigns.worker.executor.submit', side_effect=RuntimeError('unavailable')):
            dispatch(job.pk)
        self.assertEqual(ResearchOutcome.objects.get(campaign=campaign).data['reason'], 'executor_failed')
        self.assertFalse(campaign.rounds.exists())
