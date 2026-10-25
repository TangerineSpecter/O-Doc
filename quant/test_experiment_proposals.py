"""AI next-round plans remain bounded proposals until an explicit run request."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from quant.test_experiment_reviews import ExperimentReviewTests, response
from quant.experiments.review_evidence import for_result, for_run
from quant.experiments.review_contract import validate_review
from quant.experiments.worker import execute as calculate
from quant.models import AIRun, ExperimentProposal, ExperimentJob, ResearchReport
from quant.worker import execute
from quant.sync import metadata, validate
from utils.sync_manager import SyncManager, SyncError


def proposed(result, option=0):
    run = AIRun.objects.filter(kind='experiment_review', experiment_result=result).order_by('-created_at', '-id').first()
    evidence = for_run(run) if run else for_result(result)
    parent = evidence['planning_options'][option]
    value = response(evidence)
    params = dict(parent['parameters'])
    window = next(iter(params))
    params[window] += 1
    value.update(planning_note='比较邻近窗口，在新数据中检验一致性', proposal={
        'name': '窗口稳定性复核', 'hypothesis': '邻近窗口在新数据中具有方向一致性',
        'falsification': '成本后方向反复变化', 'data_requirement': '未参与上一轮选择的新行情',
        'evidence_refs': ['execution'], 'seeds': [{'candidate_id': parent['id'],
            'variants': [[{'name': name, 'value': item} for name, item in params.items()]]}]})
    memory = run.planning_context.get('research_memory') if run else None
    if memory is not None:
        value.update(memory_note='按本次冻结历史核对先前尝试与负面证据，下一轮仍需新的行情',
            memory_assessment=[{'action': 'investigate', 'rationale': '历史结果只提供复核线索，尚不证明新窗口或市场有效',
                'evidence_refs': [f"memory:{item['kind']}:{item['id']}"]} for item in memory['items']])
    return value


class ExperimentProposalTests(TestCase):
    setUp = ExperimentReviewTests.setUp
    collect = ExperimentReviewTests.collect
    publish = ExperimentReviewTests.publish
    prepare = ExperimentReviewTests.prepare
    start = ExperimentReviewTests.start
    ready = ExperimentReviewTests.ready

    def reviewed(self, option=0):
        request, run = self.ready()
        with patch('quant.worker.complete', return_value=json.dumps(proposed(request.result, option))):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        return request, run, ExperimentProposal.objects.get(run=run)

    def input_from(self, proposal):
        self.input.update(name=proposal.data['name'], request_key='ai_proposal_adoption_01', proposal_id=proposal.pk,
            config=proposal.data['config'], seeds=[{'candidate_id': seed['id'],
                'bindings': [{'name': name, 'column': column} for name, column in seed['bindings'].items()],
                'parameters': [{'name': name, 'value': value} for name, value in seed['parameters'].items()],
                'variants': [[{'name': name, 'value': value} for name, value in variant.items()] for variant in seed['variants']]}
                for seed in proposal.data['seeds']])

    def test_publication_adoption_calculation_and_sync_preserve_literal_parameters(self):
        original, run, proposal = self.reviewed()
        self.assertEqual(proposal.data['seeds'][0]['parameters'], {'N': 5})
        self.assertEqual(proposal.data['seeds'][0]['variants'], [{'N': 6}])
        self.assertEqual(ExperimentJob.objects.count(), 1)  # Proposal never starts a second job.
        body = self.client.get(self.path + original.pk + '/').json()['data']
        self.assertEqual(body['reviews'][0]['proposal']['id'], proposal.pk)
        self.assertIn('N', json.loads(body['reviews'][0]['proposal']['dataJson'])['seeds'][0]['parameters'])
        self.assertIn('下一轮可执行方案', ResearchReport.objects.get(run=run).markdown)
        self.input_from(proposal)
        adopted = self.start()
        self.assertEqual(adopted.plan['version'], 2)
        self.assertFalse(adopted.plan['proposal_adapted'])
        self.assertEqual(adopted.plan['proposal_hash'], proposal.content_hash)
        detail = self.client.get(self.path + adopted.pk + '/').json()['data']
        self.assertEqual(detail['originProposal']['dataJson'], body['reviews'][0]['proposal']['dataJson'])
        calculate(adopted.job.pk)
        self.assertEqual(adopted.result.data['status'], 'completed')
        self.assertTrue(any(row.attempt.get('requested_parameters') == {'N': 6} for row in adopted.checkpoints.all()))
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(ExperimentProposal.objects.get(pk=proposal.pk).data, proposal.data)
        self.assertFalse(ExperimentJob.objects.exists())
        self.start()
        self.assertFalse(ExperimentJob.objects.exists())  # Replaying is not reauthorization.

    def test_derived_parent_and_adapted_execution_do_not_overwrite_proposal(self):
        original, _, proposal = self.reviewed(option=1)
        self.assertNotEqual(proposal.data['seeds'][0]['id'], original.plan['seeds'][0]['id'])
        frozen = copy.deepcopy(proposal.data)
        self.input_from(proposal)
        self.input['config'] = {**self.input['config'], 'fee_bps': 7}
        adopted = self.start()
        self.assertTrue(adopted.plan['proposal_adapted'])
        self.client.post(self.path + adopted.pk + '/cancel/')
        with patch('quant.experiments.worker.run_batch') as engine:
            calculate(adopted.job.pk)
        engine.assert_not_called()
        proposal.refresh_from_db()
        self.assertEqual(proposal.data, frozen)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_invalid_parent_parameter_evidence_type_and_budget_fail_before_publication(self):
        request, run = self.ready()
        good = proposed(request.result)
        evidence = for_run(run)
        invalid = []
        row = copy.deepcopy(good); row['proposal']['seeds'][0]['candidate_id'] = 'invented'; invalid.append(row)
        row = copy.deepcopy(good); row['proposal']['evidence_refs'] = ['attempt-999']; invalid.append(row)
        for value in (0, 2001, True, 6.5, '6', 5):
            row = copy.deepcopy(good); row['proposal']['seeds'][0]['variants'][0][0]['value'] = value; invalid.append(row)
        row = copy.deepcopy(good); row['proposal']['seeds'] *= 2; invalid.append(row)
        row = copy.deepcopy(good); row['proposal']['seeds'][0]['variants'] *= 2; invalid.append(row)
        for row in invalid:
            with self.subTest(value=row['proposal']), self.assertRaises(ValidationError):
                validate_review(row, evidence)
        small = copy.deepcopy(evidence); small['evidence']['execution']['config']['max_candidates'] = 1
        with self.assertRaises(ValidationError):
            validate_review(good, small)
        unused = copy.deepcopy(evidence)
        unused['planning_options'][0]['candidate']['parameters'][0]['category'] = 'execution'
        with self.assertRaises(ValidationError):
            validate_review(good, unused)
        with patch('quant.worker.complete', return_value=json.dumps(invalid[0])):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')
        self.assertFalse(ExperimentProposal.objects.exists())
        self.assertFalse(ResearchReport.objects.filter(run=run).exists())

    def test_missing_or_tampered_proposals_and_execution_links_rejected_on_sync(self):
        _, _, proposal = self.reviewed()
        self.input_from(proposal); adopted = self.start()
        snapshot = SyncManager().build_snapshot_data()
        missing = [row for row in snapshot if row['model'] != 'quant.experimentproposal']
        with self.assertRaises(SyncError):
            validate(missing, metadata(missing))
        for field, value in [('content_hash', 'x' * 64), ('data', {})]:
            altered = copy.deepcopy(snapshot)
            next(row for row in altered if row['model'] == 'quant.experimentproposal')['fields'][field] = value
            with self.assertRaises(SyncError):
                validate(altered, metadata(altered))
        altered = copy.deepcopy(snapshot)
        record = next(row for row in altered if row['model'] == 'quant.experimentrequest' and row['pk'] == adopted.pk)
        record['fields']['plan']['proposal_adapted'] = True
        from quant.research.contracts import digest
        record['fields']['content_hash'] = digest(record['fields']['plan'])
        with self.assertRaises(SyncError):
            validate(altered, metadata(altered))
        self.input['request_key'] = 'missing_proposal_0001'
        self.input['proposal_id'] = 'missing'
        self.assertEqual(self.client.post(self.path, self.input, format='json').status_code, 400)

    def test_legacy_review_replay_and_snapshot_keep_version_one(self):
        request, run = self.ready()
        from quant.services import _run_input, canonical_hash, queue
        inputs = {'kind': 'experiment_review', 'source_id': run.source_id, 'experiment_result_id': request.result.pk,
            'request_key': run.request_key}
        values = _run_input(run.entry, inputs); values.pop('review_version'); values.pop('planning_context')
        AIRun.objects.filter(pk=run.pk).update(review_version=1, planning_context={}, input_hash=canonical_hash(values))
        run.refresh_from_db()
        self.assertEqual(queue(run.entry, inputs).pk, run.pk)
        old = {key: value for key, value in response().items() if key not in ('planning_version', 'planning_note', 'proposal')}
        with patch('quant.worker.complete', return_value=json.dumps(old)):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        self.assertFalse(ExperimentProposal.objects.exists())
        snapshot = SyncManager().build_snapshot_data()
        for row in snapshot:
            if row['model'] == 'quant.airun':
                row['fields'].pop('review_version')
        validate(snapshot, metadata(snapshot))
