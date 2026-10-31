"""Synthetic engine checks for reusable descendants and immutable sync lineage."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase, SimpleTestCase
from quant import test_experiment_jobs as fixtures
from quant import test_experiment_search as search_fixtures
from quant.experiments.worker import execute
from quant.experiments.derivation import build_candidate, eligible_attempts, publish_derived, auto_index_derived
from quant.experiments.expression import calculate
from quant.experiments.search import run_batch
from quant.models import FactorCandidate, FactorFormulaVersion, ExperimentJob
from quant.sync import metadata, validate, reset_execution
from utils.sync_manager import SyncManager, SyncError


class DerivationTests(TestCase):
    setUp = fixtures.ExperimentJobsTests.setUp
    collect = fixtures.ExperimentJobsTests.collect
    publish = fixtures.ExperimentJobsTests.publish
    prepare = fixtures.ExperimentJobsTests.prepare
    start = fixtures.ExperimentJobsTests.start

    def completed(self):
        original, dataset = self.prepare()
        request = self.start()
        execute(request.job.pk)
        self.assertEqual(request.result.data['status'], 'completed')
        derived = list(FactorCandidate.objects.exclude(derived_checkpoint_id=''))
        self.assertGreater(len(derived), 0)
        self.assertLessEqual(len(derived), 3)
        return original, dataset, request, derived

    def test_reentry_preserves_outputs_parameters_and_next_round(self):
        original, dataset, request, derived = self.completed()
        publish_derived(request.result)
        self.assertEqual(FactorCandidate.objects.count(), len(derived) + 1)
        for candidate in derived:
            version = FactorFormulaVersion.objects.get(pk=candidate.formula_version_id)
            self.assertEqual(version.root_id, original.pk)
            self.assertEqual(version.candidate_id, candidate.pk)
            self.assertEqual(version.data['origin'], 'experiment')
            data = candidate.data
            self.assertEqual(data['evidence'], [])
            self.assertEqual(data['derivation']['parent_candidate_ids'], [original.pk])
            attempt = next(item for item in request.result.data['output']['attempts'] if item['id'] == data['derivation']['attempt_id'])
            recipe = attempt['recipe']
            values = {p['name']: json.loads(p['default_value']) for p in data['parameters']}
            outputs = calculate(data['expression'], {row['name']: [bar[row['name']] for bar in dataset.snapshot['rows']] for row in data['inputs']}, values, expected=data['output_type'])
            prior = calculate(recipe['expression'], {name: [bar[column] for bar in dataset.snapshot['rows']] for name, column in recipe['bindings'].items()}, recipe['parameters'], expected=recipe['output_type'])
            self.assertEqual(outputs, prior)
        candidate = derived[0]
        self.input['request_key'] = 'derived_followup_00001'
        self.input['seeds'] = [{'candidate_id': candidate.pk, 'bindings': [{'name': row['name'], 'column': row['name']} for row in candidate.data['inputs']],
            'parameters': [{'name': row['name'], 'value': json.loads(row['default_value'])} for row in candidate.data['parameters']], 'variants': []}]
        second = self.start()
        execute(second.job.pk)
        self.assertEqual(second.result.data['status'], 'completed')
        body = self.client.get(f'/api/quant/{self.collection.pk}/factors/{candidate.pk}/').json()['data']
        self.assertEqual(body['evidenceStatus'], 'local_simulation_unverified_platform')
        self.assertEqual(body['fingerprints']['raw'], '')
        graph = self.client.get(f'/api/quant/{self.collection.pk}/graph/?candidateId={candidate.pk}').json()['data']
        self.assertTrue(any(edge['kind'] == 'derived_from' for edge in graph['edges']))
        self.assertFalse(any(edge['kind'] == 'extracted_from' and edge['to'] == f'factor:{candidate.pk}' for edge in graph['edges']))
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(ExperimentJob.objects.exists())
        self.assertEqual(FactorCandidate.objects.get(pk=candidate.pk).data, candidate.data)

    def test_restore_rejects_invented_formula_reference_or_lost_parent(self):
        _, _, _, derived = self.completed()
        snapshot = SyncManager().build_snapshot_data()
        for key, value in [('derived_checkpoint_id', 'missing'), ('ordinal', 1), ('report', 'missing')]:
            altered = copy.deepcopy(snapshot)
            row = next(row for row in altered if str(row['pk']) == derived[0].pk)
            row['fields'][key] = value
            with self.assertRaises(SyncError):
                validate(altered, metadata(altered))
        altered = copy.deepcopy(snapshot)
        row = next(row for row in altered if str(row['pk']) == derived[0].pk)
        row['fields']['data']['parameters'][0]['default_value'] = '999'
        with self.assertRaises(SyncError):
            validate(altered, metadata(altered))
        # Old snapshots without the optional derivation pointer remain valid.
        self.assertTrue(all(row.derived_checkpoint_id for row in derived))

    def test_cancelled_experiment_does_not_generate_candidates(self):
        self.prepare(); request = self.start()
        self.client.post(self.path + request.pk + '/cancel/')
        execute(request.job.pk)
        self.assertFalse(FactorCandidate.objects.exclude(derived_checkpoint_id='').exists())

    def test_old_snapshot_and_revoked_index_callback(self):
        self.prepare()
        snapshot = SyncManager().build_snapshot_data()
        for row in snapshot:
            if row['model'] == 'quant.factorcandidate':
                row['fields'].pop('derived_checkpoint_id')
        from quant.testing_documents import without_documents
        snapshot = without_documents(snapshot)
        meta = metadata(snapshot) | {'quant_schema_version': 10}
        validate(snapshot, meta)
        SyncManager().apply_snapshot_data(snapshot, remote_meta=meta)
        request = self.start()
        token = request.job.lease_token
        execute(request.job.pk)
        with patch('quant.graph.indexing.queue_index') as index:
            auto_index_derived(request.result.pk, token)
            index.assert_called_once()
            index.reset_mock()
            reset_execution()
            auto_index_derived(request.result.pk, token)
            index.assert_not_called()


class DerivationContractTests(SimpleTestCase):
    def test_selection_does_not_depend_on_holdout_or_accept_interrupted_output(self):
        output = run_batch(search_fixtures.data(), [search_fixtures.seed()], search_fixtures.SearchTests.config)
        envelope = {'status': 'completed', 'output': output}
        selected = eligible_attempts(envelope)
        self.assertTrue(selected)
        changed = copy.deepcopy(envelope)
        changed['output']['holdout'] = {'total_return': 100000}
        self.assertEqual(eligible_attempts(changed), selected)
        self.assertEqual(eligible_attempts(envelope | {'status': 'cancelled'}), [])
        self.assertEqual(eligible_attempts(envelope | {'status': 'partial'}), [])
        # Every real parameter constraint/category survives namespacing.
        plan = {'name': 'Synthetic', 'engine_version': output['engine_version'], 'dataset_hash': 'fixture', 'seeds': [search_fixtures.seed()]}
        for item in selected:
            data = build_candidate('request', 'checkpoint', plan, search_fixtures.data(), output['attempts'], item)
            self.assertTrue(all(p['category'] == 'signal' and p['constraints'] == plan['seeds'][0]['candidate']['parameters'][0]['constraints'] for p in data['parameters']))

    def test_combined_parameters_keep_separate_values_roles_and_constraints(self):
        from quant.experiments.search import recipe, combine, variant_recipe
        from rest_framework.exceptions import ValidationError
        first, second = search_fixtures.seed('first', 3, False), search_fixtures.seed('second', 8, False)
        second['bindings']['close'] = 'open'
        second['candidate']['parameters'][0]['category'] = 'risk'
        second['candidate']['parameters'][0]['constraints'] = 'Risk setting must remain fixed'
        seeds = [first, second]
        attempts = [{'id': f'attempt-{index}', 'operation': 'source_candidate', 'parents': [seed['id']],
            'recipe': recipe(seed['candidate'], seed['bindings'], seed['parameters'])} for index, seed in enumerate(seeds, 1)]
        combined = combine(attempts[0]['recipe'], attempts[1]['recipe'], 'mean')
        attempt = {'id': 'attempt-3', 'operation': 'mean', 'parents': ['attempt-1', 'attempt-2'], 'recipe': combined}
        attempts.append(attempt)
        plan = {'name': 'test', 'engine_version': 'quant-local-search-1', 'dataset_hash': 'fixture', 'seeds': seeds}
        bars = search_fixtures.data()
        data = build_candidate('request', 'checkpoint', plan, bars, attempts, attempt)
        parameters = {p['name']: json.loads(p['default_value']) for p in data['parameters']}
        bindings = {row['name']: row['name'] for row in data['inputs']}
        self.assertEqual(data['derivation']['parent_candidate_ids'], ['first', 'second'])
        self.assertEqual(parameters, {'a_p0': 3, 'b_p0': 8})
        self.assertEqual(data['parameters'][1]['constraints'], 'Risk setting must remain fixed')
        self.assertEqual(calculate(data['expression'], {name: [bar[name] for bar in bars['rows']] for name in bindings}, parameters),
            calculate(combined['expression'], {name: [bar[column] for bar in bars['rows']] for name, column in combined['bindings'].items()}, combined['parameters']))
        with self.assertRaises(ValidationError):
            variant_recipe({'candidate': data, 'bindings': bindings, 'parameters': parameters}, parameters | {'b_p0': 9})

    def test_ancestry_cycles_rejected(self):
        from quant.experiments.derivation_sync import validate_ancestry
        def fail(message):
            raise ValueError(message)
        rows = {'quant.factorcandidate': {key: {'derived_checkpoint_id': 'test', 'data': {'derivation': {'parent_candidate_ids': [parent]}}}
            for key, parent in [('a', 'b'), ('b', 'a')]}}
        with self.assertRaisesRegex(ValueError, '循环'):
            validate_ancestry(rows, fail)
