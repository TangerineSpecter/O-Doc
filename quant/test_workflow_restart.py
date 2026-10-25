"""Targeted reruns keep old reports and upstream evidence without new authority on restore."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from quant import test_workflows as workflows
from quant.test_factors import extracted
from quant.models import AIRun, Job, ResearchReport
from quant.worker import execute
from quant.sync import metadata, validate
from quant.research.contracts import digest
from quant.workflows.contracts import stages
from utils.sync_manager import SyncManager, SyncError


class WorkflowRestartTests(TestCase):
    setUp = workflows.WorkflowTests.setUp
    collect = workflows.WorkflowTests.collect
    start = workflows.WorkflowTests.start
    retry = workflows.WorkflowTests.retry
    failed_research = workflows.WorkflowTests.failed_research
    finish = workflows.WorkflowTests.finish

    def test_targeted_reruns_force_suffix_and_preserve_reports_revisions_and_frozen_scope(self):
        old = self.start()
        answer = json.dumps(extracted())
        with patch('quant.worker.complete', return_value=answer):
            execute(old.pk)
        old.refresh_from_db()
        self.assertEqual(old.status, 'completed')
        report = ResearchReport.objects.get(run=old)
        url = self.run_url.replace('runs/', f'reports/{report.pk}/')
        saved = self.client.patch(url, {'markdown': '人工修订仍须保留', 'expected_revision_id': ''}, format='json')
        self.assertEqual(saved.status_code, 200)
        before = copy.deepcopy(report.data)
        for stage, calls in [('plan', 1), ('review', 2), ('publish', 0), ('compare', 2), ('parameters', 5), ('normalize', 6)]:
            with self.subTest(stage=stage):
                new = self.retry(old, restart_stage=stage, request_key=f'targeted_rerun_{stage}')
                with patch('quant.worker.complete', return_value=answer) as model:
                    execute(new.pk)
                new.refresh_from_db()
                self.assertEqual(new.status, 'completed', new.error)
                self.assertEqual(model.call_count, calls)
                for step in new.workflow_steps.select_related('outcome'):
                    self.assertEqual(bool(step.outcome.data['reused_from']), stages(new.workflow_version).index(step.stage) < stages(new.workflow_version).index(stage))
                if stage in ('review', 'plan', 'publish'):
                    self.assertEqual(new.workflow_steps.get(stage='compare').input['library'],
                        old.workflow_steps.get(stage='compare').input['library'])
                else:
                    self.assertGreater(new.workflow_steps.get(stage='compare').outcome.data['output']['scanned'], 0)
        report.refresh_from_db()
        self.assertEqual(report.data, before)
        self.assertEqual(report.revisions.get().markdown, '人工修订仍须保留')
        self.assertEqual(ResearchReport.objects.count(), 7)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        with patch('quant.worker.dispatch') as dispatch:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
            again = self.retry(old, restart_stage='plan', request_key='targeted_rerun_plan')
        dispatch.assert_not_called()
        self.assertEqual(again.restart_stage, 'plan')
        self.assertFalse(Job.objects.exists())
        self.assertEqual(ResearchReport.objects.get(pk=report.pk).revisions.get().markdown, '人工修订仍须保留')

    def test_failed_targeted_rerun_resumes_and_changed_model_inputs_invalidate_prefix(self):
        old = self.start(); self.finish(old)
        rerun = self.retry(old, restart_stage='review')
        with patch('quant.worker.complete', side_effect=RuntimeError):
            execute(rerun.pk)
        rerun.refresh_from_db()
        self.assertEqual(rerun.status, 'failed')
        self.assertEqual(ResearchReport.objects.count(), 1)
        continued = self.retry(rerun, request_key='targeted_resume_001')
        self.assertEqual(self.finish(continued).call_count, 2)
        changed = self.retry(continued, restart_stage='plan', requirements='重新核对参数', request_key='targeted_changed_01')
        self.assertEqual(self.finish(changed).call_count, 6)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_restart_validation_and_idempotence(self):
        old = self.failed_research()
        base = dict(kind='analyze', source_id=old.source_id, resume_run_id=old.pk,
            restart_stage='review', request_key='invalid_restart_001')
        for changes in ({}, {'restart_stage': 'unknown'}, {'resume_run_id': '', 'restart_stage': 'research'},
                        {'kind': 'explain', 'restart_stage': 'research'}):
            with self.subTest(changes=changes):
                self.assertEqual(self.client.post(self.run_url, {**base, **changes}, format='json').status_code, 400)
        rerun = self.retry(old, restart_stage='research')
        data = {**base, 'resume_run_id': rerun.pk, 'restart_stage': 'research'}
        self.assertEqual(self.client.post(self.run_url, data, format='json').status_code, 400)
        self.assertEqual(self.retry(old, restart_stage='research').pk, rerun.pk)
        data = {**base, 'restart_stage': 'parameters', 'request_key': 'workflow_retry_0001'}
        self.assertEqual(self.client.post(self.run_url, data, format='json').status_code, 409)
        self.client.force_authenticate(None)
        self.assertIn(self.client.post(self.run_url, data, format='json').status_code, (401, 403))

    def test_sync_rejects_forced_stage_reuse_and_accepts_old_absent_field(self):
        old = self.start(); self.finish(old)
        legacy = SyncManager().build_snapshot_data()
        for row in legacy:
            if row['model'] == 'quant.airun': row['fields'].pop('restart_stage', None)
        validate(legacy, metadata(legacy))
        new = self.retry(old, restart_stage='review'); self.finish(new)
        snapshot = SyncManager().build_snapshot_data()
        row = next(row for row in snapshot if row['model'] == 'quant.workflowoutcome'
            and row['fields']['step'] == new.workflow_steps.get(stage='review').pk)
        row['fields']['data']['reused_from'] = old.workflow_steps.get(stage='review').outcome.pk
        row['fields']['content_hash'] = digest(row['fields']['data'])
        with self.assertRaisesRegex(SyncError, '不得复用'):
            validate(snapshot, metadata(snapshot))
