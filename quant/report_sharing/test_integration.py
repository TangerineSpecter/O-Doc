"""Focused report sharing tests, including latest analysis and sync admission."""
import copy
import json
from types import SimpleNamespace
from unittest.mock import patch

from django.core import serializers
from django.http import QueryDict
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from anthology.models import Anthology
from quant.documents.sections import FIELDS
from quant.models import AIRun, Entry, ImportedResearchReport, ReportRevision, ResearchDocument, ResearchReport, SourceMaterial, SourceRevision
from quant.reading.directory import directory
from quant.reading.projections import overview
from quant.research.analysis import analysis_markdown
from quant.research.contracts import digest
from quant.sync import metadata, validate
from utils.sync_manager import SyncError
from .services import export_report, import_report
from .views import ExportShareView, ImportShareView, ShareImportParser


class ReportSharingTests(TestCase):
    def setUp(self):
        self.collection = Anthology.objects.create(title='分享测试', type='quant', permission='private', user_id='share-test')
        self.entry = Entry.objects.create(anthology=self.collection, title='研究', kind='factor')
        self.material = SourceMaterial.objects.create(entry=self.entry, title='来源')
        first = self.make_report('N=20', 'first', 60)
        second = self.make_report('N=30', 'second', 80)
        revision = ReportRevision.objects.create(report=first, markdown='# 已修改正文', content_hash=digest('# 已修改正文'))
        first.current_revision_id = revision.pk
        first.save(update_fields=['current_revision_id', 'updated_at'])
        latest_edit = ReportRevision.objects.create(report=second, markdown='# 最新报告人工修订', content_hash='test')
        second.current_revision_id = latest_edit.pk
        second.save(update_fields=['current_revision_id', 'updated_at'])
        sections = {key: {'report_id': first.pk, 'revision_id': revision.pk} for key in FIELDS}
        ResearchDocument.objects.create(entry=self.entry, sections=sections, pending=[second.pk])

    def make_report(self, code, key, score):
        payload = {'code': code, 'description': '说明', 'url': '', 'language': 'python', 'files': []}
        source = SourceRevision.objects.create(material=self.material, payload=payload, content_hash=digest(payload))
        run = AIRun.objects.create(entry=self.entry, source=source, kind='analyze', status='completed', request_key=key, result={})
        data = {'title': '研究', 'total_score': score, 'parameters': [{'name': 'N', 'default_value': code[2:]}]}
        return ResearchReport.objects.create(entry=self.entry, source=source, run=run, schema_version=2,
            data=data, markdown=f'# 原始报告 {code}', content_hash='test')

    def test_latest_original_import_and_sync(self):
        package = export_report(self.entry)
        self.assertEqual(package['report']['markdown'], '# 原始报告 N=30')
        self.assertEqual(package['report']['data']['total_score'], 80)
        self.assertEqual(package['report']['data']['parameters'][0]['default_value'], '30')
        self.assertEqual(package['source']['code'], 'N=30')
        self.assertEqual(package['source']['related'], [])
        imported = import_report(self.collection, package)
        self.collection.refresh_from_db()
        self.assertEqual(self.collection.count, 2)
        self.assertNotEqual(imported.pk, self.entry.pk)
        self.assertEqual(export_report(imported), package)
        self.assertFalse(imported.runs.exists())
        self.assertEqual(overview(imported)['research_score'], 80)
        self.assertIn(imported.pk, [item['id'] for item in directory(self.collection, QueryDict('language=python'))['items']])
        snapshot = json.loads(serializers.serialize('json', [self.collection, imported, ImportedResearchReport.objects.get(entry=imported)]))
        validate(snapshot, metadata(snapshot))
        broken = copy.deepcopy(snapshot)
        next(row for row in broken if row['model'] == 'quant.importedresearchreport')['fields']['package']['version'] = 999
        with self.assertRaises(SyncError):
            validate(broken, metadata(broken))

    def test_api_import_rejects_invalid_file_and_foreign_collection(self):
        factory = APIRequestFactory()
        user = SimpleNamespace(is_authenticated=True)
        with patch('quant.access.get_current_user_identifier', return_value='share-test'):
            request = factory.post('/', {'packageJson': '{}'}, format='json')
            force_authenticate(request, user=user)
            self.assertEqual(ImportShareView.as_view()(request, coll_id=self.collection.pk).status_code, 400)
            foreign = Anthology.objects.create(title='他人', type='quant', permission='private', user_id='other')
            request = factory.post('/', {'packageJson': json.dumps(export_report(self.entry), ensure_ascii=False)}, format='json')
            force_authenticate(request, user=user)
            self.assertEqual(ImportShareView.as_view()(request, coll_id=foreign.pk).status_code, 404)

    def test_legacy_export_without_creating_document(self):
        ResearchDocument.objects.filter(entry=self.entry).delete()
        package = export_report(self.entry)
        self.assertEqual(package['report']['markdown'], '# 原始报告 N=30')
        self.assertEqual(package['report']['data']['total_score'], 80)
        self.assertFalse(ResearchDocument.objects.filter(entry=self.entry).exists())

    def test_history_evidence_is_omitted_from_data_and_markdown(self):
        data = {key: '当前分析' for key in ('title', 'summary', 'principle', 'formula', 'usage', 'risks', 'validation_plan')}
        data.update(kind='factor', total_score=85, scores=[], parameters=[], source_facts=[],
                    assumptions=[], unknowns=[], source_memory_version=1, memory_note='旧版本事实',
                    memory_assessment=[], research_memory={'history': '旧版本事实'})
        source = self.material.revisions.first()
        run = AIRun.objects.create(entry=self.entry, source=source, kind='analyze', status='completed',
                                   request_key='with-history', result=data)
        ResearchReport.objects.create(entry=self.entry, source=source, run=run, schema_version=2,
                                      data=data, markdown=analysis_markdown(data), content_hash='test')
        package = export_report(self.entry)
        self.assertEqual(package['report']['data']['total_score'], 85)
        self.assertNotIn('research_memory', package['report']['data'])
        self.assertNotIn('旧版本事实', package['report']['markdown'])

    def test_oversized_envelope_and_wrong_methods(self):
        factory = APIRequestFactory()
        user = SimpleNamespace(is_authenticated=True)
        with patch('quant.access.get_current_user_identifier', return_value='share-test'):
            for method in (factory.get, factory.head):
                request = method('/')
                force_authenticate(request, user=user)
                self.assertEqual(ImportShareView.as_view()(request, coll_id=self.collection.pk).status_code, 405)
            request = factory.post('/', {'packageJson': '{}'}, format='json')
            force_authenticate(request, user=user)
            response = ExportShareView.as_view()(request, coll_id=self.collection.pk, entry_id=self.entry.pk)
            self.assertEqual(response.status_code, 405)
            request = factory.post('/', {'packageJson': ' ' * 80}, format='json')
            force_authenticate(request, user=user)
            with patch.object(ShareImportParser, 'max_bytes', 64):
                self.assertEqual(ImportShareView.as_view()(request, coll_id=self.collection.pk).status_code, 413)

    def test_invalid_import_score_and_legacy_directory_read(self):
        from rest_framework.exceptions import ValidationError

        package = export_report(self.entry)
        package['report']['data']['total_score'] = 10**400
        with self.assertRaises(ValidationError):
            import_report(self.collection, package)
        legacy = Entry.objects.create(anthology=self.collection, title='旧副本', kind='factor')
        ImportedResearchReport.objects.create(id=legacy.pk, entry=legacy, package=package)
        self.assertIsNone(overview(legacy)['research_score'])
        rows = directory(self.collection, QueryDict())['items']
        self.assertIsNone(next(row for row in rows if row['id'] == legacy.pk)['research_score'])
