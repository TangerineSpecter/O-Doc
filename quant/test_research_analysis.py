"""Analysis, collection and report revision contracts against isolated fake models."""
from quant.testing_reading import read_fixture
import json
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError
from anthology.models import Anthology
from system_settings.models import AIModel, AIProvider, SystemSetting
from quant.models import AIRun, Entry, ResearchReport, SourceRevision, Job
from quant.research.analysis import DIMENSIONS, validate_analysis
from quant.services import parse_result
from quant.worker import execute, prompt
from quant.sync import metadata, validate
from utils.sync_manager import SyncManager


def result():
    return dict(source_findings=[], source_findings_note='测试仅核对合同；不表示已经排除源码缺陷。',
        initial_planning_version=1, initial_planning_note='本测试无可执行实验方案', initial_proposal=None,
        extraction_version=1, extraction_note='本测试只验证报告，未拆分候选', factors=[], title='动量研究', kind='factor', summary='比较窗口收益', principle='使用过去收盘价',
        formula='close / close[N] - 1', usage='条件待验证', risks='数据口径未知', validation_plan='检查窗口和样本外数据',
        source_facts=['源码定义窗口'], assumptions=['假定数据可获得'], unknowns=['实际参数和市场'], tags=['动量'],
        parameters=[dict(name='N', type='int', default_value='20', category='signal', meaning='窗口',
            constraints='正整数', effect='改变跨度', suggestion='比较邻近窗口，待验证', evidence='N=20')],
        scores=[dict(dimension=name, score=3, reason='基本明确', evidence='源码计算表达式') for name in DIMENSIONS])


class AnalysisTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('research-owner')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.collection = Anthology.objects.create(type='quant', permission='private', user_id=f'user_{self.user.pk}', title='研究')
        provider = AIProvider.objects.create(name='隔离', type='OpenAi', base_url='https://unused.invalid/v1', api_key='test')
        self.model = AIModel.objects.create(provider=provider, name='test', type='chat')
        SystemSetting.objects.update_or_create(key='system_ai_config', defaults={'value': {'defaultChatModelId': self.model.pk}})
        self.url = f'/api/quant/{self.collection.pk}/intake/'
        self.payload = dict(code='N=20\ndef factor(close): return close / close.shift(N) - 1', description='原作者的解释',
                            request_key='collection_request_0001', model_id=self.model.pk)

    def collect(self):
        response = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return Entry.objects.get(pk=response.data['data']['entry']['id'])

    def test_collect_analyze_report_and_edit_end_to_end(self):
        entry = self.collect()
        self.collect()
        self.assertEqual(Entry.objects.count(), 1)
        self.assertEqual(SourceRevision.objects.count(), 1)
        self.assertEqual(AIRun.objects.count(), 1)
        listed = self.client.get(f'/api/quant/{self.collection.pk}/entries/?language=python')
        self.assertEqual([row['id'] for row in listed.data['data']['items']], [entry.pk])
        run = AIRun.objects.get()
        self.assertIsNone(run.source_version_id)
        self.assertIn('原作者的解释', prompt(run))
        with patch('quant.worker.complete', return_value=json.dumps(result())):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        detail = read_fixture(self.client, f'/api/quant/{self.collection.pk}/entries/{entry.pk}/')
        self.assertEqual(detail['runs'][0]['result']['analysis']['totalScore'], 60)
        report = ResearchReport.objects.get()
        self.assertEqual(report.data['total_score'], 60)
        entry.refresh_from_db()
        self.assertEqual(entry.title, '动量研究')
        url = f'/api/quant/{self.collection.pk}/entries/{entry.pk}/reports/{report.pk}/'
        saved = self.client.patch(url, {'markdown': '我的修订', 'expected_revision_id': ''}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(saved.data['data']['markdown'], '我的修订')
        self.assertNotIn('revisions', saved.json()['data'])
        original=self.client.get(url.replace('/reports/', '/reading/reports/')+'original/').json()['data']
        self.assertIn('动量研究', original['markdown'])
        stale = self.client.patch(url, {'markdown': '冲突覆盖', 'expected_revision_id': ''}, format='json')
        self.assertEqual(stale.status_code, 409)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(ResearchReport.objects.get().revisions.get().markdown, '我的修订')
        self.assertFalse(Job.objects.exists())

    def test_entry_list_score_matches_default_report_and_keeps_unknown(self):
        entry = self.collect()
        url = f'/api/quant/{self.collection.pk}/entries/'
        def score():
            return self.client.get(url).json()['data']['items'][0]['researchScore']

        self.assertIsNone(score())
        first_run = AIRun.objects.get(entry=entry)
        source = SourceRevision.objects.get(material__entry=entry)
        ResearchReport.objects.create(entry=entry, source=source, run=first_run, schema_version=3,
                                      data={'total_score': 60}, markdown='', content_hash='static')
        self.assertEqual(score(), 60)
        later_run = AIRun.objects.create(entry=entry, source=source, request_key='feedback_score_0001',
                                         input_hash='feedback', kind='feedback_review')
        ResearchReport.objects.create(entry=entry, source=source, run=later_run, schema_version=5,
                                      data={'total_score': 80}, markdown='', content_hash='feedback')
        self.assertEqual(score(), 60)
        latest_run = AIRun.objects.create(entry=entry, source=source, request_key='static_score_000002',
                                          input_hash='later', kind='analyze')
        latest = ResearchReport.objects.create(entry=entry, source=source, run=latest_run, schema_version=3,
                                               data={'total_score': None}, markdown='', content_hash='later')
        self.assertIsNone(score())
        ResearchReport.objects.filter(pk=latest.pk).update(data={'total_score': 0})
        self.assertEqual(score(), 0)
        ResearchReport.objects.filter(pk=latest.pk).update(data={'total_score': True})
        self.assertIsNone(score())

    def test_missing_model_keeps_material_and_input_errors_do_not(self):
        self.payload['model_id'] = 'missing'
        entry = self.collect()
        self.assertTrue(entry.materials.exists())
        self.assertFalse(AIRun.objects.exists())
        response = self.client.post(self.url, {'request_key': 'new_request_000002'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Entry.objects.count(), 1)
        self.payload['code'] = 'changed'
        self.assertEqual(self.client.post(self.url, self.payload, format='json').status_code, 409)

    def test_analysis_requires_owned_source_and_private_collection(self):
        entry = self.collect()
        other = get_user_model().objects.create_user('other-researcher')
        self.client.force_authenticate(other)
        response = self.client.post(self.url, self.payload, format='json')
        self.assertIn(response.status_code, (403, 404))
        self.client.force_authenticate(self.user)
        second = Entry.objects.create(anthology=self.collection, title='其他条目')
        response = self.client.post(f'/api/quant/{self.collection.pk}/entries/{second.pk}/runs/',
            {'kind': 'analyze', 'source_id': SourceRevision.objects.get().pk, 'request_key': 'cross_entry_00000001'}, format='json')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(AIRun.objects.filter(entry=entry).count(), 1)

    def test_unknown_score_does_not_get_averaged_or_become_performance(self):
        data = result()
        data['scores'][0]['score'] = None
        data['total_score'] = 99
        normalized = validate_analysis(data)
        self.assertIsNone(normalized['total_score'])
        self.assertEqual(normalized['evidence_status'], 'static_unverified')
        for score in (True, 3.5, 6):
            data['scores'][0]['score'] = score
            with self.assertRaises(ValidationError):
                parse_result('analyze', json.dumps(data))
        data = result()
        data['scores'][0]['dimension'] = DIMENSIONS[1]
        with self.assertRaises(ValidationError):
            validate_analysis(data)

    def test_malformed_analysis_never_publishes_report(self):
        self.collect()
        run = AIRun.objects.get()
        with patch('quant.worker.complete', return_value='{"summary":"partial"}'):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')
        self.assertFalse(ResearchReport.objects.exists())

    def test_url_only_cannot_receive_unsupported_scores(self):
        self.payload.update(code='', description='', url='https://example.com/research')
        self.collect()
        run = AIRun.objects.get()
        from quant.research.web_source import SourceFetchError
        with patch('quant.research.acquisition.fetch_source', side_effect=SourceFetchError('测试抓取失败')), patch('quant.worker.complete') as model:
            execute(run.pk)
        model.assert_not_called()
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')
        self.assertFalse(ResearchReport.objects.exists())
