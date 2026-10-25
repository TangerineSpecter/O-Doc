"""Fixed-sample equivalence evidence compares all rows and never uploaded code."""
import copy
import json
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant.comparisons.kernel import evaluate_pair, compare_outputs, failure_result, validate_policy
from quant.research.contracts import digest

POLICY = {'version': 1, 'absolute_tolerance': 0, 'relative_tolerance': 0, 'warmup_bars': 0}


def snapshot(size=60):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return {'symbol': 'SYNTHETIC', 'timeframe': '1m', 'timezone': 'UTC', 'rows': [
        {'timestamp': (start + timedelta(minutes=index)).isoformat(), 'open': 100 + index,
         'high': 102 + index, 'low': 99 + index, 'close': 101 + index, 'volume': 5}
        for index in range(size)]}


def source(name='price', expression=None, parameters=None, actual=None, **metadata):
    return {'candidate': {'name': '固定样例', 'role': 'factor', 'units': 'price', 'output_type': 'numeric_series',
        'inputs': [{'name': name}], 'parameters': parameters or [],
        'expression': expression or {'op': 'input', 'name': name}, **metadata},
        'bindings': {name: 'close'}, 'parameters': actual or {}}


def compare(left, right, *, data=None, policy=None, **metadata):
    data = snapshot() if data is None else data
    return compare_outputs([row['timestamp'] for row in data['rows']], left, right, POLICY if policy is None else policy,
        left_output_type=metadata.pop('left_output_type', 'numeric_series'), right_output_type=metadata.pop('right_output_type', 'numeric_series'),
        left_units=metadata.pop('left_units', 'price'), right_units=metadata.pop('right_units', 'price'), **metadata)


class ComparisonKernelTests(SimpleTestCase):
    def test_real_ir_different_names_algebraic_equal_and_non_mutation(self):
        left = source(expression={'op': 'mul', 'args': [{'op': 'input', 'name': 'price'}, {'op': 'constant', 'value': 2}]})
        right = source('other', {'op': 'add', 'args': [{'op': 'input', 'name': 'other'}, {'op': 'input', 'name': 'other'}]})
        data, policy = snapshot(), dict(POLICY)
        original = copy.deepcopy((left, right, data, policy))
        value = evaluate_pair(left, right, data, policy)
        self.assertEqual(value['status'], 'pass')
        self.assertEqual(value['evaluation_status'], 'completed')
        self.assertEqual(value['counts']['within_tolerance'], 60)
        self.assertEqual(value['output_hashes']['left'], value['output_hashes']['right'])
        self.assertEqual(value['max_abs_error'], '0')
        self.assertEqual((left, right, data, policy), original)
        self.assertEqual(evaluate_pair(left, right, data, policy), value)
        self.assertIn('not_platform_or_global_equivalence', value['claim'])

    def test_missing_masks_are_not_dropped_and_common_warmup_is_explicit(self):
        data = snapshot()
        for index, row in enumerate(data['rows']): row['volume'] = None if index < 10 else 5
        left = source('v'); left['bindings']['v'] = 'volume'
        right = source('v', {'op': 'lag', 'args': [{'op': 'input', 'name': 'v'}, {'op': 'constant', 'value': 1}]})
        right['bindings']['v'] = 'volume'
        entire = evaluate_pair(left, right, data, POLICY)
        self.assertEqual(entire['status'], 'fail')
        self.assertEqual(entire['counts']['both_missing'], 10)
        self.assertEqual(entire['counts']['right_missing'], 11)
        self.assertEqual(entire['first_difference']['index'], 10)
        scoped = evaluate_pair(left, right, data, dict(POLICY, warmup_bars=11))
        self.assertEqual(scoped['status'], 'pass')
        self.assertEqual(scoped['counts']['common_valid'], 49)
        self.assertEqual(scoped['comparison_start'], data['rows'][11]['timestamp'])
        self.assertNotEqual(scoped['output_hashes']['left'], scoped['output_hashes']['right'])
        self.assertNotEqual(scoped['classification_hash'], entire['classification_hash'])

    def test_all_missing_few_samples_or_incompatible_metadata_cannot_pass(self):
        missing = compare([None] * 60, [None] * 60)
        self.assertEqual(missing['status'], 'inconclusive')
        self.assertEqual(missing['counts']['common_valid'], 0)
        self.assertEqual(missing['counts']['both_missing'], 60)
        few = compare([1] * 29 + [None] * 31, [1] * 29 + [None] * 31)
        self.assertEqual(few['status'], 'inconclusive')
        for metadata in ({'left_units': 'unknown'}, {'right_units': 'volume'}, {'left_role': 'factor', 'right_role': 'execution'}):
            with self.subTest(metadata=metadata):
                self.assertEqual(compare([1] * 60, [1] * 60, **metadata)['status'], 'inconclusive')
        mixed = compare([1] * 60, [True] * 60, right_output_type='boolean_series')
        self.assertEqual(mixed['status'], 'inconclusive')
        self.assertEqual(mixed['counts']['common_valid'], 60)
        self.assertEqual(mixed['counts']['within_tolerance'], 0)
        self.assertEqual(mixed['counts']['value_mismatches'], 0)
        self.assertEqual(mixed['classification_hash'], digest([[index, row['timestamp'], 'incompatible_type']
            for index, row in enumerate(snapshot()['rows'])]))
        disjoint = compare([None, 1] * 30, [1, None] * 30)
        self.assertEqual(disjoint['status'], 'fail')
        self.assertEqual(disjoint['counts']['missing_mismatches'], 60)

    def test_boolean_is_strict_and_actual_type_mismatches_raise(self):
        result = compare([True] * 60, [False] * 60, left_output_type='boolean_series', right_output_type='boolean_series')
        self.assertEqual(result['status'], 'fail')
        self.assertEqual(result['counts']['value_mismatches'], 60)
        self.assertIsNone(result['max_abs_error'])
        for left, kind in [([True] * 60, 'numeric_series'), ([1] * 60, 'boolean_series'), ([float('nan')] * 60, 'numeric_series')]:
            with self.subTest(kind=kind), self.assertRaises(ValidationError):
                compare(left, [1] * 60, left_output_type=kind)
        bad = source(output_type='boolean_series')
        with self.assertRaisesRegex(ValidationError, '实际输出'):
            evaluate_pair(bad, source(), snapshot(), POLICY)

    def test_tolerance_boundary_is_symmetric_and_finite_errors_never_overflow_json(self):
        absolute = dict(POLICY, absolute_tolerance=.001)
        self.assertEqual(compare([.001] * 60, [0] * 60, policy=absolute)['status'], 'pass')
        self.assertEqual(compare([.0010000000000000002] * 60, [0] * 60, policy=absolute)['status'], 'fail')
        relative = dict(POLICY, relative_tolerance=.001)
        for left, right in [(999, 1000), (1000, 999), (-999, -1000)]:
            self.assertEqual(compare([left] * 60, [right] * 60, policy=relative)['status'], 'pass')
        huge = compare([1e308] * 60, [-1e308] * 60, policy=relative)
        self.assertEqual(huge['status'], 'fail')
        self.assertEqual(Decimal(huge['max_abs_error']), Decimal('2e308'))
        self.assertEqual(huge['max_relative_error'], '2')
        json.dumps(huge, ensure_ascii=False, allow_nan=False)

    def test_every_row_affects_counts_and_hashes_but_examples_are_bounded(self):
        left, right = [1] * 60, [2] * 60
        value = compare(left, right)
        self.assertEqual(len(value['differences']), 12)
        self.assertEqual(value['first_difference'], value['differences'][0])
        self.assertEqual(value['counts']['value_mismatches'], 60)
        stamps = [row['timestamp'] for row in snapshot()['rows']]
        self.assertEqual(value['output_hashes']['left'], digest(list(zip(stamps, left))))
        self.assertEqual(value['classification_hash'], digest([[index, stamp, 'value_mismatch'] for index, stamp in enumerate(stamps)]))
        right[-1] = 1
        changed = compare(left, right)
        self.assertEqual(changed['differences'], value['differences'])
        self.assertNotEqual(changed['output_hashes']['right'], value['output_hashes']['right'])
        self.assertNotEqual(changed['classification_hash'], value['classification_hash'])
        self.assertEqual(changed['counts']['value_mismatches'], 59)

    def test_actual_parameters_domains_bindings_and_source_grammar_are_enforced(self):
        domain = {'version': 1, 'minimum': 1, 'maximum': 3, 'step': 1, 'step_origin': 0,
                  'choices': [], 'relations': [], 'evidence': [{'field': 'code', 'quote': 'N between 1 and 3'}]}
        left = source(parameters=[{'name': 'N', 'type': 'int', 'category': 'signal', 'domain': domain}], actual={'N': 2})
        evaluate_pair(left, source(), snapshot(), POLICY)
        for changed in [dict(left, parameters={'N': 4}), dict(left, parameters={}), dict(left, bindings={'price': 'missing'})]:
            with self.subTest(changed=changed), self.assertRaises(ValidationError):
                evaluate_pair(changed, source(), snapshot(), POLICY)
        with self.assertRaises(ValidationError):
            evaluate_pair(source(expression={'op': 'eval', 'code': 'bad()'}), source(), snapshot(), POLICY)

    def test_causal_prefix_and_complete_hashes_track_later_perturbations(self):
        left = source(expression={'op': 'sma', 'args': [{'op': 'input', 'name': 'price'}, {'op': 'constant', 'value': 3}]})
        right = source('other', {'op': 'sma', 'args': [{'op': 'input', 'name': 'other'}, {'op': 'constant', 'value': 3}]})
        before = snapshot(); after = copy.deepcopy(before)
        for row in after['rows'][40:]: row['close'] *= 1000
        from quant.experiments.expression import calculate
        first = calculate(left['candidate']['expression'], {'price': [row['close'] for row in before['rows']]}, {})
        second = calculate(left['candidate']['expression'], {'price': [row['close'] for row in after['rows']]}, {})
        self.assertEqual(first[:40], second[:40])
        original = evaluate_pair(left, right, before, POLICY)
        updated = evaluate_pair(left, right, after, POLICY)
        self.assertEqual(original['status'], 'pass'); self.assertEqual(updated['status'], 'pass')
        self.assertNotEqual(original['output_hashes'], updated['output_hashes'])

    def test_shared_deadline_timeout_template_and_cancellation_do_not_run_source(self):
        with self.assertRaises(TimeoutError):
            evaluate_pair(source(), source(), snapshot(), POLICY, deadline=time.monotonic() - 1)
        def stopped(): raise RuntimeError('cancelled')
        with self.assertRaisesRegex(RuntimeError, 'cancelled'):
            evaluate_pair(source(), source(), snapshot(), POLICY, check=stopped)
        from quant.experiments.expression import calculate as actual_calculate
        deadlines = []
        def recording(*args, **kwargs):
            deadlines.append(kwargs['deadline'])
            return actual_calculate(*args, **kwargs)
        with patch('quant.comparisons.kernel.calculate', side_effect=recording):
            evaluate_pair(source(), source(), snapshot(), POLICY)
        self.assertEqual(len(deadlines), 2); self.assertEqual(deadlines[0], deadlines[1])
        timeout = failure_result(snapshot(), POLICY)
        self.assertEqual(timeout['evaluation_status'], 'timed_out')
        self.assertEqual(timeout['status'], 'inconclusive')
        self.assertEqual(timeout['counts']['total_rows'], 60)
        self.assertIsNone(timeout['counts']['common_valid'])
        self.assertEqual(timeout['output_hashes'], {'left': '', 'right': ''})
        self.assertEqual(failure_result(snapshot(), POLICY), timeout)

    def test_policy_rows_time_alignment_and_maximum_dataset_limits(self):
        for change in [{'version': True}, {'absolute_tolerance': .00101}, {'relative_tolerance': float('nan')},
                {'warmup_bars': True}, {'warmup_bars': 2001}, {'extra': 'ignored?'}]:
            with self.subTest(change=change), self.assertRaises(ValidationError): validate_policy(dict(POLICY, **change))
        for size in (2, 29, 20001):
            with self.subTest(size=size), self.assertRaises(ValidationError):
                validate_policy(POLICY, size)
        for mutation in ('duplicate', 'no_timezone', 'reverse'):
            data = snapshot()
            if mutation == 'duplicate': data['rows'][1]['timestamp'] = data['rows'][0]['timestamp']
            elif mutation == 'no_timezone': data['rows'][0]['timestamp'] = '2026-01-01T00:00:00'
            else: data['rows'].reverse()
            with self.subTest(mutation=mutation), self.assertRaises(ValidationError):
                evaluate_pair(source(), source(), data, POLICY)
        with self.assertRaises(ValidationError):
            evaluate_pair(source(), source(), snapshot(), dict(POLICY, warmup_bars=31))
        large = snapshot(20000)
        result = compare([1] * 20000, [1] * 20000, data=large)
        self.assertEqual(result['counts']['compared_rows'], 20000)
        self.assertEqual(result['status'], 'pass')
