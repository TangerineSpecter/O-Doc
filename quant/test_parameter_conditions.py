"""Conditional declarations follow source → experiment → derived contract → sync."""
import copy
from itertools import product
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant.parameters import conditions, domains
from quant import test_parameter_domains as existing
from quant import test_experiment_search as fixtures
from quant.experiments.search import recipe, run_batch, combine
from quant.experiments.derivation import build_candidate
from quant.research.analysis import validate_analysis


def compare(name, op, value=None, *, other=None):
    return {'operator': op, 'left': {'parameter': name},
            'right': {'parameter': other} if other is not None else {'value': value}}


def rules():
    return [{'when': compare('enabled', 'eq', True), 'require': compare('N', 'lt', other='slow')}]


def parameters():
    seed = existing.relational_seed()
    rows = seed['candidate']['parameters']
    rows[0]['domain'] = existing.domain(version=2, relations=[], conditions=rules())
    rows.append(dict(copy.deepcopy(rows[1]), name='enabled', type='bool', default_value='true'))
    rows[-1].pop('domain')
    return rows


def response():
    value = existing.response()
    rows = parameters()
    rows[0]['default_value'] = '20'
    rows[1]['default_value'] = '26'
    value['parameters'] = copy.deepcopy(rows)
    value['factors'][0]['parameters'] = rows
    for variant in value['initial_proposal']['seeds'][0]['variants']:
        variant.extend([{'name': 'slow', 'value': 26}, {'name': 'enabled', 'value': True}])
    return value


class ConditionalContractTests(SimpleTestCase):
    def test_nested_truth_table_and_implication_do_not_rewrite_values(self):
        rows = parameters()
        rows[0]['domain']['conditions'] = [{'when': {'operator': 'all', 'arguments': [compare('enabled', 'eq', True),
            {'operator': 'not', 'argument': compare('slow', 'eq', 10)}]},
            'require': {'operator': 'any', 'arguments': [compare('N', 'lt', other='slow'), compare('N', 'eq', 30)]}}]
        original = copy.deepcopy(rows)
        for enabled, n, slow in product((True, False), (5, 20, 30), (10, 20)):
            values = {'enabled': enabled, 'N': n, 'slow': slow}
            allowed = not (enabled and slow != 10) or n < slow or n == 30
            if allowed: domains.validate_values(rows, values)
            else:
                with self.assertRaisesRegex(ValidationError, '条件约束'): domains.validate_values(rows, values)
        self.assertEqual(rows, original)
        self.assertIn('当 (enabled = true 且 非(slow = 10)) 时，要求 (N < slow 或 N = 30)', domains.describe('N', rows[0]['domain']))

    def test_false_antecedent_does_not_hide_bad_types_missing_values_or_unknown_dependencies(self):
        rows = parameters()
        for values in ({'enabled': False, 'N': 5}, {'enabled': False, 'N': 5, 'slow': True},
                {'enabled': 0, 'N': 5, 'slow': 20}, {'enabled': False, 'N': 31, 'slow': 20}):
            with self.subTest(values=values), self.assertRaises(ValidationError): domains.validate_values(rows, values)
        rows[0]['domain']['conditions'][0]['require'] = compare('N', 'lt', other='unknown')
        with self.assertRaises(ValidationError): domains.validate_contract(rows)

    def test_shapes_types_bounds_and_versions_fail_closed(self):
        valid = parameters()[0]['domain']
        invalid = [dict(valid, version=1), dict(valid, conditions=[]), dict(valid, conditions=rules()*9),
            dict(valid, conditions=[{'when': compare('N', 'gt', 0)}])]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValidationError): domains.validate_domain(value)
        predicate = compare('N', 'gt', 0)
        for _ in range(6): predicate = {'operator': 'not', 'argument': predicate}
        too_wide = {'operator': 'all', 'arguments': [{'operator': 'any', 'arguments': [compare('N', 'eq', i) for i in range(8)]} for _ in range(4)]}
        for item in (predicate, too_wide, {'operator': 'eval', 'code': 'danger()'}, compare('N', 'gt', float('nan')),
                {'operator': 'all', 'arguments': []}, {'operator': 'eq', 'left': {'value': 1}, 'right': {'value': 1}}):
            with self.subTest(predicate=item), self.assertRaises(ValidationError): conditions.validate(item)
        for item in (compare('enabled', 'gt', True), compare('enabled', 'eq', 1), compare('N', 'eq', True)):
            with self.assertRaises(ValidationError): conditions.validate(item, {'N': 'int', 'enabled': 'bool'})
        domains.validate_domain(dict(valid, minimum=None, maximum=None, step=None, step_origin=None))
        self.assertEqual(domains.validate_domain(existing.domain()), existing.domain())

    def test_multiple_conditions_are_conjunctive_and_decimal_comparisons_are_exact(self):
        rows = [{'name': 'x', 'type': 'float', 'domain': existing.domain(version=2, minimum=None, maximum=None, step=None, step_origin=None,
            conditions=[{'when': compare('x', 'gte', 0), 'require': compare('x', 'lte', .3)},
                        {'when': compare('x', 'gte', 0), 'require': compare('x', 'ne', .2)}])}]
        for value in (-1, .1, .3): domains.validate_values(rows, {'x': value})
        for value in (.2, .30000000000000004):
            with self.assertRaises(ValidationError): domains.validate_values(rows, {'x': value})

    def test_ai_suggestions_and_evidence_remain_constrained(self):
        value = response()
        validated = validate_analysis(value)
        self.assertEqual(validated['parameters'][0]['domain']['conditions'], rules())
        value['initial_proposal']['seeds'][0]['variants'][0][0]['value'] = 30
        with self.assertRaisesRegex(ValidationError, '条件约束'): validate_analysis(value)
        value['initial_proposal'] = None
        validate_analysis(value)
        with self.assertRaisesRegex(ValidationError, '约束引文'):
            domains.validate_evidence(value['parameters'], {'code': 'not the quoted declaration'})

    def test_rejected_trials_and_nested_combination_preserve_every_reference(self):
        seed = existing.relational_seed()
        seed['candidate']['parameters'] = parameters()
        seed['parameters']['enabled'] = True
        seed['variants'] = [dict(seed['parameters'], N=25), dict(seed['parameters'], N=3)]
        output = run_batch(fixtures.data(), [seed], fixtures.SearchTests.config)
        self.assertEqual(output['attempts'][1]['status'], 'rejected')
        self.assertIn('条件约束', output['attempts'][1]['reason'])
        self.assertEqual(output['attempts'][2]['status'], 'evaluated')
        attempts = [{'id': 'attempt-1', 'operation': 'source_candidate', 'parents': [seed['id']],
            'recipe': recipe(seed['candidate'], seed['bindings'], seed['parameters'])}]
        for index in (2, 3):
            attempts.append({'id': f'attempt-{index}', 'operation': 'mean', 'parents': [attempts[-1]['id'], 'attempt-1'],
                'recipe': combine(attempts[-1]['recipe'], attempts[0]['recipe'], 'mean')})
        derived = build_candidate('request', 'checkpoint', {'name': 'conditions', 'seeds': [seed],
            'engine_version': output['engine_version'], 'dataset_hash': 'fixture'}, fixtures.data(), attempts, attempts[-1])
        import json
        values = {row['name']: json.loads(row['default_value']) for row in derived['parameters']}
        domains.validate_values(derived['parameters'], values)
        for row in derived['parameters']:
            for rule in row.get('domain', {}).get('conditions', []):
                self.assertLessEqual(conditions.references(rule['when']) | conditions.references(rule['require']), set(values))
                names = rule['require']
                with self.assertRaises(ValidationError):
                    domains.validate_values(derived['parameters'], values | {names['left']['parameter']: values[names['right']['parameter']]})


class ConditionalIntegrationTests(TestCase):
    setUp = existing.DomainIntegrationTests.setUp
    collect = existing.DomainIntegrationTests.collect
    dataset = existing.DomainIntegrationTests.dataset

    def test_report_api_compute_export_restore_and_inner_condition_tampering(self):
        with patch('quant.test_parameter_domains.response', return_value=response()):
            # Exercises immutable reports, initial plans, API rejection, worker,
            # export, snapshot restore and absence of restored execution authority.
            existing.DomainIntegrationTests.test_api_proposal_execution_export_and_sync_preserve_constraints(self)
        from quant.models import FactorCandidate, ExperimentProposal, ExperimentJob
        from quant.experiments.campaigns.contracts import experiment_input
        from quant.exports.service import bundle
        from quant.research.contracts import digest
        from quant.sync import metadata, validate
        from utils.sync_manager import SyncManager, SyncError
        import json
        candidate = FactorCandidate.objects.get(derived_checkpoint_id='')
        manifest = json.loads(bundle(candidate, 'python')['manifest_json'])
        rule = manifest['parameter_domains'][0]['domain']['conditions'][0]
        self.assertEqual(rule['when']['left']['parameter'], 'p1')
        self.assertEqual(rule['require']['right']['parameter'], 'p2')
        data = experiment_input(ExperimentProposal.objects.get(), self.dataset().pk, 'conditional_invalid_01')
        for row in data['seeds'][0]['parameters']:
            if row['name'] == 'N': row['value'] = 30
        rejected = self.client.post(f'/api/quant/{self.collection.pk}/experiments/', data, format='json')
        self.assertEqual(rejected.status_code, 400)
        self.assertIn('条件约束', str(rejected.data))
        self.assertFalse(ExperimentJob.objects.exists())
        snapshot = SyncManager().build_snapshot_data()
        fields = next(row['fields'] for row in snapshot if row['model'] == 'quant.factorcandidate' and str(row['pk']) == candidate.pk)
        fields['data']['parameters'][0]['domain']['conditions'][0]['require']['operator'] = 'gt'
        fields['content_hash'] = digest(fields['data'])
        with self.assertRaises(SyncError): validate(snapshot, metadata(snapshot))
