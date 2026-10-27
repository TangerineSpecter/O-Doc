"""Forecast-objective search, explicit horizons and chronological replay invariants."""
import copy
import json
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant import test_experiment_search as fixtures
from quant import test_experiment_jobs as jobs
from quant import test_nested_validation as nested
from quant.label_studies.targets import freeze
from quant.label_studies.search import RULE, NESTED_RULE
from quant.experiments.search import run_batch, pareto
from quant.experiments.nested import selection_key
from quant.research.contracts import digest

TARGET = freeze({'version': 1, 'horizon_bars': 3})
CONFIG = fixtures.SearchTests.config | {'label_target': TARGET}


def verify(output, source, seeds, config):
    nested.verify(output, source, seeds, config)
    from quant.label_studies.snapshot import validate_attempts
    def fail(message): raise ValueError(message)
    validate_attempts(output['attempts'], {'config': config}, source, fail)


class LabelSearchTests(SimpleTestCase):
    def test_all_label_engines_preserve_evolution_strategy_and_temporal_contracts(self):
        from quant.experiments.evolution import DEFAULT_POLICY
        from quant.experiments.temporal import DEFAULT_POLICY as TEMPORAL
        from quant.test_strategy_execution import policy
        evolution=DEFAULT_POLICY | {'operators':['smooth']}
        variants=[({},9),({'evolution':evolution},10),({'walk_forward':TEMPORAL},11),
            ({'strategy':policy(),'evolution':evolution},12),({'walk_forward':TEMPORAL,'strategy':policy()},13),
            ({'walk_forward':nested.POLICY},14),({'walk_forward':nested.POLICY,'strategy':policy(),'evolution':evolution},15)]
        for options,number in variants:
            with self.subTest(engine=number):
                config=CONFIG | {'max_candidates':24} | options
                output=run_batch(fixtures.data(),[fixtures.seed()],config)
                self.assertEqual(output['engine_version'],f'quant-local-search-{number}')
                verify(output,fixtures.data(),[fixtures.seed()],config)
                self.assertLessEqual(len(output['limitations']),20)
                if number in (10,12,15):self.assertTrue(any(row['operation']=='formula_mutation' for row in output['attempts']))
    def test_label_objective_selects_when_trade_returns_are_identical_and_matches_rank_reference(self):
        from statistics import correlation
        from quant.experiments.expression import calculate
        source, seeds = fixtures.data(), [fixtures.seed()]
        config = CONFIG | {'threshold': 1e20}
        labeled = run_batch(source, seeds, config)
        trade = run_batch(source, seeds, {key: value for key,value in config.items() if key!='label_target'})
        self.assertEqual(labeled['selected_id'], 'attempt-2'); self.assertEqual(trade['selected_id'], 'attempt-1')
        self.assertTrue(all(row['metrics']['validation']['total_return']==0 for row in labeled['attempts'] if row['status']=='evaluated'))
        selected = next(row for row in labeled['attempts'] if row['id']==labeled['selected_id'])
        recipe=selected['recipe']; end=labeled['partitions']['validation'][1]
        rows=source['rows'][:end+1]
        values=calculate(recipe['expression'],{key:[row[column] for row in rows] for key,column in recipe['bindings'].items()},recipe['parameters'])
        start,end=labeled['partitions']['validation'];pairs=[(values[i],rows[i+3]['close']/rows[i]['close']-1)for i in range(start,end-3+1)if values[i] is not None]
        def reference_ranks(values):return [1+sum(other<value for other in values)+(sum(other==value for other in values)-1)/2 for value in values]
        reference=correlation(reference_ranks([x for x,_ in pairs]),reference_ranks([y for _,y in pairs]))
        self.assertAlmostEqual(selected['label_evaluation']['metrics']['validation']['spearman_ic'],reference)

    def test_fixed_split_label_selection_and_holdout_changes_do_not_change_candidates(self):
        source, seeds = fixtures.data(), [fixtures.seed()]
        output = run_batch(source, seeds, CONFIG)
        self.assertEqual(output['engine_version'], 'quant-local-search-9')
        self.assertEqual(output['selection_rule'], RULE)
        frontier = sorted(pareto(output['attempts']), key=selection_key)
        self.assertEqual(output['selected_id'], frontier[0]['id'])
        self.assertTrue(all(row['label_evaluation']['metrics']['validation']['selection_used'] for row in frontier))
        self.assertFalse(output['label_holdout']['selection_used'])
        verify(output, source, seeds, CONFIG)
        other = copy.deepcopy(source)
        start = output['partitions']['holdout'][0]
        for i, row in enumerate(other['rows'][start:]):
            for key in ('open','high','low','close'): row[key] *= .98**i
        changed = run_batch(other, seeds, CONFIG)
        self.assertEqual(output['attempts'], changed['attempts']); self.assertEqual(output['selected_id'], changed['selected_id'])
        self.assertNotEqual(output['label_holdout']['pairs_hash'], changed['label_holdout']['pairs_hash'])

    def test_each_nested_window_and_outer_test_replay_without_future_selection(self):
        source, seeds = fixtures.data(), [fixtures.seed()]
        config = nested.CONFIG | {'label_target': TARGET}
        for mode in ('expanding','rolling'):
            current = config | {'walk_forward': config['walk_forward'] | {'mode': mode}}
            output = run_batch(source, seeds, current)
            self.assertEqual(output['engine_version'], 'quant-local-search-14')
            self.assertEqual(output['selection_rule'], NESTED_RULE)
            for attempt in output['attempts']:
                if attempt['status'] != 'evaluated': continue
                inner = attempt['inner_evaluation']; self.assertEqual(inner['version'], 2)
                for part in ('train','validation'):
                    expected = sum(row['label_metrics'][part]['spearman_ic'] for row in inner['folds'])/inner['planned_folds']
                    self.assertAlmostEqual(inner['label_summary'][part]['spearman_ic'], expected)
                    self.assertTrue(all(row['label_metrics'][part]['window']['purged_origins'] == 3 for row in inner['folds']))
            verify(output, source, seeds, current)
            # Check the full numeric replay independently of ORM immutability,
            # checkpoint hashes or output/checkpoint list identity.
            bad = copy.deepcopy(output)
            row = next(row for row in bad['attempts'] if row['status']=='evaluated')
            row['inner_evaluation']['folds'][0]['label_metrics']['train']['window']['purged_origins'] = 0
            with self.assertRaises(ValueError): verify(bad, source, seeds, current)
            changed = copy.deepcopy(source); edge = output['walk_forward']['folds'][0]['partitions']['holdout'][0]
            for i, row in enumerate(changed['rows'][edge:]):
                for key in ('open','high','low','close'): row[key] *= .99**i
            other = run_batch(changed, seeds, current)
            self.assertEqual([row for row in output['attempts'] if row['fold']==1], [row for row in other['attempts'] if row['fold']==1])
            self.assertEqual(output['walk_forward']['folds'][0]['selected_id'], other['walk_forward']['folds'][0]['selected_id'])

    def test_undefined_labels_stop_or_reject_with_partial_facts_and_invalid_windows_fail_early(self):
        seed = fixtures.seed(); seed['candidate']['expression'] = {'op': 'constant','value': 1}
        output = run_batch(fixtures.data(), [seed], CONFIG)
        self.assertFalse(output['selected_id']); self.assertIsNone(output['label_holdout'])
        self.assertTrue(all(row['status']=='rejected' for row in output['attempts']))
        verify(output, fixtures.data(), [seed], CONFIG)
        with self.assertRaises(ValidationError): run_batch(fixtures.data(), [fixtures.seed()], CONFIG | {'label_target': freeze({'version':1,'horizon_bars':40})})
        from quant.label_studies.calculation import evaluate
        calls = 0
        def stop(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2: raise InterruptedError('stop between labels')
            return evaluate(*args, **kwargs)
        config = nested.CONFIG | {'label_target': TARGET}
        with patch('quant.label_studies.search.evaluate',side_effect=stop): output = run_batch(fixtures.data(), [fixtures.seed()], config)
        self.assertEqual(output['stop_reason'],'cancelled'); self.assertIsNone(output['label_holdout'])
        self.assertEqual(set(output['attempts'][0]['inner_evaluation']['folds'][0]['label_metrics']), {'train'})
        verify(output, fixtures.data(), [fixtures.seed()], config)


class LabelSearchAPITests(TestCase):
    setUp = jobs.ExperimentJobsTests.setUp
    collect = jobs.ExperimentJobsTests.collect
    publish = jobs.ExperimentJobsTests.publish
    prepare = jobs.ExperimentJobsTests.prepare
    start = jobs.ExperimentJobsTests.start

    def test_api_normalization_label_facts_and_fresh_restore_rejects_rehashed_forgery(self):
        from quant.experiments.worker import execute
        from quant.sync import validate, metadata
        from quant.models import ExperimentCheckpoint, ExperimentResult, ExperimentJob
        from utils.sync_manager import SyncManager, SyncError
        self.prepare()
        self.input['config'] = copy.deepcopy(nested.CONFIG) | {'label_target': {'version':1,'horizon_bars':3}}
        request = self.start(); self.assertEqual(request.plan['config']['label_target'], TARGET)
        with patch('quant.experiments.reviews.auto_review'): execute(request.job.pk)
        request.refresh_from_db(); result = request.result
        self.assertEqual(result.data['status'],'completed',result.data)
        self.assertEqual(result.data['output']['engine_version'],'quant-local-search-14')
        from quant.experiments.reviews import start_review
        from quant.experiments.review_evidence import for_run
        from quant.experiments.review_contract import review_prompt
        run=start_review(result,request_key='label_search_review_0001')
        facts=for_run(run)
        self.assertEqual(facts['evidence']['attempt-1']['label_evaluation']['metrics']['train']['target_ref'],'execution.config.label_target')
        self.assertIn('不能按测试标签',review_prompt(facts,''))
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot,metadata(snapshot))
        bad = copy.deepcopy(snapshot); point = next(row for row in bad if row['model']=='quant.experimentcheckpoint' and row['fields']['attempt']['status']=='evaluated')
        point['fields']['attempt']['inner_evaluation']['folds'][0]['label_metrics']['train']['window']['purged_origins'] = 0
        point['fields']['content_hash'] = digest(point['fields']['attempt'])
        with self.assertRaises(SyncError): validate(bad,metadata(bad))
        with patch('quant.experiments.worker.dispatch') as worker,patch('quant.worker.dispatch') as model:
            SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        worker.assert_not_called(); model.assert_not_called(); self.assertFalse(ExperimentJob.objects.exists())
        self.assertTrue(ExperimentCheckpoint.objects.exists()); self.assertEqual(ExperimentResult.objects.get(pk=result.pk).content_hash,result.content_hash)
