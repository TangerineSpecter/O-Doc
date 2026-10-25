"""Fixed arithmetic oracles, causality, missing-data and execution-timing checks."""
import time
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant.experiments.data import parse_csv
from quant.experiments.expression import calculate
from quant.experiments.backtest import simulate, partitions

INPUT = {'op': 'input', 'name': 'close'}
def const(value):
    return {'op': 'constant', 'value': value}
def expr(op, *args):
    return {'op': op, 'args': list(args)}


class DataTests(SimpleTestCase):
    metadata = dict(symbol='TEST', timeframe='1d', timezone='Asia/Shanghai', price_adjustment='unknown', source='synthetic fixture')
    raw = 'date,open,high,low,close,volume\n2024-01-01,10,12,9,11,100\n2024-01-02,11,13,10,12,200\n'

    def test_import_retains_contract_hash_and_missing_volume(self):
        data = parse_csv('\ufeff' + self.raw, self.metadata)
        self.assertEqual(data['rows'][0]['timestamp'], '2023-12-31T16:00:00+00:00')
        self.assertEqual(data['parser_version'], 1)
        self.assertEqual(len(data['raw_hash']), 64)
        raw = 'timestamp,open,high,low,close,comment\n2024-01-01T10:00:00+08:00,10,12,9,11,a\n2024-01-02T10:00:00+08:00,11,13,10,12,b'
        data = parse_csv(raw, self.metadata)
        self.assertIsNone(data['rows'][0]['volume'])
        self.assertEqual(data['discarded_columns'], ['comment'])

    def test_bad_rows_fail_instead_of_sorting_or_filling(self):
        for raw in (self.raw.replace('2024-01-02', '2024-01-01'), self.raw.replace('11,13,10,12', '11,10,10,12'),
                self.raw.replace('11,13,10,12', '11,13,10,nan'), self.raw.replace('11,13,10,12', '11,13,10,'),
                self.raw.replace('date,open', 'date,date'), self.raw.replace('2024-01-02', '2024-01-02T10:00:00'),
                self.raw.replace('2024-01-02', '2023-12-31')):
            with self.subTest(raw=raw), self.assertRaises(ValidationError):
                parse_csv(raw, self.metadata)


class CalculatorTests(SimpleTestCase):
    def test_arithmetic_windows_and_population_std(self):
        data = {'close': [10, 12, 15, 9, 18]}
        momentum = expr('sub', expr('div', INPUT, expr('lag', INPUT, {'op': 'parameter', 'name': 'N'})), const(1))
        output = calculate(momentum, data, {'N': 2})
        self.assertEqual(output[:2], [None, None])
        self.assertAlmostEqual(output[2], .5)
        self.assertAlmostEqual(output[3], -.25)
        self.assertEqual(calculate(expr('sma', INPUT, const(2)), data, {}), [None, 11., 13.5, 12., 13.5])
        self.assertEqual(calculate(expr('std', INPUT, const(2)), data, {}), [None, 1., 1.5, 3., 4.5])
        self.assertEqual(calculate(expr('highest', INPUT, const(2)), data, {}), [None, 12., 15., 15., 18.])

    def test_missing_zero_and_boolean_types_are_not_coerced(self):
        data = {'close': [1., None, 0., -1., 4.]}
        self.assertEqual(calculate(expr('div', const(1), INPUT), data, {}), [1., None, None, -1., .25])
        self.assertEqual(calculate(expr('gt', INPUT, const(0)), data, {}, expected='boolean_series'), [True, None, False, False, True])
        self.assertEqual(calculate(expr('sma', INPUT, const(2)), data, {}), [None, None, None, -.5, 1.5])
        for invalid in (expr('and', INPUT, INPUT), expr('add', expr('gt', INPUT, const(0)), INPUT), expr('sma', INPUT, {'op': 'parameter', 'name': 'N'})):
            with self.assertRaises(ValidationError):
                calculate(invalid, data, {'N': True})
        with self.assertRaises(ValidationError):
            calculate(expr('gt', INPUT, const(0)), data, {})

    def test_future_changes_do_not_change_prior_outputs_and_cancel_is_checked(self):
        source = {'close': [1., 2., 3., 4., 5., 6.]}
        formula = expr('sub', INPUT, expr('sma', INPUT, const(3)))
        first = calculate(formula, source, {})
        changed = {'close': [1., 2., 3., 400., 500., 600.]}
        self.assertEqual(first[:3], calculate(formula, changed, {})[:3])
        with self.assertRaises(TimeoutError):
            calculate(formula, source, {}, deadline=time.monotonic() - 1)
        def cancelled():
            raise InterruptedError('cancelled')
        with self.assertRaises(InterruptedError):
            calculate(formula, source, {}, check=cancelled)


class BacktestEngineTests(SimpleTestCase):
    rows = [{'timestamp': str(i), 'open': value} for i, value in enumerate([8, 10, 20, 10, 15])]

    def test_next_open_execution_and_exact_cost_accounting(self):
        # Signal at row 0 enters at row 1 open=10, then earns +100%.
        result = simulate(self.rows, [1, -1, -1, -1, -1], start=1, end=4, threshold=0, fee_bps=10, slippage_bps=0)
        self.assertAlmostEqual(result['total_return'], .999 * 2 * .999 - 1)
        self.assertEqual(result['entries'], 1)
        self.assertEqual(result['turnover'], 2)
        self.assertEqual(result['exposure_fraction'], 1 / 3)
        self.assertEqual(len(result['curve']), 4)
        # Current/future signal cannot change the first completed return.
        revised = simulate(self.rows, [1, -1, 99, 99, 99], start=1, end=4, threshold=0, fee_bps=10, slippage_bps=0)
        self.assertEqual(result['returns'][:2], revised['returns'][:2])

    def test_flat_missing_baseline_and_final_liquidation(self):
        result = simulate(self.rows, [None] * 5, start=1, end=4, threshold=0, fee_bps=10, slippage_bps=10)
        self.assertEqual(result['total_return'], 0)
        self.assertEqual(result['missing_signals'], 3)
        baseline = simulate(self.rows, [None] * 5, start=1, end=4, threshold=0, fee_bps=10, slippage_bps=10, baseline=True)
        self.assertAlmostEqual(baseline['total_return'], .998 * (15 / 10) * .998 - 1)
        self.assertAlmostEqual(baseline['max_drawdown'], .5)
        self.assertEqual(baseline['turnover'], 2)
        boolean = simulate(self.rows, [True] * 5, start=1, end=4, threshold=0, fee_bps=0, slippage_bps=0, output_type='boolean_series')
        self.assertAlmostEqual(boolean['total_return'], .5)

    def test_partitions_do_not_share_execution_intervals(self):
        split = partitions(100)
        self.assertEqual(split, {'train': [1, 59], 'validation': [61, 79], 'holdout': [81, 99]})
        with self.assertRaises(ValidationError):
            partitions(60, gap=20)
        with self.assertRaises(ValidationError):
            simulate(self.rows, [1] * 5, start=0, end=4, threshold=0, fee_bps=0, slippage_bps=0)
