"""Fixed seed lineage, budgets and actual holdout-blind selection tests."""
import copy
import math
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant.test_factors import extracted
from quant.experiments.search import run_batch, combine, recipe, variant_recipe, pareto


def data():
    rows = []
    for index in range(180):
        value = 100 + index * .1 + 4 * math.sin(index / 5)
        rows.append({'timestamp': (datetime(2024, 1, 1, tzinfo=timezone.utc) + timedelta(days=index)).isoformat(),
            'open': value, 'high': value + 1, 'low': value - 1, 'close': value + .2, 'volume': 1000.})
    return {'rows': rows, 'symbol': 'SYNTHETIC', 'timeframe': '1d', 'source': 'test fixture'}


def seed(identity='parent-1', window=5, variants=True):
    return {'id': identity, 'candidate': extracted()['factors'][0], 'bindings': {'close': 'close'},
        'parameters': {'N': window}, 'variants': [{'N': value} for value in (3, 8, 0)] if variants else []}


class SearchTests(SimpleTestCase):
    config = {'seed': 123, 'max_candidates': 12, 'generations': 3, 'threshold': 0, 'fee_bps': 5, 'slippage_bps': 5, 'gap': 1, 'seconds': 10}

    def test_reproducibility_lineage_rejections_and_cost_baseline(self):
        result = run_batch(data(), [seed()], self.config)
        self.assertEqual(result, run_batch(data(), [seed()], self.config))
        attempts = result['attempts']
        self.assertEqual(attempts[0]['operation'], 'source_candidate')
        self.assertEqual(attempts[0]['parents'], ['parent-1'])
        self.assertEqual(attempts[1]['parents'], [attempts[0]['id']])
        self.assertTrue(any(item['status'] == 'rejected' for item in attempts))
        self.assertTrue(result['selected_id'])
        self.assertIsNotNone(result['buy_hold_baseline'])
        self.assertEqual(result['holdout_status'], 'excluded_from_this_batch_selection_prior_usage_unattested')
        for item in attempts:
            self.assertNotIn('holdout', item['metrics'])
            if item['generation']:
                self.assertTrue(all(parent in {previous['id'] for previous in attempts[:attempts.index(item)]} for parent in item['parents']))

    def test_changing_only_holdout_cannot_change_search_or_selection(self):
        original = data()
        first = run_batch(original, [seed()], self.config)
        changed = copy.deepcopy(original)
        boundary = first['partitions']['holdout'][0]
        for index in range(boundary, len(changed['rows'])):
            for column in ('open', 'high', 'low', 'close'):
                changed['rows'][index][column] *= .95 ** (index - boundary)
        second = run_batch(changed, [seed()], self.config)
        self.assertEqual(first['selected_id'], second['selected_id'])
        self.assertEqual(first['attempts'], second['attempts'])
        self.assertNotEqual(first['buy_hold_baseline']['total_return'], second['buy_hold_baseline']['total_return'])
        self.assertLess(second['buy_hold_baseline']['total_return'], 0)

    def test_version_two_keeps_dominated_originals_for_first_generation_combinations(self):
        parents = [seed('window-5', 5, False), seed('window-10', 10, False)]
        old = run_batch(data(), parents, self.config, engine_version='quant-local-search-1')
        new = run_batch(data(), parents, self.config)
        self.assertEqual(len(pareto(old['attempts'])), 1)
        self.assertFalse(any(row['operation'] == 'mean' for row in old['attempts']))
        combinations = [row for row in new['attempts'] if row['operation'] == 'mean']
        self.assertTrue(combinations)
        self.assertEqual(set(combinations[0]['parents']), {'attempt-1', 'attempt-2'})
        self.assertEqual(combinations[0]['generation'], 1)
        self.assertEqual(new['engine_version'], 'quant-local-search-2')
        self.assertEqual(old['engine_version'], 'quant-local-search-1')
        self.assertEqual(old, run_batch(data(), parents, self.config, engine_version='quant-local-search-1'))

    def test_candidate_budget_cancel_and_time_budget_preserve_attempts(self):
        result = run_batch(data(), [seed()], self.config | {'max_candidates': 2})
        self.assertEqual(len(result['attempts']), 2)
        self.assertEqual(result['stop_reason'], 'candidate_budget')
        def stop():
            raise InterruptedError('test')
        result = run_batch(data(), [seed()], self.config, check=stop)
        self.assertEqual(result['stop_reason'], 'cancelled')
        self.assertEqual(result['attempts'][0]['status'], 'cancelled')
        self.assertIsNone(result['holdout'])
        with patch('quant.experiments.search.time.monotonic', side_effect=[0., 11.]):
            result = run_batch(data(), [seed()], self.config)
        self.assertEqual(result['stop_reason'], 'time_budget')
        self.assertIsNone(result['holdout'])

    def test_name_collision_isolated_and_bad_units_or_parameter_roles_rejected(self):
        a = recipe(seed()['candidate'], {'close': 'close'}, {'N': 3})
        b = recipe(seed()['candidate'], {'close': 'open'}, {'N': 8})
        combined = combine(a, b, 'mean')
        self.assertEqual(set(combined['parameters'].values()), {3, 8})
        self.assertEqual(set(combined['bindings'].values()), {'close', 'open'})
        with self.assertRaises(ValidationError):
            combine(a, b | {'units': 'price'}, 'mean')
        for category in ('display', 'constant', 'state', 'execution', 'risk'):
            parent = seed()
            parent['candidate']['parameters'][0]['category'] = category
            with self.assertRaises(ValidationError):
                variant_recipe(parent, {'N': 8})
        with self.assertRaises(ValidationError):
            recipe(seed()['candidate'], {'close': 'close'}, {'N': float('nan')})

    def test_pareto_retains_risk_and_complexity_tradeoffs(self):
        def trial(identity, gain, dd, turnover, complexity):
            return {'id': identity, 'status': 'evaluated', 'complexity': complexity, 'metrics': {'train': {'total_return': gain, 'max_drawdown': dd, 'turnover': turnover}}}
        attempts = [trial('simple', .1, .05, 2, 3), trial('risky', .2, .15, 4, 9), trial('dominated', .09, .06, 3, 4)]
        self.assertEqual({item['id'] for item in pareto(attempts)}, {'simple', 'risky'})
