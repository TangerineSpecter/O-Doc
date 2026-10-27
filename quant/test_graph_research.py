"""Scoped claims are projected, never published, selected or inherited on read."""
import copy
import json
from types import SimpleNamespace
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from quant.graph.research_contract import outcome
from quant.graph.research import _matches
from quant.test_combination import fixture
from quant.experiments.combination import analyze
from quant.research.contracts import digest


class GraphResearchRuleTests(SimpleTestCase):
    def test_negative_flat_and_profitable_dominance_are_distinct_and_no_holdout_is_read(self):
        plan, attempts = fixture()
        group = analyze(plan, attempts)['groups'][0]
        self.assertEqual(outcome(group)[0], 'counterexample')
        for part in ('train', 'validation'):
            attempts[2]['metrics'][part].update(total_return=.12, max_drawdown=.005, turnover=1)
        group = analyze(plan, attempts)['groups'][0]
        self.assertEqual(outcome(group)[0], 'supports')
        before = copy.deepcopy(group)
        attempts[2]['metrics']['holdout'] = {'total_return': -999}
        self.assertEqual(outcome(analyze(plan, attempts)['groups'][0]), outcome(before))
        attempts[2]['metrics']['validation']['total_return'] = 0
        self.assertEqual(outcome(analyze(plan, attempts)['groups'][0])[0], 'counterexample')

    def test_every_inner_window_and_rejected_attempt_remain_visible_not_average_support(self):
        plan, attempts = fixture()
        plan['config']['walk_forward'] = {'version': 2, 'inner_folds': 2}
        for row in attempts:
            row['inner_evaluation'] = {'folds': [{'number': 1, 'metrics': copy.deepcopy(row['metrics'])}]}
        group = analyze(plan, attempts)['groups'][0]
        self.assertEqual(outcome(group)[0], 'mixed')
        self.assertEqual([row['status'] for row in outcome(group)[1]], ['counterexample', 'unknown'])
        attempts[2]['status'] = 'rejected'
        self.assertEqual(outcome(analyze(plan, attempts)['groups'][0])[0], 'unknown')

    def test_only_direct_formula_variants_or_the_exact_published_parent_match(self):
        center = SimpleNamespace(pk='a', derived_checkpoint_id=None)
        rows = {'a0': {'operation': 'source_candidate', 'parents': ['a']},
            'a1': {'operation': 'parameter_variant', 'parents': ['a0']},
            'a2': {'operation': 'formula_mutation', 'parents': ['a0']},
            'ab': {'operation': 'mean', 'parents': ['a0', 'b0']}}
        self.assertTrue(_matches('a1', center, rows, {}))
        self.assertFalse(_matches('a2', center, rows, {}))
        self.assertFalse(_matches('ab', center, rows, {}))
        center.derived_checkpoint_id = 'published-ab'
        self.assertTrue(_matches('ab', center, rows, {'ab': 'published-ab'}))


class GraphResearchIntegrationTests(TestCase):
    from quant.test_experiment_jobs import ExperimentJobsTests as setup
    setUp, collect, publish, prepare, start = setup.setUp, setup.collect, setup.publish, setup.prepare, setup.start

    def graph(self, candidate):
        response = self.client.get(f'/api/quant/{self.collection.pk}/graph/', {'candidateId': candidate.pk})
        self.assertEqual(response.status_code, 200, response.data)
        return response.json()['data']

    def test_real_combination_ai_proposal_exact_report_link_and_restore_do_not_execute(self):
        from quant.models import FactorCandidate, FactorRelation, Job
        from quant.experiments.worker import execute as calculate
        from quant.experiments.reviews import start_review
        from quant.experiments.review_evidence import for_run
        from quant.test_experiment_reviews import response
        from quant.worker import execute
        from quant.sync import metadata
        from utils.sync_manager import SyncManager
        a, _ = self.prepare(); b = self.publish('graph_research_parent_b01')
        self.input['seeds'] = [self.input['seeds'][0], {'candidate_id': b.pk,
            'bindings': [{'name': 'close', 'column': 'close'}], 'parameters': [{'name': 'N', 'value': 10}], 'variants': []}]
        request = self.start()
        with patch('quant.experiments.reviews.auto_review'):
            with self.captureOnCommitCallbacks(execute=True): calculate(request.job.pk)
        run = start_review(request.result, request_key='graph_research_review_01')
        facts = for_run(run); answer = response(facts)
        answer.update(planning_note='在新数据比较单独与组合', proposal={'name': '组合互补假设',
            'hypothesis': '两个实际窗口组合是否有正的成本后增量', 'falsification': '新数据上组合不优于单独父代',
            'data_requirement': '新的独立行情', 'evidence_refs': ['execution'],
            'seeds': [{'candidate_id': seed['id'], 'variants': []} for seed in request.plan['seeds']]})
        with patch('quant.worker.complete', return_value=json.dumps(answer)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        jobs, relations = Job.objects.count(), FactorRelation.objects.count()
        with patch('quant.worker.dispatch') as model, patch('quant.experiments.expression.calculate') as engine:
            graph = self.graph(b)
        model.assert_not_called(); engine.assert_not_called()
        self.assertEqual((Job.objects.count(), FactorRelation.objects.count()), (jobs, relations))
        hypotheses = [row for row in graph['edges'] if row['kind'] == 'complement_hypothesis']
        observations = [row for row in graph['edges'] if row['kind'].startswith('combination_')]
        self.assertEqual(len(hypotheses), 1); self.assertTrue(observations)
        payload = json.loads(observations[0]['researchJson'])
        self.assertEqual(payload['candidate_hash'], digest(b.data))
        self.assertFalse(payload['rule']['uses_holdout']); self.assertFalse(payload['rule']['registered_before_experiment'])
        target = next(node for node in graph['nodes'] if node['id'] == observations[0]['to'])
        self.assertEqual(target['entryId'], a.report.entry_id)
        self.assertEqual(target['reportId'], run.report.pk)
        self.assertNotEqual(target['reportId'], b.report_id)
        self.assertTrue(payload['ai_interpretation'])
        from pathlib import Path
        Path('/private/tmp/odoc-graph-research-wire.json').write_text(json.dumps(graph))
        scenario = json.loads(next(row for row in graph['edges'] if row['kind'] == 'scenario_hypothesis')['researchJson'])
        self.assertEqual(scenario['scope'], 'source_level_context_not_component_applicability')
        derived = FactorCandidate.objects.filter(derived_checkpoint_id__in=request.checkpoints.values('id')).first()
        self.assertIsNotNone(derived)
        self.assertFalse(any(row['kind'] == 'scenario_hypothesis' for row in self.graph(derived)['edges']))
        snapshot = SyncManager().build_snapshot_data()
        with patch('quant.worker.dispatch') as model, patch('quant.experiments.worker.dispatch') as engine:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        model.assert_not_called(); engine.assert_not_called()
        restored = self.graph(b)
        for edge in [*hypotheses, *observations]: self.assertIn(edge, restored['edges'])

    def test_feedback_support_and_counter_claims_keep_quote_scope_and_original_ai_data(self):
        from quant.models import AIRun
        from quant.worker import execute
        from quant.test_feedback import response
        candidate = self.publish('graph_research_feedback01')
        saved = self.client.post(f'/api/quant/{self.collection.pk}/entries/{candidate.report.entry_id}/feedback/', {
            'requestKey': 'graph_research_feedback02', 'title': '正反信息', 'targetSourceId': candidate.report.source_id,
            'factorId': candidate.pk, 'mode': 'paper', 'documentFormat': 'text', 'document': 'N=10\nnet=-2%\ntrades=2'}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        run = AIRun.objects.get(kind='feedback_review'); answer = response()
        answer['supporting_evidence'] = [{'claim': '报告提供成交数', 'quote': 'trades=2'}]
        with patch('quant.worker.complete', return_value=json.dumps(answer)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        graph = self.graph(candidate)
        selected = [row for row in graph['edges'] if row['kind'].startswith('reported_')]
        self.assertEqual({row['kind'] for row in selected}, {'reported_support', 'reported_counterexample'})
        for edge in selected:
            payload = json.loads(edge['researchJson'])
            self.assertFalse(payload['platform_authenticated']); self.assertFalse(payload['independent_evidence'])
            self.assertEqual(payload['reported_parameters'][0]['value'], '10')
            self.assertIn(payload['quote'], 'N=10\nnet=-2%\ntrades=2')
            self.assertEqual(edge['to'], f'factor:{candidate.pk}')
        from pathlib import Path
        Path('/private/tmp/odoc-graph-feedback-wire.json').write_text(json.dumps(graph))
        other = self.publish('graph_research_feedback03')
        self.assertFalse(any(row['kind'].startswith('reported_') for row in self.graph(other)['edges']))
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(f'/api/quant/{self.collection.pk}/graph/').status_code, (401, 403))
