"""Real isolated calculations, fake completions, no market or provider requests."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from quant.test_experiment_jobs import ExperimentJobsTests
from quant.experiments.worker import execute as calculate
from quant.experiments.reviews import auto_review, start_review
from quant.experiments.review_evidence import for_result
from quant.experiments.review_contract import DIMENSIONS, validate_review
from quant.models import AIRun, ResearchReport, Job
from quant.worker import execute, prompt
from quant.sync import metadata, validate, reset_execution
from utils.sync_manager import SyncManager, SyncError


def _response():
    finding = {'text': '仅解释本次合成行情的模拟记录', 'evidence_refs': ['execution']}
    return {'planning_version': 2, 'planning_note': '测试样例缺少独立新数据，暂不提出执行方案', 'proposal': None, 'title': '动量窗口实验解读', 'summary': '需要新的数据验证', 'priority': 'insufficient_evidence',
        'findings': [finding], 'parameter_assessment': [finding], 'risks': [finding], 'unknowns': ['平台等价性未知'],
        'scores': [{'dimension': name, 'score': 3 if name == '复现价值' else None,
            'reason': '其他证据不足', 'evidence': '固定输入与算法', 'evidence_refs': ['execution']} for name in DIMENSIONS],
        'next_hypotheses': [{**finding, 'test': '独立新数据上比较窗口', 'falsification': '邻域没有一致表现', 'data_requirement': '未使用的行情区间'}]}


def response(evidence=None):
    value=_response()
    if evidence and 'selection_diagnostic' in evidence['evidence']:
        value['selection_review']=selection_response()['selection_review']
    if evidence and 'temporal_parameter_stability' in evidence['evidence']:
        temporal=evidence['evidence']['temporal_parameter_stability']
        value['temporal_parameter_review']={'status':temporal['status'],'planned_windows':temporal['planned_windows'],
            'text':'逐窗保留失败和缺测；共同离散候选仍需新数据复核。','evidence_refs':['temporal_parameter_stability']}
        windows = [{"outer_fold": row['outer_fold'], "inner_fold": row['inner_fold'],
            "text": '人工逐窗解释：实际参数、各段指标和失败仍须结合原始记录核对。', 'evidence_refs': [key]}
            for key,row in evidence['evidence'].items() if key.startswith('temporal_window:')]
        if windows:value['temporal_parameter_review']['window_reviews']=windows
    return value


def acknowledge_selection(value,run):
    if run.kind=='experiment_review' and run.planning_context.get('selection_diagnostic'):
        value['selection_review']=selection_response()['selection_review']
    if run.kind=='experiment_review' and run.review_version in (12,13,14):
        from quant.experiments.review_evidence import for_run
        generated=response(for_run(run))
        if 'temporal_parameter_review' in generated:value['temporal_parameter_review']=generated['temporal_parameter_review']
    return value


def selection_response():
    value=response()
    value['selection_review']={'text':'本次固定家族的分块反转与歧义仅用于诊断；未记录的试验和外部使用仍未知，不表示独立验证。',
        'evidence_refs':['selection_diagnostic']}
    return value


class ExperimentReviewTests(TestCase):
    setUp = ExperimentJobsTests.setUp
    collect = ExperimentJobsTests.collect
    publish = ExperimentJobsTests.publish
    prepare = ExperimentJobsTests.prepare
    start = ExperimentJobsTests.start

    def ready(self):
        self.prepare()
        request = self.start()
        with self.captureOnCommitCallbacks(execute=True):
            calculate(request.job.pk)
        return request, AIRun.objects.get(kind='experiment_review')

    def test_candidate_identity_is_not_a_seed_evidence_reference(self):
        request, _ = self.ready()
        evidence = for_result(request.result)
        seed_ref = next(key for key in evidence['evidence'] if key.startswith('seed:'))
        value = response()
        value['parameter_assessment'] = [{'text':'默认值依据父代定义', 'evidence_refs':[seed_ref]}]
        self.assertEqual(validate_review(value, evidence)['parameter_assessment'][0]['evidence_refs'], [seed_ref])
        value['parameter_assessment'][0]['evidence_refs'] = [seed_ref.removeprefix('seed:')]
        with self.assertRaisesRegex(ValidationError, '引用不存在'):
            validate_review(value, evidence)

    def test_automatic_review_publication_revision_and_sync(self):
        request, run = self.ready()
        auto_review(request.result.pk, request.job.lease_token)
        self.assertEqual(AIRun.objects.filter(kind='experiment_review').count(), 1)
        evidence = for_result(request.result)
        self.assertNotIn('rows', evidence['evidence']['dataset'])
        self.assertNotIn('curve', evidence['evidence']['holdout'])
        self.assertEqual(len([key for key in evidence['evidence'] if key.startswith('attempt-')]), request.checkpoints.count())
        self.assertIn('实际参数', prompt(run))
        with patch('quant.worker.complete', return_value=json.dumps(selection_response())):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        report = ResearchReport.objects.get(run=run)
        self.assertEqual(report.schema_version, 4)
        self.assertIsNone(report.data['total_score'])
        self.assertFalse(report.data['independent_holdout_proven'])
        self.assertIn('下一轮待验证假设', report.markdown)
        url = f'/api/quant/{self.collection.pk}/entries/{run.entry_id}/reports/{report.pk}/'
        self.assertEqual(self.client.patch(url, {'markdown': '人工删减后的结论', 'expected_revision_id': ''}, format='json').status_code, 200)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(ResearchReport.objects.get(pk=report.pk).revisions.get().markdown, '人工删减后的结论')
        self.assertFalse(Job.objects.exists())
        self.assertEqual(AIRun.objects.get(pk=run.pk).experiment_result_id, request.result.pk)
        altered = copy.deepcopy(snapshot)
        next(row for row in altered if row['model'] == 'quant.airun' and row['pk'] == run.pk)['fields']['result']['evidence_hash'] = 'invented'
        with self.assertRaises(SyncError):
            validate(altered, metadata(altered))
        missing = [row for row in snapshot if not (row['model'] == 'quant.researchreport' and row['pk'] == report.pk)
            and not (row['model'] == 'quant.reportrevision' and row['fields']['report'] == report.pk)]
        with self.assertRaises(SyncError):
            validate(missing, metadata(missing))

    def test_missing_evidence_and_unjustified_stability_are_rejected(self):
        request, run = self.ready()
        evidence = for_result(request.result)
        invalid = response(); invalid['findings'][0]['evidence_refs'] = ['attempt-999']
        with self.assertRaises(ValidationError):
            validate_review(invalid, evidence)
        invalid = response(); invalid['scores'][0]['score'] = 4
        with self.assertRaises(ValidationError):
            validate_review(invalid, evidence)
        invalid = response(); invalid['scores'][1]['score'] = 4
        with self.assertRaises(ValidationError):
            validate_review(invalid, evidence)
        with patch('quant.worker.complete', return_value=json.dumps(invalid)):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')
        self.assertFalse(ResearchReport.objects.filter(run=run).exists())

    def test_same_parent_parameter_evidence_is_required_for_scoring(self):
        request, _ = self.ready()
        evidence = for_result(request.result)
        variants = [key for key, value in evidence['evidence'].items() if key.startswith('attempt-')
            and value['operation'] == 'parameter_variant' and value['status'] == 'evaluated']
        self.assertTrue(variants)
        result = response(); score = result['scores'][0]
        score.update(score=3, evidence_refs=['attempt-1', variants[0]])
        self.assertEqual(validate_review(result, evidence)['scores'][0]['score'], 3)
        # A combination, even if evaluated, cannot masquerade as a window sensitivity test.
        evidence['evidence'][variants[0]]['operation'] = 'mean'
        with self.assertRaises(ValidationError):
            validate_review(result, evidence)

    def test_cancel_restore_and_cross_result_ownership(self):
        request, run = self.ready()
        endpoint = f'/api/quant/{self.collection.pk}/entries/{run.entry_id}/runs/'
        reset_execution()
        with patch('quant.worker.complete') as model:
            execute(run.pk)
        model.assert_not_called()
        auto_review(request.result.pk, request.job.lease_token)
        self.assertFalse(Job.objects.exists())
        other = self.collect()
        result = self.client.post(f'/api/quant/{self.collection.pk}/entries/{other.pk}/runs/', {
            'kind': 'experiment_review', 'source_id': run.source_id, 'experiment_result_id': 'missing',
            'request_key': 'experiment_review_bad_01'}, format='json')
        self.assertEqual(result.status_code, 400)
        retried = self.client.post(endpoint, {'kind': 'experiment_review', 'source_id': run.source_id,
            'experiment_result_id': request.result.pk, 'request_key': 'experiment_review_retry_01'}, format='json')
        self.assertEqual(retried.status_code, 200, retried.data)
        retry = AIRun.objects.filter(kind='experiment_review').exclude(pk=run.pk).get()
        self.client.post(endpoint + retry.pk + '/cancel/')
        with patch('quant.worker.complete') as model:
            execute(retry.pk)
        model.assert_not_called()

    def test_missing_model_keeps_calculation_and_explicit_retry(self):
        self.prepare(); request = self.start()
        from system_settings.models import SystemSetting
        SystemSetting.objects.filter(key='system_ai_config').update(value={})
        with self.captureOnCommitCallbacks(execute=True):
            calculate(request.job.pk)
        self.assertEqual(request.result.data['status'], 'completed')
        self.assertFalse(AIRun.objects.filter(kind='experiment_review').exists())
        with self.captureOnCommitCallbacks(execute=True):
            run = start_review(request.result, request_key='manual_review_model_01', model_id=self.model.pk)
        self.assertEqual(run.status, 'pending')

    def test_restore_revokes_deferred_automatic_followup(self):
        self.prepare(); request = self.start()
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            calculate(request.job.pk)
        self.assertTrue(callbacks)
        reset_execution()
        for callback in callbacks:
            callback()
        self.assertFalse(AIRun.objects.filter(kind='experiment_review').exists())

    def test_model_executor_submission_failure_is_visible(self):
        _, run = self.ready()
        from quant.worker import dispatch
        with override_settings(QUANT_DISABLE_WORKERS=False), patch('quant.worker.executor.submit', side_effect=RuntimeError('test unavailable')):
            dispatch(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')
        self.assertFalse(Job.objects.get(run=run).lease_until)
