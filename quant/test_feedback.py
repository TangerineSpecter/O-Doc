"""External facts are preserved, quote-checked and never become calculated performance."""
from quant.testing_reading import read_fixture
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError
from quant import test_research_analysis as analysis_fixtures
from quant import test_experiment_jobs as experiment_fixtures
from quant.models import AIRun, Entry, SourceRevision, ResearchReport, Job
from quant.feedback.contracts import validate_analysis
from quant.feedback.evidence import for_source
from quant.worker import execute, prompt
from quant.sync import metadata, validate
from quant.research.contracts import digest
from utils.sync_manager import SyncManager, SyncError


def response():
    return {'feedback_planning_version': 1, 'feedback_planning_note': '缺少明确验证条件，暂不提出可执行方案', 'feedback_proposal': None,
        'title': '外部反馈研究', 'summary': '报告声称收益为负，仍需核对成本和时间',
        'reported_parameters': [{'name': 'N', 'value': '10', 'unit': 'bar', 'quote': 'N=10'}],
        'reported_metrics': [{'name': '净收益', 'value': '-2%', 'unit': '%', 'quote': 'net=-2%'}],
        'supporting_evidence': [], 'counter_evidence': [{'claim': '报告记录负净收益', 'quote': 'net=-2%'}],
        'comparison': '声明参数与来源默认 N=20 不同，不能直接比较效果', 'hypotheses': ['成本可能影响结果'],
        'unknowns': ['时区和成本明细'], 'next_steps': '固定参数和成本，在新行情检验'}


class FeedbackTests(TestCase):
    setUp = analysis_fixtures.AnalysisTests.setUp
    collect = analysis_fixtures.AnalysisTests.collect

    def prepare(self):
        self.payload['analyze'] = False
        entry = self.collect()
        target = SourceRevision.objects.get()
        url = f'/api/quant/{self.collection.pk}/entries/{entry.pk}/feedback/'
        data = {'request_key': 'external_feedback_0001', 'title': '测试反馈', 'target_source_id': target.pk,
            'mode': 'live', 'document_format': 'text', 'document': 'N=10\nnet=-2%', 'platform': 'MT4 测试'}
        return entry, target, url, data

    def test_archive_analyze_revision_and_sync_replay(self):
        entry, target, url, data = self.prepare()
        saved = self.client.post(url, data, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        source = SourceRevision.objects.get(pk=saved.data['data']['source']['id'])
        run = AIRun.objects.get(kind='feedback_review')
        before = prompt(run)
        self.assertIn('N=20', before); self.assertIn('net=-2%', before)
        self.assertNotIn('curve', for_source(source))
        with patch('quant.worker.complete', return_value=json.dumps(response())):
            execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        report = ResearchReport.objects.get(run=run)
        self.assertEqual(report.schema_version, 5)
        self.assertEqual(report.data['reported_parameters'][0]['value'], '10')
        self.assertNotIn('total_score', report.data)
        self.assertEqual(report.data['evidence_status'], 'external_report_unverified')
        detail = read_fixture(self.client, f'/api/quant/{self.collection.pk}/entries/{entry.pk}/')
        self.assertEqual(detail['runs'][0]['result']['feedback']['reportedMetrics'][0]['value'], '-2%')
        self.assertEqual(self.client.patch(f'/api/quant/{self.collection.pk}/entries/{entry.pk}/reports/{report.pk}/',
            {'markdown': '人工补充核对', 'expected_revision_id': ''}, format='json').status_code, 200)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(Job.objects.exists())
        self.assertEqual(prompt(AIRun.objects.get(pk=run.pk)), before)
        replay = self.client.post(url, data, format='json')
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(AIRun.objects.count(), 1); self.assertFalse(Job.objects.exists())
        self.assertEqual(SourceRevision.objects.count(), 2)
        changed = self.client.post(url, {**data, 'document': 'changed'}, format='json')
        self.assertEqual(changed.status_code, 409)

    def test_missing_model_archives_without_fake_result_and_retry_is_explicit(self):
        entry, _, url, data = self.prepare()
        saved = self.client.post(url, {**data, 'model_id': 'missing'}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertTrue(saved.data['data']['notice']); self.assertFalse(AIRun.objects.exists())
        source_id = saved.data['data']['source']['id']
        path = f'/api/quant/{self.collection.pk}/entries/{entry.pk}/runs/'
        payload = {'kind': 'feedback_review', 'source_id': source_id, 'request_key': 'explicit_feedback_retry1'}
        started = self.client.post(path, payload, format='json')
        self.assertEqual(started.status_code, 200, started.data)
        self.assertEqual(self.client.post(path, {**payload, 'kind': 'analyze', 'request_key': 'wrong_feedback_kind01'}, format='json').status_code, 400)
        self.assertFalse(ResearchReport.objects.exists())

    def test_quotes_invalid_json_and_wrong_targets_rejected(self):
        entry, target, url, data = self.prepare()
        second = Entry.objects.create(anthology=self.collection, title='另一个来源')
        wrong = f'/api/quant/{self.collection.pk}/entries/{second.pk}/feedback/'
        self.assertEqual(self.client.post(wrong, data, format='json').status_code, 400)
        for raw in ('{bad', '{"value": NaN}', '{"value": 1e999}', 'false'):
            self.assertEqual(self.client.post(url, {**data, 'document_format': 'json', 'document': raw}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {**data, 'factor_id': 'missing'}, format='json').status_code, 400)
        saved = self.client.post(url, data, format='json')
        source = SourceRevision.objects.get(pk=saved.data['data']['source']['id'])
        bad = response(); bad['reported_metrics'][0]['quote'] = 'profit=99%'
        with self.assertRaises(ValidationError): validate_analysis(bad, for_source(source))
        invented = response(); invented['reported_metrics'][0]['value'] = '99%'
        with self.assertRaises(ValidationError): validate_analysis(invented, for_source(source))
        with patch('quant.worker.complete', return_value=json.dumps(bad)): execute(AIRun.objects.get().pk)
        self.assertEqual(AIRun.objects.get().status, 'failed'); self.assertFalse(ResearchReport.objects.exists())
        other = get_user_model().objects.create_user('feedback-other')
        self.client.force_authenticate(other)
        self.assertIn(self.client.post(url, data, format='json').status_code, (403, 404))

    def test_snapshot_tampering_rejected_after_rehash(self):
        _, _, url, data = self.prepare()
        self.client.post(url, data, format='json')
        with patch('quant.worker.complete', return_value=json.dumps(response())): execute(AIRun.objects.get().pk)
        snapshot = SyncManager().build_snapshot_data()
        for key, value in [('target_source_id', 'absent'), ('factor_id', 'absent'), ('experiment_result_id', 'absent'), ('document', 'N=10 only')]:
            altered = copy.deepcopy(snapshot)
            row = next(row for row in altered if row['model'] == 'quant.sourcerevision' and row['fields']['payload'].get('provenance') == 'external_feedback')
            row['fields']['payload'][key] = value
            row['fields']['content_hash'] = digest(row['fields']['payload'])
            with self.assertRaises(SyncError): validate(altered, metadata(altered))

    def test_large_combined_context_is_archived_and_restorable_without_model_authorization(self):
        self.payload['code'] = 'x=' + '1' * 149998
        _, _, url, data = self.prepare()
        saved = self.client.post(url, {**data, 'document': '观察' * 30000}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertIn('上限', saved.data['data']['notice'])
        self.assertFalse(AIRun.objects.exists())
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(SourceRevision.objects.filter(payload__provenance='external_feedback').count(), 1)
        self.assertFalse(Job.objects.exists())


class FeedbackExperimentTests(TestCase):
    setUp = experiment_fixtures.ExperimentJobsTests.setUp
    collect = experiment_fixtures.ExperimentJobsTests.collect
    publish = experiment_fixtures.ExperimentJobsTests.publish
    prepare = experiment_fixtures.ExperimentJobsTests.prepare
    start = experiment_fixtures.ExperimentJobsTests.start

    def test_fixed_factor_and_actual_selected_experiment_are_available_for_comparison(self):
        from quant.experiments.worker import execute as calculate
        candidate, _ = self.prepare()
        request = self.start(); calculate(request.job.pk)
        url = f'/api/quant/{self.collection.pk}/entries/{candidate.report.entry_id}/feedback/'
        data = {'request_key': 'linked_external_feedback01', 'title': '关联实际参数', 'target_source_id': candidate.report.source_id,
            'factor_id': candidate.pk, 'experiment_result_id': request.result.pk, 'mode': 'backtest', 'document': 'N=10\nnet=-2%'}
        saved = self.client.post(url, data, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        source = SourceRevision.objects.get(pk=saved.data['data']['source']['id'])
        context = for_source(source)
        self.assertEqual(context['factor']['id'], candidate.pk)
        self.assertEqual(context['experiment']['seeds'][0]['parameters'], {'N': 5})
        self.assertEqual(context['experiment']['dataset']['symbol'], 'SYNTHETIC')
        self.assertTrue(context['experiment']['selected_attempt']['recipe'])
        self.assertNotIn('curve', context['experiment']['holdout'])
        run = AIRun.objects.get(kind='feedback_review')
        with patch('quant.worker.complete', return_value=json.dumps(response())): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(for_source(SourceRevision.objects.get(pk=source.pk)), context)
