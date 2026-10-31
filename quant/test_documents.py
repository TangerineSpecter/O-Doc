"""One current document: pending work, section adoption and stable algorithm IDs."""
import copy
from django.test import TestCase, SimpleTestCase
from rest_framework.exceptions import APIException
from quant import test_factor_curation as fixtures
from quant.models import AIRun, ResearchReport, FactorCandidate, ResearchDocument
from quant.research.contracts import digest
from quant.documents.services import offer, change, initialize
from quant.documents.presentation import current_report
from quant.documents.sync import validate_documents
from quant.factors.sync import validate_factors
from django.core import serializers
import json


class DocumentTests(TestCase):
    setUp = fixtures.CurationTests.setUp
    collect = fixtures.CurationTests.collect
    publish = fixtures.CurationTests.publish

    def prepare(self):
        factor = self.publish('document_source_0001', 'Momentum')
        return factor, initialize(factor.report.entry)

    def next_report(self, original, score=80, overrides=None):
        data = copy.deepcopy(original.data)
        data['total_score'] = score
        data['summary'] = '新的正文，不自动替换'
        data.update(overrides or {})
        run = AIRun.objects.create(entry=original.entry, source=original.source, kind='analyze',
            status='completed', request_key='next_'+str(ResearchReport.objects.count()), result=data)
        return ResearchReport.objects.create(entry=original.entry, source=original.source, run=run,
            schema_version=3, data=data, markdown='# 新正文', content_hash=digest(data), publication_mode='pending')

    def test_score_only_generated_markdown_does_not_change_reading(self):
        factor, document = self.prepare()
        original = current_report(document)
        report = self.next_report(factor.report, overrides={'summary': factor.report.data['summary']})
        document = offer(report)
        from quant.documents.presentation import present
        self.assertEqual(present(document)['pending'][0]['changed_sections'], ['review'])
        document = change(document.entry, document.revision, 'adopt', report.pk, ['review'])
        self.assertEqual(document.pending, [])
        self.assertEqual(current_report(document)['markdown'], original['markdown'])
        self.assertEqual(document.sections['reading']['report_id'], factor.report_id)

    def test_parameter_inventory_follows_adopted_parameter_section(self):
        factor, document = self.prepare()
        report = self.next_report(factor.report, overrides={'parameter_inventory_json': '{"version":1,"declarations":[]}'})
        document = offer(report)
        document = change(document.entry, document.revision, 'adopt', report.pk, ['parameters'])
        self.assertEqual(current_report(document)['data']['parameter_inventory_json'], report.data['parameter_inventory_json'])

    def test_review_metadata_and_memory_are_compared_adopted_and_restored_together(self):
        factor, document = self.prepare()
        before = current_report(document)
        memory = copy.deepcopy(factor.report.data['research_memory'])
        memory['cutoff'] = '2026-10-31T00:00:00+00:00'
        changes = {'source_findings_note': '本次新增审查范围说明', 'memory_note': '本次历史核查说明',
            'source_change_review_version': 2, 'source_change_facts_json': '{"new":true}',
            'source_change_assessment': {'summary': '本次源码变化'}, 'research_memory': memory}
        report = self.next_report(factor.report, score=factor.report.data['total_score'],
            overrides={'summary': factor.report.data['summary'], **changes})
        document = offer(report)
        from quant.documents.presentation import present
        self.assertEqual(present(document)['pending'][0]['changed_sections'], ['review'])
        document = change(document.entry, document.revision, 'adopt', report.pk, ['review'])
        accepted = current_report(document)
        for key, value in changes.items():
            if key != 'research_memory':
                self.assertEqual(accepted['data'][key], value)
        self.assertEqual(json.loads(accepted['research_memory_json']), memory)
        self.assertNotIn('research_memory', accepted['data'])
        self.assertEqual(accepted['markdown'], before['markdown'])
        document = change(document.entry, document.revision, 'restore', document.history[0]['id'], ['review'])
        restored = current_report(document)
        self.assertEqual(restored['research_memory_json'], before['research_memory_json'])
        self.assertEqual(restored['data']['source_findings_note'], before['data']['source_findings_note'])
        self.assertNotIn('source_change_assessment', restored['data'])

    def test_two_device_document_ids_merge_and_restore_by_entry(self):
        from quant.documents.identity import document_id
        from utils.sync_manager import SyncManager
        from utils.sync_merge import merge_records, item_map
        from system_settings.sync_state import canonical_hash
        from quant.sync import validate, metadata
        factor, document = self.prepare()
        self.assertEqual(document.pk, document_id(document.entry_id))
        # A device which created its document before this fix keeps its old ID.
        ResearchDocument.objects.filter(pk=document.pk).update(id='legacy-local-document')
        snapshot = SyncManager().build_snapshot_data()
        remote = copy.deepcopy(snapshot)
        remote_doc = next(row for row in remote if row['model'] == 'quant.researchdocument')
        remote_doc['pk'] = 'legacy-remote-document'
        remote_doc['fields'].update(revision=document.revision + 1, updated_at='2099-01-01T00:00:00')
        def revisions(rows, device):
            result = {key: {'hash': canonical_hash(row['fields']), 'deleted': False,
                'revision_at': '2026-10-31T00:00:00Z',
                'origin_device': 'shared'} for key, row in item_map(rows).items()}
            row = next(row for row in rows if row['model'] == 'quant.researchdocument')
            result[f"quant.researchdocument:{row['pk']}"] = result.pop(f"quant.researchdocument:entry:{document.entry_id}")
            result[f"quant.researchdocument:{row['pk']}"]['origin_device'] = device
            if device == 'remote':
                result[f"quant.researchdocument:{row['pk']}"]['revision_at'] = '2026-10-31T01:00:00Z'
            return result
        merged, states, summary = merge_records(None, snapshot, revisions(snapshot, 'local'),
            {'data': remote, 'revisions': revisions(remote, 'remote')})
        self.assertEqual(summary['conflicts'], 1)
        self.assertEqual(len([row for row in merged if row['model'] == 'quant.researchdocument']), 1)
        self.assertIn(f'quant.researchdocument:entry:{document.entry_id}', states)
        validate(merged, metadata(merged))
        SyncManager().apply_snapshot_data(merged, remote_meta=metadata(merged))
        restored = ResearchDocument.objects.get(entry_id=document.entry_id)
        self.assertEqual(restored.pk, 'legacy-local-document')
        self.assertEqual(restored.revision, document.revision + 1)
        self.assertEqual(restored.sections, document.sections)

    def test_directory_and_overview_use_adopted_review_not_preserved_reading(self):
        from quant.reading.directory import directory
        from quant.reading.projections import overview
        factor, document = self.prepare()
        entry = document.entry
        original_score = current_report(document)['data']['total_score']
        def scores():
            row = next(row for row in directory(self.collection, {})['items'] if row['id'] == entry.pk)
            return row['research_score'], overview(entry)['research_score']
        report = self.next_report(factor.report, 76)
        document = offer(report)
        self.assertEqual(scores(), (original_score, original_score))
        document = change(entry, document.revision, 'adopt', report.pk, ['review'])
        self.assertEqual(document.sections['reading']['report_id'], factor.report_id)
        self.assertEqual(scores(), (76, 76))
        history_id = document.history[0]['id']
        document = change(entry, document.revision, 'restore', history_id, ['review'])
        self.assertEqual(scores(), (original_score, original_score))
        for score in (0, None):
            report = self.next_report(factor.report, score)
            document = offer(report)
            document = change(entry, document.revision, 'adopt', report.pk, ['review'])
            self.assertEqual(scores(), (score, score))

    def test_pending_then_review_only_leaves_reading_and_algorithms_stable(self):
        factor, document = self.prepare()
        original = current_report(document)
        report = self.next_report(factor.report)
        offer(report)
        document.refresh_from_db()
        self.assertEqual(current_report(document)['markdown'], original['markdown'])
        self.assertEqual(FactorCandidate.objects.count(), 1)
        self.assertEqual(document.pending, [report.pk])
        document = change(document.entry, document.revision, 'adopt', report.pk, ['review'])
        result = current_report(document)
        self.assertEqual(result['markdown'], original['markdown'])
        self.assertEqual(result['data']['total_score'], 80)
        self.assertEqual(result['section_report_ids']['factors'], factor.report_id)
        self.assertEqual(FactorCandidate.objects.count(), 1)
        self.assertEqual(document.pending, [report.pk])
        history = document.history[0]
        document = change(document.entry, document.revision, 'restore', history['id'], ['review'])
        self.assertEqual(current_report(document)['data']['total_score'], original['data']['total_score'])
        with self.assertRaises(APIException):
            change(document.entry, document.revision-1, 'discard', report.pk)

    def test_identical_factor_adoption_reuses_id_and_history_is_bounded(self):
        factor, document = self.prepare()
        for number in range(7):
            report = self.next_report(factor.report, 70+number)
            document = offer(report)
            document = change(document.entry, document.revision, 'adopt', report.pk, ['review', 'factors'])
        self.assertEqual(FactorCandidate.objects.count(), 1)
        self.assertEqual(len(document.history), 5)
        self.assertEqual(document.sections['factors']['report_id'], factor.report_id)  # identical section is stable
        document = change(document.entry, document.revision, 'clear_history')
        self.assertEqual(document.history, [])

    def test_sync_rejects_cross_entry_and_missing_algorithm_bindings(self):
        factor, document = self.prepare()
        report = self.next_report(factor.report)
        document = offer(report)
        rows = {}
        for model in (ResearchDocument, ResearchReport):
            for item in json.loads(serializers.serialize('json', model.objects.all())):
                rows.setdefault(item['model'], {})[item['pk']] = item['fields']
        rows['quant.entry'] = {document.entry_id: {}}
        def fail(message): raise ValueError(message)
        validate_documents(rows, fail)
        rows['quant.researchdocument'][document.pk]['pending'] = ['foreign']
        with self.assertRaisesRegex(ValueError, '归属'):
            validate_documents(rows, fail)

    def test_adopted_duplicate_binding_survives_full_sync_and_restore(self):
        from quant.research.services import publish_report
        from quant.sync import validate, metadata
        from utils.sync_manager import SyncManager
        factor, document = self.prepare()
        original = factor.report.run
        data = copy.deepcopy(original.result)
        data['scores'][0]['score'] = 2
        response = self.client.post(f'/api/quant/{self.collection.pk}/entries/{original.entry_id}/runs/', {
            'kind': 'analyze', 'source_id': original.source_id, 'model_id': original.model_id,
            'resume_run_id': original.pk, 'restart_stage': 'review', 'request_key': 'sync_document_repeat'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        run = AIRun.objects.get(pk=response.data['data']['id'])
        from unittest.mock import patch
        from quant.worker import execute
        with patch('quant.worker.complete', return_value=json.dumps(data)):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        report = run.report
        document.refresh_from_db()
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        # Force an actual algorithm change, then restore the original section.
        from quant.documents.services import materialize
        materialize(report, factors=True, plan=True)
        report.refresh_from_db()
        self.assertEqual(report.factor_bindings['0'], factor.pk)
        self.assertEqual(FactorCandidate.objects.count(), 1)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        restored = ResearchDocument.objects.get(pk=document.pk)
        self.assertEqual(restored.sections, document.sections)
        self.assertEqual(restored.pending, document.pending)

    def test_restore_reading_then_edit_and_delete_history(self):
        from quant.research.services import revise_report
        factor, document = self.prepare()
        report = factor.report
        old = report.markdown
        revise_report(report, '# 中文确认正文', report.current_revision_id)
        document.refresh_from_db()
        history_id = document.history[0]['id']
        document = change(document.entry, document.revision, 'restore', history_id, ['reading'])
        self.assertEqual(current_report(document)['markdown'], old)
        response = self.client.patch(f'/api/quant/{self.collection.pk}/entries/{document.entry_id}/reports/{report.pk}/', {
            'markdown': '# 恢复后继续编辑', 'expected_revision_id': document.sections['reading']['revision_id'],
            'expected_document_revision': document.revision}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        document.refresh_from_db()
        self.assertEqual(current_report(document)['markdown'], '# 恢复后继续编辑')
        document = change(document.entry, document.revision, 'clear_history')
        self.assertEqual(document.history, [])
        self.assertTrue(FactorCandidate.objects.filter(pk=factor.pk).exists())


class DocumentIdentityMergeTests(SimpleTestCase):
    def test_legacy_permanent_delete_keeps_priority_over_concurrent_document_edit(self):
        from utils.sync_merge import merge_records
        from system_settings.sync_state import canonical_hash
        original = {'model': 'quant.researchdocument', 'pk': 'old-random-id',
                    'fields': {'entry': 'entry', 'revision': 1, 'sections': {}}}
        edited = copy.deepcopy(original)
        edited['pk'] = 'other-device-id'
        edited['fields']['revision'] = 2
        def revision(row, **extra):
            return {'hash': canonical_hash(row['fields']), 'deleted': False,
                    'revision_at': '2026-10-31T00:00:00Z', 'origin_device': 'device', **extra}
        base = {'data': [original], 'revisions': {'quant.researchdocument:old-random-id': revision(original)}}
        local = {'quant.researchdocument:other-device-id': revision(edited)}
        remote = {'data': [], 'revisions': {'quant.researchdocument:old-random-id':
                  revision(original, deleted=True, hash='!' + 'a' * 63)}}
        merged, states, _ = merge_records(base, [edited], local, remote)
        self.assertEqual(merged, [])
        self.assertTrue(states['quant.researchdocument:entry:entry']['deleted'])
        self.assertTrue(states['quant.researchdocument:entry:entry']['hash'].startswith('!'))
