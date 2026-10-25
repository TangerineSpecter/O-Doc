"""Actual generated Python execution and numeric lowering, not platform claims."""
import copy
import itertools
import json
from types import SimpleNamespace
from django.test import SimpleTestCase
from quant.exports.categories import literal, numeric_categories
from quant.exports.service import bundle
from quant.experiments.expression import calculate
from quant.test_string_parameters import seed


class CategoricalExportTests(SimpleTestCase):
    def test_shared_encoding_is_bijective_and_preserves_cross_parameter_comparisons(self):
        data = seed()['candidate']
        values = ['', '1', 'True', 'trend', 'TREND', '反转', '"; } // \\ fake()', '📈']
        row = data['parameters'][1]
        row['domain']['choices'] = values
        row['default_value'] = json.dumps(values[0])
        other = copy.deepcopy(row); other['name'] = 'second'
        other['domain']['choices'] = list(reversed(values))
        data['parameters'].append(other)
        data['expression'] = {'op': 'eq', 'args': [{'op': 'parameter', 'name': name} for name in ('mode', 'second')]}
        candidate = SimpleNamespace(pk='categories', data=data, report_id='r', report=SimpleNamespace(source_id='s'))
        exported = bundle(candidate, 'python')
        namespace = {}; exec(compile(exported['code'], '<generated-categories>', 'exec'), namespace)
        original = json.loads(exported['manifest_json'])['recipe']
        lowered, encoding = numeric_categories(original)
        lookup = {row['value']: row['code'] for row in encoding['values']}
        self.assertEqual(len(set(lookup.values())), len(values))
        self.assertEqual(original['parameters']['p1'], '')
        for left, right in itertools.product(values, values):
            params = {'p1': left, 'p2': right}
            actual = namespace['calculate']([{'close': 1.}, {'close': None}], params)
            numeric = calculate(lowered['expression'], {'i0': [1., None]}, lowered['parameters'] | {name: lookup[value] for name, value in params.items()}, expected=lowered['output_type'])
            self.assertEqual(actual, [left == right] * 2)
            self.assertEqual(numeric, actual)
        tdx = bundle(candidate, 'tongdaxin')
        self.assertNotIn(values[-2], tdx['code'])
        self.assertEqual(json.loads(tdx['manifest_json'])['categorical_encoding'], encoding)
        for target in ('pine', 'mql4'):
            code = bundle(candidate, target)['code']
            self.assertIn(literal(values[-2]), code)
            self.assertIn('"反转"', code)
            self.assertNotIn('input float p1', code)

    def test_text_constants_without_parameters_are_lowered_without_collisions(self):
        data = seed()['candidate']
        data['parameters'] = data['parameters'][:1]
        data['expression'] = {'op': 'eq', 'args': [{'op': 'constant', 'value': value} for value in ('1', '01')]}
        candidate = SimpleNamespace(pk='constant', data=data, report_id='r', report=SimpleNamespace(source_id='s'))
        for target in ('python', 'pine', 'mql4', 'tongdaxin'):
            exported = bundle(candidate, target)
            if target == 'python':
                namespace = {}; exec(compile(exported['code'], '<generated-constant>', 'exec'), namespace)
                self.assertEqual(namespace['calculate']([{}, {}]), [False, False])
            elif target == 'tongdaxin':
                values = json.loads(exported['manifest_json'])['categorical_encoding']['values']
                self.assertEqual(values, [{'code': 1, 'value': '01'}, {'code': 2, 'value': '1'}])
                self.assertNotIn('QCAT', exported['code'])

    def test_boolean_parameters_keep_their_existing_type(self):
        data = seed()['candidate']
        data['parameters'] = data['parameters'][:1]
        data['parameters'][0].update(type='bool', default_value='true')
        data['expression'] = {'op': 'parameter', 'name': 'N'}
        candidate = SimpleNamespace(pk='bool', data=data, report_id='r', report=SimpleNamespace(source_id='s'))
        for target in ('pine', 'mql4', 'tongdaxin'):
            code = bundle(candidate, target)['code']
            self.assertNotIn('True', code)
