"""Graph observations retain counterexamples and exact version ownership."""
from unittest.mock import patch
from django.test import TestCase
from quant import test_factor_curation as fixtures
from quant.models import FactorEvidenceLink, Job
from quant.research.contracts import digest
from quant import test_experiment_jobs as jobs


class GraphEvidenceTests(TestCase):
    setUp = fixtures.CurationTests.setUp
    collect = fixtures.CurationTests.collect
    publish = fixtures.CurationTests.publish
    prepare = jobs.ExperimentJobsTests.prepare
    start = jobs.ExperimentJobsTests.start

    def graph(self, candidate):
        return self.client.get(f'/api/quant/{self.collection.pk}/graph/', {'candidateId': candidate.pk}).json()['data']

    def test_feedback_is_unverified_and_graph_does_not_start_or_modify_research(self):
        candidate = self.publish('graph_feedback_000001')
        saved = self.client.post(f'/api/quant/{self.collection.pk}/entries/{candidate.report.entry_id}/feedback/', {
            'requestKey': 'graph_feedback_saved001', 'title': '用户亏损反馈', 'targetSourceId': candidate.report.source_id,
            'factorId': candidate.pk, 'mode': 'live', 'documentFormat': 'text', 'document': '用户报告亏损，实际成交未核实', 'analyze': False}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        jobs = Job.objects.count()
        with patch('quant.worker.dispatch') as model, patch('quant.experiments.worker.dispatch') as experiment:
            graph = self.graph(candidate)
        model.assert_not_called(); experiment.assert_not_called()
        self.assertEqual(Job.objects.count(), jobs)
        observed = next(row for row in graph['nodes'] if row['kind'] == 'feedback')
        proof = FactorEvidenceLink.objects.get(candidate=candidate, kind='feedback')
        self.assertEqual(observed['evidence']['targetHash'], proof.data['target_hash'])
        self.assertEqual(observed['evidence']['candidateHash'], digest(candidate.data))
        self.assertEqual(observed['reportId'], '')
        edge = next(row for row in graph['edges'] if row['to'] == observed['id'])
        self.assertEqual(edge['kind'], 'direct_observation')
        self.assertIn('未核实', edge['detail'])
        self.assertIsNone(edge['similarity'])

    def test_failed_native_and_comparison_are_visible_bounded_without_inherited_evidence(self):
        candidate = self.publish('graph_negative_000001')
        other = self.publish('graph_negative_000002')
        for index in range(14):
            value = {'candidate_hash': digest(candidate.data), 'target_hash': str(index), 'status': 'completed',
                'verdict': 'fail', 'evaluation_status': 'completed'}
            FactorEvidenceLink.objects.create(candidate=candidate, kind='native_python' if index % 2 else 'comparison',
                target_id=f'negative-{index}', data=value, content_hash=digest(value))
        graph = self.graph(candidate)
        evidence = [node for node in graph['nodes'] if node.get('evidence')]
        self.assertEqual(len(evidence), 12)
        self.assertTrue(graph['limited'])
        self.assertEqual({node['kind'] for node in evidence}, {'native', 'comparison'})
        self.assertTrue(all('fail' in edge['detail'] for edge in graph['edges'] if edge['kind'] == 'direct_observation'))
        # Same expression and provenance are not permission to transfer observations.
        self.assertFalse(any(node.get('evidence') for node in self.graph(other)['nodes']))
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(f'/api/quant/{self.collection.pk}/graph/').status_code, (401,403))

    def test_wrong_formula_hash_cannot_be_projected(self):
        candidate = self.publish('graph_hash_000000001')
        value = {'candidate_hash': 'ancestor', 'target_hash': 'old'}
        FactorEvidenceLink.objects.create(candidate=candidate, kind='feedback', target_id='old', data=value, content_hash=digest(value))
        self.assertFalse(any(node.get('evidence') for node in self.graph(candidate)['nodes']))

    def test_native_review_document_is_not_an_additional_external_observation(self):
        candidate = self.publish('graph_native_document01')
        value = {'candidate_hash': digest(candidate.data), 'target_hash': 'native-document',
            'scope': 'native_python_analysis_document'}
        FactorEvidenceLink.objects.create(candidate=candidate, kind='feedback', target_id='native-document',
            data=value, content_hash=digest(value))
        edge = next(row for row in self.graph(candidate)['edges'] if row['kind'] == 'direct_observation')
        self.assertIn('同一次', edge['label'])
        self.assertIn('不是另一份外部成交', edge['detail'])

    def test_feedback_report_link_uses_the_feedback_source_not_the_ancestor_report(self):
        import json
        from quant.test_feedback import response
        from quant.models import AIRun, ResearchReport
        from quant.worker import execute
        candidate = self.publish('graph_feedback_report01')
        saved = self.client.post(f'/api/quant/{self.collection.pk}/entries/{candidate.report.entry_id}/feedback/', {
            'requestKey': 'graph_feedback_report02', 'title': '反面参数反馈', 'targetSourceId': candidate.report.source_id,
            'factorId': candidate.pk, 'mode': 'paper', 'documentFormat': 'text', 'document': 'N=10\nnet=-2%'}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        source_id = saved.data['data']['source']['id']
        run = AIRun.objects.get(kind='feedback_review', source_id=source_id)
        with patch('quant.worker.complete', return_value=json.dumps(response())):
            execute(run.pk)
        report = ResearchReport.objects.get(run=run)
        node = next(row for row in self.graph(candidate)['nodes'] if row['kind'] == 'feedback')
        self.assertEqual(node['reportId'], report.pk)
        self.assertNotEqual(node['reportId'], candidate.report_id)

    def test_actual_controlled_experiment_and_restored_graph_keep_the_same_evidence(self):
        from quant.experiments.worker import execute
        from quant.sync import metadata
        from utils.sync_manager import SyncManager
        candidate, _ = self.prepare()
        request = self.start(); execute(request.job.pk)
        graph = self.graph(candidate)
        node = next(row for row in graph['nodes'] if row['kind'] == 'experiment')
        self.assertEqual(node['evidence']['targetId'], request.result.pk)
        self.assertEqual(node['evidence']['targetHash'], request.result.content_hash)
        edge = next(row for row in graph['edges'] if row['to'] == node['id'])
        self.assertIn('直接尝试', edge['detail'])
        self.assertIn('失败', edge['detail'])
        snapshot = SyncManager().build_snapshot_data()
        with patch('quant.worker.dispatch') as model, patch('quant.experiments.worker.dispatch') as runner:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        model.assert_not_called(); runner.assert_not_called()
        restored = self.graph(candidate)
        self.assertIn(node, restored['nodes'])
        self.assertIn(edge, restored['edges'])
