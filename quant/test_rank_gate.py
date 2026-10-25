"""Numerical causal oracles, generated artifacts and persisted new operators."""
import copy
import json
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant.experiments.expression import calculate
from quant.experiments.evolution import DEFAULT_POLICY, LEGACY_OPERATORS, transform_recipe, validate_policy, validate_transform
from quant.experiments.search import run_batch
from quant.experiments.snapshot import validate_attempts
from quant.experiments.backtest import simulate
from quant.experiments.derivation import build_candidate
from quant import test_experiment_search as fixtures
from quant import test_evolution as evolution
from quant import test_exports as exports


def node(op, *args): return {'op': op, 'args': list(args)}
def const(n): return {'op': 'constant', 'value': n}
CLOSE = {'op': 'input', 'name': 'close'}
OPEN = {'op': 'input', 'name': 'open'}


def parents():
    signal = fixtures.seed('signal', variants=False)
    mask = fixtures.seed('filter', variants=False)
    mask['candidate']['expression'] = node('gt', mask['candidate']['expression'], const(0))
    mask['candidate']['output_type'] = 'boolean_series'
    mask['candidate']['units'] = 'boolean'
    return [signal, mask]


class RankGateTests(SimpleTestCase):
    def test_rank_ties_complete_windows_one_bar_and_causality(self):
        values = [3., 1., 1., 2., None, 4., 4., 4.]
        expression = node('ts_rank', CLOSE, const(3))
        actual = calculate(expression, {'close': values}, {})
        expected = [None, None, 1/3, 5/6, None, None, None, .5]
        for a, b in zip(actual, expected):
            if b is None: self.assertIsNone(a)
            else: self.assertAlmostEqual(a, b)
        self.assertEqual(calculate(node('ts_rank', CLOSE, const(1)), {'close': values}, {}), [.5, .5, .5, .5, None, .5, .5, .5])
        self.assertEqual(actual[:4], calculate(expression, {'close': values[:4] + [999., -3., 0., -8.]}, {})[:4])
        with self.assertRaises(ValidationError): calculate(node('ts_rank', node('gt', CLOSE, const(1)), const(3)), {'close': values}, {})
        with self.assertRaises(ValidationError): calculate(node('ts_rank', CLOSE, const(2001)), {'close': values}, {})

    def test_gate_preserves_kind_missing_and_flat_behavior_even_with_negative_threshold(self):
        values = {'close': [4., -2., 8., None, 5., 1.], 'open': [3., 1., None, 4., 4., 0.]}
        gate = node('gate', CLOSE, node('gt', OPEN, const(2)))
        self.assertEqual(calculate(gate, values, {}), [4., None, None, None, 5., None])
        boolean = node('gate', node('gt', CLOSE, const(0)), node('gt', OPEN, const(2)))
        self.assertEqual(calculate(boolean, values, {}, expected='boolean_series'), [True, None, None, None, True, None])
        with self.assertRaises(ValidationError): calculate(node('gate', CLOSE, OPEN), values, {})
        rows = fixtures.data()['rows']
        signals = calculate(node('gate', CLOSE, node('lt', CLOSE, const(0))), {'close': [1.] * len(rows)}, {})
        result = simulate(rows, signals, start=1, end=30, threshold=-10, fee_bps=5, slippage_bps=5)
        self.assertEqual(result['entries'], 0)
        self.assertEqual(result['total_return'], 0)
        self.assertEqual(result['missing_signals'], 29)

    def test_policy_versions_units_parent_roles_and_frozen_legacy_schedule(self):
        legacy = DEFAULT_POLICY | {'version': 1, 'operators': list(LEGACY_OPERATORS)}
        validate_policy(legacy)
        with self.assertRaises(ValidationError): validate_policy(legacy | {'operators': ['gate']})
        with self.assertRaises(ValidationError): validate_transform({'version': 1, 'operator': 'gate', 'window': None, 'weight': None}, DEFAULT_POLICY)
        value = transform_recipe([evolution.simple()], evolution.transform('ts_rank', 3), DEFAULT_POLICY)
        self.assertEqual(value['units'], 'dimensionless')
        self.assertEqual(value['expression']['op'], 'ts_rank')
        gate = transform_recipe([evolution.simple(), evolution.simple('open', boolean=True)], evolution.transform('gate'), DEFAULT_POLICY)
        self.assertEqual(gate['units'], 'price')
        self.assertEqual(gate['expression']['op'], 'gate')
        with self.assertRaises(ValidationError): transform_recipe([evolution.simple(), evolution.simple()], evolution.transform('gate'), DEFAULT_POLICY)
        config = fixtures.SearchTests.config | {'evolution': legacy}
        first = run_batch(fixtures.data(), [fixtures.seed(variants=False)], config)
        self.assertEqual(first, run_batch(fixtures.data(), [fixtures.seed(variants=False)], config))
        self.assertTrue(all(row['transformation']['version'] == 1 for row in first['attempts'] if row.get('transformation')))
        self.assertFalse(any(row.get('transformation', {}).get('operator') in ('gate', 'ts_rank') for row in first['attempts']))

    def test_search_records_both_operators_rejections_holdout_blindness_and_replay(self):
        seeds = parents()
        config = fixtures.SearchTests.config | {'max_candidates': 32, 'evolution': DEFAULT_POLICY | {'operators': ['ts_rank', 'gate'], 'windows': [3]}}
        data = fixtures.data()
        output = run_batch(data, seeds, config)
        mutations = [row for row in output['attempts'] if row['operation'] == 'formula_mutation']
        for op in ('ts_rank', 'gate'):
            self.assertTrue(any(row['transformation']['operator'] == op and row['status'] == 'evaluated' for row in mutations), op)
        self.assertTrue(any(row['status'] == 'rejected' for row in mutations))
        future = copy.deepcopy(data)
        start = output['partitions']['holdout'][0]
        for bar in future['rows'][start:]:
            for key in ('open', 'high', 'low', 'close'): bar[key] *= 2
        changed = run_batch(future, seeds, config)
        self.assertEqual(output['attempts'], changed['attempts'])
        self.assertEqual(output['selected_id'], changed['selected_id'])
        plan = {'seeds': seeds, 'config': config, 'engine_version': output['engine_version'], 'name': 'Rank gate', 'dataset_hash': 'fixture'}
        validate_attempts(output['attempts'], plan, evolution.fail)
        forged = copy.deepcopy(output['attempts'])
        next(row for row in forged if row.get('transformation'))['transformation']['version'] = 1
        with self.assertRaises((ValueError, ValidationError)): validate_attempts(forged, plan, evolution.fail)
        item = next(row for row in mutations if row['status'] == 'evaluated' and row['transformation']['operator'] == 'gate')
        child = build_candidate('request', 'checkpoint', plan, data, output['attempts'], item)
        self.assertEqual(child['expression']['op'], 'gate')
        self.assertEqual(set(child['derivation']['parent_candidate_ids']), {'signal', 'filter'})
        self.assertEqual(len(child['parameters']), 2)


class RankGateExportTests(TestCase):
    setUp = exports.ExportTests.setUp
    collect = exports.ExportTests.collect
    publish = exports.ExportTests.publish

    def test_generated_python_and_all_platform_artifacts_preserve_defined_semantics(self):
        from quant.exports.service import bundle
        candidate = self.publish('rank_gate_export_01')
        values = [3., 1., 1., 2., None, 4., 4., 4.] * 4
        expressions = [node('ts_rank', CLOSE, {'op': 'parameter', 'name': 'N'}),
            node('ts_rank', CLOSE, const(3)), node('gate', CLOSE, node('gt', CLOSE, const(2))),
            node('gate', node('gt', CLOSE, const(0)), node('gt', CLOSE, const(2)))]
        for expression in expressions:
            candidate.data['parameters'][0]['default_value'] = '3'
            candidate.data['expression'] = expression
            boolean = expression['op'] == 'gate' and expression['args'][0]['op'] == 'gt'
            candidate.data['output_type'] = 'boolean_series' if boolean else 'numeric_series'
            for target in ('python', 'pine', 'mql4', 'tongdaxin'):
                generated = bundle(candidate, target)
                manifest = json.loads(generated['manifest_json'])
                self.assertIn('operator_semantics', manifest)
                self.assertEqual(manifest['verification'], 'platform_compile_and_equivalence_pending')
                if target == 'python':
                    namespace = {}; exec(compile(generated['code'], '<generated-rank-gate>', 'exec'), namespace)
                    spec = manifest['recipe']
                    for n in (1, 3, 5):
                        actual = namespace['calculate']([{'close': value} for value in values], {'p0': n})
                        expected = calculate(spec['expression'], {key: values for key in spec['bindings']}, {'p0': n}, expected=spec['output_type'])
                        for a, b in zip(actual, expected):
                            if b is None: self.assertIsNone(a)
                            else: self.assertAlmostEqual(a, b)
                if expression['op'] == 'ts_rank':
                    if target == 'pine': self.assertIn('qRank(', generated['code'])
                    if target == 'mql4': self.assertIn('QRank(', generated['code'])
                    if target == 'tongdaxin':
                        self.assertIn('0.5', generated['code']); self.assertNotIn('CONST(', generated['code'])
                        if expression['args'][1]['op'] == 'parameter': self.assertIn(',1999)', generated['code'])
                elif target == 'tongdaxin': self.assertRegex(generated['code'], r'AND v\d+=1')

    def test_tdx_generated_midrank_arithmetic_matches_ties_and_parameter_changes(self):
        # Exercise only generated arithmetic under a tiny, explicit test scope;
        # does not claim native TDX compilation/execution or missing-bar semantics.
        from quant.exports.ranking import tdx_rank
        prices = [3., 1., 1., 2., 4., 4.]
        for n in (1, 3, 5):
            lines = []
            expression = tdx_rank(lines, 0, 'X', 'N', {'op': 'parameter', 'name': 'N'})
            for index in range(n - 1, len(prices)):
                scope = {'X': prices[index], 'N': n, 'IF': lambda condition, yes, no: yes if condition else no,
                    'REF': lambda ignored, offset: prices[max(0, index - offset)]}
                for line in lines:
                    name, code = line[:-1].split(':=')
                    scope[name] = eval(code.replace('=', '=='), {'__builtins__': {}}, scope)
                result = eval(expression, {'__builtins__': {}}, scope)
                window = sorted(prices[index - n + 1:index + 1])
                positions = [pos + .5 for pos, value in enumerate(window) if value == prices[index]]
                self.assertAlmostEqual(result, sum(positions) / len(positions) / n)


class RankGateWorkerTests(TestCase):
    setUp = evolution.EvolutionIntegrationTests.setUp
    collect = evolution.EvolutionIntegrationTests.collect
    publish = evolution.EvolutionIntegrationTests.publish
    prepare = evolution.EvolutionIntegrationTests.prepare
    start = evolution.EvolutionIntegrationTests.start
    operators = ['ts_rank', 'gate']

    def test_new_policy_api_worker_exports_and_sync_preserve_execution_boundary(self):
        evolution.EvolutionIntegrationTests.test_api_worker_export_sync_and_replay_never_restore_execution(self)

    def test_two_source_gate_worker_lineage_export_and_restore(self):
        from unittest.mock import patch
        from quant.test_factors import extracted
        from quant.experiments.worker import execute
        from quant.models import ExperimentJob, ExperimentRequest
        from quant.sync import metadata, validate
        from utils.sync_manager import SyncManager
        from quant.exports.service import bundle
        signal, dataset = self.prepare()
        response = extracted()
        factor = response['factors'][0]
        factor.update(expression=node('gt', factor['expression'], const(0)),
                      output_type='boolean_series', units='boolean', role='filter')
        with patch('quant.test_factor_curation.extracted', return_value=response):
            mask = self.publish('gate_filter_source_001', window='3')
        self.input['seeds'][0]['variants'] = []
        self.input['seeds'].append({'candidate_id': mask.pk,
            'bindings': [{'name': 'close', 'column': 'close'}],
            'parameters': [{'name': 'N', 'value': 3}], 'variants': []})
        self.input['config'] = copy.deepcopy(fixtures.SearchTests.config) | {
            'max_candidates': 32, 'evolution': DEFAULT_POLICY | {'operators': ['gate']}}
        request = self.start()
        execute(request.job.pk)
        self.assertEqual(request.result.data['status'], 'completed')
        attempts = request.result.data['output']['attempts']
        gates = [row for row in attempts if row.get('transformation', {}).get('operator') == 'gate' and row['status'] == 'evaluated']
        self.assertTrue(gates)
        child = build_candidate(request.pk, 'test-checkpoint', request.plan, dataset.snapshot, attempts, gates[0])
        self.assertEqual(set(child['derivation']['parent_candidate_ids']), {signal.pk, mask.pk})
        self.assertEqual({row['name'] for row in child['parameters']}, {'a_p0', 'b_p0'})
        signal.data = child  # In-memory export; immutable source is never saved over.
        generated = bundle(signal, 'python')
        namespace = {}
        exec(compile(generated['code'], '<generated-two-parent-gate>', 'exec'), namespace)
        actual = namespace['calculate'](dataset.snapshot['rows'])
        recipe = gates[0]['recipe']
        expected = calculate(recipe['expression'], {name: [bar[column] for bar in dataset.snapshot['rows']]
            for name, column in recipe['bindings'].items()}, recipe['parameters'], expected=recipe['output_type'])
        self.assertEqual(actual, expected)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(ExperimentJob.objects.exists())
        self.assertEqual(ExperimentRequest.objects.get(pk=request.pk).result.data['output']['attempts'], attempts)


class RankGatePlanningTests(TestCase):
    setUp = evolution.EvolutionPlanningTests.setUp
    collect = evolution.EvolutionPlanningTests.collect
    ready = evolution.EvolutionPlanningTests.ready
    dataset = evolution.EvolutionPlanningTests.dataset

    operators = ['ts_rank', 'gate']

    def test_new_operator_initial_plan_campaign_and_next_plan_survive_sync(self):
        evolution.EvolutionPlanningTests.test_source_ai_plan_campaign_review_and_next_round_preserve_evolution(self)
