"""Explicit horizons and causal segment boundaries, using synthetic data only."""
import copy
from unittest import TestCase as PureTestCase
from unittest.mock import patch
from rest_framework.exceptions import ValidationError
from django.test import TestCase
from quant.label_studies.targets import freeze, window
from quant.label_studies.calculation import evaluate
from quant.label_studies.statistics import ranks, pearson
from quant.research.contracts import digest
from quant import test_validation_studies as fixtures


class LabelCalculationTests(PureTestCase):
    def setUp(self):
        self.rows = [{'timestamp': f'2024-01-{index+1:02d}T00:00:00Z', 'close': 100 * 1.01 ** index} for index in range(25)]

    def test_forward_horizon_purges_before_missingness_and_never_reads_future(self):
        target = freeze({'version': 1, 'horizon_bars': 3})
        values = list(range(25)); values[5] = None
        first = evaluate(self.rows, values, target, 3, 15)
        self.assertEqual(first['window']['last_origin'], 12)
        self.assertEqual(first['window']['purged_origins'], 3)
        self.assertEqual((first['pairs'], first['missing_predictors'], first['window']['possible_pairs']), (9, 1, 10))
        changed = copy.deepcopy(self.rows)
        for row in changed[16:]: row['close'] = 1e40
        altered = values[:]; altered[13:] = [None] * 12
        self.assertEqual(first, evaluate(changed, altered, target, 3, 15))
        expected = [{'origin': i, 'label_end': i+3, 'predictor': values[i], 'label': self.rows[i+3]['close']/self.rows[i]['close']-1}
            for i in range(3, 13) if values[i] is not None]
        self.assertEqual(first['pairs_hash'], digest(expected))
        self.assertIsNone(first['p_value']); self.assertFalse(first['selection_used'])

    def test_known_ranks_undefined_constants_and_extreme_finite_inputs(self):
        self.assertEqual(ranks([4, 1, 1, 9]), [3, 1.5, 1.5, 4])
        self.assertAlmostEqual(pearson([1, 2, 3], [6, 4, 2]), -1)
        self.assertAlmostEqual(pearson([1e300, 2e300, 3e300], [3e300, 2e300, 1e300]), -1)
        self.assertIsNone(pearson([1, 1, 1], [1, 2, 3]))
        target = freeze({'version': 1, 'horizon_bars': 2})
        value = evaluate(self.rows, [1] * 25, target, 3, 15)
        self.assertEqual(value['reason'], 'constant_or_near_constant_input')
        value = evaluate(self.rows, [None] * 25, target, 3, 15)
        self.assertEqual(value['reason'], 'too_few_valid_pairs'); self.assertEqual(value['coverage'], 0)
        for bad in (float('nan'), float('inf'), '1', 10**400):
            with self.subTest(bad=str(bad)[:20]), self.assertRaises(ValidationError):
                evaluate(self.rows, [bad] * 25, target, 3, 15)

    def test_label_coefficients_match_independently_constructed_forward_returns(self):
        prices = [100.]
        for index in range(1, 9): prices.append(prices[-1] * (1 + index / 100))
        rows = [{'timestamp': self.rows[i]['timestamp'], 'close': price} for i, price in enumerate(prices)]
        target = freeze({'version': 1, 'horizon_bars': 1})
        values = [1., 2., 3., None, 5., 6., 7., 8., 9.]
        result = evaluate(rows, values, target, 0, 8)
        self.assertEqual((result['pairs'], result['missing_predictors']), (7, 1))
        self.assertAlmostEqual(result['pearson_ic'], 1., places=12)
        self.assertEqual(result['spearman_ic'], 1.)
        inverse = evaluate(rows, [-value if value is not None else None for value in values], target, 0, 8)
        self.assertAlmostEqual(inverse['pearson_ic'], -1., places=12)
        self.assertEqual(inverse['spearman_ic'], -1.)

    def test_contract_budget_and_unknown_fields_are_not_coerced_into_targets(self):
        for raw in ({'version': 1, 'horizon_bars': True}, {'version': 1, 'horizon_bars': 0},
                {'version': 1, 'horizon_bars': 2001}, {'version': 1, 'horizon_bars': 3, 'price': 'high'}):
            with self.assertRaises(ValidationError): freeze(raw)
        target = freeze({'version': 1, 'horizon_bars': 3})
        with self.assertRaises(ValidationError): window(target, 1, 6)
        self.assertEqual(window(target, 1, 8)['possible_pairs'], 5)
        with self.assertRaises(ValidationError): window({**target, 'formula': 'future(high)'}, 1, 10)


class LabelValidationTests(TestCase):
    setUp = fixtures.ValidationTests.setUp
    collect = fixtures.ValidationTests.collect
    publish = fixtures.ValidationTests.publish
    prepare = fixtures.ValidationTests.prepare
    start = fixtures.ValidationTests.start
    execute_source = fixtures.ValidationTests.execute_source
    dataset = fixtures.ValidationTests.dataset
    action = fixtures.ValidationTests.action

    def register_label(self, *, criteria=False):
        from quant.models import ValidationPlan
        self.source = self.execute_source(); self.url = f'/api/quant/{self.collection.pk}/validations/'
        body = {'request_key': 'forward_label_plan_0001', 'source_request_id': self.source.pk,
            'intervals': 10, 'seconds': 10, 'label_target': {'version': 1, 'horizon_bars': 3}}
        if criteria: body['criteria'] = {'min_total_return': 0}
        reply = self.client.post(self.url, body, format='json'); self.assertEqual(reply.status_code, 200, reply.data)
        self.plan = ValidationPlan.objects.get(pk=reply.data['data']['id'])
        self.assertEqual(self.client.post(self.url, body, format='json').data['data']['id'], self.plan.pk)
        return body

    def test_api_fixed_labels_criteria_ai_projection_and_fresh_device_restore(self):
        from quant.models import ValidationRequest, ValidationJob, ValidationResult, AIRun
        from quant.validation_studies.worker import execute
        from quant.validation_studies.reviews import automatic
        from quant.experiments.review_evidence import for_run
        from quant.experiments.review_contract import review_prompt
        from quant.sync import validate, metadata
        from utils.sync_manager import SyncManager, SyncError
        self.register_label(criteria=True); dataset = self.dataset()
        self.assertEqual(self.plan.data['version'], 3)
        reply = self.action('run', dataset); self.assertEqual(reply.status_code, 200, reply.data)
        request = ValidationRequest.objects.get(plan=self.plan)
        execute(request.job.pk); request.refresh_from_db()
        result = request.result; self.assertEqual(result.data['status'], 'completed', result.data)
        self.assertEqual(result.data['version'], 3)
        label = result.data['output']['label_evaluation']
        self.assertEqual(label['window']['possible_pairs'], 8)
        self.assertEqual(label['window']['purged_origins'], 3)
        self.assertEqual(result.data['output']['final']['bars'], 10)
        self.assertIn('criteria_assessment', result.data)
        automatic(result.pk, request.job.lease_token)
        run = AIRun.objects.get(validation_result=result)
        facts = for_run(run)
        self.assertEqual(facts['evidence']['fixed_validation']['label_evaluation'], label)
        self.assertIn('描述性相关', review_prompt(facts, ''))
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        # Reconstruct the new facts without an existing local result/plan whose
        # immutability checks could otherwise mask a replay-validation defect.
        AIRun.objects.filter(validation_result=result).delete()
        ValidationResult.objects.filter(pk=result.pk).delete()
        ValidationRequest.objects.filter(pk=request.pk).delete()
        self.plan.__class__.objects.filter(pk=self.plan.pk).delete()
        validate(snapshot, metadata(snapshot))
        bad = copy.deepcopy(snapshot); row = next(row for row in bad if row['model'] == 'quant.validationresult')
        row['fields']['data']['output']['label_evaluation']['window']['purged_origins'] = 0
        row['fields']['content_hash'] = digest(row['fields']['data'])
        with self.assertRaises(SyncError): validate(bad, metadata(bad))
        with patch('quant.validation_studies.worker.dispatch') as worker, patch('quant.worker.dispatch') as model:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        worker.assert_not_called(); model.assert_not_called()
        self.assertFalse(ValidationJob.objects.exists())
        self.assertEqual(ValidationResult.objects.get(pk=result.pk).content_hash, result.content_hash)

    def test_no_criteria_cancelled_target_and_invalid_horizon_keep_original_registration(self):
        from quant.models import ValidationPlan, ValidationRequest
        body = self.register_label()
        invalid = {**body, 'request_key': 'invalid_label_horizon_01', 'label_target': {'version': 1, 'horizon_bars': 8}}
        self.assertEqual(self.client.post(self.url, invalid, format='json').status_code, 400)
        self.assertEqual(ValidationPlan.objects.count(), 1)
        dataset = self.dataset(); self.assertEqual(self.action('run', dataset).status_code, 200)
        self.assertEqual(self.action('cancel').status_code, 200)
        result = ValidationRequest.objects.get().result
        self.assertEqual(result.data['version'], 3); self.assertIsNone(result.data['output'])
        self.assertNotIn('criteria_assessment', result.data)
