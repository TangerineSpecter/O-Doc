"""Temporal search causality, exact window semantics and one shared budget."""
import copy
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant import test_experiment_search as fixtures
from quant.experiments.evolution import DEFAULT_POLICY as EVOLUTION
from quant.experiments.search import _run_partitioned, pareto, run_batch
from quant.experiments.temporal import DEFAULT_POLICY, configurations, windows
from quant.experiments.walk_forward import run_walk_forward
from quant import test_experiment_jobs as job_fixtures


class WalkForwardTests(SimpleTestCase):
    config = fixtures.SearchTests.config | {'max_candidates': 30, 'evolution': EVOLUTION}

    def test_exact_windows_gaps_warmup_and_nonoverlapping_outer_returns(self):
        for mode in ('expanding', 'rolling'):
            policy = DEFAULT_POLICY | {'mode': mode, 'warmup_bars': 5}
            folds = windows(180, policy, 2)
            self.assertEqual(folds[-1]['partitions']['holdout'][1], 179)
            for index, fold in enumerate(folds):
                split = fold['partitions']
                self.assertEqual(split['train'][0] - fold['calculation_start'], 6)
                self.assertEqual(split['train'][1] - split['train'][0], 40 + (10 * index if mode == 'expanding' else 0))
                self.assertEqual(split['validation'][0] - split['train'][1], 3)
                self.assertEqual(split['holdout'][0] - split['validation'][1], 3)
                for key in ('validation', 'holdout'):
                    self.assertEqual(split[key][1] - split[key][0], 10)
                if index:
                    self.assertEqual(folds[index-1]['partitions']['holdout'][1], split['holdout'][0])
            if mode == 'expanding':
                self.assertEqual(len({fold['calculation_start'] for fold in folds}), 1)
            else:
                self.assertEqual(folds[1]['calculation_start'] - folds[0]['calculation_start'], 10)
        self.assertEqual(windows(86, DEFAULT_POLICY, 1)[0]['calculation_start'], 0)
        with self.assertRaisesRegex(ValidationError, '86'):
            windows(85, DEFAULT_POLICY, 1)

    def test_full_search_restarts_for_each_fold_with_only_its_history(self):
        source, parents = fixtures.data(), [fixtures.seed(variants=False)]
        before = copy.deepcopy((source, parents, self.config, DEFAULT_POLICY))
        calls, checkpoints = [], []
        def run(snapshot, seeds, config, split, **kwargs):
            calls.append((copy.deepcopy(snapshot), copy.deepcopy(seeds), copy.deepcopy(config), copy.deepcopy(split)))
            return _run_partitioned(snapshot, seeds, config, split, **kwargs)
        with patch('quant.experiments.walk_forward._run_partitioned', side_effect=run):
            output = run_walk_forward(source, parents, self.config, DEFAULT_POLICY, checkpoint=checkpoints.append)
        self.assertEqual(len(calls), 3)
        self.assertEqual(checkpoints, output['attempts'])
        self.assertEqual(before, (source, parents, self.config, DEFAULT_POLICY))
        self.assertEqual(output, run_walk_forward(source, parents, self.config, DEFAULT_POLICY))
        self.assertEqual(output['walk_forward']['summary']['tested_folds'], 3)
        previous = {}
        for index, (snapshot, seeds, config, split) in enumerate(calls):
            fold = output['walk_forward']['folds'][index]
            self.assertEqual(seeds, parents)
            self.assertEqual(snapshot['rows'], source['rows'][fold['calculation_start']:fold['partitions']['holdout'][1]+1])
            self.assertEqual(split['holdout'][1], len(snapshot['rows'])-1)
            self.assertEqual(config['max_candidates'], 10)
            attempts = [item for item in output['attempts'] if item['fold'] == index+1]
            self.assertEqual(attempts[0]['operation'], 'source_candidate')
            self.assertEqual(attempts[0]['parents'], ['parent-1'])
            self.assertTrue(any(item['operation'] == 'formula_mutation' for item in attempts))
            self.assertEqual(set(fold['frontier_ids']), {item['id'] for item in pareto(attempts)})
            self.assertEqual(fold['holdout']['bars'], 10)
            for item in attempts:
                self.assertEqual(set(item['metrics']) - {'train', 'validation'}, set())
                for name, metric in item['metrics'].items():
                    self.assertEqual(metric['start'], source['rows'][fold['partitions'][name][0]]['timestamp'])
                    self.assertEqual(metric['end'], source['rows'][fold['partitions'][name][1]]['timestamp'])
                if item['operation'] != 'source_candidate':
                    self.assertTrue(all(previous[parent]['fold'] == item['fold'] for parent in item['parents']))
                previous[item['id']] = item
        self.assertEqual(output['frontier_ids'], output['walk_forward']['folds'][-1]['frontier_ids'])
        self.assertEqual(output['selected_id'], output['walk_forward']['folds'][-1]['selected_id'])
        self.assertEqual([item['id'] for item in output['attempts']], [f'attempt-{i+1}' for i in range(len(output['attempts']))])

    def test_every_fold_choice_is_blind_to_its_outer_test_and_future(self):
        original = fixtures.data()
        parents = [fixtures.seed(variants=False)]
        first = run_walk_forward(original, parents, self.config, DEFAULT_POLICY)
        for index, fold in enumerate(first['walk_forward']['folds']):
            changed = copy.deepcopy(original)
            start = fold['partitions']['holdout'][0]
            # Preserve the shared boundary open: it is the preceding fold's
            # liquidation price. Alter all genuinely future rows instead.
            for row_index, bar in enumerate(changed['rows'][start+1:], 1):
                for column in ('open', 'high', 'low', 'close'):
                    bar[column] *= .97 ** row_index
            second = run_walk_forward(changed, parents, self.config, DEFAULT_POLICY)
            self.assertEqual(first['walk_forward']['folds'][:index], second['walk_forward']['folds'][:index])
            self.assertEqual([a for a in first['attempts'] if a['fold'] <= index+1],
                [a for a in second['attempts'] if a['fold'] <= index+1])
            self.assertEqual(fold['selected_id'], second['walk_forward']['folds'][index]['selected_id'])
            self.assertNotEqual(fold['buy_hold_baseline']['total_return'], second['walk_forward']['folds'][index]['buy_hold_baseline']['total_return'])

    def test_rolling_history_and_warmup_are_real_calculation_boundaries(self):
        original = fixtures.data()
        parents = [fixtures.seed(variants=False)]
        policy = DEFAULT_POLICY | {'mode': 'rolling', 'warmup_bars': 5}
        result = run_walk_forward(original, parents, self.config, policy)
        final = result['walk_forward']['folds'][-1]
        changed = copy.deepcopy(original)
        for bar in changed['rows'][:final['calculation_start']]:
            for column in ('open', 'high', 'low', 'close'): bar[column] *= 100
        second = run_walk_forward(changed, parents, self.config, policy)
        # Earlier folds may react, but the final rolling fold cannot see this history.
        a = [item for item in result['attempts'] if item['fold'] == 3]
        b = [item for item in second['attempts'] if item['fold'] == 3]
        # Per-fold attempt counts can differ, changing global ordinals; compare
        # actual recipes/metrics rather than accidentally requiring earlier history.
        self.assertEqual([(x['operation'], x.get('recipe'), x['metrics']) for x in a],
            [(x['operation'], x.get('recipe'), x['metrics']) for x in b])
        self.assertEqual(final['holdout'], second['walk_forward']['folds'][-1]['holdout'])
        no_warmup = run_walk_forward(original, parents, self.config, policy | {'warmup_bars': 0})
        self.assertGreater(no_warmup['attempts'][0]['metrics']['train']['missing_signals'], result['attempts'][0]['metrics']['train']['missing_signals'])

    def test_total_budget_and_deterministic_seed_allocation(self):
        seeds = [fixtures.seed(variants=False)]
        config = self.config | {'max_candidates': 32, 'seed': 2**32-1}
        allocation = configurations(seeds, config, DEFAULT_POLICY)
        self.assertEqual([c['max_candidates'] for c in allocation], [11, 11, 10])
        self.assertEqual([c['seed'] for c in allocation], [2**32-1, 0, 1])
        result = run_walk_forward(fixtures.data(), seeds, config, DEFAULT_POLICY)
        self.assertLessEqual(len(result['attempts']), 32)
        for fold in result['walk_forward']['folds']:
            self.assertLessEqual(len(fold['attempt_ids']), fold['max_candidates'])
        with self.assertRaisesRegex(ValidationError, '至少为 15'):
            configurations([fixtures.seed()], self.config | {'max_candidates': 14}, DEFAULT_POLICY)
        # Repeating plain parameter search does not require evolution.
        plain = run_walk_forward(fixtures.data(), [fixtures.seed()], fixtures.SearchTests.config, DEFAULT_POLICY)
        self.assertEqual(plain['walk_forward']['summary']['tested_folds'], 3)
        self.assertTrue(all(fold['search_engine_version'] == 'quant-local-search-2' for fold in plain['walk_forward']['folds']))

    def test_cancellation_and_shared_deadline_keep_completed_fold_evidence(self):
        parents = [fixtures.seed(variants=False)]
        for reason in ('cancelled', 'time_budget'):
            state = {'finished': 0, 'clock': 0.}
            checkpoints = []
            def run(*args, **kwargs):
                result = _run_partitioned(*args, **kwargs)
                state['finished'] += 1
                state['clock'] = 11.
                return result
            def check():
                if reason == 'cancelled' and state['finished']:
                    raise InterruptedError('stop after first fold')
            with patch('quant.experiments.walk_forward._run_partitioned', side_effect=run), patch('quant.experiments.walk_forward.time.monotonic', side_effect=lambda: state['clock']):
                result = run_walk_forward(fixtures.data(), parents, self.config, DEFAULT_POLICY, check=check, checkpoint=checkpoints.append)
            self.assertEqual(result['stop_reason'], reason)
            self.assertEqual(result['walk_forward']['summary']['tested_folds'], 1)
            self.assertEqual(result['walk_forward']['summary']['started_folds'], 2)
            self.assertIsNotNone(result['walk_forward']['folds'][0]['holdout'])
            self.assertIsNone(result['holdout'])
            self.assertIsNone(result['buy_hold_baseline'])
            self.assertEqual(result['attempts'], checkpoints)
            self.assertEqual(result['attempts'][-1]['status'], reason if reason == 'cancelled' else 'budget_stopped')

    def test_invalid_policy_is_rejected_before_any_calculation(self):
        for change in ({'version': True}, {'folds': 1}, {'mode': 'random'}, {'train_bars': 19},
                {'validation_bars': 4}, {'test_bars': 0}, {'warmup_bars': -1}, {'folds': 2.5}, {'extra': 1}):
            with patch('quant.experiments.walk_forward._run_partitioned') as compute:
                with self.assertRaises(ValidationError):
                    run_walk_forward(fixtures.data(), [fixtures.seed()], self.config, DEFAULT_POLICY | change)
                compute.assert_not_called()

    def test_no_usable_signal_keeps_failed_folds_without_fabricated_test_metrics(self):
        result = run_walk_forward(fixtures.data(), [fixtures.seed(window=2000, variants=False)],
            fixtures.SearchTests.config, DEFAULT_POLICY)
        self.assertEqual(result['walk_forward']['summary']['started_folds'], 3)
        self.assertEqual(result['walk_forward']['summary']['tested_folds'], 0)
        self.assertIsNone(result['walk_forward']['summary']['mean_test_return'])
        self.assertIsNone(result['holdout'])
        self.assertTrue(all(row['status'] == 'rejected' for row in result['attempts']))

    def test_legacy_batch_keeps_its_own_fixed_split_and_contract(self):
        result = run_batch(fixtures.data(), [fixtures.seed()], fixtures.SearchTests.config)
        self.assertEqual(result['partitions'], {'train': [1, 107], 'validation': [109, 143], 'holdout': [145, 179]})
        self.assertNotIn('walk_forward', result)
        self.assertTrue(all('fold' not in attempt for attempt in result['attempts']))


class WalkForwardIntegrationTests(TestCase):
    setUp = job_fixtures.ExperimentJobsTests.setUp
    collect = job_fixtures.ExperimentJobsTests.collect
    publish = job_fixtures.ExperimentJobsTests.publish
    prepare = job_fixtures.ExperimentJobsTests.prepare
    start = job_fixtures.ExperimentJobsTests.start

    def ready(self):
        self.prepare()
        self.input['config'] = copy.deepcopy(WalkForwardTests.config) | {'walk_forward': copy.deepcopy(DEFAULT_POLICY)}
        request = self.start()
        self.assertEqual(request.plan['engine_version'], 'quant-local-search-4')
        return request

    def test_api_execution_evidence_derived_and_sync_roundtrip(self):
        from quant.experiments.worker import execute
        from quant.experiments.review_evidence import project
        from quant.experiments.sensitivity import analyze
        from quant.models import ExperimentJob, FactorCandidate
        from quant.sync import metadata, validate
        from utils.sync_manager import SyncManager
        request = self.ready()
        execute(request.job.pk)
        envelope = request.result.data
        self.assertEqual(envelope['status'], 'completed', envelope)
        output = envelope['output']
        self.assertEqual(output['walk_forward']['summary']['tested_folds'], 3)
        final_ids = output['walk_forward']['folds'][-1]['attempt_ids']
        sensitivity = analyze(request.plan, output['attempts'])
        self.assertIn(sensitivity['families'][0]['baseline_attempt_id'], final_ids)
        for candidate in FactorCandidate.objects.filter(derived_checkpoint_id__in=request.checkpoints.values_list('pk', flat=True)):
            self.assertIn(candidate.data['derivation']['attempt_id'], final_ids)
        evidence = project(request.plan, request.dataset.snapshot, envelope, output['attempts'], sensitivity=True)
        self.assertEqual(evidence['evidence']['walk_forward']['tested_folds'], 3)
        self.assertIn('fold:1', evidence['evidence'])
        self.assertNotIn('curve', evidence['evidence']['fold:1']['holdout'])
        self.assertEqual(evidence['evidence']['attempt-1']['fold'], 1)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        with patch('quant.experiments.worker.run_batch') as compute:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        compute.assert_not_called()
        self.assertFalse(ExperimentJob.objects.exists())
        self.assertEqual(self.start().pk, request.pk)
        self.assertFalse(ExperimentJob.objects.exists())

    def test_rehashed_cross_fold_parents_ranges_summaries_and_winner_tampering(self):
        from quant.experiments.worker import execute
        from quant.experiments.snapshot import validate_output, validate_attempts
        request = self.ready(); execute(request.job.pk)
        envelope = request.result.data
        self.assertEqual(envelope['status'], 'completed')
        plan, dataset = request.plan, request.dataset.snapshot
        def fail(message): raise ValueError(message)
        def verify(value):
            attempts = value['output']['attempts']
            validate_attempts(attempts, plan, fail)
            validate_output(value, {'plan': plan}, dataset, [{'attempt': row} for row in attempts], fail)
        verify(envelope)
        for corruption in ('parents', 'fold', 'range', 'summary', 'winner', 'budget'):
            bad = copy.deepcopy(envelope)
            output = bad['output']; folds = output['walk_forward']['folds']
            if corruption == 'parents':
                row = next(a for a in output['attempts'] if a['fold'] == 2 and a['operation'] == 'parameter_variant')
                row['parents'] = ['attempt-1']
            elif corruption == 'fold': output['attempts'][0]['fold'] = 2
            elif corruption == 'range': output['attempts'][0]['metrics']['train']['start'] = dataset['rows'][0]['timestamp']
            elif corruption == 'summary': output['walk_forward']['summary']['mean_test_return'] = 123
            elif corruption == 'winner': output['selected_id'] = folds[0]['selected_id']
            else: folds[0]['max_candidates'] += 1
            with self.assertRaises((ValueError, ValidationError), msg=corruption): verify(bad)

    def test_late_cancel_withdraws_final_fold_only_and_restore_preserves_prior_folds(self):
        from quant.experiments.worker import execute
        from quant.models import ExperimentJob
        from quant.sync import metadata, validate
        from utils.sync_manager import SyncManager
        request = self.ready()
        def cancel_at_end(*args, **kwargs):
            result = run_batch(*args, **kwargs)
            ExperimentJob.objects.filter(request=request).update(cancel_requested=True)
            return result
        with patch('quant.experiments.worker.run_batch', side_effect=cancel_at_end): execute(request.job.pk)
        result = request.result.data
        self.assertEqual(result['status'], 'cancelled')
        self.assertEqual(result['output']['walk_forward']['summary']['tested_folds'], 2)
        self.assertIsNone(result['output']['walk_forward']['folds'][-1]['holdout'])
        self.assertIsNotNone(result['output']['walk_forward']['folds'][0]['holdout'])
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_insufficient_data_or_global_budget_rejected_before_queue(self):
        from quant.models import ExperimentRequest
        self.prepare()
        self.input['config'] = self.input['config'] | {'walk_forward': DEFAULT_POLICY | {'test_bars': 100}}
        self.assertEqual(self.client.post(self.path, self.input, format='json').status_code, 400)
        self.input['config'] = WalkForwardTests.config | {'walk_forward': DEFAULT_POLICY, 'max_candidates': 14}
        self.assertEqual(self.client.post(self.path, self.input, format='json').status_code, 400)
        self.assertFalse(ExperimentRequest.objects.exists())


class WalkForwardPlanningTests(TestCase):
    from quant import test_initial_planning as initial_fixtures
    setUp = initial_fixtures.InitialPlanningTests.setUp
    collect = initial_fixtures.InitialPlanningTests.collect
    ready = initial_fixtures.InitialPlanningTests.ready
    dataset = initial_fixtures.InitialPlanningTests.dataset

    def test_initial_ai_campaign_review_and_next_design_preserve_temporal_contract(self):
        import json
        from quant.models import ExperimentProposal, ResearchCampaign, ResearchCampaignJob, ExperimentJob
        from quant.experiments.campaigns.worker import advance
        from quant.experiments.worker import execute as compute
        from quant.worker import execute as analyze
        from quant import test_experiment_proposals as proposals
        from quant.experiments.review_evidence import for_result
        from quant.sync import validate, metadata
        from utils.sync_manager import SyncManager
        response = self.initial_fixtures.initial_response()
        config = response['initial_proposal']['config']
        config.update(generations=3, max_candidates=24, walk_forward=copy.deepcopy(DEFAULT_POLICY),
            evolution=copy.deepcopy(EVOLUTION | {'operators': ['lag', 'zscore']}))
        self.ready(response)
        proposal, dataset = ExperimentProposal.objects.get(), self.dataset()
        body = self.client.post(f'/api/quant/{self.collection.pk}/campaigns/', {
            'request_key': 'temporal_campaign_01', 'name': '逐折连续研究', 'proposal_id': proposal.pk,
            'dataset_ids': [dataset.pk], 'max_rounds': 1, 'max_attempts': 24, 'compute_seconds': 5,
            'wall_seconds': 120, 'model_id': self.model.pk}, format='json')
        self.assertEqual(body.status_code, 200, body.data)
        campaign = ResearchCampaign.objects.get(pk=body.data['data']['id'])
        job = campaign.job
        self.assertTrue(advance(job.pk, job.lease_token))
        round = campaign.rounds.get()
        self.assertEqual(round.experiment.plan['config'], config)
        compute(round.experiment.job.pk)
        self.assertTrue(advance(job.pk, job.lease_token))
        round.refresh_from_db()
        run = round.evaluation.run
        evidence = for_result(round.experiment.result, version=run.review_version, context=run.planning_context)
        self.assertEqual(evidence['evidence']['walk_forward']['tested_folds'], 3)
        self.assertIn('fold:3', evidence['evidence'])
        proposed=proposals.proposed(round.experiment.result)
        from quant.experiments.review_contract import validate_review
        validate_review(proposed,evidence)
        with patch('quant.worker.complete', return_value=json.dumps(proposed)):
            analyze(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        next_proposal = ExperimentProposal.objects.get(run=run)
        self.assertEqual(next_proposal.data['config']['walk_forward'], config['walk_forward'])
        self.assertFalse(advance(job.pk, job.lease_token))
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(ResearchCampaignJob.objects.exists())
        self.assertFalse(ExperimentJob.objects.exists())
