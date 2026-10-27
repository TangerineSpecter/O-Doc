"""Joint evidence cannot invent missing combinations or mix modes/folds."""
import copy
import json
from unittest.mock import patch
from itertools import product
from django.test import SimpleTestCase, TestCase
from quant.experiments.joint_sensitivity import analyze, supports_score
from quant.test_sensitivity import sample as single_sample


def sample(dimensions=2, levels=(10, 11, 12)):
    plan, old_attempts = single_sample()
    seed = plan['seeds'][0]
    names = [f'N{i}' for i in range(dimensions)]
    parameters = [{name: value for name, value in zip(names, values)} for values in product(levels, repeat=dimensions)]
    seed['parameters'] = parameters[0]
    seed['candidate']['parameters'] = [{'name': name, 'category': 'signal'} for name in names]
    expression = {'op': 'parameter', 'name': names[0]}
    for name in names[1:]: expression = {'op': 'add', 'args': [expression, {'op': 'parameter', 'name': name}]}
    seed['candidate']['expression'] = expression
    seed['variants'] = parameters[1:]
    attempts = []
    for index, values in enumerate(parameters):
        row = copy.deepcopy(old_attempts[0])
        row.update(id=f'attempt-{index+1}', operation='source_candidate' if index == 0 else 'parameter_variant',
                   parents=[seed['id']] if index == 0 else ['attempt-1'], requested_parameters=values)
        row['recipe'].update(expression=expression, parameter_names={name: name for name in names}, parameters=values)
        attempts.append(row)
    return plan, attempts


def context(result):
    return result['families'][0]['contexts'][0]


class JointSensitivityTests(SimpleTestCase):
    def test_complete_two_and_three_dimensional_grids_preserve_all_points(self):
        for dimensions, levels in ((2, (10, 11, 12)), (3, (10, 12))):
            plan, attempts = sample(dimensions, levels)
            original = copy.deepcopy((plan, attempts))
            result = analyze(plan, attempts)
            group = context(result)
            self.assertEqual(len(group['regions']), 1)
            self.assertEqual(group['regions'][0]['sampled_values'], {f'N{i}': list(levels) for i in range(dimensions)})
            self.assertEqual(set(group['regions'][0]['attempt_ids']), {row['id'] for row in attempts})
            self.assertTrue(group['regions'][0]['includes_baseline'])
            self.assertEqual(analyze(plan, list(reversed(attempts))), result)
            self.assertEqual((plan, attempts), original)
            plan['seeds'][0]['variants'] *= 2
            self.assertEqual(analyze(plan, attempts), result)
            self.assertFalse(result['rule']['interpolation_allowed'])

    def test_a_missing_corner_or_unexecuted_center_cannot_be_interpolated(self):
        for mode in ('not_run', 'failed', 'coverage', 'changed_formula', 'changed_period'):
            plan, attempts = sample(levels=(10, 12))
            row = attempts[-1]
            if mode == 'not_run': attempts.pop()
            elif mode == 'failed': row.update(status='rejected', metrics={}, reason='invalid')
            elif mode == 'coverage': row['metrics']['validation']['missing_signals'] = 8
            elif mode == 'changed_period': row['metrics']['train']['start'] = 'other'
            else: row['recipe']['expression'] = {'op': 'constant', 'value': 0}
            group = context(analyze(plan, attempts))
            self.assertEqual(len(group['points']), 4)
            self.assertEqual(group['regions'], [], mode)
        plan, attempts = sample()
        attempts.pop(4)  # Planned central point (11, 11) remains a hole.
        group = context(analyze(plan, attempts))
        self.assertEqual(group['regions'], [])
        self.assertEqual(group['comparison_cells'], [])

    def test_all_maximal_overlapping_regions_survive_and_cliffs_stop_growth(self):
        plan, attempts = sample()
        for row in attempts:
            for metric in row['metrics'].values():
                metric['total_return'] = .1 + .015 * (row['requested_parameters']['N0'] - 10)
        group = context(analyze(plan, attempts))
        self.assertEqual([row['sampled_values']['N0'] for row in group['regions']], [[10, 11], [11, 12]])
        self.assertTrue(all(row['sampled_values']['N1'] == [10, 11, 12] for row in group['regions']))
        self.assertEqual(len(group['comparison_cells']), 1)
        for row in attempts:
            row['metrics']['validation']['total_return'] = -.1
        losing = context(analyze(plan, attempts))
        self.assertFalse(losing['regions'])
        self.assertTrue(losing['comparison_cells'])
        self.assertTrue(supports_score(analyze(plan, attempts), {'attempt-1', 'attempt-2', 'attempt-4', 'attempt-5'}))
        self.assertFalse(supports_score(analyze(plan, attempts), {'attempt-1', 'attempt-2', 'attempt-4'}))

    def test_categorical_modes_get_separate_measured_references(self):
        for first_mode, second_mode in (('fast', 'slow'), (False, True)):
            plan, attempts = sample(levels=(10, 12))
            seed = plan['seeds'][0]
            seed['candidate']['parameters'].append({'name': 'Mode', 'category': 'signal'})
            seed['candidate']['expression'] = {'op': 'gate', 'args': [seed['candidate']['expression'],
                {'op': 'eq', 'args': [{'op': 'parameter', 'name': 'Mode'}, {'op': 'constant', 'value': first_mode}]}]}
            for values in [seed['parameters'], *seed['variants']]: values['Mode'] = first_mode
            for row in attempts: row['requested_parameters']['Mode'] = first_mode
            original = copy.deepcopy(attempts)
            for row in original:
                row['id'] = f"attempt-{int(row['id'].split('-')[1])+4}"
                row['operation'] = 'parameter_variant'; row['parents'] = ['attempt-1']
                row['requested_parameters']['Mode'] = second_mode
                seed['variants'].append(row['requested_parameters'])
            attempts += original
            result = analyze(plan, attempts)
            contexts = result['families'][0]['contexts']
            self.assertEqual(len(contexts), 2)
            slow = next(row for row in contexts if row['fixed_parameters']['Mode'] == second_mode)
            self.assertEqual(slow['baseline_attempt_id'], 'attempt-5')
            self.assertEqual(set(slow['regions'][0]['attempt_ids']), {'attempt-5', 'attempt-6', 'attempt-7', 'attempt-8'})
            attempts = [row for row in attempts if row['id'] != 'attempt-5']
            slow = next(row for row in analyze(plan, attempts)['families'][0]['contexts'] if row['fixed_parameters']['Mode'] == second_mode)
            self.assertEqual(slow['baseline_attempt_id'], '')
            self.assertFalse(slow['regions'])
            self.assertEqual(slow['compared_points'], 0)

    def test_no_holdout_selection_formula_mixing_or_cross_fold_grid(self):
        plan, attempts = sample(levels=(10, 12))
        result = analyze(plan, attempts)
        plan['selected_id'] = 'attempt-4'
        for row in attempts: row['metrics']['holdout'] = {'total_return': 1e9}
        self.assertEqual(result, analyze(plan, attempts))
        early = copy.deepcopy(attempts)
        for row in early: row['fold'] = 1
        for row in attempts: row['fold'] = 2
        plan['config'] = {'walk_forward': {}}
        folded = analyze(plan, early + attempts[:2])
        self.assertFalse(context(folded)['regions'])
        self.assertEqual(context(folded)['compared_points'], 2)
        self.assertIn('第 2 折', folded['limitations'][0])


from quant import test_experiment_reviews as review_fixtures
from quant import test_experiment_jobs as job_fixtures


class JointReviewTests(TestCase):
    setUp = job_fixtures.ExperimentJobsTests.setUp
    collect = job_fixtures.ExperimentJobsTests.collect
    start = job_fixtures.ExperimentJobsTests.start
    ready = review_fixtures.ExperimentReviewTests.ready

    def publish(self, request):
        from quant.test_factors import extracted
        from quant.models import AIRun, FactorCandidate
        from quant.worker import execute
        self.payload.update(request_key=request, code='N=2\nT=0.01\ndef factor(close): return close / close.shift(N) - 1 > T')
        entry = self.collect()
        data = extracted()
        data['parameters'][0]['default_value'] = '2'
        data['parameters'].append({**data['parameters'][0], 'name': 'T', 'type': 'float', 'default_value': '0.01',
            'meaning': '信号阈值', 'constraints': '有限数值', 'evidence': 'T=0.01'})
        candidate = data['factors'][0]
        candidate.update(output_type='boolean_series', units='boolean', formula='close / close[N] - 1 > T')
        candidate['expression'] = {'op': 'gt', 'args': [candidate['expression'], {'op': 'parameter', 'name': 'T'}]}
        with patch('quant.worker.complete', return_value=json.dumps(data)): execute(AIRun.objects.get(entry=entry).pk)
        return FactorCandidate.objects.get(report__entry=entry)

    def prepare(self):
        result = job_fixtures.ExperimentJobsTests.prepare(self)
        def values(n, t): return [{'name': 'N', 'value': n}, {'name': 'T', 'value': t}]
        self.input['seeds'][0].update(parameters=values(2, .01), variants=[values(2, .02), values(3, .01), values(3, .02)])
        self.input['config'] = self.input['config'] | {'generations': 1, 'max_candidates': 4}
        return result

    def test_actual_calculation_api_model_evidence_review_and_restore(self):
        from quant.experiments.review_evidence import for_run
        from quant.models import AIRun, Job, ExperimentJob
        from quant.worker import execute, prompt
        from quant.sync import validate, metadata
        from utils.sync_manager import SyncManager, SyncError
        request, run = self.ready()
        self.assertEqual(run.review_version, 17)
        evidence = for_run(run)
        joint = evidence['evidence']['parameter_joint_sensitivity']
        group = context(joint)
        self.assertEqual(group['compared_points'], 4)
        self.assertEqual(len(group['comparison_cells']), 1)
        self.assertIn('完整笛卡尔', prompt(run))
        body = self.client.get(self.path + request.pk + '/').json()['data']
        self.assertEqual(json.loads(body['jointSensitivityJson']), joint)
        response = review_fixtures.response(evidence)
        response['scores'][0].update(score=2, evidence_refs=['parameter_joint_sensitivity', 'attempt-1', 'attempt-2', 'attempt-3', 'attempt-4'])
        response['parameter_assessment'][0]['evidence_refs'] = ['parameter_joint_sensitivity']
        with patch('quant.worker.complete', return_value=json.dumps(response)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(run.result['scores'][0]['score'], 2)
        snapshot = SyncManager().build_snapshot_data()
        self.assertEqual(metadata(snapshot)['quant_schema_version'], 74)
        validate(snapshot, metadata(snapshot))
        forged = copy.deepcopy(snapshot)
        next(row['fields'] for row in forged if row['model'] == 'quant.airun' and row['pk'] == run.pk)['review_version'] = 4
        with self.assertRaises(SyncError): validate(forged, metadata(forged))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(for_run(AIRun.objects.get(pk=run.pk)), evidence)
        self.assertFalse(Job.objects.exists()); self.assertFalse(ExperimentJob.objects.exists())
        self.assertEqual(json.loads(self.client.get(self.path + request.pk + '/').json()['data']['jointSensitivityJson']), joint)

    def test_legacy_v4_review_keeps_its_original_input_and_evidence(self):
        from quant.models import AIRun
        from quant.worker import execute, prompt
        from quant.services import _run_input, canonical_hash
        from quant.experiments.review_evidence import for_run
        from quant.sync import validate, metadata
        from utils.sync_manager import SyncManager
        request, run = self.ready()
        values = _run_input(run.entry, {'kind': 'experiment_review', 'source_id': run.source_id,
            'experiment_result_id': request.result.pk, 'request_key': run.request_key})
        values['review_version'] = 4
        legacy_context = {key: val for key, val in values['planning_context'].items() if key not in ('research_memory','fixed_validation','selection_diagnostic','planning_capabilities','output_associations')}
        legacy_context['version'] = 1
        legacy_context['method'] = 'related-library-v1'
        values['planning_context'] = legacy_context
        AIRun.objects.filter(pk=run.pk).update(review_version=4, planning_context=legacy_context, input_hash=canonical_hash(values))
        run.refresh_from_db()
        before = for_run(run)
        self.assertIn('parameter_sensitivity', before['evidence'])
        self.assertNotIn('parameter_joint_sensitivity', before['evidence'])
        self.assertNotIn('parameter_joint_sensitivity', prompt(run))
        with patch('quant.worker.complete', return_value=json.dumps(review_fixtures.response())): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(for_run(AIRun.objects.get(pk=run.pk)), before)

    def test_joint_score_cannot_use_three_points_or_mix_two_different_grids(self):
        from rest_framework.exceptions import ValidationError
        from quant.experiments.review_evidence import for_run
        from quant.experiments.review_contract import validate_review
        _, run = self.ready()
        evidence = for_run(run)
        response = review_fixtures.response(evidence)
        score = response['scores'][0]
        for refs in (['parameter_joint_sensitivity', 'attempt-1', 'attempt-2', 'attempt-3'],
                     ['attempt-1', 'attempt-2', 'attempt-3', 'attempt-4']):
            score.update(score=3, evidence_refs=refs)
            with self.assertRaises(ValidationError): validate_review(response, evidence)
        score['evidence_refs'] = ['parameter_joint_sensitivity', 'attempt-1', 'attempt-2', 'attempt-3', 'attempt-4']
        self.assertEqual(validate_review(response, evidence)['scores'][0]['score'], 3)
        evidence['evidence']['parameter_joint_sensitivity']['families'][0]['contexts'][0]['points'][-1]['comparable'] = False
        with self.assertRaises(ValidationError): validate_review(response, evidence)
