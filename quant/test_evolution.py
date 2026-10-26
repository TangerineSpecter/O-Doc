"""Actual numerical transformations, search isolation and immutable lineage replay."""
import copy
import json
import random
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant import test_experiment_search as search_fixtures
from quant import test_experiment_jobs as job_fixtures
from quant import test_initial_planning as initial_fixtures
from quant.experiments.evolution import DEFAULT_POLICY, transform_recipe, validate_policy, proposals
from quant.experiments.expression import calculate
from quant.experiments.search import run_batch, recipe
from quant.experiments.snapshot import validate_attempts
from quant.experiments.derivation import build_candidate
from quant.research.contracts import digest


def transform(operator, window=None, weight=None):
    return {'version': 2, 'operator': operator, 'window': window, 'weight': weight}


def simple(column='close', units='price', boolean=False):
    expression = {'op': 'input', 'name': 'i0'}
    if boolean:
        expression = {'op': 'gt', 'args': [expression, {'op': 'constant', 'value': 2}]}
    return {'expression': expression, 'bindings': {'i0': column}, 'parameters': {}, 'parameter_names': {},
            'output_type': 'boolean_series' if boolean else 'numeric_series', 'units': units}


def fail(message):
    raise ValueError(message)


class EvolutionTests(SimpleTestCase):
    config = search_fixtures.SearchTests.config | {'evolution': DEFAULT_POLICY}

    def values(self, value, columns):
        return calculate(value['expression'], {name: columns[column] for name, column in value['bindings'].items()}, value['parameters'], expected=value['output_type'])

    def test_arithmetic_causality_missing_and_boolean_contracts(self):
        policy = DEFAULT_POLICY | {'windows': [3], 'max_nodes': 128}
        y, x = [4., 7., 9., 13., 14., 17., None, 24.], [1., 2., 3., 4., 5., 6., 7., 8.]
        columns = {'close': y, 'open': x}
        for op in ('lag', 'smooth', 'zscore', 'weighted_mean', 'residual', 'mean'):
            parents = [simple()] if op in ('lag', 'smooth', 'zscore') else [simple(), simple('open')]
            tr = transform(op, 3 if op in ('lag', 'smooth', 'zscore', 'residual') else None, .25 if op == 'weighted_mean' else None)
            value = transform_recipe(parents, tr, policy)
            output = self.values(value, columns)
            changed = {key: vals[:5] + [900., -500., 800.] for key, vals in columns.items()}
            self.assertEqual(output[:5], self.values(value, changed)[:5], op)
            if op == 'lag': self.assertEqual(output, [None, None, None, 4., 7., 9., 13., 14.])
            if op == 'smooth': self.assertAlmostEqual(output[2], 20/3)
            if op == 'zscore':
                self.assertEqual(value['units'], 'dimensionless')
                self.assertAlmostEqual(output[2], (9 - 20/3) / (((4-20/3)**2+(7-20/3)**2+(9-20/3)**2)/3)**.5)
            if op == 'weighted_mean': self.assertEqual(output[0], 1.75)
            if op == 'mean': self.assertEqual(output[0], 2.5)
            if op == 'residual':
                # Independent centered OLS oracle, with intercept and full trailing window.
                for i in range(2, 6):
                    xx, yy = x[i-2:i+1], y[i-2:i+1]
                    mx, my = sum(xx)/3, sum(yy)/3
                    beta = sum((a-mx)*(b-my) for a,b in zip(xx, yy))/sum((a-mx)**2 for a in xx)
                    self.assertAlmostEqual(output[i], y[i] - (my + beta*(x[i]-mx)), places=9)
                self.assertIsNone(output[6])
                self.assertEqual(self.values(value, {'close': y, 'open': [2.]*8}), [None]*8)
        for op in ('and', 'or', 'lag'):
            value = transform_recipe([simple(boolean=True)] * (1 if op == 'lag' else 2), transform(op, 3 if op == 'lag' else None), policy)
            actual = self.values(value, {'close': x})
            self.assertEqual(actual[3], False if op == 'lag' else True)
        with self.assertRaises(ValidationError): transform_recipe([simple(boolean=True)], transform('smooth', 3), policy)
        with self.assertRaises(ValidationError): transform_recipe([simple(), simple('open', 'volume')], transform('weighted_mean', weight=.25), policy)
        with self.assertRaises(ValidationError): transform_recipe([simple(), simple('open')], transform('residual', 3), policy | {'max_nodes': 8})

    def test_reproducible_multiple_generations_holdout_blindness_and_failure_records(self):
        parents = [search_fixtures.seed(variants=False)]
        config = self.config | {'max_candidates': 20}
        output = run_batch(search_fixtures.data(), parents, config)
        self.assertEqual(output, run_batch(search_fixtures.data(), parents, config))
        mutations = [row for row in output['attempts'] if row['operation'] == 'formula_mutation']
        self.assertEqual({row['generation'] for row in mutations}, {1, 2})
        self.assertTrue(any(row['status'] == 'evaluated' for row in mutations))
        self.assertTrue(any(row['status'] == 'rejected' and row['reason'] for row in mutations))
        self.assertLessEqual(len(output['attempts']), 20)
        validate_attempts(output['attempts'], {'seeds': parents, 'config': config, 'engine_version': output['engine_version']}, fail)
        changed = search_fixtures.data()
        for bar in changed['rows'][output['partitions']['holdout'][0]:]:
            for column in ('open', 'high', 'low', 'close'): bar[column] *= .5
        rerun = run_batch(changed, parents, config)
        self.assertEqual(output['attempts'], rerun['attempts'])
        self.assertEqual(output['selected_id'], rerun['selected_id'])
        # Proposal order never reads validation metrics either.
        altered = copy.deepcopy(output['attempts'])
        for row in altered: row['metrics'].pop('validation', None)
        self.assertEqual(list(proposals(output['attempts'], DEFAULT_POLICY, random.Random(42), 3)), list(proposals(altered, DEFAULT_POLICY, random.Random(42), 3)))

    def test_policy_budget_validation_and_rehashed_lineage_tamper(self):
        for patch in ({'operators': ['unknown']}, {'windows': [True]}, {'weights': [0]}, {'max_nodes': 129}):
            with self.assertRaises(ValidationError): validate_policy(DEFAULT_POLICY | patch)
        seeds = [search_fixtures.seed(variants=False)]
        for config in (None, self.config | {'generations': 1}, self.config | {'max_candidates': 1}):
            with self.assertRaises(ValidationError): run_batch(search_fixtures.data(), seeds, config)
        output = run_batch(search_fixtures.data(), seeds, self.config)
        plan = {'seeds': seeds, 'config': self.config, 'engine_version': output['engine_version']}
        row = next(item for item in output['attempts'] if item['operation'] == 'formula_mutation' and item['status'] == 'evaluated')
        for key, value in [('parents', [row['id']]), ('generation', 0), ('transformation', transform('lag', 999)), ('requested_parameters', {})]:
            altered = copy.deepcopy(output['attempts']); altered[int(row['id'].split('-')[1])-1][key] = value
            with self.assertRaises((ValueError, ValidationError)): validate_attempts(altered, plan, fail)
        altered = copy.deepcopy(output['attempts']); forged = altered[int(row['id'].split('-')[1])-1]
        forged['operation'] = 'mean'; forged.pop('transformation')
        with self.assertRaisesRegex(ValueError, '变换记录'): validate_attempts(altered, plan, fail)
        altered = copy.deepcopy(output['attempts']); bad = altered[int(row['id'].split('-')[1])-1]
        bad['recipe']['parameters']['p0'] = 19
        bad['fingerprint'] = digest({key: bad['recipe'][key] for key in ('expression', 'bindings', 'parameters', 'output_type', 'units')})
        with self.assertRaisesRegex(ValueError, '公式'): validate_attempts(altered, plan, fail)

    def test_transformed_descendants_preserve_contracts_and_outputs(self):
        seeds = [search_fixtures.seed('a', variants=False), search_fixtures.seed('b', 8, False)]
        seeds[1]['bindings']['close'] = 'open'
        config = self.config | {'max_candidates': 24, 'evolution': DEFAULT_POLICY | {'operators': ['lag', 'smooth', 'weighted_mean']}}
        output = run_batch(search_fixtures.data(), seeds, config)
        plan = {'seeds': seeds, 'name': 'test evolution', 'engine_version': output['engine_version'], 'dataset_hash': 'fixture'}
        columns = {column: [bar[column] for bar in search_fixtures.data()['rows']] for column in ('close', 'open')}
        for item in output['attempts']:
            if item['operation'] != 'formula_mutation' or item['status'] != 'evaluated': continue
            candidate = build_candidate('request', 'checkpoint', plan, search_fixtures.data(), output['attempts'], item)
            trial = recipe(candidate, {row['name']: row['name'] for row in candidate['inputs']}, {p['name']: json.loads(p['default_value']) for p in candidate['parameters']})
            self.assertEqual(self.values(trial, columns), self.values(item['recipe'], columns))
            self.assertEqual(candidate['derivation']['transformation'], item['transformation'])
            self.assertTrue(all(p['category'] == 'signal' for p in candidate['parameters']))


class EvolutionIntegrationTests(TestCase):
    setUp = job_fixtures.ExperimentJobsTests.setUp
    collect = job_fixtures.ExperimentJobsTests.collect
    publish = job_fixtures.ExperimentJobsTests.publish
    prepare = job_fixtures.ExperimentJobsTests.prepare
    start = job_fixtures.ExperimentJobsTests.start

    def test_api_worker_export_sync_and_replay_never_restore_execution(self):
        from quant.experiments.worker import execute
        from quant.models import ExperimentJob, FactorCandidate
        from quant.sync import metadata, validate
        from utils.sync_manager import SyncManager
        from quant.exports.service import bundle
        original, dataset = self.prepare()
        self.input['config'] = copy.deepcopy(EvolutionTests.config)
        self.input['config']['evolution']['operators'] = getattr(self, 'operators', ['zscore', 'lag'])
        request = self.start()
        self.assertEqual(request.plan['engine_version'], 'quant-local-search-3')
        self.assertEqual(self.start().pk, request.pk)
        execute(request.job.pk)
        output = request.result.data['output']
        self.assertEqual(request.result.data['status'], 'completed')
        self.assertTrue(any(item['operation'] == 'formula_mutation' for item in output['attempts']))
        # Export an actual evaluated mutation, whether or not it wins the frontier.
        item = next(row for row in output['attempts'] if row['operation'] == 'formula_mutation' and row['status'] == 'evaluated')
        generated = build_candidate(request.pk, 'test-checkpoint', request.plan, dataset.snapshot, output['attempts'], item)
        original.data = generated
        exported = bundle(original, 'python')
        namespace = {}; exec(compile(exported['code'], '<generated-evolution-test>', 'exec'), namespace)
        expected = calculate(item['recipe']['expression'], {name: [bar[column] for bar in dataset.snapshot['rows']] for name,column in item['recipe']['bindings'].items()}, item['recipe']['parameters'])
        actual = namespace['calculate'](dataset.snapshot['rows'])
        for a,b in zip(actual, expected):
            if b is None: self.assertIsNone(a)
            else: self.assertAlmostEqual(a,b,places=8)
        snapshot = SyncManager().build_snapshot_data()
        self.assertEqual(metadata(snapshot)['quant_schema_version'], 62)
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(ExperimentJob.objects.exists())
        self.start()
        self.assertFalse(ExperimentJob.objects.exists())
        self.assertTrue(FactorCandidate.objects.exists())


class EvolutionPlanningTests(TestCase):
    setUp = initial_fixtures.InitialPlanningTests.setUp
    collect = initial_fixtures.InitialPlanningTests.collect
    ready = initial_fixtures.InitialPlanningTests.ready
    dataset = initial_fixtures.InitialPlanningTests.dataset

    def test_source_ai_plan_campaign_review_and_next_round_preserve_evolution(self):
        from unittest.mock import patch
        from quant.models import ExperimentProposal, ResearchCampaign, ResearchCampaignJob, ExperimentJob
        from quant.experiments.campaigns.worker import advance
        from quant.experiments.worker import execute as compute
        from quant.worker import execute as analyze
        from quant import test_experiment_proposals as proposal_fixtures
        from quant.experiments.review_evidence import for_result
        from quant.sync import validate, metadata
        from utils.sync_manager import SyncManager
        response = initial_fixtures.initial_response()
        config = response['initial_proposal']['config']
        config.update(generations=3, evolution=copy.deepcopy(DEFAULT_POLICY | {'operators': getattr(self, 'operators', ['lag', 'zscore'])}))
        self.ready(response)
        proposal, dataset = ExperimentProposal.objects.get(), self.dataset()
        self.assertEqual(proposal.data['config']['evolution'], config['evolution'])
        body = self.client.post(f'/api/quant/{self.collection.pk}/campaigns/', {
            'request_key': 'evolution_campaign_01', 'name': '公式连续研究', 'proposal_id': proposal.pk,
            'dataset_ids': [dataset.pk], 'max_rounds': 1, 'max_attempts': 8, 'compute_seconds': 5,
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
        mutation = next(row for row in round.experiment.result.data['output']['attempts'] if row['operation'] == 'formula_mutation')
        self.assertEqual(evidence['evidence'][mutation['id']]['transformation'], mutation['transformation'])
        with patch('quant.worker.complete', return_value=json.dumps(proposal_fixtures.proposed(round.experiment.result))):
            analyze(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        next_proposal = ExperimentProposal.objects.get(run=run)
        self.assertEqual(next_proposal.data['config']['evolution'], config['evolution'])
        self.assertFalse(advance(job.pk, job.lease_token))
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(ResearchCampaignJob.objects.exists())
        self.assertFalse(ExperimentJob.objects.exists())
