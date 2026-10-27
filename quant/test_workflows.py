"""Durable staged execution: recovery, publication, ownership and sync tampering."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from quant import test_research_analysis as fixtures
from quant.models import AIRun, Job, ResearchReport, WorkflowStep, WorkflowOutcome
from quant.worker import execute
from quant.sync import metadata, validate, reset_execution
from quant.research.contracts import digest
from quant.workflows.contracts import MODEL_STAGES, STAGES, NAMES
from utils.sync_manager import SyncManager, SyncError


class WorkflowTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp
    collect = fixtures.AnalysisTests.collect

    def start(self):
        entry = self.collect()
        self.run_url = f'/api/quant/{self.collection.pk}/entries/{entry.pk}/runs/'
        return AIRun.objects.get()

    def retry(self, old, **changes):
        data = dict(kind='analyze', source_id=old.source_id, model_id=self.model.pk,
            request_key='workflow_retry_0001', resume_run_id=old.pk)
        data.update(changes)
        response = self.client.post(self.run_url, data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return AIRun.objects.get(pk=response.data['data']['id'])

    def failed_research(self):
        run = self.start()
        with patch('quant.worker.complete', side_effect=[json.dumps(fixtures.result()), json.dumps(fixtures.result()), RuntimeError('private failure')]) as model:
            execute(run.pk)
        self.assertEqual(model.call_count, 3)
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')
        self.assertEqual(list(run.workflow_steps.values_list('stage', flat=True)), list(STAGES[:4]))
        self.assertFalse(ResearchReport.objects.exists())
        return run

    def finish(self, run):
        with patch('quant.worker.complete', return_value=json.dumps(fixtures.result())) as model:
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        return model

    def test_success_stages_distinct_contexts_and_evidence_access(self):
        run = self.start()
        model = self.finish(run)
        self.assertEqual(model.call_count, 6)
        prompts = [call.args[1] for call in model.call_args_list]
        for stage, prompt in zip([s for s in STAGES if s in MODEL_STAGES], prompts):
            self.assertIn(NAMES[stage], prompt)
        self.assertNotIn(self.payload['code'], prompts[-1])
        self.assertEqual(run.workflow_version, 25)
        for text in prompts[:-1]: self.assertIn('source_structure', text)
        self.assertNotIn('source_structure', prompts[-1])
        structure = run.workflow_steps.get(stage='normalize').outcome.data['output']['structure']
        self.assertEqual(structure['status'], 'parsed')
        self.assertIn('__source__.py::factor', [row['name'] for row in structure['nodes']])
        self.assertIn('normalize', run.workflow_steps.get(stage='identify').input['dependencies'])
        detail = self.client.get(self.run_url + run.pk + '/workflow/normalize/').json()['data']
        self.assertEqual(detail['sourceCode'], self.payload['code'])
        self.assertEqual(next(row for row in detail['structure']['nodes'] if row['name'] == '__source__.py::factor')['startLine'], 2)
        self.assertEqual(WorkflowOutcome.objects.count(), 10)
        response = self.client.get(self.run_url + run.pk + '/').json()['data']
        self.assertEqual([s['status'] for s in response['workflow']['stages']], ['completed'] * 10)
        self.assertIsNone(response['workflow']['stages'][1]['usage']['totalTokens'])
        url = self.run_url + run.pk + '/workflow/parameters/'
        detail = self.client.get(url).json()['data']
        self.assertEqual(json.loads(detail['inputJson'])['source_id'], run.source_id)
        self.assertEqual(json.loads(detail['outcomeJson'])['output']['parameters'][0]['name'], 'N')
        self.assertNotIn('api_key', detail['inputJson'])
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(url).status_code, (401, 403))
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_v1_rerun_preserves_original_contract_and_idempotence(self):
        from quant.services import _run_input
        from system_settings.sync_state import canonical_hash
        old = self.start()
        old.workflow_version = 1
        data = dict(kind='analyze', source_id=old.source_id, model_id=self.model.pk, request_key=old.request_key)
        old.input_hash = canonical_hash(_run_input(old.entry, data, existing=old))
        old.save()
        self.finish(old)
        self.assertNotIn('structure', old.workflow_steps.get(stage='normalize').outcome.data['output'])
        self.assertEqual(self.client.post(self.run_url, data, format='json').status_code, 200)
        rerun = self.retry(old, restart_stage='plan')
        self.assertEqual(rerun.workflow_version, 1)
        self.assertEqual(self.finish(rerun).call_count, 1)
        detail = self.client.get(self.run_url + rerun.pk + '/workflow/normalize/').json()['data']
        self.assertIsNone(detail['structure'])
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_structure_snapshot_cannot_be_rehashed_to_fabricate_coordinates(self):
        run = self.start(); self.finish(run)
        snapshot = SyncManager().build_snapshot_data()
        row = next(row for row in snapshot if row['model'] == 'quant.workflowoutcome'
            and row['fields']['step'] == run.workflow_steps.get(stage='normalize').pk)
        row['fields']['data']['output']['structure']['nodes'][1]['start_line'] = 999
        row['fields']['content_hash'] = digest(row['fields']['data'])
        with self.assertRaisesRegex(SyncError, '阶段输出'):
            validate(snapshot, metadata(snapshot))

    def test_failure_resume_reuses_successful_calls_and_restores_without_execution(self):
        old = self.failed_research()
        before = list(WorkflowOutcome.objects.values('id', 'data'))
        self.assertNotIn('private failure', json.dumps(before))
        reset_execution()
        new = self.retry(old)
        model = self.finish(new)
        self.assertEqual(model.call_count, 4)
        for stage in STAGES[:3]:
            step = new.workflow_steps.get(stage=stage)
            self.assertEqual(step.outcome.data['reused_from'], old.workflow_steps.get(stage=stage).outcome.pk)
        self.assertEqual(ResearchReport.objects.count(), 1)
        for row in before:
            self.assertEqual(WorkflowOutcome.objects.get(pk=row['id']).data, row['data'])
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        reset_execution()
        with patch('quant.worker.dispatch') as dispatch:
            again = self.retry(old)
        self.assertEqual(again.pk, new.pk)
        dispatch.assert_not_called()
        self.assertFalse(Job.objects.exists())

    def test_changed_requirements_invalidates_model_steps_but_not_source(self):
        old = self.failed_research()
        new = self.retry(old, requirements='重点检查参数来源')
        model = self.finish(new)
        self.assertEqual(model.call_count, 6)
        self.assertTrue(new.workflow_steps.get(stage='normalize').outcome.data['reused_from'])
        self.assertFalse(new.workflow_steps.get(stage='identify').outcome.data['reused_from'])
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_library_change_invalidates_comparison_and_downstream_review(self):
        from quant.test_factors import extracted
        old = self.start()
        answer = json.dumps(extracted())
        with patch('quant.worker.complete', side_effect=[answer] * 5 + [RuntimeError]):
            execute(old.pk)
        old.refresh_from_db()
        self.assertEqual(old.status, 'failed')
        self.assertEqual(old.workflow_steps.get(stage='compare').outcome.data['output']['scanned'], 0)
        self.payload['request_key'] = 'collection_library_other'
        other = self.collect()
        with patch('quant.worker.complete', return_value=answer):
            execute(AIRun.objects.get(entry=other).pk)
        new = self.retry(old)
        with patch('quant.worker.complete', return_value=answer) as model:
            execute(new.pk)
        new.refresh_from_db()
        self.assertEqual(new.status, 'completed', new.error)
        self.assertEqual(model.call_count, 2)
        compare = new.workflow_steps.get(stage='compare')
        self.assertFalse(compare.outcome.data['reused_from'])
        self.assertEqual(compare.outcome.data['output']['scanned'], 1)
        self.assertEqual(compare.outcome.data['output']['matches'][0]['items'][0]['basis'], 'same_expression_contract')
        self.assertFalse(new.workflow_steps.get(stage='review').outcome.data['reused_from'])
        self.assertTrue(new.workflow_steps.get(stage='extract').outcome.data['reused_from'])
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_active_and_foreign_source_cannot_be_resumed(self):
        old = self.start()
        data = dict(kind='analyze', source_id=old.source_id, request_key='workflow_retry_0001', resume_run_id=old.pk)
        self.assertEqual(self.client.post(self.run_url, data, format='json').status_code, 400)
        old.status = 'failed'; old.save()
        self.payload['request_key'] = 'collection_request_0002'
        other = self.collect()
        data['source_id'] = AIRun.objects.get(entry=other).source_id
        self.assertEqual(self.client.post(self.run_url, data, format='json').status_code, 404)

    def test_cancel_or_restore_during_model_call_cannot_publish_late_outcome(self):
        for revoke in ('cancel', 'restore'):
            with self.subTest(revoke=revoke):
                self.payload['request_key'] = f'collection_request_{revoke}'
                entry = self.collect()
                run = AIRun.objects.get(entry=entry)
                def late_answer(*args, **kwargs):
                    if revoke == 'restore':
                        reset_execution()
                    else:
                        Job.objects.filter(run=run).update(cancelled=True)
                    return json.dumps(fixtures.result())
                with patch('quant.worker.complete', side_effect=late_answer):
                    execute(run.pk)
                run.refresh_from_db()
                self.assertEqual(run.status, 'interrupted' if revoke == 'restore' else 'cancelled')
                self.assertEqual(run.workflow_steps.count(), 2)
                self.assertFalse(WorkflowOutcome.objects.filter(step__run=run, step__stage='identify').exists())
                self.assertFalse(ResearchReport.objects.filter(entry=entry).exists())
                snapshot = SyncManager().build_snapshot_data()
                validate(snapshot, metadata(snapshot))

    def test_publication_failure_rolls_back_final_outcome_and_report(self):
        run = self.start()
        with patch('quant.worker.complete', return_value=json.dumps(fixtures.result())), patch('quant.workflows.runner.finish', side_effect=RuntimeError):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')
        self.assertFalse(ResearchReport.objects.exists())
        self.assertEqual(run.workflow_steps.count(), 10)
        self.assertEqual(WorkflowOutcome.objects.count(), 9)
        new = self.retry(run)
        model = self.finish(new)
        model.assert_not_called()
        self.assertEqual(ResearchReport.objects.count(), 1)

    def test_rehashed_workflow_mutations_rejected(self):
        old = self.failed_research()
        new = self.retry(old)
        self.finish(new)
        original = SyncManager().build_snapshot_data()
        for mutation in ('downgrade', 'dependency', 'reuse', 'native_usage', 'cycle', 'unpublished', 'output'):
            with self.subTest(mutation=mutation):
                snapshot = copy.deepcopy(original)
                run = next(r['fields'] for r in snapshot if r['model'] == 'quant.airun' and r['pk'] == new.pk)
                steps = {r['fields']['stage']: r for r in snapshot if r['model'] == 'quant.workflowstep' and r['fields']['run'] == new.pk}
                outcomes = {r['fields']['step']: r['fields'] for r in snapshot if r['model'] == 'quant.workflowoutcome'}
                if mutation == 'downgrade':
                    run['workflow_version'], run['resume_run_id'] = 0, ''
                    snapshot = [r for r in snapshot if r['model'] not in ('quant.workflowstep', 'quant.workflowoutcome')]
                elif mutation == 'dependency':
                    row = steps['research']['fields']; row['input']['dependencies'] = {}; row['content_hash'] = digest(row['input'])
                elif mutation == 'cycle':
                    run['resume_run_id'] = new.pk
                elif mutation == 'unpublished':
                    run['status'] = 'failed'; run['result'] = {}
                else:
                    row = outcomes[steps['normalize' if mutation == 'native_usage' else 'research']['pk']]
                    if mutation == 'reuse': row['data']['reused_from'] = 'nonexistent'
                    elif mutation == 'native_usage': row['data']['usage']['total_tokens'] = 100
                    else: row['data']['output']['summary'] = 'forged'
                    row['content_hash'] = digest(row['data'])
                with self.assertRaises(SyncError):
                    validate(snapshot, metadata(snapshot))
