import copy
import json
import re
from unittest.mock import patch
from django.test import TestCase
from quant import test_research_analysis as fixtures
from quant.test_factors import extracted
from quant.models import AIRun, FactorCandidate, FactorRevision
from quant.worker import execute
from quant.sync import metadata, validate
from quant.factors.grouping import fingerprints
from utils.sync_manager import SyncManager, SyncError


class CurationTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp
    collect = fixtures.AnalysisTests.collect

    def publish(self, request, name='动量', window='20'):
        self.payload['request_key'] = request
        self.payload['code'] = re.sub(r'(?m)^N=.*$', f'N={window}', self.payload['code'])
        entry = self.collect()
        data = extracted()
        data['factors'][0]['name'] = name
        data['factors'][0]['parameters'][0]['default_value'] = window
        data['factors'][0]['parameters'][0]['evidence'] = f'N={window}'
        def answer(config,prompt,**kwargs):
            value=copy.deepcopy(data)
            memory=json.loads(prompt.split('材料：',1)[1]).get('research_memory') if '材料：' in prompt else None
            if memory:
                value.update(memory_note='测试：核对完整历史，另用新数据验证。',memory_assessment=[{'action':'investigate','rationale':'测试历史需继续核查，不晋升当前证据。','evidence_refs':[f"memory:{r['kind']}:{r['id']}"]} for r in memory['items']])
            return json.dumps(value)
        with patch('quant.worker.complete', side_effect=answer):
            execute(AIRun.objects.get(entry=entry).pk)
        return FactorCandidate.objects.get(report__entry=entry)

    def test_grouping_keeps_aliases_and_parameter_variants_separate(self):
        first = self.publish('factor_group_00000001', '动量')
        second = self.publish('factor_group_00000002', '区间涨幅')
        third = self.publish('factor_group_00000003', '动量', '50')
        self.assertEqual(fingerprints(first), fingerprints(second))
        self.assertNotEqual(fingerprints(first), fingerprints(third))
        url = f'/api/quant/{self.collection.pk}/factors/'
        grouped = self.client.get(url + '?groupBy=expression').json()['data']
        self.assertEqual(grouped['total'], 2)
        self.assertEqual(grouped['occurrenceTotal'], 3)
        self.assertEqual(sorted(row['occurrenceCount'] for row in grouped['items']), [1, 2])
        occurrences = self.client.get(url + first.pk + '/occurrences/?groupBy=expression&limit=1').json()['data']
        self.assertEqual(occurrences['total'], 2)
        self.assertEqual(len(occurrences['items']), 1)
        self.assertEqual(self.client.get(url + '?groupBy=raw').data['data']['total'], 2)
        # Same excerpts but a different complete source cannot count as raw duplicate.
        original = first.report.source.payload
        altered = copy.deepcopy(original)
        altered['code'] += '\n# different source context'
        first.report.source.payload = altered
        self.assertNotEqual(fingerprints(first)['raw'], fingerprints(second)['raw'])
        self.assertEqual(FactorCandidate.objects.count(), 3)

    def test_edits_history_optimistic_conflict_and_sync(self):
        candidate = self.publish('factor_edit_00000001')
        url = f'/api/quant/{self.collection.pk}/factors/{candidate.pk}/'
        data = dict(name='我的动量', family='momentum', tags=[' ＲＳＩ ', 'RSI', '动量'], aliases=['区间涨幅'], note='需要检查费用敏感度')
        saved = self.client.patch(url, {'data': data, 'expected_revision_id': ''}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        body = saved.json()['data']
        self.assertEqual(body['curation']['tags'], ['RSI', '动量'])
        self.assertEqual(body['data']['name'], '动量')
        self.assertEqual(len(body['revisions']), 1)
        self.assertEqual(self.client.patch(url, {'data': data, 'expected_revision_id': ''}, format='json').status_code, 409)
        self.assertEqual(self.client.get(f'/api/quant/{self.collection.pk}/factors/?q=区间涨幅').data['data']['total'], 1)
        self.assertEqual(self.client.patch(url + 'occurrences/', {}, format='json').status_code, 405)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(self.client.get(url).json()['data']['curation']['name'], '我的动量')
        self.assertEqual(FactorRevision.objects.count(), 1)
        for tamper in ('parent', 'pointer', 'hash'):
            altered = copy.deepcopy(snapshot)
            row = next(item for item in altered if item['model'] == 'quant.factorrevision')
            if tamper == 'parent':
                row['fields']['parent_id'] = row['pk']
            elif tamper == 'pointer':
                next(item for item in altered if item['model'] == 'quant.factorcandidate')['fields']['current_revision_id'] = 'missing'
            else:
                row['fields']['content_hash'] = 'invalid'
            with self.assertRaises(SyncError):
                validate(altered, metadata(altered))
