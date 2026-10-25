"""Declared arithmetic survives AI planning, calculation, namespacing and restore."""
import copy
import json
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError

from quant.parameters import conditions, domains
from quant import test_parameter_conditions as conditional
from quant import test_parameter_domains as existing
from quant import test_experiment_search as fixtures
from quant.experiments.search import recipe, run_batch, combine
from quant.experiments.derivation import build_candidate


def parameters():
    rows = conditional.parameters()
    rows[0]['domain'].update(version=4, conditions=[{
        'when': conditional.compare('enabled', 'eq', True),
        'require': {'operator': 'lte', 'left': {'operator': 'add',
            'left': {'operator': 'mul', 'left': {'parameter': 'N'}, 'right': {'value': 2}},
            'right': {'parameter': 'slow'}}, 'right': {'value': 70}},
    }])
    return rows


def response():
    value = conditional.response()
    rows = parameters()
    rows[0]['default_value'] = '20'
    rows[1]['default_value'] = '26'
    value['parameters'] = copy.deepcopy(rows)
    value['factors'][0]['parameters'] = rows
    value['initial_proposal']['seeds'][0]['variants'] = [[
        {'name': 'N', 'value': 15}, {'name': 'slow', 'value': 26}, {'name': 'enabled', 'value': True},
    ]]
    return value


class ArithmeticFlowTests(SimpleTestCase):
    def test_initial_ai_suggestion_is_checked_against_declared_arithmetic(self):
        from quant.research.analysis import validate_analysis
        valid = response()
        self.assertEqual(validate_analysis(valid)['parameters'][0]['domain'], valid['parameters'][0]['domain'])
        invalid = copy.deepcopy(valid)
        invalid['initial_proposal']['seeds'][0]['variants'][0][0]['value'] = 25
        with self.assertRaisesRegex(ValidationError, '条件约束'):
            validate_analysis(invalid)
        invalid['initial_proposal'] = None
        validate_analysis(invalid)
        with self.assertRaisesRegex(ValidationError, '约束引文'):
            domains.validate_evidence(valid['parameters'], {'code': 'unrelated source'})

    def test_rejected_variant_and_multilevel_derived_contract_keep_nested_references(self):
        seed = existing.relational_seed()
        seed['candidate']['parameters'] = parameters()
        seed['parameters'].update(slow=26, enabled=True)
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
        derived = build_candidate('request', 'checkpoint', {'name': 'arithmetic', 'seeds': [seed],
            'engine_version': output['engine_version'], 'dataset_hash': 'fixture'}, fixtures.data(), attempts, attempts[-1])
        actual = {row['name']: json.loads(row['default_value']) for row in derived['parameters']}
        domains.validate_values(derived['parameters'], actual)
        for row in derived['parameters']:
            for rule in row.get('domain', {}).get('conditions', []):
                refs = conditions.references(rule['when']) | conditions.references(rule['require'])
                self.assertLessEqual(refs, set(actual))
                n = rule['require']['left']['left']['left']['parameter']
                with self.assertRaisesRegex(ValidationError, '条件约束'):
                    domains.validate_values(derived['parameters'], actual | {n: 25})

    def test_v4_text_enum_remains_categorical_and_export_keeps_nested_contract(self):
        from types import SimpleNamespace
        from quant.test_string_parameters import seed as text_seed
        from quant.exports.service import bundle
        seed = text_seed()
        seed['candidate']['parameters'][0]['default_value'] = '5'
        row = seed['candidate']['parameters'][1]
        row['domain']['version'] = 4
        row['domain']['conditions'] = [{'when': conditional.compare('mode', 'eq', 'trend'),
            'require': {'operator': 'lte', 'left': {'operator': 'add',
                'left': {'parameter': 'N'}, 'right': {'value': 2}}, 'right': {'value': 20}}}]
        recipe(seed['candidate'], seed['bindings'], seed['parameters'])
        with self.assertRaisesRegex(ValidationError, '条件约束'):
            recipe(seed['candidate'], seed['bindings'], dict(seed['parameters'], N=20))
        candidate = SimpleNamespace(pk='arithmetic-text', data=seed['candidate'], report_id='report',
            report=SimpleNamespace(source_id='source'))
        for target in ('python', 'pine', 'mql4', 'tongdaxin'):
            with self.subTest(target=target):
                manifest = json.loads(bundle(candidate, target)['manifest_json'])
                self.assertEqual(manifest['recipe']['string_choices'], {'p1': ['trend', 'reverse']})
                constraint = manifest['parameter_domains'][0]['domain']
                self.assertEqual(constraint['version'], 4)
                self.assertEqual(constraint['conditions'][0]['require']['left']['left'], {'parameter': 'p0'})
                self.assertEqual(manifest['verification'], 'platform_compile_and_equivalence_pending')


class ArithmeticIntegrationTests(TestCase):
    setUp = existing.DomainIntegrationTests.setUp
    collect = existing.DomainIntegrationTests.collect
    dataset = existing.DomainIntegrationTests.dataset

    def test_report_api_worker_export_and_restore_enforce_exact_frozen_arithmetic(self):
        from quant.models import AIRun, FactorCandidate, ExperimentProposal, ExperimentJob, ExperimentRequest
        from quant.worker import execute
        from quant.experiments.worker import execute as compute
        from quant.experiments.campaigns.contracts import experiment_input
        from quant.exports.service import bundle
        from quant.sync import metadata, validate
        from quant.research.contracts import digest
        from utils.sync_manager import SyncManager, SyncError
        self.collect()
        run = AIRun.objects.get()
        value = response()
        for row in value['parameters'] + value['factors'][0]['parameters']:
            if 'domain' in row:
                row['domain']['evidence'] = [{'field': 'code', 'quote': run.source.payload['code']}]
        with patch('quant.worker.complete', return_value=json.dumps(value)):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        factor = FactorCandidate.objects.get()
        proposal = ExperimentProposal.objects.get()
        detail = self.client.get(f'/api/quant/{self.collection.pk}/factors/{factor.pk}/').json()['data']
        self.assertEqual(detail['data']['parameters'][0]['domain']['version'], 4)
        path = f'/api/quant/{self.collection.pk}/experiments/'
        plan = experiment_input(proposal, self.dataset().pk, 'arithmetic_experiment_0001')
        invalid = copy.deepcopy(plan)
        next(row for row in invalid['seeds'][0]['parameters'] if row['name'] == 'N')['value'] = 25
        rejected = self.client.post(path, invalid, format='json')
        self.assertEqual(rejected.status_code, 400, rejected.data)
        self.assertIn('条件约束', str(rejected.data))
        self.assertFalse(ExperimentJob.objects.exists())
        plan['seeds'][0]['variants'].append([dict(row, value=25) if row['name'] == 'N' else dict(row)
            for row in plan['seeds'][0]['parameters']])
        created = self.client.post(path, plan, format='json')
        self.assertEqual(created.status_code, 200, created.data)
        request = ExperimentRequest.objects.get(pk=created.data['data']['id'])
        compute(request.job.pk)
        attempts = request.result.data['output']['attempts']
        self.assertTrue(any(row['status'] == 'rejected' and '条件约束' in row['reason'] for row in attempts))
        self.assertTrue(any(row['status'] == 'evaluated' for row in attempts))
        for target in ('python', 'pine', 'mql4', 'tongdaxin'):
            manifest = json.loads(bundle(factor, target)['manifest_json'])
            rule = manifest['parameter_domains'][0]['domain']['conditions'][0]
            self.assertEqual(rule['when']['left'], {'parameter': 'p1'})
            self.assertEqual(rule['require']['left']['left']['left'], {'parameter': 'p0'})
            self.assertEqual(rule['require']['left']['right'], {'parameter': 'p2'})
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(FactorCandidate.objects.get(pk=factor.pk).data, factor.data)
        self.assertFalse(ExperimentJob.objects.exists())
        forged = copy.deepcopy(snapshot)
        fields = next(row['fields'] for row in forged if row['model'] == 'quant.factorcandidate' and str(row['pk']) == factor.pk)
        fields['data']['parameters'][0]['domain']['conditions'][0]['require']['left']['left']['operator'] = 'div'
        fields['content_hash'] = digest(fields['data'])
        with self.assertRaises(SyncError):
            validate(forged, metadata(forged))
