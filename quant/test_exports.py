"""Execute only our generated standard-library runtime, on synthetic test arrays."""
import copy
import json
from django.test import TestCase
from django.contrib.auth import get_user_model
from quant import test_factor_curation as fixtures
from quant.exports.service import bundle
from quant.experiments.expression import calculate
from quant.research.contracts import digest


class ExportTests(TestCase):
    setUp = fixtures.CurationTests.setUp
    collect = fixtures.CurationTests.collect
    publish = fixtures.CurationTests.publish

    def test_python_generated_runtime_matches_engine_for_every_operator_and_missing_values(self):
        candidate = self.publish('export_test_source01')
        a = {'op': 'input', 'name': 'close'}
        b = {'op': 'parameter', 'name': 'N'}
        base = copy.deepcopy(candidate.data)
        expressions = [a, b, {'op': 'constant', 'value': 2}]
        expressions += [{'op': op, 'args': [a]} for op in ('abs', 'neg', 'log')]
        expressions += [{'op': op, 'args': [a, b]} for op in ('lag', 'sma', 'sum', 'std', 'highest', 'lowest', 'add', 'sub', 'mul', 'div', 'min', 'max', 'gt', 'lt', 'eq')]
        condition = {'op': 'gt', 'args': [a, b]}
        expressions += [{'op': op, 'args': [condition, {'op': 'lt', 'args': [a, {'op': 'constant', 'value': 40}]}]} for op in ('and', 'or')]
        prices = [float(i - 5) if i not in (9, 20) else None for i in range(80)]
        for expression in expressions:
            candidate.data = {**base, 'expression': expression, 'output_type': 'boolean_series' if expression['op'] in ('gt', 'lt', 'eq', 'and', 'or') else 'numeric_series'}
            exported = bundle(candidate, 'python'); manifest = json.loads(exported['manifest_json']); spec = manifest['recipe']
            namespace = {}; exec(compile(exported['code'], '<generated-test-candidate>', 'exec'), namespace)
            actual = namespace['calculate']([{'close': value} for value in prices])
            expected = calculate(spec['expression'], {key: prices for key in spec['bindings']}, spec['parameters'], expected=spec['output_type'])
            for x, y in zip(actual, expected):
                if y is None: self.assertIsNone(x, expression)
                else: self.assertAlmostEqual(x, y, places=9, msg=str(expression))
            self.assertEqual(manifest['code_hash'], digest(exported['code']))
            self.assertEqual(manifest['verification'], 'platform_compile_and_equivalence_pending')
            with self.assertRaises(ValueError): namespace['calculate']([{'close': 1}] * 10, {'unknown': 1})

    def test_four_export_routes_are_read_only_stable_and_owned(self):
        candidate = self.publish('export_route_source01')
        path = f'/api/quant/{self.collection.pk}/factors/{candidate.pk}/export/'
        before = candidate.report.entry.implementations.count()
        for target in ('python', 'pine', 'mql4', 'tongdaxin'):
            response = self.client.get(path, {'target': target})
            self.assertEqual(response.status_code, 200, response.data)
            data = response.json()['data']
            self.assertEqual(data, self.client.get(path, {'target': target}).json()['data'])
            self.assertTrue(data['code']); self.assertIn(candidate.pk, data['filename'])
            manifest = json.loads(data['manifestJson']); self.assertEqual(manifest['candidate_id'], candidate.pk)
            self.assertEqual(manifest['artifact_kind'], 'indicator_calculation_not_ea')
            if target == 'pine': self.assertIn('barstate.isconfirmed', data['code'])
            if target == 'mql4': self.assertIn('ArraySetAsSeries(close,false)', data['code']); self.assertNotIn('OrderSend', data['code'])
            if target == 'tongdaxin': self.assertIn('DRAWNULL', data['code'])
        self.assertEqual(candidate.report.entry.implementations.count(), before)
        self.assertEqual(self.client.get(path, {'target': 'arbitrary'}).status_code, 400)
        self.client.force_authenticate(get_user_model().objects.create_user('foreign-export'))
        self.assertIn(self.client.get(path).status_code, (403, 404))

    def test_unsupported_expression_unknown_defaults_and_injected_identifiers_fail_or_remain_data(self):
        candidate = self.publish('export_validation01')
        original = copy.deepcopy(candidate.data)
        for value in (None, {'op': 'exec', 'name': 'print(1)'}):
            candidate.data = {**original, 'expression': value}
            from rest_framework.exceptions import ValidationError
            with self.assertRaises(ValidationError): bundle(candidate, 'python')
        candidate.data = copy.deepcopy(original)
        candidate.data['parameters'][0]['default_value'] = 'unknown'
        with self.assertRaises(ValidationError): bundle(candidate, 'python')
        candidate.data = copy.deepcopy(original)
        hostile = 'N\"); raise RuntimeError(\"unexpected\") #'
        candidate.data['parameters'][0]['name'] = hostile
        candidate.data['expression'] = {'op': 'parameter', 'name': hostile}
        for target in ('python', 'pine', 'mql4', 'tongdaxin'):
            exported = bundle(candidate, target)
            manifest = json.loads(exported['manifest_json'])
            self.assertEqual(manifest['recipe']['parameter_names'], {'p0': hostile})
            if target == 'python':
                namespace = {}; exec(compile(exported['code'], '<generated-safe-names>', 'exec'), namespace)
                self.assertEqual(namespace['calculate']([{'close': 1}, {'close': 2}]), [20, 20])
            else:
                self.assertNotIn(hostile, exported['code'])
        candidate.data['parameters'][0]['default_value'] = str(2**64)
        for target in ('pine', 'mql4'):
            with self.assertRaises(ValidationError): bundle(candidate, target)
