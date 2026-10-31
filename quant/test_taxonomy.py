"""Controlled classifications must stay distinct from research validation."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from quant import test_research_analysis as fixtures
from quant import test_factor_curation as factors
from quant import test_workflows as workflows
from quant.models import QuantVocabulary, QuantVocabularyRevision, QuantVocabularyTerm, AIRun
from quant.research.contracts import digest
from quant.taxonomy.builtins import catalog
from quant.taxonomy.contracts import validate as validate_catalog, reference
from quant.taxonomy.normalization import classify
from quant.taxonomy.services import current
from quant.sync import validate, metadata
from utils.sync_manager import SyncManager, SyncError


class VocabularyTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp
    collect = fixtures.AnalysisTests.collect
    publish = factors.CurationTests.publish

    def edit(self, term=None, expected='', request_key='vocabulary_request00001', reason='统一别名，保留静态研究边界'):
        term = term or next(row for row in catalog()['terms'] if row['id'] == 'mechanism:momentum')
        if term['id'] == 'mechanism:momentum' and not term['label'].startswith('统一'):
            term = dict(term, label='统一动量', aliases=[*term['aliases'], term['label']])
        return self.client.post(f'/api/quant/{self.collection.pk}/vocabulary/', dict(term=term,
            expected_revision_id=expected, request_key=request_key, reason=reason), format='json')

    def test_builtin_is_canonical_exact_classification_and_no_false_evidence(self):
        value = catalog()
        self.assertEqual(validate_catalog(value), value)
        from pathlib import Path
        fixture = json.loads(Path('frontend_react/src/mocks/quant/vocabularyBuiltin.json').read_text())
        fixture['builtin_version'] = fixture.pop('builtinVersion')
        self.assertEqual(fixture, value)
        raw = {'tags': ['動量', 'daily', 'Python', 'MQL4', 'evidence:authored_unverified'], 'family': 'momentum', 'role': 'factor', 'parameters': []}
        result = classify(raw, {'family': 'momentum', 'tags': raw['tags']}, value, platform='')
        ids = {row['id'] for row in result['terms']}
        self.assertIn('frequency:daily', ids)
        self.assertNotIn('platform:joinquant', ids)
        self.assertNotIn('platform:mt4', ids)
        self.assertNotIn('evidence:authored_unverified', ids)
        self.assertIn('evidence:static_unverified', ids)
        self.assertEqual(next(row for row in result['unresolved'] if row['raw'].startswith('evidence:'))['status'], 'protected')
        modified = copy.deepcopy(value)
        for row in modified['terms']:
            if row['id'] in ('mechanism:momentum', 'mechanism:trend'): row['aliases'].append('混合词')
        raw['tags'] = ['混合词', 'mechanism:trend', '不是日线']
        result = classify(raw, {'family': 'other', 'tags': raw['tags']}, validate_catalog(modified))
        self.assertEqual(result['unresolved'][0]['status'], 'ambiguous')
        self.assertEqual(len(result['unresolved'][0]['codes']), 2)
        self.assertNotIn('frequency:daily', {row['id'] for row in result['terms']})
        removed = classify(raw, {'family': 'other', 'tags': []}, value)
        self.assertNotIn('mechanism:trend', {row['id'] for row in removed['terms']})

    def test_reads_are_pure_revisions_optimistic_idempotent_and_semantics_stable(self):
        url = f'/api/quant/{self.collection.pk}/vocabulary/'
        self.assertEqual(self.client.get(url).status_code, 200)
        self.assertFalse(QuantVocabulary.objects.exists())
        saved = self.edit(); self.assertEqual(saved.status_code, 200, saved.data)
        head = saved.data['data']['reference']['revision_id']
        self.assertEqual(self.edit().status_code, 200)
        self.assertEqual(QuantVocabularyRevision.objects.count(), 1)
        self.assertEqual(self.edit(request_key='vocabulary_stale0000001').status_code, 409)
        term = copy.deepcopy(saved.data['data']['catalog']['terms'][0]); term['definition'] = '重用旧编码'
        self.assertEqual(self.edit(term, head, 'vocabulary_bad_meaning1').status_code, 400)
        term = dict(id='mechanism:custom_x', dimension='mechanism', label='局部机制', aliases=['混合词'], definition='用于测试的明确含义', active=True)
        response = self.edit(term, head, 'vocabulary_custom000001'); self.assertEqual(response.status_code, 200, response.data)
        selected = self.client.get(url + '?selectedRevisionId=' + head).json()['data']
        self.assertNotEqual(selected['reference']['revisionId'], selected['currentReference']['revisionId'])
        self.assertTrue(any(row['id'] == term['id'] for row in selected['archivedConcepts']))
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(url).status_code, (401, 403))

    def test_alias_filter_search_and_projection_inputs_remain_original(self):
        candidate = self.publish('vocabulary_candidate001')
        from quant.graph.projection import projection
        old_projection = projection(candidate)
        saved = self.edit(); self.assertEqual(saved.status_code, 200)
        value, ref = current(self.collection.pk)
        term = next(row for row in value['terms'] if row['id'] == 'mechanism:momentum')
        term = dict(term, aliases=[*term['aliases'], '价差延续测试别名'])
        response = self.edit(term, ref['revision_id'], 'vocabulary_search00001')
        self.assertEqual(response.status_code, 200, response.data)
        base = f'/api/quant/{self.collection.pk}/factors/'
        for suffix in ('?q=价差延续测试别名', '?taxonomyTerm=mechanism:momentum', '?groupBy=lineage&taxonomyTerm=mechanism:momentum'):
            reply = self.client.get(base + suffix)
            self.assertEqual(reply.json()['data']['total'], 1, reply.data)
        self.assertEqual(self.client.get(base + '?taxonomyTerm=asset:equity').json()['data']['total'], 0)
        reply = self.client.post(base + 'search/', {'q': '价差延续测试别名'}, format='json')
        self.assertEqual(reply.status_code, 200, reply.data)
        self.assertIn('分类词表', reply.json()['data']['items'][0]['searchMatch']['keywordFields'])
        self.assertEqual(projection(candidate), old_projection)

    def test_sync_roundtrip_and_rehashed_catalog_tampering(self):
        self.assertEqual(self.edit().status_code, 200)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(QuantVocabularyRevision.objects.count(), 1)
        self.assertGreater(QuantVocabularyTerm.objects.count(), 40)
        # Clear local immutable witnesses so validation must reconstruct facts.
        QuantVocabularyRevision.objects.all().delete(); QuantVocabularyTerm.objects.all().delete(); QuantVocabulary.objects.all().delete()
        for kind in ('meaning', 'evidence', 'missing', 'cycle', 'head'):
            changed = copy.deepcopy(snapshot)
            row = next(row for row in changed if row['model'] == 'quant.quantvocabularyrevision')
            if kind in ('meaning', 'evidence'):
                term = next(term for term in row['fields']['data']['terms'] if term['dimension'] == ('evidence' if kind == 'evidence' else 'mechanism'))
                term['definition' if kind == 'meaning' else 'label'] = '伪造'
                row['fields']['content_hash'] = digest(row['fields']['data'])
            elif kind == 'missing': changed = [item for item in changed if item['model'] != 'quant.quantvocabularyterm']
            elif kind == 'cycle': row['fields']['parent_id'] = row['pk']
            else: next(item for item in changed if item['model'] == 'quant.quantvocabulary')['fields']['current_revision_id'] = 'missing'
            with self.assertRaises(SyncError, msg=kind): validate(changed, metadata(changed))

    def test_complete_older_backup_prunes_new_vocabulary_without_authorizing_execution(self):
        before = SyncManager().build_snapshot_data(); meta = metadata(before)
        meta['quant_schema_version'] = 38
        self.assertEqual(self.edit().status_code, 200)
        with patch('quant.worker.dispatch') as model, patch('quant.experiments.worker.dispatch') as experiment:
            SyncManager().apply_snapshot_data(before, remote_meta=meta)
        model.assert_not_called(); experiment.assert_not_called()
        self.assertFalse(QuantVocabulary.objects.exists())
        self.assertFalse(QuantVocabularyRevision.objects.exists()); self.assertFalse(QuantVocabularyTerm.objects.exists())

    def test_dictionary_context_is_bounded_and_does_not_carry_evidence_levels(self):
        from quant.taxonomy.prompts import context, validate_tags
        value = catalog()
        for i in range(130): value['terms'].append(dict(id=f'mechanism:custom_{i}', dimension='mechanism', label=f'实验机制{i}', aliases=[], definition='定义' * 240, active=True))
        value = validate_catalog(value)
        projected = context(value, {'title': '未指定机制'})
        self.assertLessEqual(len(json.dumps(projected, ensure_ascii=False)), 18000)
        self.assertGreater(projected['omitted'], 0)
        self.assertFalse(any(row['dimension'] == 'evidence' for row in projected['terms']))
        for code in ('evidence:authored_unverified', 'mechanism:nonexistent'):
            with self.assertRaises(ValidationError): validate_tags('identify', {'tags': [code]}, value)

    def test_two_device_merge_retains_both_branches_and_locks_hidden_concept_meaning(self):
        from utils.sync_merge import merge_records
        from system_settings.sync_state import canonical_hash
        from quant.taxonomy.services import presentation
        manager = SyncManager()
        base = manager.build_snapshot_data()
        term_a = dict(id='mechanism:device_a', dimension='mechanism', label='设备 A 概念', aliases=['A 词'], definition='设备 A 固定含义', active=True)
        term_b = dict(id='mechanism:device_b', dimension='mechanism', label='设备 B 概念', aliases=['B 词'], definition='设备 B 固定含义', active=True)
        self.assertEqual(self.edit(term_a, request_key='vocabulary_device_a001').status_code, 200)
        local = manager.build_snapshot_data()
        QuantVocabularyRevision.objects.all().delete(); QuantVocabularyTerm.objects.all().delete(); QuantVocabulary.objects.all().delete()
        self.assertEqual(self.edit(term_b, request_key='vocabulary_device_b001').status_code, 200)
        remote = manager.build_snapshot_data()
        def revisions(data, side):
            return {row['model'] + ':' + str(row['pk']): {'hash': canonical_hash(row), 'deleted': False,
                'revision_at': '2026-10-25T00:00:0' + str(side), 'origin_device': str(side)} for row in data}
        merged, _, _ = merge_records({'data': base, 'revisions': revisions(base, 0)}, local, revisions(local, 1),
            {'data': remote, 'revisions': revisions(remote, 2)})
        validate(merged, metadata(merged))
        manager.apply_snapshot_data(merged, remote_meta=metadata(merged))
        self.assertEqual(QuantVocabularyRevision.objects.count(), 2)
        result = presentation(self.collection.pk)
        self.assertIn(term_a['id'], [row['id'] for row in result['archived_concepts']])
        response = self.edit(dict(term_a, definition='设备 B 想改用这个编码'), expected=result['current_reference']['revision_id'], request_key='vocabulary_reused_code1')
        self.assertEqual(response.status_code, 409, response.data)


class VocabularyWorkflowTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp
    collect = fixtures.AnalysisTests.collect
    start = workflows.WorkflowTests.start
    retry = workflows.WorkflowTests.retry
    finish = workflows.WorkflowTests.finish
    failed_research = workflows.WorkflowTests.failed_research
    edit = VocabularyTests.edit

    def test_ai_uses_frozen_vocabulary_retry_and_explicit_normalize_restart(self):
        old = self.failed_research()
        self.assertEqual(old.workflow_version, 25)
        original_ref = old.workflow_steps.get(stage='normalize').input['vocabulary_ref']
        self.assertEqual(self.edit().status_code, 200)
        resumed = self.retry(old)
        model = self.finish(resumed)
        self.assertEqual(model.call_count, 4)
        self.assertEqual(resumed.workflow_steps.get(stage='normalize').input['vocabulary_ref'], original_ref)
        for call in model.call_args_list:
            self.assertIn('classification_vocabulary', call.args[1])
            self.assertNotIn('统一动量', call.args[1])
        restarted = self.retry(resumed, restart_stage='normalize', request_key='vocabulary_restart0001')
        model = self.finish(restarted)
        self.assertEqual(model.call_count, 6)
        self.assertIn('统一动量', model.call_args_list[0].args[1])
        self.assertNotEqual(restarted.workflow_steps.get(stage='normalize').input['vocabulary_ref'], original_ref)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_ai_cannot_invent_codes_or_upgrade_evidence(self):
        run = self.start()
        from quant.worker import execute
        value = fixtures.result(); value['tags'] = ['evidence:authored_unverified']
        with patch('quant.worker.complete', return_value=json.dumps(value)) as model: execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')
        self.assertEqual(model.call_count, 2)
        self.assertEqual(run.workflow_steps.get(stage='identify').outcome.data['status'], 'failed')
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))

    def test_wrong_vocabulary_reference_cannot_be_rehashed_into_workflow(self):
        self.assertEqual(self.edit().status_code, 200)
        run = self.start(); self.finish(run)
        snapshot = SyncManager().build_snapshot_data()
        row = next(row for row in snapshot if row['model'] == 'quant.workflowstep' and row['fields']['stage'] == 'normalize')
        row['fields']['input']['vocabulary_ref']['content_hash'] = '0' * 64
        row['fields']['content_hash'] = digest(row['fields']['input'])
        with self.assertRaises(SyncError): validate(snapshot, metadata(snapshot))


class VocabularyLegacyWorkflowTests(TestCase):
    from quant import test_incremental_workflows as incremental
    setUp = fixtures.AnalysisTests.setUp
    seed = incremental.IncrementalWorkflowTests.seed
    start = incremental.IncrementalWorkflowTests.start
    finish = incremental.IncrementalWorkflowTests.finish
    version = incremental.IncrementalWorkflowTests.version

    def test_v2_v3_replay_and_cross_source_request_idempotence_keep_old_contract(self):
        with patch('quant.workflows.contracts.VERSION', 2): old = self.seed()
        self.assertEqual(old.workflow_version, 2)
        self.assertNotIn('vocabulary_ref', old.workflow_steps.get(stage='normalize').input)
        source = self.version(self.code + '# legacy v3\n')
        with patch('quant.workflows.contracts.INCREMENTAL_VERSION', 3):
            run = self.start(source, 'legacy_v3_vocabulary001', old)
        model = self.finish(run)
        self.assertEqual(run.workflow_version, 3)
        self.assertTrue(all('classification_vocabulary' not in call.args[1] for call in model.call_args_list))
        # The same old request after an upgrade must not fingerprint as v5.
        self.assertEqual(self.start(source, 'legacy_v3_vocabulary001', old).pk, run.pk)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
