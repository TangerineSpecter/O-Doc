"""Read-only change previews use explicit owned versions and preserve old research."""
import copy
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from anthology.models import Anthology
from quant import test_research_analysis as fixtures
from quant.models import AIRun, Entry, FactorCandidate, Job, ResearchReport, SourceMaterial, SourceRevision
from quant.research.contracts import digest
from quant.research.services import revise_report
from quant.sync import metadata, validate
from quant.test_factors import extracted
from quant.worker import execute
from utils.sync_manager import SyncManager


class SourceChangeAPITests(TestCase):
    setUp = fixtures.AnalysisTests.setUp

    def versions(self):
        entry = Entry.objects.create(anthology=self.collection, title='独立源码版本')
        self.base = f'/api/quant/{self.collection.pk}/entries/{entry.pk}/'
        code = self.payload['code']
        saved = self.client.post(self.base + 'implementations/', {'name': 'Python 实现', 'language': 'python', 'code': code}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        impl_id = saved.data['data']['id']
        old = SourceRevision.objects.get(material__entry=entry)
        saved = self.client.post(self.base + 'runs/', {'kind': 'analyze', 'source_id': old.pk,
            'model_id': self.model.pk, 'request_key': 'source_change_baseline_01'}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        run = AIRun.objects.get(entry=entry)
        with patch('quant.worker.complete', return_value=json.dumps(extracted())):
            execute(run.pk)
        report = ResearchReport.objects.get(entry=entry)
        saved = self.client.post(self.base + f'implementations/{impl_id}/versions/',
            {'code': code.replace('N=20', 'N=25'), 'language': 'python'}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        new = SourceRevision.objects.get(material=old.material, code_version_id=saved.data['data']['id'])
        self.assertNotEqual(new.pk, old.pk)
        return entry, old, new, report

    def preview(self, target, report, expected=200, **extra):
        saved = self.client.get(self.base + 'source-impact/', {'sourceId': target.pk, 'reportId': report.pk, **extra})
        self.assertEqual(saved.status_code, expected, saved.data)
        return json.loads(saved.json()['data']['impactJson']) if expected == 200 else saved

    def test_current_pointer_projection_and_explicit_read_only_preview(self):
        entry, old, new, report = self.versions()
        revise_report(report, '保留我的报告删减', '')
        old_facts = copy.deepcopy(report.data)
        counts = (AIRun.objects.count(), Job.objects.count(), FactorCandidate.objects.count())
        with patch('quant.worker.complete', side_effect=AssertionError('read-only preview called model')):
            result = self.preview(new, report)
            self.assertEqual(self.preview(new, report), result)
        self.assertEqual(result['relationship'], 'same_material')
        self.assertEqual(result['baseline']['report_hash'], report.content_hash)
        self.assertEqual(result['baseline']['source_hash'], old.content_hash)
        self.assertEqual(result['target']['source_hash'], new.content_hash)
        self.assertIn('code', result['impact']['changed_fields'])
        self.assertEqual(result['impact']['structure']['new_parser'], 'python-provided-file-bindings-v1')
        changed_function = next(row for row in result['impact']['structure']['nodes'] if row['name'] == '__source__.py::factor')
        self.assertEqual(changed_function['impact'], 'potential')
        self.assertTrue(any('词法绑定' in reason for reason in changed_function['reasons']))
        self.assertFalse(result['impact']['recommendation']['can_reuse_stages'])
        self.assertEqual(result['impact']['recommendation']['start_stage'], 'normalize')
        self.assertEqual((AIRun.objects.count(), Job.objects.count(), FactorCandidate.objects.count()), counts)
        report.refresh_from_db()
        self.assertEqual(report.data, old_facts)
        self.assertEqual(report.revisions.get().markdown, '保留我的报告删减')
        detail = self.client.get(self.base).json()['data']
        sources = {row['id']: row for row in detail['sources']}
        self.assertEqual(sources[old.pk]['materialCurrentSourceId'], new.pk)
        self.assertEqual(sources[new.pk]['materialCurrentSourceId'], new.pk)
        self.assertEqual(sources[new.pk]['contentHash'], new.content_hash)
        self.assertEqual(report.source_id, old.pk)
        same = self.preview(old, report)
        self.assertEqual(same['relationship'], 'same_source')
        self.assertEqual(same['impact']['status'], 'identical')
        snapshot = SyncManager().build_snapshot_data()
        self.assertEqual(metadata(snapshot)['quant_schema_version'], 70)
        validate(snapshot, metadata(snapshot))

    def test_cross_material_requires_explicit_baseline_and_never_claims_new_version(self):
        entry, old, new, report = self.versions()
        material = SourceMaterial.objects.create(entry=entry, title='另一个实现')
        payload = copy.deepcopy(new.payload)
        # A different material can be compared explicitly, without assigning it
        # the old material's version lineage or moving either current pointer.
        payload = {'description': '独立文字说明', 'url': '', 'provenance': 'legacy_entry', 'fetch_status': 'not_fetched'}
        target = SourceRevision.objects.create(material=material, payload=payload, content_hash=digest(payload))
        material.current_revision_id = target.pk
        material.save()
        result = self.preview(target, report)
        self.assertEqual(result['relationship'], 'different_material')
        self.assertEqual(result['baseline']['source_id'], old.pk)
        self.assertEqual(result['target']['source_id'], target.pk)
        missing = self.client.get(self.base + 'source-impact/', {'sourceId': target.pk})
        self.assertEqual(missing.status_code, 400)

    def test_foreign_entries_reports_and_owners_are_not_previewable(self):
        entry, old, new, report = self.versions()
        other_entry = Entry.objects.create(anthology=self.collection, title='同文集另一研究')
        saved = self.client.get(f'/api/quant/{self.collection.pk}/entries/{other_entry.pk}/source-impact/',
            {'sourceId': new.pk, 'reportId': report.pk})
        self.assertEqual(saved.status_code, 404)
        foreign = Anthology.objects.create(type='quant', permission='private', user_id='user_foreign', title='其他私密库')
        saved = self.client.get(f'/api/quant/{foreign.pk}/entries/{entry.pk}/source-impact/',
            {'sourceId': new.pk, 'reportId': report.pk})
        self.assertIn(saved.status_code, (403, 404))
        self.client.force_authenticate(get_user_model().objects.create_user('source-foreign-reader'))
        self.preview(new, report, 404)
        self.client.force_authenticate(self.user)
        entry.is_valid = False
        entry.save()
        self.preview(new, report, 404)

    def test_new_version_analysis_is_independent_and_prior_evidence_survives(self):
        entry, old, new, report = self.versions()
        original = copy.deepcopy(report.data)
        old_factor = FactorCandidate.objects.get(report=report)
        self.preview(new, report)
        invalid = self.client.post(self.base + 'runs/', {'kind': 'analyze', 'source_id': new.pk,
            'resume_run_id': report.run_id, 'restart_stage': 'parameters', 'model_id': self.model.pk,
            'request_key': 'cannot_reuse_new_source_01'}, format='json')
        self.assertEqual(invalid.status_code, 400)
        saved = self.client.post(self.base + 'runs/', {'kind': 'analyze', 'source_id': new.pk,
            'model_id': self.model.pk, 'request_key': 'new_source_independent_01'}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        fresh = AIRun.objects.get(pk=saved.data['data']['id'])
        self.assertEqual(fresh.source_id, new.pk)
        self.assertFalse(fresh.resume_run_id)
        value = extracted()
        value['parameters'][0].update(default_value='25', evidence='N=25')
        value['factors'][0]['parameters'] = copy.deepcopy(value['parameters'])
        with patch('quant.worker.complete', return_value=json.dumps(value)):
            execute(fresh.pk)
        fresh.refresh_from_db()
        self.assertEqual(fresh.status, 'completed', fresh.error)
        report.refresh_from_db()
        self.assertEqual(report.data, original)
        self.assertEqual(report.source_id, old.pk)
        old_factor.refresh_from_db()
        self.assertEqual(old_factor.report_id, report.pk)
        self.assertEqual(entry.reports.count(), 2)
        self.assertEqual(FactorCandidate.objects.get(report__run=fresh).data['parameters'][0]['default_value'], '25')

    def test_experiment_and_feedback_reports_cannot_supply_static_baseline(self):
        entry, old, new, report = self.versions()
        # The owner boundary rejects unsupported report kinds before inspecting
        # their payload. These temporary fixture rows are not sync evidence.
        for schema, kind in ((4, 'experiment_review'), (5, 'feedback_review')):
            run = AIRun.objects.create(entry=entry, source=old, kind=kind, status='completed',
                request_key=f'unsupported_baseline_{schema}', input_hash='fixture', result={})
            unsupported = ResearchReport.objects.create(entry=entry, source=old, run=run, schema_version=schema,
                data={}, markdown='Unsupported baseline fixture', content_hash='fixture')
            self.preview(new, unsupported, 404)

    def test_legacy_explanation_can_supply_code_baseline_without_invented_factors(self):
        entry, old, new, report = self.versions()
        saved = self.client.post(self.base + 'runs/', {'kind': 'explain', 'source_version_id': old.code_version_id,
            'model_id': self.model.pk, 'request_key': 'legacy_baseline_preview_01'}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        with patch('quant.worker.complete', return_value=json.dumps({'explanation': '历史解释只作为原文基准'})):
            execute(saved.data['data']['id'])
        legacy = ResearchReport.objects.get(run_id=saved.data['data']['id'])
        self.assertEqual(legacy.schema_version, 1)
        result = self.preview(new, legacy)
        self.assertEqual(result['baseline']['source_id'], old.pk)
        self.assertEqual(result['impact']['parameters'], [])
        self.assertEqual(result['impact']['factors'], [])
        self.assertIn('code', result['impact']['changed_fields'])
