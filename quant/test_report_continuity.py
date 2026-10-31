"""Downstream retries keep the accepted prose alongside new scores/plans."""
from django.test import TestCase
from quant.models import AIRun, ResearchReport, SourceRevision
from quant.research.services import revise_report
from quant.research.continuity import preserve_reading
from quant.research.presentation import report_data


class ReportContinuityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from quant.test_reading import ReadingTests
        ReadingTests.setUpTestData.__func__(cls)
        revise_report(cls.report, '## 这个指标做什么\n\n已确认正文\n\n## 它是怎么计算的', '')

    def next_report(self, stage='review', *, source=None, changed=False):
        source = source or self.source
        data = {**self.report.data, 'total_score': 68}
        if changed:
            data['formula'] = 'different formula'
        run = AIRun.objects.create(entry=self.entry, source=source, kind='analyze', status='completed',
            resume_run_id=self.task.pk, restart_stage=stage, request_key=f'next-{stage}-{source.pk}-{changed}', result=data)
        return ResearchReport.objects.create(entry=self.entry, source=source, run=run, schema_version=3,
            data=data, markdown='旧版自动排版', content_hash='new')

    def test_scoring_and_plan_reuse_accepted_text_but_keep_new_data_and_original(self):
        for stage in ('review', 'plan'):
            report = self.next_report(stage)
            self.assertTrue(preserve_reading(report))
            report.refresh_from_db()
            value = report_data(report)
            self.assertIn('已确认正文', value['markdown'])
            self.assertEqual(value['original_markdown'], '旧版自动排版')
            self.assertEqual(value['data']['total_score'], 68)
            self.assertEqual(report.revisions.count(), 1)
            self.assertFalse(preserve_reading(report))
        self.report.refresh_from_db()
        self.assertEqual(self.report.data['total_score'], 60)

    def test_changed_source_full_analysis_or_changed_algorithm_does_not_inherit(self):
        source = SourceRevision.objects.create(material=self.material, payload={'code': 'changed'}, content_hash='changed')
        for report in (self.next_report('research'), self.next_report(source=source), self.next_report(changed=True)):
            self.assertFalse(preserve_reading(report))
            self.assertFalse(report.revisions.exists())

    def test_existing_edit_is_never_overwritten(self):
        report = self.next_report()
        revise_report(report, '用户的新修订', '')
        self.assertFalse(preserve_reading(report))
        report.refresh_from_db()
        self.assertEqual(report_data(report)['markdown'], '用户的新修订')
