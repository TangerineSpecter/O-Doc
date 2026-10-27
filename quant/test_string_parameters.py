"""Text is a declared categorical choice, never executable source or a number."""
import copy
import json
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant.parameters import domains
from quant.test_parameter_domains import domain
from quant.test_parameter_conditions import compare
from quant import test_experiment_search as fixtures
from quant.experiments.search import recipe, run_batch, combine
from quant.experiments.expression import calculate
from quant.experiments.derivation import build_candidate
from quant.experiments.sensitivity import analyze
from quant.exports.service import bundle


def seed():
    value = fixtures.seed(variants=False)
    parameter = dict(copy.deepcopy(value['candidate']['parameters'][0]), name='mode', type='string',
        default_value='"trend"', domain=domain(version=3, minimum=None, maximum=None, step=None,
            step_origin=None, choices=['trend', 'reverse'], conditions=[]))
    value['candidate']['parameters'].append(parameter)
    value['parameters']['mode'] = 'trend'
    original = value['candidate']['expression']
    value['candidate']['expression'] = {'op': 'or', 'args': [
        {'op': 'and', 'args': [{'op': 'eq', 'args': [{'op': 'parameter', 'name': 'mode'}, {'op': 'constant', 'value': mode}]},
            {'op': operation, 'args': [copy.deepcopy(original), {'op': 'constant', 'value': 0}]}]}
        for mode, operation in [('trend', 'gt'), ('reverse', 'lt')]]}
    value['candidate']['output_type'] = 'boolean_series'
    value['candidate']['units'] = 'boolean'
    value['variants'] = [dict(value['parameters'], mode='reverse'), dict(value['parameters'], mode='unknown')]
    return value


class StringParameterTests(SimpleTestCase):
    def test_strict_enum_types_conditions_and_version_boundaries(self):
        value = seed()
        rows = value['candidate']['parameters']
        rows[1]['domain']['conditions'] = [{'when': compare('mode', 'eq', 'trend'), 'require': compare('N', 'lte', 10)}]
        domains.validate_values(rows, value['parameters'])
        domains.validate_values(rows, {'mode': 'reverse', 'N': 20})
        for values in ({'mode': 'trend', 'N': 20}, {'mode': 'TREND', 'N': 5}, {'mode': 1, 'N': 5}, {'mode': 'trend\n', 'N': 5}):
            with self.subTest(values=values), self.assertRaises(ValidationError): domains.validate_values(rows, values)
        for changes in ({'version': 2}, {'minimum': 0}, {'choices': []}, {'choices': ['trend', 1]}, {'choices': ['trend', 'trend']}):
            changed = copy.deepcopy(rows)
            changed[1]['domain'].update(changes)
            with self.subTest(changes=changes), self.assertRaises(ValidationError): domains.validate_contract(changed)
        rows[1]['domain']['conditions'][0]['when']['operator'] = 'lt'
        with self.assertRaises(ValidationError): domains.validate_contract(rows)
        value = seed(); value['candidate']['parameters'][1].pop('domain')
        with self.assertRaisesRegex(ValidationError, 'v3'): recipe(value['candidate'], value['bindings'], value['parameters'])

    def test_calculator_compares_exact_text_and_rejects_numeric_coercion(self):
        value = seed()
        spec = recipe(value['candidate'], value['bindings'], value['parameters'])
        inputs = {key: [100., 110., 120., 130., 140., 150., 160.] for key in spec['bindings']}
        baseline = calculate(spec['expression'], inputs, spec['parameters'], expected='boolean_series')
        mode = next(key for key, name in spec['parameter_names'].items() if name == 'mode')
        reverse = calculate(spec['expression'], inputs, spec['parameters'] | {mode: 'reverse'}, expected='boolean_series')
        self.assertIs(baseline[-1], True); self.assertIs(reverse[-1], False)
        string = {'op': 'constant', 'value': '123'}
        for expression in (string, {'op': 'add', 'args': [string, {'op': 'constant', 'value': 1}]},
                {'op': 'lag', 'args': [string, {'op': 'constant', 'value': 1}]},
                {'op': 'eq', 'args': [string, {'op': 'constant', 'value': 123}]}):
            with self.assertRaises(ValidationError): calculate(expression, {'close': [1., 2.]}, {})

    def test_trials_derivation_and_sensitivity_preserve_categories(self):
        value = seed(); result = run_batch(fixtures.data(), [value], fixtures.SearchTests.config)
        self.assertEqual(result['attempts'][1]['status'], 'evaluated')
        self.assertEqual(result['attempts'][2]['status'], 'rejected')
        self.assertIn('枚举', result['attempts'][2]['reason'])
        attempt = result['attempts'][1]
        derived = build_candidate('request', 'checkpoint', {'name': 'text enum', 'seeds': [value],
            'engine_version': result['engine_version'], 'dataset_hash': 'fixture'}, fixtures.data(), result['attempts'], attempt)
        row = next(row for row in derived['parameters'] if row['type'] == 'string')
        self.assertEqual(json.loads(row['default_value']), 'reverse')
        self.assertEqual(row['domain']['choices'], ['trend', 'reverse'])
        domains.validate_values(derived['parameters'], {row['name']: json.loads(row['default_value']) for row in derived['parameters']})
        evidence = analyze({'seeds': [value]}, result['attempts'])
        self.assertFalse(evidence['families'][0]['axes'])
        self.assertEqual(evidence['families'][0]['baseline_parameters']['mode'], 'trend')
        combined = combine(attempt['recipe'], result['attempts'][0]['recipe'], 'or')
        self.assertEqual(set(v for v in combined['parameters'].values() if isinstance(v, str)), {'trend', 'reverse'})

    def test_platform_export_preserves_enum_choices_and_typed_nodes(self):
        from types import SimpleNamespace
        candidate = SimpleNamespace(pk='text', data=seed()['candidate'], report_id='report', report=SimpleNamespace(source_id='source'))
        for target in ('python', 'pine', 'mql4', 'tongdaxin'):
            with self.subTest(target=target):
                exported = bundle(candidate, target)
                manifest = json.loads(exported['manifest_json'])
                self.assertEqual(manifest['recipe']['string_choices'], {'p1': ['trend', 'reverse']})
                self.assertEqual(manifest['verification'], 'platform_compile_and_equivalence_pending')
                code = exported['code']
                if target == 'python':
                    namespace = {}; exec(compile(code, '<generated-enum>', 'exec'), namespace)
                    rows = [{'close': float(100 + i)} for i in range(30)]
                    spec = manifest['recipe']
                    for mode in ('trend', 'reverse'):
                        actual = namespace['calculate'](rows, {'p1': mode})
                        expected = calculate(spec['expression'], {name: [row[column] for row in rows] for name, column in spec['bindings'].items()}, spec['parameters'] | {'p1': mode}, expected=spec['output_type'])
                        self.assertEqual(actual, expected)
                        self.assertEqual(actual[-1], mode == 'trend')
                    for value in ('TREND', 'unknown', 1, True, None, ['trend']):
                        with self.assertRaises(ValueError): namespace['calculate'](rows, {'p1': value})
                elif target == 'pine':
                    self.assertIn('input.string("trend", "p1", options=["trend", "reverse"])', code)
                    self.assertIn('string v0 = p1', code)
                    self.assertNotIn('float r0 = p1', code)
                elif target == 'mql4':
                    self.assertIn('input string p1 = "trend";', code)
                    self.assertIn('StringCompare(p1,"trend",true)==0', code)
                    self.assertIn('StringCompare(v0,v1,true)==0', code)
                    self.assertNotIn('double v0[]', code)
                else:
                    self.assertEqual(manifest['categorical_encoding']['values'], [{'code': 1, 'value': 'reverse'}, {'code': 2, 'value': 'trend'}])
                    self.assertIn('P1:=2;', code)
                    self.assertIn('QCAT:=(p1=2 OR p1=1);', code)
                    self.assertIn('AND QCAT AND NOT(ISLASTBAR)', code)


class StringParameterIntegrationTests(TestCase):
    from quant.test_parameter_domains import DomainIntegrationTests as _Fixture
    setUp = _Fixture.setUp
    collect = _Fixture.collect
    dataset = _Fixture.dataset

    def test_ai_plan_execution_derivation_restore_and_tamper_rejection(self):
        from unittest.mock import patch
        from quant.test_initial_planning import initial_response
        from quant.models import AIRun, FactorCandidate, ExperimentProposal, ExperimentJob, ExperimentRequest
        from quant.worker import execute
        from quant.experiments.worker import execute as compute
        from quant.experiments.campaigns.contracts import experiment_input
        from quant.sync import metadata, validate
        from quant.research.contracts import digest
        from utils.sync_manager import SyncManager, SyncError
        self.payload['code'] += '\nmode="trend" # allowed modes: trend, reverse\n'
        self.collect(); run = AIRun.objects.get()
        response = initial_response(); candidate = seed()['candidate']
        candidate['parameters'][1]['domain']['evidence'] = [{'field': 'code', 'quote': run.source.payload['code']}]
        response['factors'] = [candidate]; response['parameters'] = copy.deepcopy(candidate['parameters'])
        response['initial_proposal']['seeds'][0]['variants'] = [[{'name': 'N', 'value': 20}, {'name': 'mode', 'value': 'reverse'}]]
        with patch('quant.worker.complete', return_value=json.dumps(response)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        factor = FactorCandidate.objects.get(); proposal = ExperimentProposal.objects.get()
        for target in ('python', 'pine', 'mql4', 'tongdaxin'):
            path = f'/api/quant/{self.collection.pk}/factors/{factor.pk}/export/'
            exported = self.client.get(path, {'target': target})
            self.assertEqual(exported.status_code, 200, exported.data)
            self.assertEqual(json.loads(exported.json()['data']['manifestJson'])['recipe']['string_choices']['p1'], ['trend', 'reverse'])
        detail = self.client.get(f'/api/quant/{self.collection.pk}/factors/{factor.pk}/').json()['data']
        self.assertEqual(detail['data']['parameters'][1]['domain']['choices'], ['trend', 'reverse'])
        plan = experiment_input(proposal, self.dataset().pk, 'string_parameters_0001')
        invalid = copy.deepcopy(plan)
        next(row for row in invalid['seeds'][0]['parameters'] if row['name'] == 'mode')['value'] = 1
        path = f'/api/quant/{self.collection.pk}/experiments/'
        self.assertEqual(self.client.post(path, invalid, format='json').status_code, 400)
        self.assertFalse(ExperimentJob.objects.exists())
        created = self.client.post(path, plan, format='json')
        self.assertEqual(created.status_code, 200, created.data)
        request = ExperimentRequest.objects.get(pk=created.data['data']['id'])
        compute(request.job.pk)
        attempts = request.result.data['output']['attempts']
        self.assertEqual(attempts[1]['requested_parameters']['mode'], 'reverse')
        self.assertEqual(attempts[1]['status'], 'evaluated')
        snapshot = SyncManager().build_snapshot_data()
        self.assertEqual(metadata(snapshot)['quant_schema_version'], 74)
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(ExperimentJob.objects.exists())
        self.assertEqual(FactorCandidate.objects.get(pk=factor.pk).data, factor.data)
        forged = copy.deepcopy(snapshot)
        fields = next(row['fields'] for row in forged if row['model'] == 'quant.factorcandidate' and str(row['pk']) == factor.pk)
        fields['data']['parameters'][1]['domain']['choices'].append('invented')
        fields['content_hash'] = digest(fields['data'])
        with self.assertRaises(SyncError): validate(forged, metadata(forged))
