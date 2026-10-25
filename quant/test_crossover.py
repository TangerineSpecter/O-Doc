"""Typed subtree replacement, numerical behavior and provenance restoration."""
import copy
import json
import random
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant import test_experiment_search as fixtures
from quant import test_evolution as evolution_fixtures
from quant.experiments.evolution import DEFAULT_POLICY, proposals, transform_recipe, validate_policy, validate_transform
from quant.experiments.crossover import signatures, selected
from quant.experiments.search import recipe, run_batch
from quant.experiments.expression import calculate
from quant.experiments.snapshot import validate_attempts
from quant.experiments.derivation import build_candidate
from quant.research.contracts import digest

POLICY = DEFAULT_POLICY | {'version': 3, 'operators': ['crossover']}


def transform(recipient=None, donor=None):
    return {'version': 3, 'operator': 'crossover', 'window': None, 'weight': None,
            'recipient_path': [0, 1] if recipient is None else recipient,
            'donor_path': [0, 1] if donor is None else donor}


def seeds():
    a, b = fixtures.seed('a', 2, False), fixtures.seed('b', 3, False)
    b['bindings']['close'] = 'open'
    return [a, b]


class CrossoverTests(SimpleTestCase):
    def test_graft_uses_donor_inputs_and_parameters_with_causal_missing_values(self):
        parents = [recipe(seed['candidate'], seed['bindings'], seed['parameters']) for seed in seeds()]
        original = copy.deepcopy(parents)
        value = transform_recipe(parents, transform(), POLICY)
        self.assertEqual(parents, original)
        self.assertEqual(value['parameters'], {'a_p0': 2, 'b_p0': 3})
        self.assertEqual(value['expression']['args'][0]['args'][1]['args'][1]['name'], 'b_p0')
        close, opened = [10., 11., 12., 13., 14., 15., 16.], [5., 6., None, 8., 9., 10., 11.]
        actual = calculate(value['expression'], {'a_i0': close, 'b_i0': opened}, value['parameters'])
        expected = [None, None, None, 13/5-1, 14/6-1, None, 16/8-1]
        self.assertEqual(actual, expected)
        altered = calculate(value['expression'], {'a_i0': close[:5] + [100., 200.], 'b_i0': opened[:5] + [300., 400.]}, value['parameters'])
        self.assertEqual(actual[:5], altered[:5])

    def test_units_types_windows_unknowns_and_complexity_are_checked(self):
        a, b = [recipe(seed['candidate'], seed['bindings'], seed['parameters']) for seed in seeds()]
        volume = copy.deepcopy(b); volume['bindings']['i0'] = 'volume'
        boolean = evolution_fixtures.simple(boolean=True)
        unknown = copy.deepcopy(b)
        unknown['expression'] = {'op': 'mul', 'args': [{'op': 'input', 'name': 'i0'}, {'op': 'parameter', 'name': 'p0'}]}
        for donor, change in ((volume, transform()), (boolean, transform(donor=[])),
                (unknown, transform(donor=[])), (b, transform(donor=[0, 1, 1])),
                (b, transform(recipient=[0, 0])), (b, transform(recipient=[1]))):
            with self.subTest(change=change), self.assertRaises(ValidationError): transform_recipe([a, donor], change, POLICY)
        with self.assertRaisesRegex(ValidationError, '复杂度'):
            transform_recipe([a, b], transform(recipient=[0], donor=[]), POLICY | {'max_nodes': 8})
        self.assertNotIn((0, 1, 1), signatures(a))
        for path in ([], [True], [-1], [2], [0] * 13, '0'):
            with self.subTest(path=path), self.assertRaises(ValidationError): validate_transform(transform(recipient=path), POLICY)
        for version in (1, 2):
            with self.assertRaises(ValidationError): validate_policy(POLICY | {'version': version})
        with self.assertRaises(ValidationError): validate_transform(transform() | {'window': 3}, POLICY)

    def test_search_reproducible_holdout_blind_and_lineage_tamper_rejected(self):
        config = fixtures.SearchTests.config | {'evolution': POLICY, 'max_candidates': 20}
        result = run_batch(fixtures.data(), seeds(), config)
        self.assertEqual(result, run_batch(fixtures.data(), seeds(), config))
        crossovers = [row for row in result['attempts'] if row['operation'] == 'formula_mutation']
        self.assertTrue(any(row['status'] == 'evaluated' for row in crossovers))
        self.assertTrue(all(row['transformation']['operator'] == 'crossover' for row in crossovers))
        self.assertLessEqual(len(result['attempts']), 20)
        self.assertEqual({row['generation'] for row in crossovers}, {1, 2})
        plan = {'seeds': seeds(), 'config': config, 'engine_version': result['engine_version']}
        validate_attempts(result['attempts'], plan, evolution_fixtures.fail)
        changed = fixtures.data()
        for row in changed['rows'][result['partitions']['holdout'][0]:]:
            for key in ('open', 'high', 'low', 'close'): row[key] *= .5
        self.assertEqual(run_batch(changed, seeds(), config)['attempts'], result['attempts'])
        altered = copy.deepcopy(result['attempts'])
        for row in altered: row['metrics'].pop('validation', None)
        self.assertEqual(list(proposals(altered, POLICY, random.Random(42), 3)), list(proposals(result['attempts'], POLICY, random.Random(42), 3)))
        attempt = next(row for row in result['attempts'] if row['operation'] == 'formula_mutation' and row['status'] == 'evaluated')
        altered = copy.deepcopy(result['attempts'])
        altered[int(attempt['id'].split('-')[1]) - 1]['transformation']['donor_path'] = [1]
        with self.assertRaises((ValidationError, ValueError)):
            validate_attempts(altered, plan, evolution_fixtures.fail)
        source = [recipe(seed['candidate'], seed['bindings'], seed['parameters']) for seed in seeds()]
        self.assertLessEqual(len(selected(*source, random.Random(1))), 16)

    def test_derived_formula_keeps_both_contracts_and_exports_same_values(self):
        from types import SimpleNamespace
        from quant.exports.service import bundle
        from quant.test_parameter_domains import domain
        parents = seeds()
        for seed in parents:
            seed['candidate']['parameters'][0]['domain'] = domain(minimum=1, maximum=30, step=1, step_origin=1)
        config = fixtures.SearchTests.config | {'evolution': POLICY, 'max_candidates': 12}
        snapshot = fixtures.data()
        result = run_batch(snapshot, parents, config)
        attempt = next(row for row in result['attempts'] if row['operation'] == 'formula_mutation' and row['status'] == 'evaluated')
        candidate = build_candidate('request', 'checkpoint', {'seeds': parents, 'name': 'cross', 'engine_version': result['engine_version'], 'dataset_hash': 'data'}, snapshot, result['attempts'], attempt)
        self.assertEqual(candidate['derivation']['transformation'], attempt['transformation'])
        self.assertEqual(len(candidate['parameters']), 2)
        self.assertTrue(all(row['domain']['maximum'] == 30 for row in candidate['parameters']))
        exported = bundle(SimpleNamespace(pk='cross', data=candidate, report_id='r', report=SimpleNamespace(source_id='s')), 'python')
        namespace = {}; exec(compile(exported['code'], '<generated-crossover>', 'exec'), namespace)
        spec = attempt['recipe']
        expected = calculate(spec['expression'], {name: [row[column] for row in snapshot['rows']] for name, column in spec['bindings'].items()}, spec['parameters'])
        self.assertEqual(namespace['calculate'](snapshot['rows']), expected)

    def test_each_walk_forward_fold_restarts_crossover_and_cannot_see_its_test(self):
        from quant.experiments.temporal import DEFAULT_POLICY as TEMPORAL
        config = fixtures.SearchTests.config | {'evolution': POLICY, 'max_candidates': 30,
            'walk_forward': TEMPORAL}
        source = fixtures.data()
        result = run_batch(source, seeds(), config)
        self.assertEqual(result, run_batch(source, seeds(), config))
        self.assertEqual(result['walk_forward']['summary']['tested_folds'], 3)
        plan = {'seeds': seeds(), 'config': config, 'engine_version': result['engine_version']}
        validate_attempts(result['attempts'], plan, evolution_fixtures.fail)
        by_id = {row['id']: row for row in result['attempts']}
        for fold in result['walk_forward']['folds']:
            attempts = [row for row in result['attempts'] if row['fold'] == fold['number']]
            self.assertEqual([row['parents'] for row in attempts if row['operation'] == 'source_candidate'], [['a'], ['b']])
            crossed = [row for row in attempts if row['operation'] == 'formula_mutation']
            self.assertTrue(any(row['status'] == 'evaluated' for row in crossed))
            for row in crossed:
                self.assertEqual(row['transformation']['operator'], 'crossover')
                self.assertTrue(all(by_id[parent]['fold'] == fold['number'] for parent in row['parents']))
            changed = copy.deepcopy(source)
            # Keep the opening boundary price used to close the validation/test
            # intervals; perturb only prices strictly beyond that boundary.
            for index, bar in enumerate(changed['rows'][fold['partitions']['holdout'][0] + 1:], 1):
                for column in ('open', 'high', 'low', 'close'):
                    bar[column] *= .97 ** index
            rerun = run_batch(changed, seeds(), config)
            self.assertEqual(attempts, [row for row in rerun['attempts'] if row['fold'] == fold['number']])
            repeated_fold = rerun['walk_forward']['folds'][fold['number'] - 1]
            self.assertEqual(fold['selected_id'], repeated_fold['selected_id'])
            self.assertNotEqual(fold['buy_hold_baseline'], repeated_fold['buy_hold_baseline'])


class CrossoverIntegrationTests(TestCase):
    setUp = evolution_fixtures.EvolutionIntegrationTests.setUp
    collect = evolution_fixtures.EvolutionIntegrationTests.collect
    publish = evolution_fixtures.EvolutionIntegrationTests.publish
    prepare = evolution_fixtures.EvolutionIntegrationTests.prepare
    start = evolution_fixtures.EvolutionIntegrationTests.start

    def test_actual_request_worker_checkpoint_sync_and_no_reauthorization(self):
        from quant.experiments.worker import execute
        from quant.models import ExperimentJob
        from quant.sync import validate, metadata
        from utils.sync_manager import SyncManager, SyncError
        _, dataset = self.prepare()
        second = self.publish('crossover_second_source')
        self.input['seeds'][0]['variants'] = []
        self.input['seeds'].append({'candidate_id': second.pk, 'bindings': [{'name': 'close', 'column': 'open'}],
            'parameters': [{'name': 'N', 'value': 3}], 'variants': []})
        self.input['config'] = fixtures.SearchTests.config | {'evolution': POLICY, 'max_candidates': 20}
        request = self.start()
        self.assertEqual(self.start().pk, request.pk)
        execute(request.job.pk)
        result = request.result.data
        self.assertEqual(result['status'], 'completed')
        attempt = next(row for row in result['output']['attempts'] if row['operation'] == 'formula_mutation' and row['status'] == 'evaluated')
        detail = self.client.get(self.path + request.pk + '/').json()['data']
        returned = next(row for row in json.loads(detail['attemptsJson']) if row['id'] == attempt['id'])
        self.assertEqual(returned['transformation'], attempt['transformation'])
        snapshot = SyncManager().build_snapshot_data()
        self.assertEqual(metadata(snapshot)['quant_schema_version'], 51)
        validate(snapshot, metadata(snapshot))
        forged = copy.deepcopy(snapshot)
        row = next(row['fields'] for row in forged if row['model'] == 'quant.experimentcheckpoint' and row['fields']['attempt']['id'] == attempt['id'])
        row['attempt']['transformation']['donor_path'] = [1]
        row['content_hash'] = digest(row['attempt'])
        with self.assertRaises(SyncError): validate(forged, metadata(forged))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(ExperimentJob.objects.exists())
        self.start()
        self.assertFalse(ExperimentJob.objects.exists())
        self.assertEqual(request.dataset_id, dataset.pk)
