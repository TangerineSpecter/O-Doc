"""Numerical, coverage and restore tests; synthetic data and patched models only."""
import copy
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant.experiments.combination import analyze, evidence
from quant.experiments.combination_review import validate


def metric(profit, drawdown, turnover=2):
    return {'total_return': profit, 'max_drawdown': drawdown, 'turnover': turnover,
        'entries': 2, 'missing_signals': 0, 'bars': 10, 'start': '2024-01-01', 'end': '2024-01-11'}


def fixture():
    plan = {'config': {}}
    attempts = [{'id': f'attempt-{i}', 'parents': ['seed'] if i < 3 else ['attempt-1', 'attempt-2'],
        'operation': 'source_candidate' if i < 3 else 'mean', 'status': 'evaluated', 'reason': '',
        'metrics': {part: metric(profit, drawdown) for part in ('train', 'validation')}}
        for i, profit, drawdown in ((1, .1, .03), (2, .08, .01), (3, .09, .02))]
    return plan, attempts


class CombinationTests(SimpleTestCase):
    def test_actual_differences_keep_worse_return_and_drawdown_tradeoff(self):
        plan, attempts = fixture()
        before = copy.deepcopy(attempts)
        value = analyze(plan, attempts)['groups'][0]['windows'][0]['parts']['validation']
        self.assertAlmostEqual(value['deltas']['return_over_best_parent'], -.01)
        self.assertAlmostEqual(value['deltas']['drawdown_over_lower_parent'], .01)
        self.assertAlmostEqual(value['deltas']['versus_parents'][0]['total_return'], -.01)
        self.assertAlmostEqual(value['deltas']['versus_parents'][1]['total_return'], .01)
        self.assertEqual(attempts, before)
        # Unrelated final-test fields never enter these comparisons.
        attempts[2]['metrics']['holdout'] = metric(100, 0)
        self.assertEqual(value, analyze(plan, attempts)['groups'][0]['windows'][0]['parts']['validation'])

    def test_incomplete_failed_misaligned_and_cross_fold_stay_unknown(self):
        plan, attempts = fixture()
        attempts[2].update(status='rejected', reason='test failure', metrics={})
        group = analyze(plan, attempts)['groups'][0]
        self.assertEqual(group['status'], 'rejected')
        self.assertIsNone(group['windows'][0]['parts']['validation']['deltas'])
        plan, attempts = fixture(); attempts[0]['metrics']['validation']['start'] = '2024-01-02'
        part = analyze(plan, attempts)['groups'][0]['windows'][0]['parts']['validation']
        self.assertEqual(part['reason'], 'window_mismatch')
        self.assertIsNone(part['deltas'])
        attempts[0]['fold'] = 2
        self.assertFalse(analyze(plan, attempts)['groups'][0]['parent_scope_valid'])
        self.assertIsNotNone(analyze(plan, attempts)['groups'][0]['windows'][0]['parts']['validation']['values'][2])

    def test_nested_uses_every_planned_window_not_last_top_level_metric(self):
        plan, attempts = fixture()
        plan['config']['walk_forward'] = {'version': 2, 'inner_folds': 3}
        for row in attempts:
            row['fold'] = 1
            row['inner_evaluation'] = {'folds': [{'number': 1, 'metrics': copy.deepcopy(row['metrics'])}]}
        attempts[2]['inner_evaluation']['folds'][0]['metrics']['validation']['total_return'] = -.2
        group = analyze(plan, attempts)['groups'][0]
        self.assertEqual(len(group['windows']), 3)
        self.assertAlmostEqual(group['windows'][0]['parts']['validation']['deltas']['return_over_best_parent'], -.3)
        for window in group['windows'][1:]:
            self.assertIsNone(window['parts']['validation']['deltas'])

    def test_all_combinations_bound_facts_and_old_reports_remain_separate(self):
        plan, attempts = fixture()
        facts = evidence(plan, attempts)
        raw = {'combination_reviews': [{'evidence_ref': 'combination:attempt-3', 'text': '描述性对照'}]}
        result = copy.deepcopy(raw); validate(raw, result, facts)
        self.assertEqual(result['combination_reviews'][0]['facts'], facts['combination:attempt-3'])
        tampered = copy.deepcopy(result)
        tampered['combination_reviews'][0]['facts']['windows'][0]['parts']['validation']['deltas']['return_over_best_parent'] = 999
        with self.assertRaises(ValidationError): validate(tampered, tampered, facts)
        for invalid in ({}, {'combination_reviews': []}, {'combination_reviews': raw['combination_reviews'] * 2}):
            with self.assertRaises(ValidationError): validate(invalid, copy.deepcopy(invalid), facts)
        with self.assertRaises(ValidationError): validate(raw, copy.deepcopy(raw), {})
        empty = {'combination_reviews': []}; validate(empty, empty, evidence(plan, attempts[:2]))

    def test_label_target_and_window_must_match_and_unknown_is_not_zero(self):
        plan, attempts = fixture(); target = {'version': 1, 'horizon_bars': 2}
        plan['config']['label_target'] = target
        for i, row in enumerate(attempts):
            row['label_evaluation'] = {'metrics': {part: {'status': 'completed', 'target': target,
                'start_timestamp': '2024-01-01', 'end_timestamp': '2024-01-11', 'spearman_ic': .1 * i,
                'coverage': 1, 'pairs': 9, 'reason': ''} for part in ('train', 'validation')}}
        label = analyze(plan, attempts)['groups'][0]['windows'][0]['parts']['train']['labels']
        self.assertAlmostEqual(label['versus_parents'][0]['spearman_ic'], .2)
        attempts[0]['label_evaluation']['metrics']['train']['spearman_ic'] = None
        self.assertIsNone(analyze(plan, attempts)['groups'][0]['windows'][0]['parts']['train']['labels']['versus_parents'])


class CombinationIntegrationTests(TestCase):
    from quant.test_experiment_jobs import ExperimentJobsTests as setup
    setUp, collect, publish, prepare, start = setup.setUp, setup.collect, setup.publish, setup.prepare, setup.start

    def test_worker_report_projection_sync_tamper_and_legacy_prompt(self):
        import json
        from unittest.mock import patch
        from quant.experiments.worker import execute as calculate
        from quant.experiments.reviews import start_review
        from quant.experiments.review_evidence import for_run, for_result
        from quant.experiments.review_contract import review_prompt
        from quant.test_experiment_reviews import response
        from quant.worker import execute
        from quant.sync import metadata, validate as validate_sync
        from utils.sync_manager import SyncManager, SyncError
        self.prepare()
        second = self.publish('second_combo_parent_01')
        self.input['seeds'] = [self.input['seeds'][0] | {'variants': []},
            {'candidate_id': second.pk, 'bindings': [{'name': 'close', 'column': 'close'}],
                'parameters': [{'name': 'N', 'value': 10}], 'variants': []}]
        request = self.start(); calculate(request.job.pk)
        run = start_review(request.result, request_key='combo_review_0000001')
        facts = for_run(run)
        self.assertEqual(run.review_version, 17)
        self.assertTrue(facts['evidence']['combination_analysis']['group_refs'])
        legacy = copy.deepcopy(run.planning_context); legacy.pop('output_associations'); legacy['version'] = 6
        old = for_result(request.result, 15, legacy)
        self.assertNotIn('combination_analysis', old['evidence'])
        self.assertNotIn('combination_reviews', review_prompt(old, ''))
        stripped = copy.deepcopy(facts)
        for key in list(stripped['evidence']):
            if key in ('combination_analysis', 'output_associations') or key.startswith(('combination:', 'output_association:')): stripped['evidence'].pop(key)
        self.assertEqual(stripped, old)
        answer = response(facts)
        with patch('quant.worker.complete', return_value=json.dumps(answer)):
            execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        self.assertTrue(run.result['combination_reviews'])
        self.assertIn('组合与直接父代', run.report.markdown)
        detail = self.client.get(self.path + request.pk + '/').json()['data']
        self.assertTrue(json.loads(detail['combinationAnalysisJson'])['groups'])
        snapshot = SyncManager().build_snapshot_data(); validate_sync(snapshot, metadata(snapshot))
        tampered = copy.deepcopy(snapshot)
        raw = next(row['fields']['result'] for row in tampered if row['model'] == 'quant.airun' and row['pk'] == run.pk)
        raw['combination_reviews'][0]['facts']['status'] = 'invented'
        with self.assertRaises(SyncError): validate_sync(tampered, metadata(tampered))
        with self.assertRaises(SyncError): validate_sync(snapshot, metadata(snapshot) | {'quant_schema_version': 72})
        with patch('quant.worker.complete') as model, patch('quant.experiments.worker.run_batch') as engine:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        model.assert_not_called(); engine.assert_not_called()
