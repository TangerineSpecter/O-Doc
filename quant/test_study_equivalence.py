"""Actual formula counterexample and conservative proof results."""
from django.test import SimpleTestCase
from decimal import Decimal
from quant.experiments.expression import calculate
from quant.studies.equivalence import compare
from quant.studies.equivalence_v4 import compare as compare_v4, evaluate


def node(op, *args): return {'op': op, 'args': list(args)}
def inp(name): return {'op': 'input', 'name': name}
def parameter(name): return {'op': 'parameter', 'name': name}
def constant(value): return {'op': 'constant', 'value': value}


class StudyEquivalenceTests(SimpleTestCase):
    def setUp(self):
        x = inp('close')
        n = node('div', x, node('lag', x, parameter('N')))
        m = node('div', x, node('lag', x, parameter('M')))
        self.base = {'inputs': [{'name': 'close'}], 'parameters': [{'name': 'N', 'default_value': '20'}, {'name': 'M', 'default_value': '5'}],
            'output_type': 'numeric_series', 'expression': node('sub', node('sub', n, m), constant(1))}
        self.alternative = {**self.base, 'expression': node('sub', node('sub', n, constant(1)), node('sub', m, constant(1)))}

    def test_actual_false_equivalence_has_counterexample(self):
        result = compare(self.base, self.alternative, 'parent', 'equivalent')
        self.assertEqual(result['status'], 'different')
        self.assertEqual(result['counterexample']['parent'], '-1')
        self.assertEqual(result['counterexample']['candidate'], '0')
        self.assertEqual(result['counterexample']['parameters'], {'M': '5', 'N': '20'})

    def test_algebraic_identity_is_conditional_and_defaults_are_distinct(self):
        a = self.base['expression']['args'][0]['args'][0]
        b = self.base['expression']['args'][0]['args'][1]
        same = {**self.base, 'parameters': [{'name': 'N', 'default_value': '40'}, {'name': 'M', 'default_value': '5'}],
            'expression': node('sub', a, node('add', b, constant(1)))}
        result = compare(self.base, same, 'parent')
        self.assertEqual(result['status'], 'equivalent')
        self.assertTrue(result['default_parameters_differ'])
        self.assertIn('均有定义', result['reason'])

    def test_unknown_for_unsupported_or_unproven_sample(self):
        unsupported = {**self.base, 'expression': node('log', inp('close'))}
        self.assertEqual(compare(self.base, unsupported, 'parent')['status'], 'unknown')
        flat = {'inputs': [{'name': 'close'}], 'parameters': [], 'output_type': 'numeric_series',
            'expression': node('sub', inp('close'), constant(100))}
        zero = {**flat, 'expression': constant(0)}
        self.assertEqual(compare(flat, zero, 'parent')['status'], 'unknown')

    def test_v4_log_and_rolling_can_find_real_counterexamples(self):
        x = inp('close')
        base = {'inputs': [{'name': 'close'}], 'parameters': [], 'output_type': 'numeric_series', 'expression': node('log', x)}
        altered = {**base, 'expression': node('add', node('log', x), constant(1))}
        result = compare_v4(base, altered, 'parent')
        self.assertEqual(result['status'], 'different')
        self.assertNotEqual(result['counterexample']['parent'], result['counterexample']['candidate'])
        moving = {'inputs': [{'name': 'close'}], 'parameters': [{'name': 'N', 'type': 'int', 'default_value': '3'}],
            'output_type': 'numeric_series', 'expression': node('sma', x, parameter('N'))}
        latest = {**moving, 'expression': x}
        result = compare_v4(moving, latest, 'parent')
        self.assertEqual(result['status'], 'different')
        self.assertIn('时点序号', result['counterexample']['inputs']['close'])

    def test_v4_synthetic_calculation_agrees_with_existing_calculator(self):
        x = inp('close')
        data = [100 + (index % 97) / 10 for index in range(2001)]
        for op in ('lag', 'sma', 'sum', 'std', 'highest', 'lowest', 'ts_rank'):
            expression = node(op, x, parameter('N'))
            with self.subTest(operator=op):
                expected = calculate(expression, {'close': data}, {'N': 3})[-1]
                self.assertAlmostEqual(float(evaluate(expression, {'N': Decimal(3)}, 'varying')), expected, places=10)
        expression = node('log', x)
        expected = calculate(expression, {'close': data}, {})[-1]
        self.assertAlmostEqual(float(evaluate(expression, {}, 'varying')), expected, places=10)
