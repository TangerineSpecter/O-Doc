"""Deterministic evidence invariants and end-to-end versioned review restore."""
import copy
import json
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant.experiments.sensitivity import analyze
from quant.experiments.review_evidence import for_run
from quant.experiments.review_contract import validate_review
from quant import test_experiment_reviews as fixtures
from quant.models import AIRun, Job
from quant.worker import execute, prompt
from quant.sync import metadata, validate
from utils.sync_manager import SyncManager, SyncError


def sample():
    seed = {'id': 'factor-1', 'candidate': {'name': '窗口', 'parameters': [{'name': 'N', 'category': 'signal'}],
            'expression': {'op': 'parameter', 'name': 'N'}}, 'parameters': {'N': 10},
            'variants': [{'N': n} for n in (8, 9, 11, 12)]}
    metric = {'total_return': .1, 'max_drawdown': .05, 'turnover': 4, 'entries': 2, 'missing_signals': 0, 'bars': 20}
    recipe = {'expression': {'op': 'parameter', 'name': 'p0'}, 'bindings': {}, 'output_type': 'numeric_series', 'units': 'ratio', 'parameter_names': {'p0': 'N'}}
    attempts = [{'id': f'attempt-{i + 1}', 'operation': 'source_candidate' if i == 0 else 'parameter_variant',
                 'parents': ['factor-1'] if i == 0 else ['attempt-1'], 'requested_parameters': {'N': n},
                 'recipe': {**copy.deepcopy(recipe), 'parameters': {'p0': n}}, 'status': 'evaluated', 'reason': '',
                 'metrics': {part: {**metric, 'total_return': .1 + (n - 10) * .003} for part in ('train', 'validation')}}
                for i, n in enumerate((10, 8, 9, 11, 12))]
    return {'seeds': [seed]}, attempts


class SensitivityTests(SimpleTestCase):
    def test_flat_supported_region_and_deltas_are_reproducible(self):
        plan, attempts = sample()
        before = copy.deepcopy((plan, attempts))
        result = analyze(plan, attempts)
        axis = result['families'][0]['axes'][0]
        self.assertEqual(axis['regions'][0]['sampled_values'], [8, 9, 10, 11, 12])
        self.assertAlmostEqual(axis['spreads']['validation']['total_return'], .012)
        self.assertAlmostEqual(axis['points'][0]['delta']['validation']['total_return'], -.006)
        self.assertEqual((plan, attempts), before)
        self.assertEqual(analyze(plan, list(reversed(attempts))), result)
        self.assertFalse(result['rule']['interpolation_allowed'])

    def test_failed_unexecuted_and_missing_points_break_region(self):
        for change in ('failed', 'not_run', 'missing'):
            with self.subTest(change=change):
                plan, attempts = sample()
                row = attempts[3]  # value 11
                if change == 'failed': row.update(status='rejected', reason='invalid', metrics={})
                elif change == 'not_run': attempts.remove(row)
                else: row['metrics']['validation']['missing_signals'] = 3
                axis = analyze(plan, attempts)['families'][0]['axes'][0]
                self.assertEqual([r['sampled_values'] for r in axis['regions']], [[8, 9, 10]])
                self.assertFalse(axis['points'][3]['eligible'])
        # No false bridge from 10 to 12 through planned-but-unexecuted 11.
        self.assertEqual(axis['points'][3]['value'], 11)

    def test_losing_inactive_or_training_cliff_never_become_recommended_region(self):
        for change in ('losing', 'inactive', 'training_cliff', 'all_missing', 'wrong_formula'):
            with self.subTest(change=change):
                plan, attempts = sample()
                for i, row in enumerate(attempts):
                    if change == 'losing': row['metrics']['validation']['total_return'] = -.1
                    elif change == 'inactive': row['metrics']['validation']['entries'] = 0
                    elif change == 'all_missing': row['metrics']['train']['missing_signals'] = 20
                    elif change == 'training_cliff': row['metrics']['train']['total_return'] = i * .1
                    elif change == 'wrong_formula' and i: row['recipe']['expression'] = {'op': 'constant', 'value': 1}
                axis = analyze(plan, attempts)['families'][0]['axes'][0]
                self.assertFalse(axis['regions'])
                if change in ('losing', 'inactive', 'all_missing'):
                    self.assertTrue(all(point['eligibility_reasons'] for point in axis['points']))

    def test_warmup_coverage_and_identical_metric_period_are_required(self):
        plan, attempts = sample()
        for row in attempts:
            row['metrics']['train']['missing_signals'] = 1  # Limited recorded warmup is visible, not silently removed.
        self.assertTrue(analyze(plan, attempts)['families'][0]['axes'][0]['regions'])
        for row in attempts[1:]: row['metrics']['train']['bars'] = 19
        axis = analyze(plan, attempts)['families'][0]['axes'][0]
        self.assertEqual(axis['compared_points'], 1)
        self.assertFalse(axis['regions'])

    def test_joint_parameters_display_parameters_and_boolean_are_excluded(self):
        plan, attempts = sample()
        seed = plan['seeds'][0]
        seed['parameters'].update(Color=1, Switch=False)
        seed['candidate']['parameters'] += [{'name': 'Color', 'category': 'display'}, {'name': 'Switch', 'category': 'signal'}]
        seed['variants'] = [{'N': 9, 'Color': 2, 'Switch': False}, {'N': 10, 'Color': 1, 'Switch': True}, {'N': 10, 'Color': 3, 'Switch': False}]
        family = analyze(plan, [])['families'][0]
        self.assertEqual(family['axes'], [])
        self.assertEqual(len(family['excluded_variants']), 3)

    def test_holdout_and_selected_winner_do_not_affect_projection(self):
        plan, attempts = sample()
        before = analyze(plan, attempts)
        plan.update(holdout={'total_return': 9999}, selected_id='attempt-5')
        for row in attempts: row['metrics']['holdout'] = {'total_return': -99999}
        self.assertEqual(analyze(plan, attempts), before)
        # Duplicate measurements do not increase support.
        plan['seeds'][0]['variants'] *= 2
        self.assertEqual(analyze(plan, attempts), before)


class SensitivityReviewTests(TestCase):
    setUp = fixtures.ExperimentReviewTests.setUp
    collect = fixtures.ExperimentReviewTests.collect
    publish = fixtures.ExperimentReviewTests.publish
    prepare = fixtures.ExperimentReviewTests.prepare
    start = fixtures.ExperimentReviewTests.start
    ready = fixtures.ExperimentReviewTests.ready

    def test_v4_api_prompt_sync_and_no_execution_on_restore(self):
        request, run = self.ready()
        self.assertEqual(run.review_version, 10)
        evidence = for_run(run)
        self.assertIn('parameter_sensitivity', evidence['evidence'])
        self.assertIn('抽样点', prompt(run))
        response = fixtures.response(evidence)
        response['parameter_assessment'][0]['evidence_refs'] = ['parameter_sensitivity']
        with patch('quant.worker.complete', return_value=json.dumps(response)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        detail = self.client.get(self.path + request.pk + '/').json()['data']
        self.assertEqual(json.loads(detail['sensitivityJson']), evidence['evidence']['parameter_sensitivity'])
        self.client.force_authenticate(user=None)
        self.assertNotEqual(self.client.get(self.path + request.pk + '/').status_code, 200)
        snapshot = SyncManager().build_snapshot_data()
        self.assertEqual(metadata(snapshot)['quant_schema_version'], 51)
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(for_run(AIRun.objects.get(pk=run.pk)), evidence)
        self.assertFalse(Job.objects.exists())
        bad = copy.deepcopy(snapshot)
        next(row['fields'] for row in bad if row['model'] == 'quant.airun' and row['pk'] == run.pk)['review_version'] = 3
        with self.assertRaises(SyncError): validate(bad, metadata(bad))

    def test_old_v3_prompt_and_hash_keep_old_evidence(self):
        request, run = self.ready()
        from quant.services import _run_input, canonical_hash
        values = _run_input(run.entry, {'kind': 'experiment_review', 'source_id': run.source_id,
            'experiment_result_id': request.result.pk, 'request_key': run.request_key})
        values['review_version'] = 3
        legacy_context = {key: val for key, val in values['planning_context'].items() if key not in ('research_memory','fixed_validation','selection_diagnostic')}
        legacy_context['version'] = 1
        values['planning_context'] = legacy_context
        AIRun.objects.filter(pk=run.pk).update(review_version=3, planning_context=legacy_context, input_hash=canonical_hash(values))
        run.refresh_from_db()
        before = prompt(run)
        self.assertNotIn('parameter_sensitivity', before)
        with patch('quant.worker.complete', return_value=json.dumps(fixtures.response())): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(prompt(AIRun.objects.get(pk=run.pk)), before)

    def test_v4_score_requires_three_comparable_points_and_reference(self):
        request, run = self.ready()
        evidence = for_run(run)
        response = fixtures.response(evidence)
        score = response['scores'][0]
        score.update(score=3, evidence_refs=['attempt-1', 'attempt-2'])
        with self.assertRaises(ValidationError): validate_review(response, evidence)
        # Use known controlled measurements to test rule independently of market path.
        plan, attempts = sample()
        for row in attempts: evidence['evidence'][row['id']] = row
        evidence['evidence']['parameter_sensitivity'] = analyze(plan, attempts)
        score['evidence_refs'] = ['parameter_sensitivity', 'attempt-1', 'attempt-2', 'attempt-3']
        self.assertEqual(validate_review(response, evidence)['scores'][0]['score'], 3)
        score['evidence_refs'].remove('attempt-3')
        with self.assertRaises(ValidationError): validate_review(response, evidence)
