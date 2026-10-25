"""Automatic scoped admission; positive, negative and unverified evidence coexist."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase, SimpleTestCase
from quant.test_factors import extracted
from quant.verification.structure import qualification
from quant import test_factor_curation as curation
from quant import test_experiment_jobs as jobs
from quant.models import FactorCandidate, FactorQualification, FactorEvidenceLink, Job
from quant.research.contracts import digest
from quant.sync import metadata, validate
from utils.sync_manager import SyncManager, SyncError


class QualificationContractTests(SimpleTestCase):
    def test_type_and_dependency_checks_do_not_compute_or_claim_platform_equivalence(self):
        value = extracted()['factors'][0]
        with patch('quant.experiments.expression.calculate') as compute: result = qualification(value)
        compute.assert_not_called()
        self.assertEqual(result['reuse_status'], 'reusable')
        self.assertTrue(result['automatic_experiment_ready'])
        self.assertEqual(result['platform_equivalence'], 'unverified')
        self.assertEqual(result['economic_effectiveness'], 'unassessed')
        known = set()
        for node in result['nodes']:
            self.assertTrue(set(node['dependencies']) <= known)
            known.add(node['id'])
        for expression in (None, {'op': 'and', 'args': [value['expression'], value['expression']]},
                           {'op': 'input', 'name': 'missing'}, {'op': 'sma', 'args': [{'op': 'input', 'name': 'close'}, {'op': 'constant', 'value': 2001}]}):
            checked = qualification(dict(value, expression=expression))
            self.assertEqual(checked['reuse_status'], 'candidate')
            self.assertTrue(checked['blockers'])
        value['parameters'][0]['default_value'] = ''
        result = qualification(value)
        self.assertEqual(result['reuse_status'], 'reusable')
        self.assertFalse(result['automatic_experiment_ready'])
        self.assertEqual(result['configuration']['status'], 'needs_values')

    def test_unknown_inputs_strings_and_boolean_arithmetic_stay_explicit(self):
        value = extracted()['factors'][0]
        value['inputs'].append(dict(value['inputs'][0], name='upstream_signal'))
        result = qualification(value)
        self.assertEqual(result['inputs_requiring_mapping'], ['upstream_signal'])
        self.assertFalse(result['automatic_experiment_ready'])
        value['parameters'][0].update(type='bool', default_value='true')
        self.assertEqual(qualification(value)['reuse_status'], 'candidate')
        value['parameters'][0].update(type='string', default_value='"trend"')
        value['expression'] = {'op': 'eq', 'args': [{'op': 'parameter', 'name': 'N'}, {'op': 'constant', 'value': 'trend'}]}
        value['output_type'] = 'boolean_series'
        self.assertEqual(qualification(value)['reuse_status'], 'candidate')


class VerificationIntegrationTests(TestCase):
    setUp = curation.CurationTests.setUp
    collect = curation.CurationTests.collect
    publish = curation.CurationTests.publish
    prepare = jobs.ExperimentJobsTests.prepare
    start = jobs.ExperimentJobsTests.start

    def verification_url(self, candidate):
        return f'/api/quant/{self.collection.pk}/factors/{candidate.pk}/verification/'

    def test_new_candidates_automatically_qualify_and_experiment_links_are_direct(self):
        from quant.experiments.worker import execute
        candidate, _ = self.prepare()
        original = copy.deepcopy(candidate.data)
        row = FactorQualification.objects.get(candidate=candidate)
        self.assertEqual(row.data['reuse_status'], 'reusable')
        self.assertEqual(candidate.qualification_version, 1)
        request = self.start(); execute(request.job.pk)
        link = FactorEvidenceLink.objects.get(candidate=candidate, kind='experiment')
        self.assertEqual(link.target_id, request.result.pk)
        self.assertTrue({'calculation', 'historical_experiment'} <= set(link.data['levels']))
        self.assertFalse(link.data['independent_validation'])
        self.assertTrue(any(attempt['status'] == 'rejected' for attempt in link.data['attempts']))
        self.assertTrue(all(attempt['operation'] in ('source_candidate', 'parameter_variant') for attempt in link.data['attempts']))
        self.assertTrue(all(row['original_name'] in {p['name'] for p in candidate.data['parameters']}
            for attempt in link.data['attempts'] for row in attempt['parameters']))
        self.assertTrue(all(row['name'] in {p['name'] for p in candidate.data['inputs']}
            for attempt in link.data['attempts'] for row in attempt['bindings']))
        selected = request.result.data['output']['selected_id']
        evaluated = {row['id'] for row in link.data['attempts'] if row['status'] == 'evaluated'}
        self.assertEqual(bool(link.data['heldout']), selected in evaluated)
        for derived in FactorCandidate.objects.exclude(derived_checkpoint_id=''):
            linked = FactorEvidenceLink.objects.get(candidate=derived, target_id=request.result.pk)
            self.assertEqual([row['id'] for row in linked.data['attempts']], [derived.data['derivation']['attempt_id']])
            self.assertTrue(all(row['original_name'] in {p['name'] for p in derived.data['parameters']}
                for attempt in linked.data['attempts'] for row in attempt['parameters']))
            self.assertTrue(all(row['name'] in {p['name'] for p in derived.data['inputs']}
                for attempt in linked.data['attempts'] for row in attempt['bindings']))
        response = self.client.get(self.verification_url(candidate)).json()['data']
        self.assertEqual(response['reuseStatus'], 'reusable')
        self.assertEqual(response['total'], 1)
        self.assertFalse(response['independentValidation'])
        self.assertEqual(candidate.data, original)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        with patch('quant.worker.dispatch') as model, patch('quant.experiments.worker.dispatch') as runner:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        model.assert_not_called(); runner.assert_not_called(); self.assertFalse(Job.objects.exists())
        self.assertEqual(FactorEvidenceLink.objects.filter(candidate=candidate).count(), 1)

    def test_authored_version_does_not_inherit_ancestor_evidence_and_legacy_backfill_is_bounded(self):
        from quant.experiments.worker import execute
        from quant.factors.versions.presentation import definition_json
        candidate, _ = self.prepare(); request = self.start(); execute(request.job.pk)
        definition = json.loads(definition_json(candidate)); definition['name'] = '独立的新公式'
        definition['expression'] = {'op': 'neg', 'args': [definition['expression']]}
        response = self.client.post(f'/api/quant/{self.collection.pk}/factors/{candidate.pk}/formula-versions/',
            {'request_key': 'verification_authored01', 'reason': '检验独立版本', 'definition_json': json.dumps(definition)}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        child = FactorCandidate.objects.get(pk=response.data['data']['candidate']['id'])
        self.assertFalse(FactorEvidenceLink.objects.filter(candidate=child).exists())
        self.assertEqual(self.client.get(self.verification_url(child)).json()['data']['levels'], [])
        FactorEvidenceLink.objects.filter(candidate=candidate).delete()
        before = Job.objects.count()
        with patch('quant.worker.dispatch') as model, patch('quant.experiments.worker.dispatch') as runner:
            first = self.client.post(self.verification_url(candidate), {'kind': 'experiment', 'limit': 1}, format='json')
            again = self.client.post(self.verification_url(candidate), {'kind': 'experiment', 'limit': 1}, format='json')
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(FactorEvidenceLink.objects.filter(candidate=candidate).count(), 1)
        self.assertEqual(Job.objects.count(), before); model.assert_not_called(); runner.assert_not_called()
        self.assertEqual(self.client.post(self.verification_url(candidate), {'limit': 51}, format='json').status_code, 400)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.verification_url(candidate)).status_code, (401, 403))

    def test_user_live_report_is_explicitly_unverified_and_negative_comparison_is_retained(self):
        from quant import test_factor_comparisons as comparisons
        candidate, dataset = self.prepare()
        right = comparisons.FactorComparisonIntegrationTests.publish(self, 'verification_other_factor01', offset=1)
        side = comparisons.FactorComparisonIntegrationTests.side
        response = self.client.post(f'/api/quant/{self.collection.pk}/comparisons/', {
            'request_key': 'verification_compare001', 'name': '直接反例', 'dataset_id': dataset.pk,
            'left': side(candidate), 'right': side(right),
            'policy': {'absolute_tolerance': 0, 'relative_tolerance': 0, 'warmup_bars': 0}}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        proof = FactorEvidenceLink.objects.get(candidate=candidate, kind='comparison')
        self.assertEqual(proof.data['verdict'], 'fail')
        self.assertIn('calculation', proof.data['levels'])
        saved = self.client.post(f'/api/quant/{self.collection.pk}/entries/{candidate.report.entry_id}/feedback/', {
            'request_key': 'verification_feedback01', 'title': '用户实盘声明', 'target_source_id': candidate.report.source_id,
            'factor_id': candidate.pk, 'mode': 'live', 'document_format': 'text', 'document': '用户记录一次亏损', 'analyze': False}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        observation = FactorEvidenceLink.objects.get(candidate=candidate, kind='feedback')
        self.assertIn('user_reported_live', observation.data['levels'])
        self.assertFalse(observation.data['platform_authenticated'])
        self.assertEqual(observation.data['accounting_status'], 'unavailable')
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_forged_admission_evidence_scope_or_missing_required_record_rejected(self):
        from quant.experiments.worker import execute
        candidate, _ = self.prepare(); request = self.start(); execute(request.job.pk)
        snapshot = SyncManager().build_snapshot_data()
        FactorEvidenceLink.objects.all().delete(); FactorQualification.objects.all().delete()
        for change in ('qualification', 'evidence', 'missing'):
            value = copy.deepcopy(snapshot)
            if change == 'missing': value = [row for row in value if row['model'] != 'quant.factorqualification']
            else:
                row = next(row for row in value if row['model'] == ('quant.factorqualification' if change == 'qualification' else 'quant.factorevidencelink'))
                row['fields']['data']['platform_equivalence' if change == 'qualification' else 'independent_validation'] = 'verified' if change == 'qualification' else True
                row['fields']['content_hash'] = digest(row['fields']['data'])
            with self.assertRaises(SyncError, msg=change): validate(value, metadata(value))

    def test_old_complete_backup_prunes_new_checks_and_does_not_borrow_new_field(self):
        candidate = self.publish('verification_legacy001')
        FactorCandidate.objects.filter(pk=candidate.pk).update(qualification_version=0)
        FactorQualification.objects.filter(candidate=candidate).delete()
        snapshot = SyncManager().build_snapshot_data()
        for row in snapshot:
            if row['model'] == 'quant.factorcandidate': row['fields'].pop('qualification_version')
        meta = metadata(snapshot); meta['quant_schema_version'] = 39
        indexed = self.client.post(self.verification_url(candidate), {'kind': 'experiment'}, format='json')
        self.assertEqual(indexed.status_code, 200, indexed.data)
        self.assertTrue(FactorQualification.objects.filter(candidate=candidate).exists())
        with patch('quant.worker.dispatch') as model, patch('quant.experiments.worker.dispatch') as runner:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=meta)
        model.assert_not_called(); runner.assert_not_called()
        self.assertFalse(FactorQualification.objects.exists())
        candidate.refresh_from_db(); self.assertEqual(candidate.qualification_version, 0)
        self.assertEqual(self.client.get(self.verification_url(candidate)).json()['data']['reuseStatus'], 'unchecked')

    def test_rolling_records_are_scoped_to_actual_selected_formula_and_never_attest_unused_data(self):
        from quant.experiments.worker import execute
        from quant.experiments.temporal import DEFAULT_POLICY
        candidate, _ = self.prepare()
        self.input['config'] = {**self.input['config'], 'max_candidates': 12, 'walk_forward': DEFAULT_POLICY}
        self.input['seeds'][0]['variants'] = []
        self.input['config']['generations'] = 1
        request = self.start(); execute(request.job.pk)
        self.assertEqual(request.result.data['status'], 'completed')
        link = FactorEvidenceLink.objects.get(candidate=candidate, target_id=request.result.pk)
        self.assertEqual(len(link.data['heldout']), 3)
        self.assertIn('rolling_observation', link.data['levels'])
        self.assertFalse(link.data['independent_validation'])
        self.assertTrue(all(row['prior_usage'] == 'unattested' for row in link.data['heldout']))
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))


class QualificationWorkflowTests(TestCase):
    setUp = curation.CurationTests.setUp
    collect = curation.CurationTests.collect

    def test_new_review_and_plan_receive_static_facts_while_v4_keeps_old_prompt(self):
        from quant.models import AIRun
        from quant.worker import execute
        for index, version in enumerate((6, 4)):
            self.payload['request_key'] = f'verification_prompt_{index:04d}'
            with patch('quant.workflows.contracts.VERSION', version): entry = self.collect()
            run = AIRun.objects.get(entry=entry)
            with patch('quant.worker.complete', return_value=json.dumps(extracted())) as model: execute(run.pk)
            run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
            self.assertEqual(model.call_count, 6)
            for call in model.call_args_list[-2:]:
                self.assertEqual('portable_qualification' in call.args[1], version == 6)
                if version == 6: self.assertIn('automatic_experiment_ready', call.args[1])
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
