"""V4 assertions bind to staged analysis and feedback plans, never user code execution."""
import copy
import json
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError

from quant import test_parameter_arithmetic as arithmetic_fixtures
from quant import test_research_analysis as analysis_fixtures
from quant import test_feedback as feedback_fixtures
from quant.feedback.contracts import validate_analysis as validate_feedback
from quant.feedback.evidence import for_run as feedback_context
from quant.models import AIRun, ExperimentJob, ExperimentProposal, FactorCandidate, Job, ResearchReport, SourceRevision
from quant.research.contracts import digest
from quant.sync import metadata, validate
from quant.worker import execute, prompt
from quant.workflows.contracts import validate_output
from utils.sync_manager import SyncManager


def answer(quote, *, division=False, initial=True):
    value = arithmetic_fixtures.response()
    if not initial:
        value['initial_proposal'] = None
    for row in value['parameters'] + value['factors'][0]['parameters']:
        if 'domain' in row:
            row['domain']['evidence'] = [{'field': 'code', 'quote': quote}]
        if division and row['name'] == 'N':
            row['domain']['conditions'][0]['require'] = {
                'operator': 'lte', 'left': {'operator': 'div', 'left': {'parameter': 'N'},
                    'right': {'operator': 'sub', 'left': {'parameter': 'N'}, 'right': {'value': 25}}},
                'right': {'value': 70},
            }
    return value


class ArithmeticParameterStageTests(SimpleTestCase):
    def test_stage_accepts_v4_and_checks_inactive_branch_types_and_references(self):
        quote = 'enabled implies 2 * N + slow <= 70'
        value = answer(quote)
        stage = {key: copy.deepcopy(value[key]) for key in ('parameters', 'risks', 'unknowns')}
        stage['parameters'][-1]['default_value'] = 'false'
        checked = validate_output('parameters', stage, {}, {'code': quote})
        self.assertEqual(checked['parameters'], stage['parameters'])
        self.assertEqual(checked['parameters'][0]['domain']['version'], 4)
        for dependency in ('enabled', 'mode', 'undeclared'):
            invalid = copy.deepcopy(stage)
            if dependency == 'mode':
                invalid['parameters'].append({**copy.deepcopy(invalid['parameters'][-1]),
                    'name': 'mode', 'type': 'string', 'default_value': '"off"'})
            rule = invalid['parameters'][0]['domain']['conditions'][0]
            rule['require']['left']['left']['left'] = {'parameter': dependency}
            with self.subTest(dependency=dependency), self.assertRaises(ValidationError):
                validate_output('parameters', invalid, {}, {'code': quote})


class ArithmeticWorkflowTests(TestCase):
    setUp = analysis_fixtures.AnalysisTests.setUp
    collect = analysis_fixtures.AnalysisTests.collect

    def test_stage_rerun_and_restore_keep_arithmetic_tree_and_source_evidence(self):
        self.collect()
        run = AIRun.objects.get()
        value = answer(run.source.payload['code'])
        with patch('quant.worker.complete', return_value=json.dumps(value)) as provider:
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(provider.call_count, 6)
        first_step = run.workflow_steps.get(stage='parameters')
        parameters = first_step.outcome.data['output']['parameters']
        self.assertEqual(parameters, value['parameters'])
        path = f'/api/quant/{self.collection.pk}/entries/{run.entry_id}/runs/'
        inputs = {'kind': 'analyze', 'source_id': run.source_id, 'model_id': self.model.pk,
                  'request_key': 'arithmetic_workflow_plan_rerun', 'resume_run_id': run.pk, 'restart_stage': 'plan'}
        saved = self.client.post(path, inputs, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        rerun = AIRun.objects.get(pk=saved.data['data']['id'])
        with patch('quant.worker.complete', return_value=json.dumps(value)) as provider:
            execute(rerun.pk)
        rerun.refresh_from_db()
        self.assertEqual(rerun.status, 'completed', rerun.error)
        self.assertEqual(provider.call_count, 1)
        reused = rerun.workflow_steps.get(stage='parameters').outcome
        self.assertEqual(reused.data['reused_from'], first_step.outcome.pk)
        self.assertEqual(reused.data['output']['parameters'], parameters)
        frozen = copy.deepcopy(reused.data)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        with patch('quant.worker.complete') as provider, patch('quant.worker.dispatch') as dispatch:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
            execute(rerun.pk)
            replay = self.client.post(path, inputs, format='json')
            self.assertEqual(replay.status_code, 200, replay.data)
            self.assertEqual(replay.data['data']['id'], rerun.pk)
            provider.assert_not_called()
            dispatch.assert_not_called()
        restored = AIRun.objects.get(pk=rerun.pk)
        self.assertEqual(restored.workflow_steps.get(stage='parameters').outcome.data, frozen)
        report = ResearchReport.objects.get(run=restored)
        self.assertEqual(report.data['parameters'], parameters)
        self.assertEqual(report.data['parameters'][0]['domain']['evidence'][0]['quote'], run.source.payload['code'])
        self.assertFalse(Job.objects.exists())
        self.assertFalse(ExperimentJob.objects.exists())


class ArithmeticFeedbackTests(TestCase):
    setUp = analysis_fixtures.AnalysisTests.setUp
    collect = analysis_fixtures.AnalysisTests.collect

    def ready(self, *, division=False):
        self.collect()
        source_run = AIRun.objects.get()
        value = answer(source_run.source.payload['code'], division=division, initial=False)
        with patch('quant.worker.complete', return_value=json.dumps(value)):
            execute(source_run.pk)
        source_run.refresh_from_db()
        self.assertEqual(source_run.status, 'completed', source_run.error)
        candidate = FactorCandidate.objects.get(report__run=source_run)
        path = f'/api/quant/{self.collection.pk}/entries/{source_run.entry_id}/feedback/'
        inputs = {'request_key': 'arithmetic_external_feedback', 'title': '原始负面反馈',
                  'target_source_id': source_run.source_id, 'factor_id': candidate.pk,
                  'document': 'N=10\nnet=-2%', 'mode': 'backtest'}
        saved = self.client.post(path, inputs, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        run = AIRun.objects.get(source_id=saved.data['data']['source']['id'], kind='feedback_review')
        return candidate, run, path, inputs

    @staticmethod
    def response(candidate, run, n):
        value = feedback_fixtures.response()
        memory = run.planning_context['library_memory']
        value.update(memory_note='暂无独立验证，原始负面反馈与声明约束分别保留',
            memory_assessment=[{'action': 'investigate', 'rationale': '历史线索仍待核对，不替代本次实验',
                'evidence_refs': [f"memory:{item['kind']}:{item['id']}"]} for item in memory['items']],
            feedback_planning_note='以完整源码基线与合法候选参数在新行情复核负面反馈',
            feedback_proposal={'name': '条件算术反馈复核', 'hypothesis': '新参数能否解释差异',
                'falsification': '新行情成本后仍不稳定', 'data_requirement': '未用于研究的同口径历史行情',
                'evidence_refs': ['feedback'], 'seeds': [{'candidate_id': candidate.pk, 'variants': [[
                    {'name': 'N', 'value': n}, {'name': 'slow', 'value': 26}, {'name': 'enabled', 'value': True}]]}],
                'config': {'seed': 42, 'max_candidates': 4, 'generations': 1, 'threshold': 0,
                           'fee_bps': 5, 'slippage_bps': 5, 'gap': 2, 'seconds': 5}})
        return value

    def rejected(self, *, division=False):
        candidate, run, _, _ = self.ready(division=division)
        source = run.source
        original = copy.deepcopy(source.payload)
        value = self.response(candidate, run, 25)
        context = feedback_context(run)
        error = '除以零' if division else '条件约束'
        with self.assertRaisesRegex(ValidationError, error):
            validate_feedback(value, context)
        with patch('quant.worker.complete', return_value=json.dumps(value)) as provider:
            execute(run.pk)
        provider.assert_called_once()
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')
        self.assertFalse(ExperimentProposal.objects.filter(run=run).exists())
        self.assertFalse(ResearchReport.objects.filter(run=run).exists())
        self.assertFalse(ExperimentJob.objects.exists())
        source.refresh_from_db()
        self.assertEqual(source.payload, original)
        self.assertEqual(source.payload['document'], 'N=10\nnet=-2%')
        self.assertEqual(source.content_hash, digest(original))
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_worker_rejects_arithmetic_violation_without_losing_negative_feedback(self):
        self.rejected()

    def test_worker_rejects_division_by_zero_without_publishing_a_plan(self):
        self.rejected(division=True)

    def test_valid_feedback_plan_and_declaration_survive_restore_without_execution(self):
        candidate, run, path, inputs = self.ready()
        value = self.response(candidate, run, 15)
        before = prompt(run)
        with patch('quant.worker.complete', return_value=json.dumps(value)):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        proposal = ExperimentProposal.objects.get(run=run)
        self.assertEqual(proposal.data['seeds'][0]['candidate']['parameters'], candidate.data['parameters'])
        self.assertEqual(proposal.data['seeds'][0]['variants'][0], {'N': 15, 'slow': 26, 'enabled': True})
        self.assertEqual(proposal.data['seeds'][0]['candidate']['parameters'][0]['domain']['version'], 4)
        frozen = copy.deepcopy(proposal.data)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        with patch('quant.worker.complete') as provider, patch('quant.worker.dispatch') as dispatch:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
            execute(run.pk)
            replay = self.client.post(path, inputs, format='json')
            self.assertEqual(replay.status_code, 200, replay.data)
            provider.assert_not_called()
            dispatch.assert_not_called()
        self.assertEqual(ExperimentProposal.objects.get(pk=proposal.pk).data, frozen)
        self.assertEqual(prompt(AIRun.objects.get(pk=run.pk)), before)
        self.assertEqual(SourceRevision.objects.get(pk=run.source_id).payload['document'], 'N=10\nnet=-2%')
        self.assertFalse(Job.objects.exists())
        self.assertFalse(ExperimentJob.objects.exists())
