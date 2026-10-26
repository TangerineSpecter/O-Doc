"""Automatic AI revisions remain distinct hypotheses with executable provenance."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase, SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant import test_research_analysis as fixtures
from quant.test_factors import extracted
from quant.test_initial_planning import initial_response
from quant.models import AIRun, FactorCandidate, FactorFormulaVersion, FactorEvidenceLink
from quant.repairs.contracts import plan, validate as validate_repair, original_definition, identifiers
from quant.sync import metadata, validate
from quant.worker import execute
from quant.research.contracts import digest
from utils.sync_manager import SyncManager, SyncError


def broken():
    value = extracted()
    value['factors'][0]['expression'] = None
    return value


def repaired():
    return {'items': [{'factor_index': 0, 'status': 'revised', 'summary': '依据原文补齐滞后比值计算，平台等价仍待核对',
        'definition': original_definition(extracted()['factors'][0]),
        'evidence': [{'field': 'code', 'quote': 'close / close.shift(N) - 1'}],
        'remaining_unknowns': ['复权和平台缺失值行为仍需验证']}]}


class RepairContractTests(SimpleTestCase):
    def test_unresolved_platform_action_still_obeys_evidence_and_unknown_bounds(self):
        factor = broken()['factors'][0]
        value = {'items':[{'factor_index':0,'status':'unresolved','summary':'平台动作无法转为纯计算',
                          'definition':None,'evidence':[{'field':'code','quote':'OrderSend(...)'}]*5,
                          'remaining_unknowns':['平台执行语义待核对']*8}]}
        self.assertEqual(validate_repair(value, [factor], {'code':'OrderSend(...)'})['items'][0]['status'], 'unresolved')
        too_many = copy.deepcopy(value)
        too_many['items'][0]['evidence'].append({'field':'code','quote':'OrderSend(...)'})
        with self.assertRaises(ValidationError):
            validate_repair(too_many, [factor], {'code':'OrderSend(...)'})
        too_many = copy.deepcopy(value)
        too_many['items'][0]['remaining_unknowns'].append('第九项')
        with self.assertRaises(ValidationError):
            validate_repair(too_many, [factor], {'code':'OrderSend(...)'})

    def test_budget_types_scope_missing_dependencies_and_evidence_are_not_guessed(self):
        factors = [copy.deepcopy(broken()['factors'][0]) for _ in range(6)]
        self.assertEqual(plan(factors), {'version': 1, 'selected': [0, 1, 2, 3], 'omitted': [4, 5]})
        self.assertEqual(plan(extracted()['factors'])['selected'], [])
        result = validate_repair(repaired(), factors[:1], {'code': 'close / close.shift(N) - 1'})
        self.assertEqual(result['items'][0]['changed_fields'], ['expression'])
        for forged in (dict(result, version=True), dict(result, selected=[False]), dict(result, omitted=[1])):
            with self.assertRaises(ValidationError): validate_repair(forged, factors[:1])
        for change in ('quote', 'same', 'scope', 'missing'):
            value = repaired()
            if change == 'quote': value['items'][0]['evidence'][0]['quote'] = 'not in source'
            if change == 'same': value['items'][0]['definition']['expression'] = None
            if change == 'scope': value['items'][0]['factor_index'] = 9
            if change == 'missing': value['items'] = []
            with self.assertRaises(ValidationError): validate_repair(value, factors[:1], {'code': 'close / close.shift(N) - 1'})
        unresolved = {'items': [{'factor_index': 0, 'status': 'unresolved', 'summary': '原模块实现未提供',
            'definition': None, 'evidence': [], 'remaining_unknowns': ['请补充依赖正文']}]}
        self.assertEqual(validate_repair(unresolved, factors[:1])['items'][0]['status'], 'unresolved')
        for change in ('role', 'dependencies', 'category'):
            value = repaired(); original = copy.deepcopy(factors[:1])
            if change == 'role': value['items'][0]['definition']['role'] = 'execution'
            if change == 'dependencies': value['items'][0]['definition']['dependencies'] = []
            if change == 'category': original[0]['parameters'][0]['category'] = 'display'
            with self.assertRaises(ValidationError): validate_repair(value, original)


class AutomaticRepairTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp
    collect = fixtures.AnalysisTests.collect

    def finish(self, unknown=False):
        entry = self.collect(); run = AIRun.objects.get()
        analysis = broken()
        planned = initial_response()
        planned['initial_proposal']['evidence_refs'] += ['repair:0']
        proposal = repaired()
        if unknown:
            proposal = {'items': [{'factor_index': 0, 'status': 'unresolved', 'summary': '依赖源码缺失，不能推测',
                'definition': None, 'evidence': [], 'remaining_unknowns': ['缺少模块正文']}]}
        def model(config, prompt, **kwargs):
            if '只完成“修订候选定义”' in prompt: return json.dumps(proposal)
            if '只完成“设计实验”' in prompt: return json.dumps(analysis if unknown else planned)
            return json.dumps(analysis)
        with patch('quant.worker.complete', side_effect=model) as call:
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(call.call_count, 7)
        self.assertEqual(run.workflow_steps.count(), 10)
        return entry, run

    def test_collect_repairs_automatically_preserves_parent_and_plans_and_runs_exact_child(self):
        _, run = self.finish()
        self.assertEqual(run.workflow_version, 16)
        self.assertIsNone(run.report.data['factors'][0]['expression'])
        root, version, child_id = identifiers(run.report.pk, 0)
        child = FactorCandidate.objects.get(pk=child_id)
        parent = FactorCandidate.objects.get(pk=root)
        self.assertIsNone(parent.data['expression']); self.assertIsNotNone(child.data['expression'])
        self.assertEqual(child.data['formula_version']['origin'], 'ai_repair')
        report_wire = self.client.get(f'/api/quant/{self.collection.pk}/entries/{run.entry_id}/').json()['data']['reports'][0]
        self.assertEqual(report_wire['data']['factorRepair']['items'][0]['status'], 'revised')
        self.assertEqual(report_wire['proposal']['candidates'][0]['data']['formulaVersion']['origin'], 'ai_repair')
        root_wire = self.client.get(f'/api/quant/{self.collection.pk}/factors/{root}/verification/').json()['data']
        self.assertEqual(root_wire['aiRevisions'][0]['candidateId'], child_id)
        self.assertEqual(FactorFormulaVersion.objects.get(pk=version).root_id, root)
        self.assertEqual(child.qualifications.get().data['reuse_status'], 'reusable')
        self.assertFalse(FactorEvidenceLink.objects.filter(candidate=child).exists())
        from quant.exports.service import bundle
        manifest = json.loads(bundle(child, 'python')['manifest_json'])
        self.assertEqual(manifest['source_role'], 'ancestor_context_not_ai_revised_formula_source')
        self.assertEqual(manifest['formula_version']['origin'], 'ai_repair')
        self.assertEqual(run.experiment_proposal.data['seeds'][0]['id'], child_id)
        self.assertEqual(run.experiment_proposal.data['seeds'][0]['candidate'], child.data)
        self.assertEqual(run.experiment_proposal.data['baseline_status'], 'ai_revised_definition_defaults_not_native_or_live_settings')
        self.assertIn('repair:0', run.experiment_proposal.data['evidence_refs'])
        self.assertEqual(run.report.data['total_score'], 60)
        self.assertIn('AI 定义修订', run.report.markdown)
        from quant.test_initial_planning import InitialPlanningTests
        from quant.experiments.campaigns.contracts import experiment_input
        from quant.experiments.worker import execute as calculate
        from quant.models import ExperimentRequest
        dataset = InitialPlanningTests.dataset(self)
        response = self.client.post(f'/api/quant/{self.collection.pk}/experiments/',
            experiment_input(run.experiment_proposal, dataset.pk, 'repaired_experiment_0001'), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        request = ExperimentRequest.objects.get(pk=response.data['data']['id'])
        calculate(request.job.pk)
        self.assertEqual(request.result.data['status'], 'completed')
        self.assertTrue(FactorEvidenceLink.objects.filter(candidate=child, kind='experiment').exists())
        self.assertFalse(FactorEvidenceLink.objects.filter(candidate=parent).exists())
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        with patch('quant.worker.dispatch') as model, patch('quant.experiments.worker.dispatch') as engine:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        model.assert_not_called(); engine.assert_not_called()

    def test_unresolved_dependency_is_preserved_in_report_without_fake_child(self):
        _, run = self.finish(unknown=True)
        self.assertEqual(run.result['factor_repair']['items'][0]['status'], 'unresolved')
        self.assertEqual(FactorCandidate.objects.count(), 1)
        self.assertFalse(FactorFormulaVersion.objects.exists())
        self.assertIsNone(run.result['initial_proposal'])
        validate(SyncManager().build_snapshot_data(), metadata(SyncManager().build_snapshot_data()))

    def test_rehashed_formula_or_missing_revision_is_rejected_and_old_versions_stay_old(self):
        _, run = self.finish()
        snapshot = SyncManager().build_snapshot_data()
        for kind in ('missing', 'definition'):
            value = copy.deepcopy(snapshot)
            if kind == 'missing': value = [row for row in value if row['model'] != 'quant.factorformulaversion']
            else:
                row = next(row for row in value if row['model'] == 'quant.factorcandidate' and row['fields']['formula_version_id'])
                row['fields']['data']['formula'] = 'invented output'
                row['fields']['content_hash'] = digest(row['fields']['data'])
            with self.assertRaises(SyncError): validate(value, metadata(value))

    def test_v6_v7_requests_reports_and_restore_keep_original_contract(self):
        from quant.services import _run_input
        from quant.test_incremental_workflows import local_answer
        from system_settings.sync_state import canonical_hash
        for version in (6, 7):
            self.payload['request_key'] = f'legacy_repair_contract_{version}'
            entry = self.collect(); run = AIRun.objects.get(entry=entry)
            run.workflow_version = version
            request = {'kind': 'analyze', 'source_id': run.source_id, 'model_id': self.model.pk, 'request_key': run.request_key}
            run.input_hash = canonical_hash(_run_input(entry, request, existing=run)); run.save()
            def answer(config, prompt, **kwargs):
                step = run.workflow_steps.order_by('-ordinal').first()
                return json.dumps(local_answer(json.loads(prompt.split('材料：', 1)[1])) if step.stage == 'snippets' else fixtures.result())
            with patch('quant.worker.complete', side_effect=answer) as model: execute(run.pk)
            run.refresh_from_db()
            self.assertEqual(run.status, 'completed', run.error)
            self.assertEqual(model.call_count, 6 if version == 6 else 7)
            self.assertFalse(run.workflow_steps.filter(stage='repair').exists())
            self.assertNotIn('factor_repair', run.result)
            self.assertNotIn('## AI 定义修订', run.report.markdown)
            response = self.client.post(f'/api/quant/{self.collection.pk}/entries/{entry.pk}/runs/', request, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.json()['data']['id'], run.pk)
        snapshot = SyncManager().build_snapshot_data(); meta = metadata(snapshot); meta['quant_schema_version'] = 40
        validate(snapshot, meta)

    def test_legacy_single_call_cannot_inject_unrequested_repair_artifacts(self):
        from quant.services import _run_input
        from system_settings.sync_state import canonical_hash
        from quant.research.services import publish_report
        entry = self.collect(); run = AIRun.objects.get(entry=entry)
        run.workflow_version = 0
        request = {'kind': 'analyze', 'source_id': run.source_id, 'model_id': self.model.pk, 'request_key': run.request_key}
        run.input_hash = canonical_hash(_run_input(entry, request, existing=run)); run.save()
        result = broken(); result['factor_repair'] = validate_repair(repaired(), result['factors'], run.source.payload)
        with patch('quant.worker.complete', return_value=json.dumps(result)) as model: execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(model.call_count, 1)
        self.assertEqual(run.status, 'failed')
        self.assertFalse(FactorCandidate.objects.exists())
        run.result = result; run.status = 'completed'
        with self.assertRaises(ValidationError): publish_report(run)
