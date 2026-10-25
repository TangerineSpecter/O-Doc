"""Isolated lineage, concurrency, migration and sync tests; no models/files executed."""
import json
from copy import deepcopy
from django.apps import apps
from django.core import serializers
from django.core.exceptions import ValidationError as ModelError
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from unittest.mock import patch
from anthology.models import Anthology
from utils.sync_manager import SyncError, SyncManager
from quant.models import (Entry, Implementation, CodeVersion, AIRun, Job, SourceMaterial,
                          SourceRevision, ResearchReport, ReportRevision)
from quant.services import create_implementation, save_version, Conflict
from quant.research.services import capture_version, publish_legacy_report, revise_report
from quant.research.legacy_v1 import upgrade
from quant.research.contracts import digest
from quant.sync import validate, metadata, reset_execution


class ResearchFoundationTests(TestCase):
    def setUp(self):
        self.collection = Anthology.objects.create(type='quant', permission='private', title='测试', user_id='test-owner')
        self.entry = Entry.objects.create(anthology=self.collection, title='来源', content='原笔记',
                                          source_url='https://example.invalid/original')
        self.impl = create_implementation(self.entry, {'name': '代码', 'language': 'python', 'code': 'x = 1'})
        self.version = CodeVersion.objects.get(pk=self.impl.current_version_id)
        self.run = AIRun.objects.create(entry=self.entry, source_version=self.version, request_key='explanation',
            input_hash='test', kind='explain', status='completed', result={'explanation': '原理', 'limitations': '未回测'})

    def snapshot(self):
        types = [Anthology, Entry, Implementation, CodeVersion, AIRun,
                 SourceMaterial, SourceRevision, ResearchReport, ReportRevision]
        return json.loads(serializers.serialize('json', [obj for cls in types for obj in cls.objects.all()]))

    def test_sources_reports_are_idempotent_and_keep_all_sections(self):
        source = capture_version(self.version)
        self.assertEqual(capture_version(self.version).pk, source.pk)
        report = publish_legacy_report(self.run)
        self.assertIn('未回测', report.markdown)
        self.assertEqual(publish_legacy_report(self.run).pk, report.pk)
        upgrade(apps)
        upgrade(apps)
        self.assertEqual(ResearchReport.objects.count(), 1)
        self.assertEqual(SourceRevision.objects.count(), 2)
        self.assertEqual(Entry.objects.get(pk=self.entry.pk).content, '原笔记')
        self.assertEqual(Job.objects.count(), 0)
        validate(self.snapshot(), metadata(self.snapshot()))

    def test_manual_edits_preserve_original_and_reject_stale_writes(self):
        report = publish_legacy_report(self.run)
        revision = revise_report(report, '删改后的报告', '')
        with self.assertRaises(Conflict):
            revise_report(report, '另一个页面覆盖', '')
        second = revise_report(report, '', revision.pk)
        report.refresh_from_db()
        self.assertEqual(report.current_revision_id, second.pk)
        self.assertIn('原理', report.markdown)
        self.assertEqual(second.parent_id, revision.pk)
        report.markdown = '原稿被修改'
        with self.assertRaises(ModelError):
            report.save()
        forged = ReportRevision(id=revision.pk, report=report, parent_id='', markdown='伪造覆盖', content_hash=digest('伪造覆盖'))
        with self.assertRaises(ModelError):
            forged.save()
        validate(self.snapshot())

    def test_analysis_of_old_code_does_not_move_current_source_pointer(self):
        version = save_version(self.impl, {'code': 'x = 2'})
        capture_version(self.version)
        material = SourceMaterial.objects.get(entry=self.entry)
        self.assertEqual(SourceRevision.objects.get(pk=material.current_revision_id).code_version_id, version.pk)

    def test_sync_rejects_tampering_cross_entry_and_cycles(self):
        report = publish_legacy_report(self.run)
        revision = revise_report(report, '正文', '')
        original = self.snapshot()
        broken = deepcopy(original)
        next(row for row in broken if row['model'] == 'quant.sourcerevision')['fields']['payload']['code'] = 'different'
        with self.assertRaises(SyncError):
            validate(broken)
        other = Entry.objects.create(anthology=self.collection, title='其他研究')
        broken = self.snapshot()
        next(row for row in broken if row['model'] == 'quant.researchreport')['fields']['entry'] = other.pk
        with self.assertRaises(SyncError):
            validate(broken)
        broken = deepcopy(original)
        row = next(row for row in broken if row['model'] == 'quant.reportrevision')
        row['fields']['parent_id'] = revision.pk
        with self.assertRaises(SyncError):
            validate(broken)
        broken = deepcopy(original)
        row = next(row for row in broken if row['model'] == 'quant.reportrevision')
        row['fields']['markdown'] = '重新算了哈希也不能覆盖不可变快照'
        row['fields']['content_hash'] = digest(row['fields']['markdown'])
        with self.assertRaises(SyncError):
            validate(broken)

    def test_real_restore_roundtrip_and_stale_protected_deletion(self):
        manager = SyncManager()
        report = publish_legacy_report(self.run)
        revision = revise_report(report, '人工修订保留', '')
        data = manager.build_snapshot_data()
        self.assertTrue(any(row['model'] == 'quant.reportrevision' for row in data))
        with patch('quant.worker.dispatch') as dispatch:
            manager.apply_snapshot_data(data, remote_meta=metadata(data))
            dispatch.assert_not_called()
        self.assertEqual(ResearchReport.objects.get(pk=report.pk).current_revision_id, revision.pk)
        self.assertEqual(ReportRevision.objects.get(pk=revision.pk).markdown, '人工修订保留')
        # Simulate an older backup with all research children absent. References
        # must be removed in dependency order before protected sources/code.
        clean = [row for row in data if not row['model'].startswith('quant.') or row['model'] == 'quant.entry']
        manager.apply_snapshot_data(clean, remote_meta=metadata(clean))
        self.assertFalse(ResearchReport.objects.exists())
        self.assertFalse(SourceRevision.objects.exists())
        self.assertFalse(CodeVersion.objects.exists())
        self.assertTrue(Entry.objects.filter(pk=self.entry.pk).exists())

    def test_legacy_restore_maps_facts_without_requeueing(self):
        manager = SyncManager()
        old = [row for row in manager.build_snapshot_data() if row['model'] not in
               ('quant.sourcematerial', 'quant.sourcerevision', 'quant.researchreport', 'quant.reportrevision')]
        legacy_meta = metadata(old)
        legacy_meta['quant_schema_version'] = 1
        with patch('quant.worker.dispatch') as dispatch:
            manager.apply_snapshot_data(old, remote_meta=legacy_meta)
            dispatch.assert_not_called()
        self.assertEqual(ResearchReport.objects.count(), 1)
        self.assertEqual(SourceRevision.objects.count(), 2)
        upgraded = manager.build_snapshot_data()
        validate(upgraded, metadata(upgraded))

    def test_old_snapshot_upgrade_and_execution_revocation(self):
        old = [row for row in self.snapshot() if row['model'] not in
               ('quant.sourcematerial', 'quant.sourcerevision', 'quant.researchreport', 'quant.reportrevision')]
        validate(old, {'quant_schema_version': 1})
        pending = AIRun.objects.create(entry=self.entry, source_version=self.version, request_key='pending',
            input_hash='test', kind='explain', status='pending')
        Job.objects.create(run=pending)
        reset_execution(upgrade_legacy=True)
        pending.refresh_from_db()
        self.assertEqual(pending.status, 'interrupted')
        self.assertFalse(Job.objects.exists())
        self.assertEqual(ResearchReport.objects.count(), 1)
        validate(self.snapshot(), metadata(self.snapshot()))


class ResearchMigrationTests(TransactionTestCase):
    def test_upgrade_preserves_notes_code_and_legacy_report(self):
        executor = MigrationExecutor(connection)
        executor.migrate([('quant', '0001_initial')])
        try:
            state = executor.loader.project_state([('quant', '0001_initial')]).apps
            collection = state.get_model('anthology', 'Anthology').objects.create(type='quant', title='迁移',
                permission='private', user_id='migration-owner')
            entry = state.get_model('quant', 'Entry').objects.create(anthology=collection, title='旧笔记', content='人工内容')
            impl = state.get_model('quant', 'Implementation').objects.create(entry=entry, name='脚本', language='pine')
            import hashlib
            code = '//@version=2\nstudy("test")'
            version = state.get_model('quant', 'CodeVersion').objects.create(implementation=impl, code=code,
                language='pine', content_hash=hashlib.sha256(code.encode()).hexdigest())
            impl.current_version_id = version.pk
            impl.save()
            run = state.get_model('quant', 'AIRun').objects.create(entry=entry, source_version=version,
                request_key='old', input_hash='test', kind='explain', status='completed',
                result={'explanation': '解释', 'assumptions': '假设', 'limitations': '限制'})
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate([('quant', '0015_airun_planning_context')])
        report = ResearchReport.objects.get(run_id=run.pk)
        self.assertIn('假设', report.markdown)
        self.assertIn('限制', report.markdown)
        self.assertEqual(Entry.objects.get(pk=entry.pk).content, '人工内容')
        self.assertEqual(SourceRevision.objects.get(code_version_id=version.pk).payload['code'], code)
        self.assertFalse(Job.objects.exists())
