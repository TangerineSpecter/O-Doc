"""Real publication, access isolation, immutable sync and evidence/expression boundaries."""
import copy
import json
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as ModelValidationError
from rest_framework.exceptions import ValidationError
from quant.models import AIRun, FactorCandidate, ResearchReport
from quant.research.analysis import validate_analysis, validate_source_evidence
from quant.factors.services import publish_candidates
from quant.factors.expression import expression_hash
from django.test import TestCase
from quant import test_research_analysis as fixtures
from quant.test_research_analysis import result
from quant.worker import execute
from quant.sync import metadata, validate
from utils.sync_manager import SyncManager, SyncError


def extracted():
    value = result()
    value['extraction_note'] = '从源码提取区间动量计算；尚未验证'
    value['factors'] = [dict(name='区间动量', role='factor', family='momentum', summary='收盘价相对变化',
        formula='close / close[N] - 1', inputs=[dict(name='close', meaning='收盘价', availability='收盘后', missing_policy='未知')],
        output_type='numeric_series', units='比率', timeframe='N根K线，交易周期未知',
        parameters=value['parameters'], dependencies=['pandas价格序列'], limitations='尚未验证复权、缺失处理与实际参数', tags=['动量'],
        expression={'op': 'sub', 'args': [{'op': 'div', 'args': [{'op': 'input', 'name': 'close'},
            {'op': 'lag', 'args': [{'op': 'input', 'name': 'close'}, {'op': 'parameter', 'name': 'N'}]}]}, {'op': 'constant', 'value': 1}]},
        evidence=[dict(field='code', quote='close / close.shift(N) - 1')])]
    return value


class FactorTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp
    collect = fixtures.AnalysisTests.collect
    def complete(self):
        entry = self.collect()
        with patch('quant.worker.complete', return_value=json.dumps(extracted())):
            execute(AIRun.objects.get().pk)
        run = AIRun.objects.get()
        self.assertEqual(run.status, 'completed', run.error)
        return entry, FactorCandidate.objects.get()

    def test_compact_parameter_references_publish_full_facts_and_sync(self):
        self.collect()
        value = extracted()
        compact = copy.deepcopy(value)
        compact['factors'][0]['parameters'] = [{'name': 'N'}]
        def answer(_config, text, **_kwargs):
            if '“提取因子”' in text:
                context = json.loads(text.split('\n材料：', 1)[1])
                binding = context['previous']['parameters']['parameters'][0]['source_binding']
                self.assertEqual(set(binding), {'status', 'source_name'})
                return json.dumps(compact)
            return json.dumps(value)
        with patch('quant.worker.complete', side_effect=answer):
            execute(AIRun.objects.get().pk)
        run = AIRun.objects.get()
        self.assertEqual(run.status, 'completed', run.error)
        factor = FactorCandidate.objects.get().data
        self.assertEqual(factor['parameters'][0], run.result['parameters'][0])
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_auto_publication_queries_and_restore(self):
        entry, candidate = self.complete()
        self.assertEqual(candidate.report.schema_version, 3)
        publish_candidates(candidate.report)
        self.assertEqual(FactorCandidate.objects.count(), 1)
        url = f'/api/quant/{self.collection.pk}/factors/'
        listing = self.client.get(url + '?q=动量&role=factor&family=momentum').json()['data']
        self.assertEqual(listing['total'], 1)
        self.assertEqual(listing['items'][0]['entryId'], entry.pk)
        self.assertEqual(self.client.get(url + '?role=display').data['data']['total'], 0)
        self.assertEqual(self.client.get(url + '?limit=101').status_code, 400)
        self.assertEqual(self.client.get(url + candidate.pk + '/').status_code, 200)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(FactorCandidate.objects.get().data, candidate.data)
        entry.is_valid = False
        entry.save()
        self.assertEqual(self.client.get(url).data['data']['total'], 0)
        self.assertEqual(self.client.get(url + candidate.pk + '/').status_code, 404)

    def test_no_foreign_library_access(self):
        _, candidate = self.complete()
        self.client.force_authenticate(get_user_model().objects.create_user('foreign-factor-reader'))
        for suffix in ('', candidate.pk + '/'):
            self.assertIn(self.client.get(f'/api/quant/{self.collection.pk}/factors/{suffix}').status_code, (403, 404))

    def test_invalid_evidence_rolls_back_entire_publication(self):
        self.collect()
        data = extracted()
        data['factors'][0]['evidence'][0]['quote'] = 'this never appeared in the source'
        with patch('quant.worker.complete', return_value=json.dumps(data)):
            execute(AIRun.objects.get().pk)
        self.assertEqual(AIRun.objects.get().status, 'failed')
        self.assertFalse(ResearchReport.objects.exists())
        self.assertFalse(FactorCandidate.objects.exists())

    def test_expressions_cannot_hide_scripts_or_undeclared_dependencies(self):
        for node in ({'op': 'eval', 'args': ['malicious()']}, {'op': 'input', 'name': 'future_close'},
                {'op': 'sma', 'args': [{'op': 'input', 'name': 'close'}, {'op': 'constant', 'value': -2}]},
                {'op': 'constant', 'value': float('nan')}):
            data = extracted()
            data['factors'][0]['expression'] = node
            with self.assertRaises(ValidationError):
                validate_analysis(data)
        data = extracted()
        data['factors'][0]['expression'] = None
        normalized = validate_analysis(data)
        self.assertEqual(expression_hash(normalized['factors'][0]), '')
        validate_source_evidence(normalized, self.payload)
        data = extracted()
        first = expression_hash(data['factors'][0])
        data['factors'][0]['parameters'][0]['default_value'] = '50'
        self.assertNotEqual(first, expression_hash(data['factors'][0]))

    def test_sync_cannot_drop_or_forge_occurrences(self):
        _, candidate = self.complete()
        original = SyncManager().build_snapshot_data()
        for tamper in ('drop', 'source', 'hash', 'data'):
            snapshot = copy.deepcopy(original)
            row = next(item for item in snapshot if item['model'] == 'quant.factorcandidate')
            if tamper == 'drop':
                snapshot.remove(row)
            elif tamper == 'source':
                row['fields']['report'] = 'missing'
            elif tamper == 'hash':
                row['fields']['expression_hash'] = '0' * 64
            else:
                row['fields']['data']['formula'] = 'altered'
            with self.assertRaises(SyncError):
                validate(snapshot, metadata(snapshot))
        candidate.data = {'changed': True}
        with self.assertRaises(ModelValidationError):
            candidate.save()

    def test_legacy_report_survives_but_new_job_requires_explicit_extraction(self):
        self.collect()
        run = AIRun.objects.get()
        old = result()
        for key in ('extraction_version', 'extraction_note', 'factors',
                    'initial_planning_version', 'initial_planning_note', 'initial_proposal'):
            old.pop(key)
        with patch('quant.worker.complete', return_value=json.dumps(old)):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'failed')
        self.assertFalse(ResearchReport.objects.exists())
        # An already archived schema-2 fact still validates without a model call
        # or invented extraction when restored from an older device.
        from quant.research.services import publish_report
        run.workflow_steps.all().delete()
        run.workflow_version = 0
        run.status = 'completed'
        run.error = ''
        run.result = validate_analysis(old)
        run.save()
        report = publish_report(run)
        self.assertEqual(report.schema_version, 2)
        self.assertFalse(FactorCandidate.objects.exists())
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

