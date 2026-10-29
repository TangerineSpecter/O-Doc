"""Normal data-free generations, arithmetic, publication, stop and recovery."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from quant import test_research_analysis as fixtures
from quant import test_factor_curation as curation
from quant.models import AIStudy, FactorCandidate, MarketDataset, AIStudyJob
from quant.studies.worker import execute
from quant.studies.contracts import DIMENSIONS, fingerprint
from quant.sync import validate, metadata, reset_execution
from utils.sync_manager import SyncManager
from utils.sync_manager import SyncError


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
        if '本代公式核对结果：' in prompt:
            evidence = json.loads(prompt.split('本代公式核对结果：', 1)[1])
            return json.dumps({'summary': '程序事实已核对，实证未评估', 'candidates': [
                {'index': row['index'], 'explanation': '根据程序核对解释，保留未知与风险。',
                 'checks': [{'parent_id': check['parent_id'], 'status': check['status']} for check in row['formula_checks']]}
                for row in evidence['candidates']]})
        material = json.loads(prompt.split('冻结研究配置与父代：')[1])
        parent = material['input']['parents'][0]
        definition = {k: copy.deepcopy(v) for k, v in parent['definition'].items() if k not in ('evidence', 'formula_version', 'derivation')}
        definition.update(name='新尺度假设', formula='父代信号乘二', expression={'op': 'mul', 'args': [definition['expression'], {'op': 'constant', 'value': 2}]})
        score = [{'dimension': d, 'score': 3, 'reason': '结构清楚，但需要运行反馈', 'evidence': '当前父代与新定义；没有行情实证'} for d in DIMENSIONS]
        return json.dumps({'summary': '保留可比较的尺度假设，实证未评估', 'continue': True, 'stop_reason': '',
            'candidates': [{'parents': [parent['id']], 'parent_relations': [{'parent_id': parent['id'], 'relation': 'different'}], 'operation': 'mutation', 'definition': definition,
                'rationale': '比较尺度变化，保留独立谱系', 'scores': score, 'risks': ['没有收益证据'], 'decision': 'keep'}]})

    def legacy_reply(self, config, prompt, **kwargs):
        raw = json.loads(self.reply(config, prompt, **kwargs))
        for item in raw['candidates']: item.pop('parent_relations', None)
        return json.dumps(raw)

    def test_two_generations_without_market_data_publish_score_and_restore_without_running(self):
        seed, study = self.start()
        with patch('quant.studies.worker.complete', side_effect=self.reply) as model:
            execute(study.job.pk)
        self.assertEqual(model.call_count, 4)
        self.assertEqual(MarketDataset.objects.count(), 0)
        study.job.refresh_from_db()
        self.assertEqual(study.job.status, 'completed', study.job.error)
        generations = list(study.generations.all())
        self.assertEqual(len(generations), 2, [g.data for g in generations])
        self.assertTrue(all(g.data.get('review') for g in generations))
        self.assertEqual(generations[1].data['input']['previous_review'], generations[0].data['review'])
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
        with self.assertRaises(SyncError):
            validate(snapshot, {**metadata(snapshot), 'quant_schema_version': 80})
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

    def test_duplicate_expression_with_reworded_units_is_not_selected(self):
        seed, study = self.start(max_generations=1)
        original = copy.deepcopy(seed.data)
        reworded = copy.deepcopy(original)
        reworded['units'] = '无量纲比率'
        self.assertNotEqual(fingerprint(original, 1), fingerprint(reworded, 1))
        self.assertEqual(fingerprint(original, 2), fingerprint(reworded, 2))
        def answer(config, prompt, **kwargs):
            if '本代公式核对结果：' in prompt: return self.reply(config, prompt, **kwargs)
            data = json.loads(self.reply(config, prompt, **kwargs))
            new = data['candidates'][0]
            repeated = copy.deepcopy(new)
            repeated['definition'] = {k: copy.deepcopy(v) for k, v in reworded.items() if k not in ('evidence', 'formula_version', 'derivation')}
            repeated['rationale'] = '只改写单位措辞，计算定义没有变化'
            data['candidates'] = [repeated, new]
            return json.dumps(data)
        with patch('quant.studies.worker.complete', side_effect=answer): execute(study.job.pk)
        generation = study.generations.get()
        duplicate, distinct = generation.data['result']['candidates']
        self.assertFalse(duplicate['selected'])
        self.assertIn('重复', duplicate['validation_error'])
        self.assertTrue(distinct['selected'])
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_legacy_research_snapshot_keeps_its_original_fingerprint(self):
        with patch('quant.studies.services.STUDY_VERSION', 1):
            _, study = self.start(max_generations=1)
        with patch('quant.studies.worker.complete', side_effect=self.legacy_reply): execute(study.job.pk)
        self.assertEqual(study.plan['version'], 1)
        self.assertEqual(AIStudyJob.objects.get(study=study).status, 'completed')
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_previous_plan_version_remains_readable(self):
        with patch('quant.studies.services.STUDY_VERSION', 2):
            _, study = self.start(max_generations=1)
        with patch('quant.studies.worker.complete', side_effect=self.legacy_reply): execute(study.job.pk)
        self.assertEqual(study.plan['version'], 2)
        self.assertEqual(AIStudyJob.objects.get(study=study).status, 'completed')
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_v3_comparisons_remain_readable_without_review(self):
        with patch('quant.studies.services.STUDY_VERSION', 3):
            _, study = self.start(max_generations=1)
        with patch('quant.studies.worker.complete', side_effect=self.reply) as model: execute(study.job.pk)
        self.assertEqual(model.call_count, 1)
        self.assertEqual(AIStudyJob.objects.get(study=study).status, 'completed')
        self.assertNotIn('review', study.generations.get().data)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_program_counterexample_blocks_false_claim_and_reaches_next_generation(self):
        _, study = self.start()
        def answer(config, prompt, **kwargs):
            if '本代公式核对结果：' in prompt: return self.reply(config, prompt, **kwargs)
            raw = json.loads(self.reply(config, prompt, **kwargs))
            frozen = json.loads(prompt.split('冻结研究配置与父代：')[1])['input']
            if not frozen['previous_checks']:
                parent = frozen['parents'][0]
                wrong = copy.deepcopy(raw['candidates'][0])
                wrong['definition']['expression'] = {'op': 'add', 'args': [parent['definition']['expression'], {'op': 'constant', 'value': 1}]}
                wrong['definition']['formula'] = '父代加一'
                wrong['parent_relations'] = [{'parent_id': parent['id'], 'relation': 'equivalent'}]
                valid = raw['candidates'][0]
                valid['definition']['expression'] = {'op': 'add', 'args': [parent['definition']['expression'], {'op': 'constant', 'value': 2}]}
                valid['definition']['formula'] = '父代加二'
                valid['parent_relations'] = [{'parent_id': parent['id'], 'relation': 'different'}]
                raw['candidates'] = [wrong, valid]
            else:
                self.assertEqual(frozen['previous_checks'][0]['checks'][0]['status'], 'different')
                self.assertIn('不能进入下一代', frozen['previous_checks'][0]['validation_error'])
            return json.dumps(raw)
        with patch('quant.studies.worker.complete', side_effect=answer) as model: execute(study.job.pk)
        self.assertEqual(model.call_count, 4)
        rows = list(study.generations.all())
        bad, good = rows[0].data['result']['candidates']
        self.assertFalse(bad['selected'])
        self.assertEqual(bad['formula_checks'][0]['counterexample']['parent'], '0')
        self.assertEqual(bad['formula_checks'][0]['counterexample']['candidate'], '1')
        self.assertTrue(good['selected'])
        self.assertEqual(rows[1].data['input']['parents'][0]['id'], good['candidate_id'])
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_review_cannot_override_program_findings(self):
        _, study = self.start(max_generations=1)
        def answer(config, prompt, **kwargs):
            raw = json.loads(self.reply(config, prompt, **kwargs))
            if '本代公式核对结果：' in prompt and raw['candidates'][0]['checks']:
                raw['candidates'][0]['checks'][0]['status'] = 'different' if raw['candidates'][0]['checks'][0]['status'] != 'different' else 'equivalent'
            return json.dumps(raw)
        with patch('quant.studies.worker.complete', side_effect=answer): execute(study.job.pk)
        data = study.generations.get().data
        self.assertEqual(data['status'], 'completed')
        self.assertIsNone(data['review'])
        self.assertTrue(data['review_error'])
        self.assertTrue(data['result']['candidates'][0]['formula_checks'])
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_source_identity_survives_explanation_edits_but_not_default_changes(self):
        seed, study = self.start(max_generations=1)
        def answer(config, prompt, **kwargs):
            if '本代公式核对结果：' in prompt: return self.reply(config, prompt, **kwargs)
            data = json.loads(self.reply(config, prompt, **kwargs))
            good = data['candidates'][0]
            good['definition']['parameters'][0]['evidence'] = '源码 N=20 的事实及其研究解释'
            bad = copy.deepcopy(good)
            bad['definition']['parameters'][0]['default_value'] = '30'
            data['candidates'] = [good, bad]
            return json.dumps(data)
        with patch('quant.studies.worker.complete', side_effect=answer): execute(study.job.pk)
        good, bad = study.generations.get().data['result']['candidates']
        self.assertTrue(good['selected'])
        self.assertEqual(good['definition']['parameters'][0]['source_binding'], seed.data['parameters'][0]['source_binding'])
        self.assertFalse(bad['selected'])
        self.assertTrue(bad['validation_error'])
        self.assertEqual(bad['formula_checks'][0]['status'], 'unknown')
        self.assertEqual(study.generations.get().data['review']['candidates'][1]['checks'][0]['status'], 'unknown')

    def test_missing_input_policy_remains_unknown_and_does_not_block_other_candidate(self):
        _, study = self.start(max_generations=1)
        def answer(config, prompt, **kwargs):
            if '本代公式核对结果：' in prompt: return self.reply(config, prompt, **kwargs)
            self.assertIn('missing_policy', prompt)
            data = json.loads(self.reply(config, prompt, **kwargs))
            bad = copy.deepcopy(data['candidates'][0])
            bad['definition']['inputs'][0].pop('missing_policy')
            good = data['candidates'][0]
            good['definition']['inputs'][0]['missing_policy'] = '未知，待核验'
            data['candidates'] = [bad, good]
            return json.dumps(data)
        with patch('quant.studies.worker.complete', side_effect=answer): execute(study.job.pk)
        data = study.generations.get().data
        bad, good = data['result']['candidates']
        self.assertFalse(bad['selected'])
        self.assertIn('missing_policy', bad['validation_error'])
        self.assertEqual(bad['formula_checks'][0]['status'], 'unknown')
        self.assertTrue(good['selected'])
        self.assertEqual(good['definition']['inputs'][0]['missing_policy'], '未知，待核验')
        self.assertTrue(data['review'])

    def test_malformed_model_output_is_preserved_without_publishing(self):
        _, study = self.start(max_generations=1)
        broken = '{"summary":"研究结果", "candidates":['
        with patch('quant.studies.worker.complete', return_value=broken) as model: execute(study.job.pk)
        self.assertEqual(model.call_count, 1)
        data = study.generations.get().data
        self.assertEqual(data['status'], 'failed')
        self.assertEqual(data['raw_output'], broken)
        self.assertIsNone(data['result'])
        self.assertIn('完整有效的JSON', data['error'])

    def test_unique_missing_definition_brace_is_repaired_and_original_preserved(self):
        _, study = self.start(max_generations=1)
        captured = []
        def answer(config, prompt, **kwargs):
            if '本代公式核对结果：' in prompt: return self.reply(config, prompt, **kwargs)
            data = json.loads(self.reply(config, prompt, **kwargs))
            row = data['candidates'][0]
            data['candidates'][0] = {key: row[key] for key in ('parents', 'operation', 'definition', 'parent_relations', 'rationale', 'decision', 'scores', 'risks')}
            good = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
            pos = good.index(',"parent_relations":')
            self.assertEqual(good[pos - 1], '}')
            broken = good[:pos - 1] + good[pos:]
            captured.append(broken)
            return broken
        with patch('quant.studies.worker.complete', side_effect=answer) as model: execute(study.job.pk)
        self.assertEqual(model.call_count, 2)
        data = study.generations.get().data
        self.assertEqual(data['raw_output'], captured[0])
        self.assertIn('唯一可解析', data['format_repair'])
        self.assertTrue(data['result']['candidates'][0]['selected'])
        self.assertTrue(data['review'])
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))

    def test_invalid_combination_does_not_discard_other_candidate(self):
        _, study = self.start(max_generations=1)
        def answer(config, prompt, **kwargs):
            if '本代公式核对结果：' in prompt: return self.reply(config, prompt, **kwargs)
            data = json.loads(self.reply(config, prompt, **kwargs))
            good = data['candidates'][0]
            bad = copy.deepcopy(good)
            bad['operation'] = 'combination'
            bad['definition']['expression']['args'][1]['value'] = 3
            bad['definition']['formula'] = '父代乘三'
            data['candidates'] = [good, bad]
            return json.dumps(data)
        with patch('quant.studies.worker.complete', side_effect=answer): execute(study.job.pk)
        data = study.generations.get().data
        good, bad = data['result']['candidates']
        self.assertTrue(good['selected'])
        self.assertFalse(bad['selected'])
        self.assertIn('至少两个不同父代', bad['validation_error'])
        self.assertTrue(data['review'])
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
