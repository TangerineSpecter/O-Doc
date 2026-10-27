"""Normal data-free generations, arithmetic, publication, stop and recovery."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from quant import test_research_analysis as fixtures
from quant import test_factor_curation as curation
from quant.models import AIStudy, FactorCandidate, MarketDataset, AIStudyJob
from quant.studies.worker import execute
from quant.studies.contracts import DIMENSIONS
from quant.sync import validate, metadata, reset_execution
from utils.sync_manager import SyncManager


class AIStudyTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp
    collect = fixtures.AnalysisTests.collect
    publish = curation.CurationTests.publish

    def start(self, **changes):
        seed = self.publish('ai_study_original_0001')
        self.path = f'/api/quant/{self.collection.pk}/ai-studies/'
        values = {'request_key': 'ai_study_two_generations', 'name': '无行情研究', 'direction': '比较信号尺度与参数解释',
            'candidate_ids': [seed.pk], 'max_generations': 2, 'population': 2, 'keep': 1, 'model_id': self.model.pk, **changes}
        response = self.client.post(self.path, values, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return seed, AIStudy.objects.get(pk=response.json()['data']['id'])

    def reply(self, config, prompt, **kwargs):
        material = json.loads(prompt.split('冻结研究配置与父代：')[1])
        parent = material['input']['parents'][0]
        definition = {k: copy.deepcopy(v) for k, v in parent['definition'].items() if k not in ('evidence', 'formula_version', 'derivation')}
        definition.update(name='新尺度假设', formula='父代信号乘二', expression={'op': 'mul', 'args': [definition['expression'], {'op': 'constant', 'value': 2}]})
        score = [{'dimension': d, 'score': 3, 'reason': '结构清楚，但需要运行反馈', 'evidence': '当前父代与新定义；没有行情实证'} for d in DIMENSIONS]
        return json.dumps({'summary': '保留可比较的尺度假设，实证未评估', 'continue': True, 'stop_reason': '',
            'candidates': [{'parents': [parent['id']], 'operation': 'mutation', 'definition': definition,
                'rationale': '比较尺度变化，保留独立谱系', 'scores': score, 'risks': ['没有收益证据'], 'decision': 'keep'}]})

    def test_two_generations_without_market_data_publish_score_and_restore_without_running(self):
        seed, study = self.start()
        with patch('quant.studies.worker.complete', side_effect=self.reply) as model:
            execute(study.job.pk)
        self.assertEqual(model.call_count, 2)
        self.assertEqual(MarketDataset.objects.count(), 0)
        study.job.refresh_from_db()
        self.assertEqual(study.job.status, 'completed', study.job.error)
        generations = list(study.generations.all())
        self.assertEqual(len(generations), 2, [g.data for g in generations])
        first, second = [g.data['result']['candidates'][0] for g in generations]
        self.assertEqual(first['total_score'], 60)
        self.assertEqual(second['parents'], [first['candidate_id']])
        child = FactorCandidate.objects.get(pk=second['candidate_id'])
        self.assertEqual(child.data['formula_version']['origin'], 'ai_study')
        self.assertEqual(second['empirical_status'], 'unassessed')
        original = copy.deepcopy(seed.report.data)
        edited = self.client.post(self.path + study.pk + '/report/', {'markdown': '人工修订，原稿仍保留'}, format='json')
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.json()['data']['userReport'], '人工修订，原稿仍保留')
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        with patch('quant.studies.worker.dispatch') as dispatch:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        dispatch.assert_not_called()
        self.assertFalse(AIStudyJob.objects.exists())
        seed.report.refresh_from_db(); self.assertEqual(seed.report.data, original)
        self.assertEqual(self.client.get(self.path + study.pk + '/').json()['data']['status'], 'completed')

    def test_cancel_does_not_call_model_and_restored_remaining_budget_requires_resume(self):
        _, study = self.start()
        self.client.post(self.path + study.pk + '/cancel/', {}, format='json')
        with patch('quant.studies.worker.complete') as model: execute(study.job.pk)
        model.assert_not_called()
        reset_execution()
        self.assertEqual(self.client.get(self.path + study.pk + '/').json()['data']['status'], 'interrupted')
        response = self.client.post(self.path + study.pk + '/resume/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        with patch('quant.studies.worker.complete', side_effect=self.reply): execute(AIStudyJob.objects.get(study=study).pk)
        self.assertEqual(study.generations.count(), 2)
