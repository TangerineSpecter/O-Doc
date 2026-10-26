"""AI findings stay source-bound and visible even when quality scores are high."""
import json
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant import test_research_analysis as fixtures
from quant.models import AIRun, Job, ResearchReport
from quant.research.analysis import validate_analysis, validate_source_evidence, analysis_markdown
from quant.research.findings import validate_admission
from quant.worker import execute
from quant.sync import metadata, validate
from utils.sync_manager import SyncManager

CODE = 'def factor(close):\n    return close.shift(-1) / close - 1\n'


def response():
    value = fixtures.result()
    for score in value['scores']: score['score'] = 5
    value.update(source_findings_note='只完成静态时点审查，尚未运行、编译或检查真实行情。', source_findings=[{
        'title': '最终输出依赖未来一根价格', 'severity': 'critical', 'category': 'temporal_leakage', 'certainty': 'source_fact',
        'impact': '该输出不能直接作为当时可得的交易信号；高研究分不能消除此时点问题。',
        'recommendation': '将事后标签与可用特征分开，重新检验时点和数据。',
        'affected_dimensions': ['数据与时序可靠性'], 'evidence': [{'field': 'code', 'quote': 'close.shift(-1) / close - 1'}]}])
    return value


class SourceFindingsContractTests(SimpleTestCase):
    def test_tool_observations_cannot_be_relabelled_as_source_description(self):
        from quant.research.findings import from_review
        for quote in ('仅词法结构候选，未调用原平台编译器。', '尚无受控表达式，不能检查引用和类型。'):
            value = response()
            value['source_findings'].append({**value['source_findings'][0],
                'title':'本机工具覆盖', 'evidence':[{'field':'description','quote':quote}]})
            with self.subTest(quote=quote), self.assertRaisesRegex(ValidationError, '逐字存在'):
                from_review(value, {'code':CODE,'description':'','web_markdown':''})
            value['source_findings'].pop()
            value['source_findings_note'] += quote
            self.assertEqual(len(from_review(value, {'code':CODE})['source_findings']), 1)

    def test_critical_issue_is_before_quality_score_without_changing_original_scores(self):
        value = {**response(), 'source_findings_version': 1}
        result = validate_analysis(value)
        validate_source_evidence(result, {'code': CODE})
        self.assertEqual(result['total_score'], 100)
        text = analysis_markdown(result)
        self.assertLess(text.index('问题清单与严重度'), text.index('研究质量评价'))
        self.assertIn('研究总分不能视为通过结论', text)
        self.assertEqual(result['source_findings'][0]['certainty'], 'source_fact')

    def test_invalid_or_fabricated_evidence_and_legacy_promotion_are_rejected(self):
        for change in ({'severity': 'unknown'}, {'affected_dimensions': ['实现质量', '实现质量']}, {'evidence': []}):
            value = {**response(), 'source_findings_version': 1}; value['source_findings'][0].update(change)
            with self.subTest(change=change), self.assertRaises(ValidationError): validate_analysis(value)
        value = validate_analysis({**response(), 'source_findings_version': 1})
        with self.assertRaises(ValidationError): validate_source_evidence(value, {'code': 'return close'})
        with self.assertRaises(ValidationError): validate_admission(value, 12)
        with self.assertRaises(ValidationError): validate_admission(fixtures.result(), 14)


class SourceFindingsWorkflowTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp
    collect = fixtures.AnalysisTests.collect

    def start(self):
        self.payload.update(code=CODE, description='测试：说明不是运行证据')
        entry = self.collect()
        return entry, AIRun.objects.get(entry=entry)

    def finish(self, run, value):
        with patch('quant.worker.complete', return_value=json.dumps(value)) as model: execute(run.pk)
        run.refresh_from_db()
        return model

    def test_new_report_api_manual_revision_and_sync_preserve_findings(self):
        entry, run = self.start(); model = self.finish(run, response())
        self.assertEqual(run.status, 'completed', run.error); self.assertEqual(run.workflow_version, 16)
        self.assertTrue(any('source_findings_note' in call.args[1] for call in model.call_args_list))
        report = ResearchReport.objects.get(run=run)
        data = self.client.get(f'/api/quant/{self.collection.pk}/entries/{entry.pk}/').json()['data']
        wire = data['reports'][0]['data']
        self.assertEqual(wire['sourceFindingsVersion'], 1); self.assertEqual(wire['totalScore'], 100)
        self.assertEqual(wire['sourceFindings'][0]['evidence'][0]['quote'], 'close.shift(-1) / close - 1')
        url = f'/api/quant/{self.collection.pk}/entries/{entry.pk}/reports/{report.pk}/'
        changed = self.client.patch(url, {'markdown': '人工删减后的正文', 'expected_revision_id': ''}, format='json')
        self.assertEqual(changed.status_code, 200, changed.data)
        report.refresh_from_db(); self.assertEqual(report.data['source_findings'][0]['severity'], 'critical')
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        with patch('quant.worker.dispatch') as dispatch:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        dispatch.assert_not_called(); self.assertFalse(Job.objects.exists())
        restored = ResearchReport.objects.get(pk=report.pk)
        self.assertEqual(restored.data['source_findings_version'], 1)
        self.assertEqual(restored.revisions.get().markdown, '人工删减后的正文')

    def test_missing_findings_or_fabricated_quote_fail_before_publication(self):
        for index in range(2):
            self.payload['request_key'] = f'source_finding_failure_0{index}'
            entry, run = self.start(); value = response()
            if index == 0: value.pop('source_findings')
            else: value['source_findings'][0]['evidence'][0]['quote'] = 'fabricated source'
            self.finish(run, value)
            self.assertEqual(run.status, 'failed'); self.assertFalse(ResearchReport.objects.filter(entry=entry).exists())
            self.assertEqual(run.workflow_steps.last().stage, 'review')

    def test_legacy_workflow_has_no_appended_findings_or_changed_markdown(self):
        _, run = self.start()
        AIRun.objects.filter(pk=run.pk).update(workflow_version=12)
        self.finish(run, response())
        self.assertEqual(run.status, 'completed', run.error)
        self.assertNotIn('source_findings_version', run.result)
        self.assertNotIn('问题清单与严重度', run.report.markdown)
        validate(SyncManager().build_snapshot_data(), metadata(SyncManager().build_snapshot_data()))
