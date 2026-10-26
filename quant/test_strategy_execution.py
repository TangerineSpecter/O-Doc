"""Independent cash-flow oracles and chronological stop/reversal boundaries."""
import copy
import json
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant.strategies.policy import validate_policy
from quant.strategies.simulator import simulate


def policy(**changes):
    return {'version': 1, 'direction': 'long_only', 'boolean_side': 'long', 'short_entry_threshold': -1.,
        'long_exit_threshold': 0., 'short_exit_threshold': 0., 'position_fraction': 1.,
        'stop_loss_fraction': None, 'take_profit_fraction': None, 'max_holding_bars': 0,
        'cooldown_bars': 0, 'max_entries': 20, 'short_borrow_bps_per_bar': 0., 'same_open_reversal': False} | changes


def rows(opens):
    return [{'timestamp': str(i), 'open': price, 'high': price, 'low': price, 'close': price}
        for i, price in enumerate(opens)]


def run(data, values=None, **changes):
    options = {'start': 1, 'end': len(data) - 1, 'threshold': 0., 'fee_bps': 0., 'slippage_bps': 0., 'policy': policy()}
    options.update(changes)
    return simulate(data, values if values is not None else [1.] * len(data), **options)


class StrategyExecutionTests(SimpleTestCase):
    def test_fixed_quantity_long_and_short_cash_accounting_with_real_exit_fees(self):
        data = rows([10, 10, 20, 10, 15])
        result = run(data)
        self.assertAlmostEqual(result['total_return'], .5)
        self.assertEqual((result['entries'], result['turnover']), (1, 2))
        charged = run(data, fee_bps=100., slippage_bps=100.)
        terminal = (1 / 1.01) / (10 * 1.01) * (15 * .99) * .99
        self.assertAlmostEqual(charged['total_return'], terminal - 1)
        self.assertAlmostEqual(sum(t['net_pnl'] for t in charged['execution']['trades']), terminal - 1)
        short = run(rows([10, 10, 12, 10, 15]), [-2.] * len(data), policy=policy(direction='short_only', boolean_side='short'))
        self.assertAlmostEqual(short['total_return'], -.5)
        self.assertEqual(short['execution']['trades'][0]['side'], 'short')

    def test_intrabar_ambiguous_path_is_stop_first_and_gap_stop_is_not_filled_at_old_level(self):
        data = rows([100] * 5); data[1].update(high=120, low=80)
        rules = policy(stop_loss_fraction=.1, take_profit_fraction=.1, max_entries=1)
        result = run(data, policy=rules)
        self.assertAlmostEqual(result['total_return'], -.1)
        self.assertEqual(result['execution']['trades'][0]['exit_reason'], 'stop_loss')
        self.assertEqual(result['execution']['trades'][0]['exit_raw_price'], 90)
        gap = run(rows([100, 100, 80, 80, 80]), policy=rules)
        self.assertAlmostEqual(gap['total_return'], -.2)
        self.assertEqual(gap['execution']['trades'][0]['exit_reason'], 'gap_stop_loss')
        profit = run(rows([100, 100, 120, 120, 120]), policy=rules)
        self.assertAlmostEqual(profit['total_return'], .1)
        self.assertAlmostEqual(profit['execution']['trades'][0]['exit_raw_price'], 110)

    def test_short_protective_rules_and_explicit_borrow_per_bar(self):
        data = rows([100] * 5); data[1].update(high=120, low=80)
        rules = policy(direction='short_only', boolean_side='short', stop_loss_fraction=.1, take_profit_fraction=.1, max_entries=1)
        result = run(data, [-2.] * len(data), policy=rules)
        self.assertAlmostEqual(result['total_return'], -.1)
        self.assertEqual(result['execution']['trades'][0]['exit_reason'], 'stop_loss')
        charged = run(rows([100] * 5), [-2.] * 5, policy=policy(direction='short_only', boolean_side='short', short_borrow_bps_per_bar=100.))
        self.assertAlmostEqual(charged['total_return'], -.03)
        self.assertAlmostEqual(charged['execution']['trades'][0]['borrow_cost'], .03)

    def test_reversal_is_explicit_and_false_boolean_never_means_implicit_short(self):
        data = rows([100, 100, 100, 80, 80])
        rules = policy(direction='long_short', same_open_reversal=True)
        same = run(data, [1., -2., -2., -2., -2.], policy=rules)
        self.assertAlmostEqual(same['total_return'], .2)
        self.assertEqual(same['execution']['trades'][0]['exit_reason'], 'signal_reverse')
        self.assertEqual(same['execution']['trades'][1]['entry_bar'], 2)
        delayed = run(data, [1., -2., -2., -2., -2.], policy=rules | {'same_open_reversal': False})
        self.assertAlmostEqual(delayed['total_return'], 0.)
        boolean = run(data, [False] * 5, output_type='boolean_series', policy=rules)
        self.assertEqual(boolean['entries'], 0)

    def test_holding_limit_cooldown_and_missing_signals_have_distinct_exits(self):
        data = rows([100] * 7)
        result = run(data, policy=policy(max_holding_bars=1, cooldown_bars=1))
        self.assertEqual([t['entry_bar'] for t in result['execution']['trades']], [1, 4])
        missing = run(data, [1., None, None, 1., 1., 1., 1.])
        self.assertEqual(missing['execution']['trades'][0]['exit_reason'], 'missing_signal')
        self.assertEqual(missing['missing_signals'], 2)

    def test_insolvency_preserves_negative_equity_and_deficit_and_stops_new_trades(self):
        result = run(rows([100, 100, 300, 200, 100]), [-2.] * 5,
            policy=policy(direction='short_only', boolean_side='short'))
        self.assertEqual(result['execution']['status'], 'insolvent')
        self.assertAlmostEqual(result['total_return'], -2.)
        self.assertAlmostEqual(result['max_drawdown'], 2.)
        self.assertAlmostEqual(result['execution']['capital_deficit'], 1.)
        self.assertEqual(result['returns'], [-2., 0., 0.])
        self.assertEqual(result['entries'], 1)

    def test_causality_cancellation_and_buy_hold_reference_disable_strategy_exits(self):
        data = rows([100, 100, 120, 110, 130, 140])
        values = [1.] * 6
        first = run(data, values, policy=policy(stop_loss_fraction=.05))
        changed = copy.deepcopy(values); changed[2:] = [-2.] * 4
        self.assertEqual(first['returns'][:2], run(data, changed, policy=policy(stop_loss_fraction=.05))['returns'][:2])
        baseline = run(data, policy=policy(direction='short_only', boolean_side='short', max_holding_bars=1), baseline=True)
        self.assertAlmostEqual(baseline['total_return'], .4)
        self.assertEqual(baseline['entries'], 1)
        def cancel(): raise InterruptedError('cancelled')
        with self.assertRaises(InterruptedError): run(data, check=cancel)

    def test_untyped_or_ambiguous_risk_policy_is_rejected(self):
        for changes in ({'version': True}, {'position_fraction': 2}, {'max_entries': False}, {'same_open_reversal': 1},
                {'stop_loss_fraction': 0}, {'take_profit_fraction': float('nan')}, {'direction': 'long_short', 'short_entry_threshold': 0},
                {'boolean_side': 'short'}, {'unknown': 1}):
            with self.assertRaises(ValidationError): validate_policy(policy(**changes), 0.)


class StrategyExperimentTests(TestCase):
    from quant import test_factor_curation as curation
    from quant import test_experiment_jobs as jobs
    setUp = curation.CurationTests.setUp
    collect = curation.CurationTests.collect
    publish = curation.CurationTests.publish
    prepare = jobs.ExperimentJobsTests.prepare
    start = jobs.ExperimentJobsTests.start

    def execute(self, rolling=False):
        from quant.experiments.worker import execute
        self.prepare()
        self.input['config'] = copy.deepcopy(self.input['config'])
        self.input['config']['strategy'] = policy(position_fraction=.5, stop_loss_fraction=.1, take_profit_fraction=.2)
        if rolling:
            self.input['config'].update(max_candidates=15, walk_forward={'version': 1, 'mode': 'expanding',
                'folds': 2, 'train_bars': 20, 'validation_bars': 5, 'test_bars': 5, 'warmup_bars': 0})
        request = self.start(); execute(request.job.pk)
        self.assertEqual(request.result.data['status'], 'completed')
        return request

    def test_real_strategy_job_ledger_and_restore_without_worker_authority(self):
        from utils.sync_manager import SyncManager
        from quant.sync import metadata, validate
        request = self.execute()
        output = request.result.data['output']
        self.assertEqual(output['engine_version'], 'quant-local-search-5')
        self.assertEqual(output['holdout']['execution']['ledger_scope'], 'full_trades')
        self.assertTrue(all('execution' in value for row in output['attempts'] for value in row['metrics'].values()))
        self.assertTrue(all(value['execution']['ledger_scope'] == 'summary_only' for row in output['attempts'] for value in row['metrics'].values()))
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        with patch('quant.experiments.worker.dispatch') as worker, patch('quant.worker.dispatch') as model:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        worker.assert_not_called(); model.assert_not_called()

    def test_strategy_walk_forward_restarts_frozen_rules_and_validates_each_ledger(self):
        from utils.sync_manager import SyncManager
        from quant.sync import metadata, validate
        request = self.execute(rolling=True)
        output = request.result.data['output']
        self.assertEqual(output['engine_version'], 'quant-local-search-6')
        self.assertEqual([fold['search_engine_version'] for fold in output['walk_forward']['folds']], ['quant-local-search-5'] * 2)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_rehashed_winning_ledger_cannot_invent_fills_or_profit(self):
        from utils.sync_manager import SyncManager, SyncError
        from quant.sync import metadata, validate
        from quant.research.contracts import digest
        from quant.models import ExperimentResult
        request = self.execute()
        snapshot = SyncManager().build_snapshot_data()
        ExperimentResult.objects.filter(pk=request.result.pk).delete()
        row = next(row for row in snapshot if row['model'] == 'quant.experimentresult')
        value = row['fields']['data']['output']['holdout']
        value['execution']['fees'] += .01
        row['fields']['content_hash'] = digest(row['fields']['data'])
        with self.assertRaises(SyncError): validate(snapshot, metadata(snapshot))

    def test_strategy_evolution_review_proposal_and_sync_share_execution_policy(self):
        from quant.experiments.worker import execute as calculate
        from quant.experiments.reviews import start_review
        from quant.experiments.review_evidence import for_run
        from quant.experiments.review_contract import review_prompt
        from quant.test_experiment_reviews import response
        from quant.worker import execute as analyze
        from quant.models import AIRun, ExperimentProposal
        from quant.experiments.campaigns.contracts import experiment_input
        from quant.sync import metadata, validate
        from utils.sync_manager import SyncManager
        self.prepare(); self.input['config'] = copy.deepcopy(self.input['config'])
        self.input['config'].update(strategy=policy(position_fraction=.5), evolution={'version': 3, 'operators': ['lag'], 'windows': [3], 'weights': [.5], 'max_nodes': 80})
        request = self.start(); calculate(request.job.pk)
        self.assertTrue(any(row['operation'] == 'formula_mutation' for row in request.result.data['output']['attempts']))
        start_review(request.result, request_key='strategy_review_0000001')
        ai = AIRun.objects.get(kind='experiment_review')
        self.assertEqual(ai.review_version, 14)
        facts = for_run(ai)
        self.assertEqual(facts['evidence']['execution']['config']['strategy'], self.input['config']['strategy'])
        self.assertIn('trades_sample', facts['evidence']['holdout']['execution'])
        self.assertNotIn('trades', facts['evidence']['holdout']['execution'])
        self.assertIn('strategy-v1', review_prompt(facts, ''))
        result = response(facts)
        result.update(planning_note='固定规则，使用新的数据重复本轮参考实验', proposal={
            'name': '新数据对照', 'hypothesis': '固定策略假设在新数据复核', 'falsification': '费用后优势消失',
            'data_requirement': '新的独立区间', 'evidence_refs': ['execution'],
            'seeds': [{'candidate_id': facts['planning_options'][0]['id'], 'variants': []}]})
        with patch('quant.worker.complete', return_value=json.dumps(result)):
            analyze(ai.pk)
        ai.refresh_from_db(); self.assertEqual(ai.status, 'completed', ai.error)
        proposal = ExperimentProposal.objects.get(run=ai)
        prepared = experiment_input(proposal, request.dataset_id, 'strategy_followup_00001')
        self.assertEqual(prepared['config']['strategy'], request.plan['config']['strategy'])
        validate(SyncManager().build_snapshot_data(), metadata(SyncManager().build_snapshot_data()))
        wire = self.client.get(self.path + request.pk + '/').json()['data']
        from pathlib import Path
        Path('/private/tmp/odoc-strategy-wire.json').write_text(json.dumps(wire))

    def test_oversized_strategy_ledger_fails_before_publication_without_losing_checkpoints(self):
        from quant.experiments.worker import execute
        from quant.models import ExperimentCheckpoint
        from utils.sync_manager import SyncManager
        from quant.sync import metadata, validate
        self.prepare(); self.input['config'] = copy.deepcopy(self.input['config'])
        self.input['config']['strategy'] = policy()
        request = self.start()
        from quant.experiments.search import run_batch as calculate
        def oversized(*args, **kwargs):
            return calculate(*args, **kwargs) | {'padding': 'x' * 5_900_001}
        with patch('quant.experiments.worker.run_batch', side_effect=oversized):
            execute(request.job.pk)
        self.assertEqual(request.result.data['status'], 'failed')
        self.assertIsNone(request.result.data['output'])
        self.assertIn('账本超过同步大小上限', request.result.data['error'])
        self.assertGreater(ExperimentCheckpoint.objects.filter(request=request).count(), 0)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_development_insolvency_retains_loss_and_never_enters_selection(self):
        from quant.test_experiment_search import SearchTests, data, seed
        from quant.experiments.search import run_batch
        market = data()
        for index, row in enumerate(market['rows']):
            price = 100. if index < 2 else 300.
            row.update(open=price, high=price, low=price, close=price)
        parent = seed(variants=False)
        parent['candidate']['expression'] = {'op': 'constant', 'value': -2.}
        config = copy.deepcopy(SearchTests.config) | {'strategy': policy(direction='short_only', boolean_side='short')}
        output = run_batch(market, [parent], config, engine_version='quant-local-search-5')
        self.assertEqual(output['selected_id'], '')
        self.assertIsNone(output['holdout'])
        attempt = output['attempts'][0]
        self.assertEqual(attempt['status'], 'rejected')
        self.assertAlmostEqual(attempt['metrics']['train']['total_return'], -2., delta=.01)
        self.assertEqual(attempt['metrics']['train']['execution']['status'], 'insolvent')
        self.assertGreater(attempt['metrics']['train']['execution']['capital_deficit'], 0)


class StrategyInitialPlanningTests(TestCase):
    from quant.test_initial_planning import InitialPlanningTests as Initial
    setUp = Initial.setUp
    collect = Initial.collect
    ready = Initial.ready
    dataset = Initial.dataset

    def test_new_source_workflow_publishes_typed_strategy_hypothesis_and_runs_exact_plan(self):
        from quant.test_initial_planning import initial_response
        from quant.models import ExperimentProposal, ExperimentRequest
        from quant.experiments.campaigns.contracts import experiment_input
        from quant.experiments.worker import execute
        from quant.experiments.initial_planning import validate_strategy_admission, initial_prompt
        from quant.sync import metadata, validate
        from utils.sync_manager import SyncManager
        value = initial_response(); value['initial_proposal']['config']['strategy'] = policy(position_fraction=.5)
        entry, ai = self.ready(value)
        self.assertEqual(ai.workflow_version, 16)
        for version in range(10):
            with self.assertRaises(ValidationError): validate_strategy_admission(value, version)
        self.assertNotIn('strategy完整结构', initial_prompt())
        self.assertIn('strategy完整结构', initial_prompt(strategy=True))
        proposal = ExperimentProposal.objects.get(run=ai)
        dataset = self.dataset()
        body = experiment_input(proposal, dataset.pk, 'strategy_initial_00001')
        response = self.client.post(f'/api/quant/{self.collection.pk}/experiments/', body, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        request = ExperimentRequest.objects.get(pk=response.data['data']['id']); execute(request.job.pk)
        self.assertEqual(request.plan['config']['strategy'], value['initial_proposal']['config']['strategy'])
        self.assertEqual(request.result.data['output']['engine_version'], 'quant-local-search-5')
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
