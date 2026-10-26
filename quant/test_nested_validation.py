"""Inner arithmetic, chronological isolation and sync/API provenance."""
import copy
import json
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant import test_experiment_search as fixtures
from quant.experiments.search import run_batch, simulate_config, pareto
from quant.experiments.expression import calculate
from quant.experiments.temporal import DEFAULT_POLICY, windows, validate_policy
from quant.experiments.evolution import DEFAULT_POLICY as EVOLUTION
from quant.experiments.snapshot import validate_attempts, validate_output
from quant.experiments.nested import selection_key, RULE

POLICY = DEFAULT_POLICY | {'version': 2, 'inner_folds': 3}
CONFIG = fixtures.SearchTests.config | {'walk_forward': POLICY, 'max_candidates': 24}


def verify(output, snapshot, seeds, config):
    def fail(message): raise ValueError(message)
    plan = {'engine_version': output['engine_version'], 'dataset_hash': output['dataset_hash'], 'seeds': seeds, 'config': config}
    attempts = output['attempts']
    validate_attempts(attempts, plan, fail)
    status = {'cancelled': 'cancelled', 'time_budget': 'partial'}.get(output['stop_reason'], 'completed')
    validate_output({'output': output, 'status': status}, {'plan': plan}, snapshot, [{'attempt': row} for row in attempts], fail)


class NestedValidationTests(SimpleTestCase):
    def test_selection_uses_all_inner_windows_even_when_last_window_prefers_another_parameter(self):
        import random
        from math import exp
        source, randomizer, price = fixtures.data(), random.Random(0), 100.
        for row in source['rows']:
            price *= exp(randomizer.gauss(0, .025))
            row.update(open=price, high=price*1.02, low=price*.98, close=price)
        output = run_batch(source, [fixtures.seed()], CONFIG)
        first = output['walk_forward']['folds'][0]
        frontier = pareto([a for a in output['attempts'] if a['fold'] == 1])
        self.assertEqual(first['selected_id'], 'attempt-2')
        last_only = sorted(frontier, key=lambda a: (-(a['metrics']['validation']['total_return']-a['metrics']['validation']['max_drawdown']),
            a['metrics']['validation']['turnover'], a['complexity'], a['fingerprint']))
        self.assertEqual(last_only[0]['id'], 'attempt-3')
        selected = next(a for a in frontier if a['id'] == first['selected_id'])
        means = selected['inner_evaluation']['folds']
        mean_utility = sum(a['metrics']['validation']['total_return']-a['metrics']['validation']['max_drawdown'] for a in means)/3
        self.assertAlmostEqual(-selection_key(selected)[0], mean_utility)

    def test_exact_windows_and_separate_calculation_history(self):
        for mode in ('expanding', 'rolling'):
            folds = windows(180, POLICY | {'mode': mode, 'warmup_bars': 5}, 2)
            self.assertEqual(folds[-1]['partitions']['holdout'][1], 179)
            for outer in folds:
                self.assertEqual(outer['calculation_start'], outer['inner_windows'][0]['calculation_start'])
                for index, inner in enumerate(outer['inner_windows']):
                    train, validation = inner['partitions']['train'], inner['partitions']['validation']
                    self.assertEqual(train[0]-inner['calculation_start'], 6)
                    self.assertEqual(validation[0]-train[1], 3)
                    self.assertEqual(validation[1]-validation[0], 10)
                    if index:
                        self.assertEqual(outer['inner_windows'][index-1]['partitions']['validation'][1], validation[0])
                self.assertEqual(outer['partitions']['train'], outer['inner_windows'][-1]['partitions']['train'])
                self.assertEqual(outer['partitions']['holdout'][0]-outer['partitions']['validation'][1], 3)
        self.assertEqual(windows(106, POLICY, 1)[0]['calculation_start'], 0)
        with self.assertRaisesRegex(ValidationError, '106'): windows(105, POLICY, 1)
        for bad in ({'inner_folds': 1}, {'inner_folds': True}, {'inner_folds': 5}, {'inner_mode': 'rolling'}, {'version': 1}):
            with self.assertRaises(ValidationError): validate_policy(POLICY | bad)

    def test_all_inner_metrics_match_separate_manual_runs_and_mean_selection(self):
        source, seeds = fixtures.data(), [fixtures.seed()]
        for mode in ('expanding', 'rolling'):
            config = copy.deepcopy(CONFIG); config['walk_forward']['mode'] = mode
            output = run_batch(source, seeds, config)
            self.assertEqual(output['engine_version'], 'quant-local-search-7')
            self.assertEqual(output['selection_rule'], RULE)
            self.assertLessEqual(len(output['attempts']), 24)
            for outer in output['walk_forward']['folds']:
                attempts = [a for a in output['attempts'] if a['fold'] == outer['number']]
                for attempt in attempts:
                    if attempt['status'] != 'evaluated': continue
                    trial = attempt['recipe']
                    for record, window in zip(attempt['inner_evaluation']['folds'], outer['inner_windows']):
                        origin = window['calculation_start']
                        rows = source['rows'][origin:window['partitions']['validation'][1]+1]
                        values = calculate(trial['expression'], {key: [row[col] for row in rows] for key, col in trial['bindings'].items()}, trial['parameters'], expected=trial['output_type'])
                        for part, (a, b) in window['partitions'].items():
                            metric = simulate_config(rows, values, config, record_trades=False, start=a-origin, end=b-origin, threshold=0, fee_bps=5, slippage_bps=5, output_type=trial['output_type'])
                            self.assertEqual(record['metrics'][part], {k: v for k, v in metric.items() if k not in ('curve', 'returns')})
                    for part in ('train', 'validation'):
                        mean = sum(row['metrics'][part]['total_return'] for row in attempt['inner_evaluation']['folds'])/3
                        self.assertEqual(attempt['inner_evaluation']['summary'][part]['total_return'], mean)
                frontier = sorted(pareto(attempts), key=selection_key)
                self.assertEqual(outer['selected_id'], frontier[0]['id'])
            verify(output, source, seeds, config)
            self.assertEqual(output, run_batch(source, seeds, config))

    def test_outer_test_and_future_changes_do_not_change_inner_selection(self):
        source, seeds = fixtures.data(), [fixtures.seed()]
        output = run_batch(source, seeds, CONFIG)
        for fold in output['walk_forward']['folds']:
            changed = copy.deepcopy(source)
            for index, row in enumerate(changed['rows'][fold['partitions']['holdout'][0]+1:], 1):
                for key in ('open', 'high', 'low', 'close'): row[key] *= .95**index
            result = run_batch(changed, seeds, CONFIG)
            self.assertEqual([a for a in output['attempts'] if a['fold'] <= fold['number']], [a for a in result['attempts'] if a['fold'] <= fold['number']])
            self.assertEqual(fold['selected_id'], result['walk_forward']['folds'][fold['number']-1]['selected_id'])
            self.assertNotEqual(fold['buy_hold_baseline'], result['walk_forward']['folds'][fold['number']-1]['buy_hold_baseline'])

    def test_stop_during_second_inner_fold_preserves_partial_metrics_without_selection(self):
        from quant.experiments.search import simulate_config as original
        calls = []
        def simulate(*args, **kwargs):
            calls.append(kwargs)
            if len(calls) == 4: raise InterruptedError('test stop')
            return original(*args, **kwargs)
        seeds, source, saved = [fixtures.seed()], fixtures.data(), []
        with patch('quant.experiments.search.simulate_config', side_effect=simulate):
            output = run_batch(source, seeds, CONFIG, checkpoint=saved.append)
        first = output['attempts'][0]
        self.assertEqual(first['status'], 'cancelled')
        self.assertEqual(len(first['inner_evaluation']['folds']), 2)
        self.assertEqual(set(first['inner_evaluation']['folds'][0]['metrics']), {'train', 'validation'})
        self.assertEqual(set(first['inner_evaluation']['folds'][1]['metrics']), {'train'})
        self.assertIsNone(first['inner_evaluation']['summary'])
        self.assertEqual(saved, output['attempts'])
        self.assertIsNone(output['holdout'])
        verify(output, source, seeds, CONFIG)

    def test_inner_missing_invalid_duplicate_and_evolution_keep_all_attempts(self):
        source, seeds = fixtures.data(), [fixtures.seed()]
        seeds[0]['variants'] += [{'N': 5}, {'N': 2000}]
        config = CONFIG | {'max_candidates': 30, 'evolution': EVOLUTION}
        output = run_batch(source, seeds, config)
        self.assertTrue(any(row['operation'] == 'formula_mutation' for row in output['attempts']))
        self.assertTrue(any(row['status'] == 'rejected' and not row['inner_evaluation']['folds'] for row in output['attempts']))
        self.assertTrue(any(row['status'] == 'rejected' and len(row['inner_evaluation']['folds']) == 3 for row in output['attempts']))
        verify(output, source, seeds, config)

    def test_strategy_outer_ledger_replay_uses_last_rolling_inner_history(self):
        from quant.test_strategy_execution import policy
        source, seeds = fixtures.data(), [fixtures.seed()]
        config = CONFIG | {'strategy': policy(position_fraction=.5, stop_loss_fraction=.1, max_holding_bars=3),
            'walk_forward': POLICY | {'mode': 'rolling', 'warmup_bars': 3}}
        output = run_batch(source, seeds, config)
        self.assertEqual(output['engine_version'], 'quant-local-search-8')
        self.assertIsNotNone(output['holdout'])
        verify(output, source, seeds, config)
        for fold in output['walk_forward']['folds']:
            origin = fold['inner_windows'][-1]['calculation_start']
            selected = next(row for row in output['attempts'] if row['id'] == fold['selected_id'])
            trial = selected['recipe']; rows = source['rows'][origin:fold['partitions']['holdout'][1]+1]
            values = calculate(trial['expression'], {key: [row[col] for row in rows] for key, col in trial['bindings'].items()}, trial['parameters'], expected=trial['output_type'])
            start, end = fold['partitions']['holdout']
            result = simulate_config(rows, values, config, start=start-origin, end=end-origin, threshold=0, fee_bps=5, slippage_bps=5, output_type=trial['output_type'])
            self.assertEqual(fold['holdout'], result)

    def test_rehashed_inner_tampering_and_legacy_field_injection_are_rejected(self):
        source, seeds = fixtures.data(), [fixtures.seed()]
        output = run_batch(source, seeds, CONFIG)
        verify(json.loads(json.dumps(output, sort_keys=True)), source, seeds, CONFIG)
        for kind in ('summary', 'metrics', 'missing', 'range', 'schedule', 'version', 'rule'):
            bad = copy.deepcopy(output); first = bad['attempts'][0]
            if kind == 'summary': first['inner_evaluation']['summary']['validation']['total_return'] += 1
            elif kind == 'metrics': first['metrics']['train']['total_return'] += .1
            elif kind == 'missing': first['inner_evaluation']['folds'].pop()
            elif kind == 'range': first['inner_evaluation']['folds'][0]['metrics']['train']['start'] = source['rows'][0]['timestamp']
            elif kind == 'schedule': bad['walk_forward']['folds'][0]['inner_windows'][0]['calculation_start'] += 1
            elif kind == 'version': bad['walk_forward']['version'] = 1
            else: bad['selection_rule'] = 'train_pareto_then_validation_return_minus_drawdown_v1'
            with self.assertRaises((ValueError, ValidationError), msg=kind): verify(bad, source, seeds, CONFIG)
        legacy = run_batch(source, seeds, fixtures.SearchTests.config)
        legacy['attempts'][0]['inner_evaluation'] = copy.deepcopy(output['attempts'][0]['inner_evaluation'])
        with self.assertRaises(ValueError): verify(legacy, source, seeds, fixtures.SearchTests.config)


class NestedIntegrationTests(TestCase):
    from quant.test_walk_forward import WalkForwardIntegrationTests as setup
    setUp, collect, publish, prepare, start = setup.setUp, setup.collect, setup.publish, setup.prepare, setup.start

    def test_api_worker_ai_evidence_sync_restore_and_no_dispatch(self):
        from quant.experiments.worker import execute
        from quant.experiments.review_evidence import project
        from quant.sync import metadata, validate
        from quant.models import ExperimentJob
        from utils.sync_manager import SyncManager
        self.prepare(); self.input['config'] = copy.deepcopy(CONFIG)
        request = self.start(); execute(request.job.pk)
        self.assertEqual(request.plan['engine_version'], 'quant-local-search-7')
        self.assertEqual(request.result.data['status'], 'completed', request.result.data)
        output = request.result.data['output']
        from quant.experiments.temporal_sensitivity import analyze as temporal_analysis
        detail=self.client.get(f'/api/quant/{self.collection.pk}/experiments/{request.pk}/').json()['data']
        self.assertEqual(json.loads(detail['temporalSensitivityJson']),temporal_analysis(request.plan,output['attempts']))
        self.assertEqual(json.loads(detail['temporalSensitivityJson'])['planned_windows'],9)
        evidence = project(request.plan, request.dataset.snapshot, request.result.data, output['attempts'], sensitivity=True, joint_sensitivity=True)
        self.assertEqual(len(evidence['evidence']['attempt-1']['inner_evaluation']['folds']), 3)
        self.assertIn('最后已启动内层', '；'.join(evidence['evidence']['parameter_sensitivity']['limitations']))
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        with patch('quant.experiments.worker.run_batch') as compute:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        compute.assert_not_called(); self.assertFalse(ExperimentJob.objects.exists())
        self.assertEqual(self.start().pk, request.pk)


class NestedPlanningTests(TestCase):
    from quant.test_walk_forward import WalkForwardPlanningTests as setup
    initial_fixtures = setup.initial_fixtures
    setUp, collect, ready, dataset = setup.setUp, setup.collect, setup.ready, setup.dataset

    def test_ai_proposal_campaign_review_next_plan_roundtrip(self):
        with patch('quant.test_walk_forward.DEFAULT_POLICY', POLICY):
            self.setup.test_initial_ai_campaign_review_and_next_design_preserve_temporal_contract(self)
