"""Executable declaration constraints across proposals, experiments, derivation and sync."""
import copy
import json
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant.parameters import domains
from quant import test_initial_planning as initial
from quant import test_experiment_search as search_fixtures
from quant.research.analysis import validate_analysis, validate_source_evidence
from quant.experiments.search import recipe, run_batch, combine
from quant.experiments.derivation import build_candidate
from quant.research.contracts import digest


def domain(**changes):
    return {'version': 1, 'minimum': 1, 'maximum': 30, 'step': 1, 'step_origin': 0,
        'choices': [], 'relations': [], 'evidence': [{'field': 'code', 'quote': 'input.int(20, minval=1, maxval=30, step=1)'}], **changes}


def response():
    value = initial.initial_response()
    value['factors'][0]['parameters'][0]['domain'] = domain()
    value['parameters'] = copy.deepcopy(value['factors'][0]['parameters'])
    return value


def relational_seed(identity='parent-1'):
    seed = search_fixtures.seed(identity, 5, False)
    fast = seed['candidate']['parameters'][0]
    fast['domain'] = domain(relations=[{'operator': 'lt', 'parameter': 'slow'}])
    slow = dict(copy.deepcopy(fast), name='slow', default_value='20', domain=domain())
    seed['candidate']['parameters'].append(slow)
    seed['parameters']['slow'] = 20
    return seed


class DomainContractTests(SimpleTestCase):
    def test_unknowns_and_legacy_outputs_are_not_rewritten(self):
        old = initial.initial_response()
        validated = validate_analysis(old)
        self.assertNotIn('domain', validated['factors'][0]['parameters'][0])
        self.assertEqual(validate_analysis(validated), validated)
        self.assertEqual(validate_analysis(response())['parameters'][0]['domain'], domain())

    def test_bounds_enums_steps_types_and_relationships(self):
        seed = relational_seed()
        def attempt(values):
            return recipe(seed['candidate'], seed['bindings'], values)
        attempt({'N': 3, 'slow': 20})
        for values in ({'N': 0, 'slow': 20}, {'N': 31, 'slow': 20}, {'N': True, 'slow': 20},
                {'N': 3.5, 'slow': 20}, {'N': 20, 'slow': 20}, {'N': 21, 'slow': 20}):
            with self.subTest(values=values), self.assertRaises(ValidationError): attempt(values)
        seed['candidate']['parameters'][0]['domain']['choices'] = [3, 5]
        with self.assertRaisesRegex(ValidationError, '枚举'): attempt({'N': 4, 'slow': 20})
        row = {'name': 'x', 'type': 'float', 'domain': domain(minimum=0, maximum=1, step=.1, choices=[])}
        domains.validate_values([row], {'x': .3})
        with self.assertRaisesRegex(ValidationError, '步长'): domains.validate_values([row], {'x': .31})
        row['domain'] = domain(minimum=None, maximum=None, step=1e-308, step_origin=0)
        domains.validate_values([row], {'x': 1e308})
        row = {'name': 'enabled', 'type': 'bool', 'domain': domain(minimum=None, maximum=None, step=None, step_origin=None, choices=[True])}
        domains.validate_values([row], {'enabled': True})
        for value in (1, False):
            with self.assertRaises(ValidationError): domains.validate_values([row], {'enabled': value})

    def test_malformed_domains_missing_references_and_invented_quotes_fail_closed(self):
        for change in ({'version': True}, {'maximum': 0}, {'minimum': True}, {'step': 0}, {'step_origin': None},
                {'choices': ['a']}, {'choices': [3, 3]}, {'maximum': float('nan')}, {'evidence': []},
                {'relations': [{'operator': 'eval', 'parameter': 'slow'}]}, {'arbitrary': 'ignored?'}):
            with self.subTest(change=change), self.assertRaises(ValidationError): domains.validate_domain(domain(**change))
        seed = relational_seed()
        for name in ('N', 'missing'):
            seed['candidate']['parameters'][0]['domain']['relations'][0]['parameter'] = name
            with self.assertRaises(ValidationError): domains.validate_contract(seed['candidate']['parameters'])
        value = response()
        value['factors'][0]['evidence'] = [{'field': 'code', 'quote': 'actual code'}]
        with self.assertRaisesRegex(ValidationError, '约束引文'):
            validate_source_evidence(validate_analysis(value), {'code': 'actual code'})
        validate_source_evidence(validate_analysis(value), {'code': 'actual code\n' + domain()['evidence'][0]['quote']})

    def test_ai_plans_cannot_suggest_out_of_domain_parameters_or_silently_fix_defaults(self):
        for value in (31, 0, True, 15.5):
            row = response()
            row['initial_proposal']['seeds'][0]['variants'][0][0]['value'] = value
            with self.subTest(value=value), self.assertRaises(ValidationError): validate_analysis(row)
        row = response(); row['factors'][0]['parameters'][0]['default_value'] = '99'
        with self.assertRaises(ValidationError): validate_analysis(row)
        row['initial_proposal'] = None
        self.assertEqual(validate_analysis(row)['factors'][0]['parameters'][0]['default_value'], '99')

    def test_invalid_trials_remain_visible_and_combined_descendants_keep_scoped_relations(self):
        seed = relational_seed()
        seed['variants'] = [{'N': 25, 'slow': 20}, {'N': 3, 'slow': 20}]
        result = run_batch(search_fixtures.data(), [seed], search_fixtures.SearchTests.config)
        self.assertEqual(result['attempts'][1]['status'], 'rejected')
        self.assertIn('N < slow', result['attempts'][1]['reason'])
        self.assertEqual(result['attempts'][2]['status'], 'evaluated')
        seeds = [relational_seed('one'), relational_seed('two')]
        attempts = [{'id': f'attempt-{i}', 'operation': 'source_candidate', 'parents': [item['id']],
            'recipe': recipe(item['candidate'], item['bindings'], item['parameters'])} for i, item in enumerate(seeds, 1)]
        attempts.append({'id': 'attempt-3', 'operation': 'mean', 'parents': ['attempt-1', 'attempt-2'],
            'recipe': combine(attempts[0]['recipe'], attempts[1]['recipe'], 'mean')})
        attempts.append({'id': 'attempt-4', 'operation': 'mean', 'parents': ['attempt-3', 'attempt-1'],
            'recipe': combine(attempts[2]['recipe'], attempts[0]['recipe'], 'mean')})
        plan = {'name': 'scoped', 'engine_version': result['engine_version'], 'dataset_hash': 'fixture', 'seeds': seeds}
        derived = build_candidate('request', 'checkpoint', plan, search_fixtures.data(), attempts, attempts[-1])
        domains.validate_contract(derived['parameters'])
        values = {row['name']: json.loads(row['default_value']) for row in derived['parameters']}
        domains.validate_values(derived['parameters'], values)
        constrained = next(row for row in derived['parameters'] if row['domain']['relations'])
        other = constrained['domain']['relations'][0]['parameter']
        with self.assertRaises(ValidationError):
            domains.validate_values(derived['parameters'], values | {constrained['name']: values[other]})


class DomainIntegrationTests(TestCase):
    setUp = initial.InitialPlanningTests.setUp
    collect = initial.InitialPlanningTests.collect
    dataset = initial.InitialPlanningTests.dataset

    def test_api_proposal_execution_export_and_sync_preserve_constraints(self):
        from quant.models import AIRun, FactorCandidate, ExperimentProposal, ExperimentJob, ExperimentRequest
        from quant.worker import execute
        from quant.experiments.worker import execute as calculate
        from quant.experiments.campaigns.contracts import experiment_input
        from quant.exports.service import bundle
        from quant.sync import metadata, validate
        from utils.sync_manager import SyncManager, SyncError
        # The fixed intake fixture has code "close - sma(close, 20)"; bind domain
        # evidence to the actual material, not to our hypothetical declaration.
        entry = self.collect()
        run = AIRun.objects.get()
        value = response()
        quote = run.source.payload['code']
        for row in value['parameters'] + value['factors'][0]['parameters']:
            if 'domain' in row:
                row['domain']['evidence'] = [{'field': 'code', 'quote': quote}]
        with patch('quant.worker.complete', return_value=json.dumps(value)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        candidate, proposal = FactorCandidate.objects.get(), ExperimentProposal.objects.get()
        detail = self.client.get(f'/api/quant/{self.collection.pk}/factors/{candidate.pk}/').json()['data']
        self.assertEqual(detail['data']['parameters'][0]['domain']['stepOrigin'], 0)
        markdown = self.client.get(f'/api/quant/{self.collection.pk}/entries/{entry.pk}/').json()['data']['reports'][0]['markdown']
        self.assertIn('本机实验将检查', markdown)
        request_input = experiment_input(proposal, self.dataset().pk, 'domain_experiment_0001')
        invalid = copy.deepcopy(request_input); invalid['seeds'][0]['parameters'][0]['value'] = 31
        path = f'/api/quant/{self.collection.pk}/experiments/'
        rejected = self.client.post(path, invalid, format='json')
        self.assertEqual(rejected.status_code, 400, rejected.data)
        self.assertFalse(ExperimentJob.objects.exists())
        request_input['seeds'][0]['variants'].append([dict(row, value=31) if row['name'] == 'N' else dict(row)
            for row in request_input['seeds'][0]['parameters']])
        created = self.client.post(path, request_input, format='json')
        self.assertEqual(created.status_code, 200, created.data)
        request = ExperimentRequest.objects.get(pk=created.data['data']['id'])
        calculate(request.job.pk)
        attempts = request.result.data['output']['attempts']
        self.assertTrue(any(row['status'] == 'rejected' and '上限' in row['reason'] for row in attempts))
        manifest = json.loads(bundle(candidate, 'python')['manifest_json'])
        self.assertEqual(manifest['parameter_domains'][0]['name'], 'p0')
        self.assertEqual(manifest['parameter_domains'][0]['domain']['maximum'], 30)
        snapshot = SyncManager().build_snapshot_data()
        self.assertEqual(metadata(snapshot)['quant_schema_version'], 53)
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(FactorCandidate.objects.get(pk=candidate.pk).data, candidate.data)
        self.assertFalse(ExperimentJob.objects.exists())
        forged = copy.deepcopy(snapshot)
        fields = next(row['fields'] for row in forged if row['model'] == 'quant.factorcandidate' and str(row['pk']) == candidate.pk)
        fields['data']['parameters'][0]['domain']['maximum'] = 999
        fields['content_hash'] = digest(fields['data'])
        with self.assertRaises(SyncError): validate(forged, metadata(forged))
