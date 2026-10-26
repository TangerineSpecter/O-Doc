"""Every planned inner window must support a common discrete parameter region."""
import copy
from django.test import SimpleTestCase
from quant.test_sensitivity import sample as axis_sample
from quant.test_joint_sensitivity import sample as joint_sample
from quant.experiments.temporal_sensitivity import analyze, intersections, supports_score


def nested_sample(*, joint=False):
    plan, original = joint_sample(levels=(10, 12)) if joint else axis_sample()
    plan['config'] = {'walk_forward': {'version': 2, 'folds': 2, 'inner_folds': 3}}
    attempts = []
    for outer in (1, 2):
        offset = len(attempts)
        for index, source in enumerate(original):
            row = copy.deepcopy(source)
            row.update(id=f'attempt-{offset+index+1}', fold=outer,
                parents=row['parents'] if index == 0 else [f'attempt-{offset+1}'])
            folds = []
            for inner in (1, 2, 3):
                metrics = copy.deepcopy(source['metrics'])
                for metric in metrics.values():
                    metric.update(start=f'{outer}:{inner}:start', end=f'{outer}:{inner}:end')
                folds.append({'number': inner, 'metrics': metrics})
            row['inner_evaluation'] = {'folds': folds, 'planned_folds': 3, 'summary': {}}
            row['metrics'] = copy.deepcopy(folds[-1]['metrics'])
            attempts.append(row)
    return plan, attempts


class TemporalSensitivityTests(SimpleTestCase):
    def test_archived_market_projection_preserves_negative_result_without_new_model(self):
        from pathlib import Path
        from unittest.mock import patch
        from quant.acceptance.temporal_parameter_replay import replay
        with patch('utils.bounded_completion.complete',side_effect=AssertionError('no provider')),patch('quant.native_python.runtime.run',side_effect=AssertionError('no source')):
            value=replay(Path(__file__).resolve().parent.parent/'docs/quant/验收记录')
        self.assertEqual((value['planned_windows'],value['parameter_status']),(9,'no_supported_region'))
        self.assertEqual((value['new_provider_calls'],value['source_executions'],value['projection_model_calls']),(0,0,0))

    def test_all_six_windows_and_same_parameter_identity_support_common_axis(self):
        plan, attempts = nested_sample()
        original = copy.deepcopy((plan, attempts))
        value = analyze(plan, attempts);axis = value['families'][0]['axes'][0]
        self.assertEqual(value['planned_windows'], 6)
        self.assertEqual(len(axis['windows']), 6)
        self.assertEqual(axis['regions'], [{'N': [8, 9, 10, 11, 12]}])
        self.assertEqual(axis['status'], 'sampled_region')
        self.assertTrue(supports_score(value, {f'attempt-{i}' for i in range(1, 6)}, stable=True))
        self.assertTrue(supports_score(value, {'attempt-1','attempt-2','attempt-3'}, stable=True))
        self.assertFalse(supports_score(value, {'attempt-1', 'attempt-2'}, stable=True))
        self.assertEqual(analyze(plan, list(reversed(attempts))), value)
        self.assertEqual((plan, attempts), original)

    def test_first_window_loss_cannot_be_hidden_by_last_window_or_mean(self):
        plan, attempts = nested_sample()
        for row in attempts[:5]:
            row['inner_evaluation']['folds'][0]['metrics']['validation']['total_return'] = -.1
        value = analyze(plan, attempts);axis = value['families'][0]['axes'][0]
        self.assertEqual(axis['regions'], [])
        self.assertEqual(axis['comparison_regions'], [{'N': [8, 9, 10, 11, 12]}])
        self.assertEqual(axis['status'], 'no_supported_region')
        self.assertFalse(axis['windows'][0]['points'][0]['eligible'])
        cited={f'attempt-{i}' for i in range(6,11)}
        self.assertTrue(supports_score(value,cited,stable=False))
        self.assertFalse(supports_score(value,cited,stable=True))

    def test_missing_planned_window_or_outer_fold_remains_unknown(self):
        for mode in ('outer', 'inner', 'rejected', 'no_train'):
            with self.subTest(mode=mode):
                plan, attempts = nested_sample()
                if mode == 'outer': attempts=attempts[:5]
                else:
                    for row in attempts[:5]:
                        if mode == 'inner': row['inner_evaluation']['folds'].pop(0)
                        elif mode == 'rejected': row['status']='failed'
                        else: row['inner_evaluation']['folds'][0]['metrics'].pop('train')
                value=analyze(plan,attempts);axis=value['families'][0]['axes'][0]
                self.assertEqual(len(axis['windows']),6)
                self.assertEqual(axis['comparison_regions'],[])
                self.assertEqual(axis['regions'],[])
                self.assertEqual(axis['status'],'insufficient_comparison')

    def test_failed_central_point_cannot_bridge_a_hole(self):
        plan, attempts=nested_sample()
        # N=11 missing in just the first of six windows: only [8,9,10] survives.
        attempts[3]['inner_evaluation']['folds'][0]['metrics']['validation']['missing_signals']=5
        axis=analyze(plan,attempts)['families'][0]['axes'][0]
        self.assertEqual(axis['regions'],[{'N':[8,9,10]}])

    def test_joint_common_grid_requires_every_corner_in_every_window(self):
        plan,attempts=nested_sample(joint=True)
        value=analyze(plan,attempts);group=value['families'][0]['contexts'][0]
        self.assertEqual(group['regions'],[{'N0':[10,12],'N1':[10,12]}])
        self.assertTrue(supports_score(value,{'attempt-1','attempt-2','attempt-3','attempt-4'},stable=True))
        attempts[3]['inner_evaluation']['folds'][0]['metrics']['validation']['total_return']=-.2
        group=analyze(plan,attempts)['families'][0]['contexts'][0]
        self.assertEqual(group['regions'],[])
        self.assertEqual(len(group['comparison_regions']),1)
        attempts.pop(3)
        group=analyze(plan,attempts)['families'][0]['contexts'][0]
        self.assertEqual(group['comparison_regions'],[])
        self.assertEqual(group['status'],'insufficient_comparison')

    def test_holdout_selection_curve_top_level_metrics_are_never_read(self):
        plan,attempts=nested_sample()
        value=analyze(plan,attempts)
        plan.update(selected_id='wrong',holdout={'total_return':123})
        for row in attempts:row.update(metrics={'validation':{'total_return':999}},curve=[999],holdout={'total_return':999})
        self.assertEqual(analyze(plan,attempts),value)
        plan['config']['walk_forward']['version']=1
        self.assertIsNone(analyze(plan,attempts))

    def test_rectangle_intersection_keeps_all_maximal_overlap_and_no_interpolation(self):
        groups=[[{'N':[1,3,5,7]},{'N':[3,5,7,9]}],[{'N':[1,3,5]},{'N':[5,7,9]}]]
        self.assertEqual(intersections(groups,minimum=3,dimensions=1),[{'N':[1,3,5]},{'N':[5,7,9]}])
        self.assertEqual(intersections([groups[0],[]],minimum=3,dimensions=1),[])


class TemporalReviewTests(SimpleTestCase):
    def evidence(self, *, loss=False, missing=False, joint=False):
        from quant.experiments.sensitivity import analyze as single
        from quant.experiments.joint_sensitivity import analyze as multiple
        plan,attempts=nested_sample(joint=joint)
        if loss:
            for row in attempts:row['inner_evaluation']['folds'][0]['metrics']['validation']['total_return']=-.1
        if missing:attempts=attempts[:len(attempts)//2]
        return {'version':2,'planning_options':[],'evidence':{'execution':{},
            'parameter_sensitivity':single(plan,attempts),'parameter_joint_sensitivity':multiple(plan,attempts),
            'temporal_parameter_stability':analyze(plan,attempts),**{row['id']:row for row in attempts}}}

    def response(self,evidence,score=None):
        from quant.test_experiment_reviews import response
        value=response(evidence)
        value['scores'][0].update(score=score,evidence_refs=['temporal_parameter_stability','attempt-1','attempt-2','attempt-3'])
        return value

    def test_required_status_window_count_and_bound_refs_cannot_be_invented(self):
        from quant.experiments.review_contract import validate_review,review_markdown
        from rest_framework.exceptions import ValidationError
        evidence=self.evidence();value=self.response(evidence,3)
        validated=validate_review(value,evidence)
        self.assertEqual(validate_review(validate_review(value),evidence),validated)
        self.assertEqual(validated['rubric_version'],'experiment-research-v2')
        self.assertIn('跨窗口参数复核',review_markdown(validated))
        self.assertEqual(validate_review(validated,evidence),validated)
        for mode in ('missing','count','status','ref','version'):
            bad=copy.deepcopy(value)
            if mode=='missing':bad.pop('temporal_parameter_review')
            elif mode=='count':bad['temporal_parameter_review']['planned_windows']=4
            elif mode=='status':bad['temporal_parameter_review']['status']='insufficient_comparison'
            elif mode=='ref':bad['temporal_parameter_review']['evidence_refs']=['execution']
            else:bad['temporal_parameter_review_version']=True
            with self.assertRaises(ValidationError):validate_review(bad,evidence)

    def test_negative_window_caps_score_and_missing_window_forces_unknown(self):
        from quant.experiments.review_contract import validate_review
        from rest_framework.exceptions import ValidationError
        losing=self.evidence(loss=True)
        validate_review(self.response(losing,2),losing)
        with self.assertRaises(ValidationError):validate_review(self.response(losing,3),losing)
        missing=self.evidence(missing=True)
        validate_review(self.response(missing,None),missing)
        for score in (0,2,5):
            with self.assertRaises(ValidationError):validate_review(self.response(missing,score),missing)

    def test_joint_complete_grid_and_legacy_contract_do_not_borrow_new_facts(self):
        from quant.experiments.review_contract import validate_review
        from rest_framework.exceptions import ValidationError
        evidence=self.evidence(joint=True);value=self.response(evidence,3)
        value['scores'][0]['evidence_refs'].append('attempt-4')
        validate_review(value,evidence)
        old=copy.deepcopy(evidence);old['evidence'].pop('temporal_parameter_stability')
        with self.assertRaises(ValidationError):validate_review(value,old)
        value.pop('temporal_parameter_review');value['scores'][0].update(score=None,evidence_refs=['execution'])
        self.assertEqual(validate_review(value,old)['rubric_version'],'experiment-research-v1')
        # Prompt can be checked with production execution metadata in integration;
        # the legacy evidence is deliberately missing this new mandatory section.
        self.assertNotIn('temporal_parameter_review',value)
