"""Feedback proposals reach real local calculations without inventing external verification."""
from quant.testing_reading import read_fixture
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from quant import test_feedback as fixtures
from quant import test_experiment_proposals as review_fixtures
from quant.feedback.evidence import for_run
from quant.feedback.planning import options
from quant.feedback.contracts import validate_analysis
from quant.models import AIRun, SourceRevision, ExperimentProposal, ExperimentJob, ResearchReport, ResearchCampaign, ResearchCampaignJob
from quant.worker import execute, prompt
from quant.experiments.worker import execute as calculate
from quant.experiments.campaigns.worker import advance
from quant.experiments.campaigns.contracts import experiment_input
from quant.sync import validate, metadata
from utils.sync_manager import SyncManager, SyncError


class FeedbackPlanningTests(TestCase):
    setUp = fixtures.FeedbackExperimentTests.setUp
    collect = fixtures.FeedbackExperimentTests.collect
    publish = fixtures.FeedbackExperimentTests.publish
    prepare = fixtures.FeedbackExperimentTests.prepare
    start = fixtures.FeedbackExperimentTests.start

    def ready(self, linked=False):
        candidate, dataset = self.prepare()
        request = self.start() if linked else None
        if request: calculate(request.job.pk)
        path = f'/api/quant/{self.collection.pk}/entries/{candidate.report.entry_id}/feedback/'
        data = {'request_key': 'feedback_proposal_test01', 'title': '负面反馈', 'target_source_id': candidate.report.source_id,
                'document': 'N=10\nnet=-2%'}
        if request: data['experiment_result_id'] = request.result.pk
        saved = self.client.post(path, data, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        run = AIRun.objects.get(kind='feedback_review')
        context = for_run(run)
        parent = options(context)[0]
        result = fixtures.response()
        result.update(feedback_planning_note='以固定基线与 N=10 进行对照，费用各5bps为假设', feedback_proposal={
            'name': '负面反馈复核', 'hypothesis': '窗口调整能否解释差异', 'falsification': '新数据成本后表现不稳定',
            'data_requirement': '全新同口径历史行情', 'evidence_refs': ['feedback'],
            'seeds': [{'candidate_id': parent['id'], 'variants': [[{'name': 'N', 'value': 10}]]}],
            'config': {'seed': 42, 'max_candidates': 4, 'generations': 2, 'threshold': 0, 'fee_bps': 5, 'slippage_bps': 5, 'gap': 2, 'seconds': 5}})
        return candidate, dataset, run, result, path, data

    def finish(self, run, result):
        value = copy.deepcopy(result)
        memory = run.planning_context.get('library_memory')
        if memory is not None:
            value.update(memory_note='反馈规划保留冻结历史中的失败条件，外部数字仍需核对',
                memory_assessment=[{'action': 'investigate', 'rationale': '先核对历史参数、数据与成本差异，不能直接确认反馈结论',
                    'evidence_refs': [f"memory:{item['kind']}:{item['id']}"]} for item in memory['items']])
        with patch('quant.worker.complete', return_value=json.dumps(value)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        return ExperimentProposal.objects.get(run=run)

    def test_automatic_candidate_plan_calculates_and_syncs_without_reauthorization(self):
        candidate, dataset, run, result, _, _ = self.ready()
        self.assertEqual(run.planning_context['candidate_ids'], [candidate.pk])
        proposal = self.finish(run, result)
        self.assertEqual(proposal.data['origin'], 'external_feedback')
        self.assertFalse(ExperimentJob.objects.exists())
        detail = read_fixture(self.client, f'/api/quant/{self.collection.pk}/entries/{run.entry_id}/')
        report = next(row for row in detail['reports'] if row['runId'] == run.pk)
        self.assertEqual(report['proposal']['id'], proposal.pk)
        self.assertEqual(report['data']['feedbackPlanningVersion'], 1)
        self.assertNotIn('totalScore', report['data'])
        self.input = experiment_input(proposal, dataset.pk, 'feedback_adopt_plan01')
        request = self.start(); calculate(request.job.pk)
        self.assertEqual(request.result.data['status'], 'completed')
        self.assertTrue(any(row.attempt.get('requested_parameters') == {'N': 10} for row in request.checkpoints.all()))
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(ExperimentJob.objects.exists())
        self.start(); self.assertFalse(ExperimentJob.objects.exists())
        self.assertEqual(ExperimentProposal.objects.get(pk=proposal.pk).data, proposal.data)

    def test_linked_inputs_and_feedback_plan_start_bounded_campaign(self):
        _, dataset, run, result, _, _ = self.ready(linked=True)
        proposal = self.finish(run, result)
        self.assertEqual(proposal.data['seeds'][0]['parameters'], {'N': 5})
        self.assertEqual(proposal.data['baseline_status'], 'recorded_experiment_inputs')
        path = f'/api/quant/{self.collection.pk}/campaigns/'
        data = {'request_key': 'feedback_campaign_0001', 'name': '反馈连续验证', 'proposal_id': proposal.pk,
                'dataset_ids': [dataset.pk], 'max_rounds': 1, 'max_attempts': 4, 'compute_seconds': 5, 'wall_seconds': 60, 'model_id': self.model.pk}
        saved = self.client.post(path, data, format='json'); self.assertEqual(saved.status_code, 200, saved.data)
        campaign = ResearchCampaign.objects.get(pk=saved.data['data']['id']); job = campaign.job
        self.assertTrue(advance(job.pk, job.lease_token))
        step = campaign.rounds.get(); calculate(step.experiment.job.pk)
        self.assertTrue(advance(job.pk, job.lease_token)); step.refresh_from_db()
        value = review_fixtures.proposed(step.experiment.result); value['proposal'] = None
        with patch('quant.worker.complete', return_value=json.dumps(value)): execute(step.evaluation.run_id)
        self.assertFalse(advance(job.pk, job.lease_token))
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(ResearchCampaignJob.objects.exists())
        self.assertFalse(advance(job.pk, job.lease_token))

    def test_invalid_design_rejected_atomically_and_legacy_report_remains_valid(self):
        _, _, run, result, _, _ = self.ready()
        context = for_run(run)
        invalid = []
        row = copy.deepcopy(result); row['feedback_proposal']['seeds'][0]['candidate_id'] = 'foreign'; invalid.append(row)
        row = copy.deepcopy(result); row['feedback_proposal']['evidence_refs'] = ['source']; invalid.append(row)
        for value in (0, 2001, True, '10', 10.5):
            row = copy.deepcopy(result); row['feedback_proposal']['seeds'][0]['variants'][0][0]['value'] = value; invalid.append(row)
        row = copy.deepcopy(result); row['feedback_proposal']['config']['max_candidates'] = 1; invalid.append(row)
        row = copy.deepcopy(result); row['feedback_proposal']['config']['gap'] = -1; invalid.append(row)
        for row in invalid:
            with self.assertRaises(ValidationError): validate_analysis(row, context)
        with patch('quant.worker.complete', return_value=json.dumps(invalid[0])): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'failed')
        self.assertFalse(ExperimentProposal.objects.exists()); self.assertFalse(ResearchReport.objects.filter(run=run).exists())
        legacy = {key: value for key, value in fixtures.response().items() if not key.startswith('feedback_planning') and key != 'feedback_proposal'}
        self.assertNotIn('feedback_proposal', validate_analysis(legacy))
        with self.assertRaises(ValidationError): validate_analysis(legacy, context)

    def test_history_and_candidates_frozen_no_future_or_foreign_context(self):
        candidate, _, run, result, path, data = self.ready()
        first_prompt = prompt(run)
        self.finish(run, result)
        saved = self.client.post(path, {**data, 'request_key': 'feedback_history_next1', 'document': 'N=10\nnet=-2%\n再次失败'}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        new_run = AIRun.objects.get(kind='feedback_review', source_id=saved.data['data']['source']['id'])
        self.assertEqual(new_run.planning_context['history_ids'], [run.source_id])
        self.assertIn('net=-2%', for_run(new_run)['research_memory']['history'][0]['document'])
        self.assertEqual(prompt(AIRun.objects.get(pk=run.pk)), first_prompt)
        self.finish(new_run, result)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        for field, ids in [('candidate_ids', ['foreign']), ('history_ids', [new_run.source_id])]:
            changed = copy.deepcopy(snapshot)
            record = next(row for row in changed if row['model'] == 'quant.airun' and row['pk'] == new_run.pk)
            record['fields']['planning_context'][field] = ids
            with self.assertRaises(SyncError): validate(changed, metadata(changed))
        missing = [row for row in snapshot if not (row['model'] == 'quant.experimentproposal' and row['fields']['run'] == new_run.pk)]
        with self.assertRaises(SyncError): validate(missing, metadata(missing))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(prompt(AIRun.objects.get(pk=new_run.pk)), prompt(new_run))
