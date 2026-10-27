"""Direct output facts influence AI research without upgrading their claim scope."""
import copy
import json
from types import SimpleNamespace
from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from quant import test_factor_comparisons as fixtures
from quant import test_feedback as feedback_fixtures
from quant import test_experiment_reviews as review_fixtures
from quant.experiments.library_contract import option
from quant.experiments.review_evidence import for_run as review_evidence
from quant.experiments.review_contract import validate_review
from quant.experiments.reviews import start_review
from quant.experiments.worker import execute as calculate
from quant.feedback.contracts import validate_analysis
from quant.feedback.evidence import for_run as feedback_evidence
from quant.models import AIRun, ExperimentJob, ExperimentProposal, ExperimentRequest, Job, ResearchReport
from quant.research_memory import freeze, validate_from_rows
from quant.research_memory.contract import instant
from quant.sync import metadata, validate
from quant.worker import execute, prompt
from utils.sync_manager import SyncError, SyncManager


class ComparisonResearchMemoryTests(TestCase):
    setUp = fixtures.FactorComparisonIntegrationTests.setUp
    publish = fixtures.FactorComparisonIntegrationTests.publish
    dataset = fixtures.FactorComparisonIntegrationTests.dataset
    side = staticmethod(fixtures.FactorComparisonIntegrationTests.side)
    pair = fixtures.FactorComparisonIntegrationTests.pair
    compare = fixtures.FactorComparisonIntegrationTests.compare
    merge = fixtures.FactorComparisonIntegrationTests.merge
    withdraw = fixtures.FactorComparisonIntegrationTests.withdraw

    def prepare(self):
        left = self.publish('memory_comparison_left_01', '左侧动量')
        right = self.publish('memory_comparison_right_1', '右侧独立名称', parameter_name='Length')
        dataset = self.dataset()
        passed = self.compare(self.pair(left, right, dataset, 'memory_comparison_pass_01'))
        failed = self.compare(self.pair(left, right, dataset, 'memory_comparison_fail_01', windows=(20, 8)), 'fail')
        return left, right, dataset, passed, failed

    @staticmethod
    def rows():
        snapshot = SyncManager().build_snapshot_data()
        return {label: {str(row['pk']): row['fields'] for row in snapshot if row['model'] == label}
                for label in {row['model'] for row in snapshot}}, snapshot

    def memory(self, left, *, version=2, seconds=1):
        return freeze([option(left.pk, left.data)], str(self.collection.pk),
                      before=(timezone.now() + timedelta(seconds=seconds)).isoformat(), version=version)

    def feedback(self, left, key='comparison_feedback_0001'):
        path = f'/api/quant/{self.collection.pk}/entries/{left.report.entry_id}/feedback/'
        with patch('django.utils.timezone.now', return_value=timezone.now() + timedelta(seconds=1)):
            saved = self.client.post(path, {'request_key': key, 'title': '对照失败后的反馈',
                'target_source_id': left.report.source_id, 'factor_id': left.pk, 'document': 'N=10\nnet=-2%'}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        return AIRun.objects.get(source_id=saved.data['data']['source']['id'])

    def value(self, run, value):
        value=review_fixtures.acknowledge_selection(value,run)
        memory = run.planning_context.get('research_memory', run.planning_context.get('library_memory'))
        value.update(memory_note='采用直接失败样本提出反证实验；不据一致性升分或推导传递等价',
            memory_assessment=[{'action': 'investigate', 'rationale': '先核对固定行情、双方实际参数与合并撤销状态，再用新数据验证',
                'evidence_refs': [f"memory:{row['kind']}:{row['id']}"]} for row in memory['items']])
        return value

    def test_direct_pass_fail_and_unknown_preserved_with_actual_parameters_and_no_raw_bars(self):
        left, right, dataset, passed, failed = self.prepare()
        unknown = self.compare(self.pair(left, right, dataset, 'memory_comparison_unknown', windows=(500, 500)), 'inconclusive')
        memory = self.memory(left)
        self.assertEqual(memory['version'], 2)
        self.assertEqual(memory['method'], 'library-history-v2')
        self.assertEqual(memory['scanned']['comparisons'], 3)
        items = [row for row in memory['items'] if row['kind'] == 'comparison']
        self.assertEqual(items[0]['id'], failed.pk)
        self.assertEqual({row['id'] for row in items}, {passed.pk, failed.pk, unknown.pk})
        failure = items[0]['evidence']
        self.assertEqual(failure['sides']['left']['parameters'], {'N': 20})
        self.assertEqual(failure['sides']['right']['parameters'], {'Length': 8})
        self.assertGreater(failure['result']['counts']['missing_mismatches'], 0)
        self.assertNotIn('rows', failure['dataset'])
        self.assertNotIn('csv_text', json.dumps(failure))
        self.assertFalse(failure['independent_holdout_proven'])
        rows, _ = self.rows()
        validate_from_rows(memory, rows, collection_id=str(self.collection.pk), latest_at=memory['cutoff'], options=[option(left.pk, left.data)])

    def test_merge_and_later_withdrawal_do_not_rewrite_historical_context(self):
        left, _, _, passed, _ = self.prepare()
        merge, _ = self.merge(passed, 'memory_merge_active_0001')
        old = self.memory(left)
        cutoff = instant(old['cutoff']) + timedelta(seconds=1)
        local_cutoff = timezone.make_naive(cutoff, timezone.get_default_timezone())
        with patch('django.utils.timezone.now', return_value=local_cutoff):
            self.withdraw(merge, 'memory_withdraw_later_01')
        rows, _ = self.rows()
        validate_from_rows(old, rows, collection_id=str(self.collection.pk), latest_at=old['cutoff'], options=[option(left.pk, left.data)])
        before = next(row for row in old['items'] if row['id'] == passed.pk)['evidence']['logical_merges']['items'][0]
        self.assertTrue(before['active_at_cutoff']); self.assertIsNone(before['withdrawal'])
        new = freeze([option(left.pk, left.data)], str(self.collection.pk), before=(cutoff + timedelta(seconds=1)).isoformat(), version=2)
        after = next(row for row in new['items'] if row['id'] == passed.pk)['evidence']['logical_merges']['items'][0]
        self.assertFalse(after['active_at_cutoff']); self.assertTrue(after['withdrawal']['reason'])

    def test_feedback_assessment_must_cover_direct_comparisons_and_proposal_can_cite_them(self):
        left, _, dataset, _, failed = self.prepare()
        run = self.feedback(left)
        self.assertEqual(run.planning_context['version'], 5)
        context = feedback_evidence(run)
        ref = f'memory:comparison:{failed.pk}'
        value = self.value(run, feedback_fixtures.response())
        value['feedback_proposal'] = {'name': '对照差异反证', 'hypothesis': '原差异来自窗口设定而非平台行为',
            'falsification': '同参数新数据仍不一致', 'data_requirement': '全新同口径行情', 'evidence_refs': ['feedback', ref],
            'seeds': [{'candidate_id': left.pk, 'variants': [[{'name': 'N', 'value': 10}]]}],
            'config': {'seed': 42, 'max_candidates': 4, 'generations': 2, 'threshold': 0, 'fee_bps': 5,
                       'slippage_bps': 5, 'gap': 2, 'seconds': 5}}
        self.assertIn('logical_merges', prompt(run))
        self.assertIn('不支持全局公式等价', prompt(run))
        self.assertEqual(validate_analysis(value, context)['feedback_proposal']['evidence_refs'], ['feedback', ref])
        missing = copy.deepcopy(value); missing['memory_assessment'] = []
        with self.assertRaises(ValidationError): validate_analysis(missing, context)
        forged = copy.deepcopy(value); forged['memory_assessment'][0]['evidence_refs'] = ['memory:comparison:foreign']
        with self.assertRaises(ValidationError): validate_analysis(forged, context)
        with patch('quant.worker.complete', return_value=json.dumps(value)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        proposal = ExperimentProposal.objects.get(run=run)
        self.assertIn(ref, proposal.data['evidence_refs'])
        from quant.experiments.campaigns.contracts import experiment_input
        raw = experiment_input(proposal, dataset.pk, 'comparison_adopt_plan_01')
        started = self.client.post(f'/api/quant/{self.collection.pk}/experiments/', raw, format='json')
        self.assertEqual(started.status_code, 200, started.data)
        request = ExperimentRequest.objects.get(pk=started.data['data']['id'])
        calculate(request.job.pk)
        self.assertEqual(request.result.data['status'], 'completed')
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertFalse(ExperimentJob.objects.exists()); self.assertFalse(Job.objects.exists())

    def test_experiment_review_uses_comparison_facts_without_performance_score_upgrade(self):
        left, _, dataset, _, failed = self.prepare()
        data = {'request_key': 'comparison_base_exp_0001', 'name': '对照后本机研究', 'dataset_id': dataset.pk,
            'seeds': [{**self.side(left), 'variants': []}],
            'config': {'seed': 42, 'max_candidates': 2, 'generations': 1, 'threshold': 0, 'fee_bps': 5,
                       'slippage_bps': 5, 'gap': 2, 'seconds': 5}}
        saved = self.client.post(f'/api/quant/{self.collection.pk}/experiments/', data, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        request = ExperimentRequest.objects.get(pk=saved.data['data']['id'])
        with patch('django.utils.timezone.now', return_value=timezone.now() + timedelta(seconds=1)), self.captureOnCommitCallbacks(execute=True):
            calculate(request.job.pk)
        run = AIRun.objects.get(experiment_result=request.result)
        self.assertEqual(run.review_version, 17)
        evidence = review_evidence(run)
        ref = f'memory:comparison:{failed.pk}'
        self.assertIn(ref, evidence['evidence'])
        value = self.value(run, review_fixtures.response())
        value['findings'][0]['evidence_refs'] = [ref]
        normalized = validate_review(value, evidence)
        self.assertIsNone(normalized['scores'][1]['score'])
        wrong = copy.deepcopy(value); wrong['scores'][1].update(score=5, evidence_refs=[ref])
        with self.assertRaises(ValidationError): validate_review(wrong, evidence)
        with patch('quant.worker.complete', return_value=json.dumps(value)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        before = prompt(run)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(prompt(AIRun.objects.get(pk=run.pk)), before)

    def test_bounded_merge_history_and_replay_preserve_selected_ids_at_millisecond_precision(self):
        left, _, _, passed, _ = self.prepare()
        for index in range(10):
            merged, _ = self.merge(passed, f'memory_merge_cycle_{index:04d}')
            self.withdraw(merged, f'memory_withdraw_cycle_{index:04d}')
        memory = self.memory(left)
        item = next(row for row in memory['items'] if row['id'] == passed.pk)
        history = item['evidence']['logical_merges']
        self.assertEqual((history['total'], history['included'], history['omitted']), (10, 8, 2))
        self.assertTrue(all(not row['active_at_cutoff'] for row in history['items']))
        rows, _ = self.rows()
        validate_from_rows(memory, rows, collection_id=str(self.collection.pk), latest_at=memory['cutoff'], options=[option(left.pk, left.data)])
        changed = copy.deepcopy(memory)
        next(row for row in changed['items'] if row['id'] == passed.pk)['evidence']['logical_merges']['items'][0]['active_at_cutoff'] = True
        with self.assertRaises(ValidationError): validate_from_rows(changed, rows, collection_id=str(self.collection.pk), latest_at=memory['cutoff'], options=[option(left.pk, left.data)])

    def test_selection_ignores_merely_related_or_deleted_candidates_and_legacy_has_no_comparisons(self):
        left, _, _, _, _ = self.prepare()
        other = self.publish('memory_comparison_unrelated', '同标签独立因子')
        unrelated = self.memory(other)
        self.assertEqual(unrelated['scanned']['comparisons'], 2)
        self.assertEqual(unrelated['eligible']['comparisons'], 0)
        self.assertFalse(any(row['kind'] == 'comparison' for row in unrelated['items']))
        old = self.memory(left, version=1)
        self.assertEqual(old['method'], 'library-history-v1')
        self.assertNotIn('comparisons', old['scanned'])
        left.report.entry.is_valid = False; left.report.entry.save(update_fields=['is_valid'])
        self.assertFalse(any(row['kind'] == 'comparison' for row in self.memory(left)['items']))

    def test_batch_discovery_does_not_query_each_comparison_or_merge(self):
        left, right, dataset, _, _ = self.prepare()
        for index in range(20):
            self.compare(self.pair(left, right, dataset, f'memory_bulk_pair_{index:04d}'))
        with CaptureQueriesContext(connection) as queries:
            memory = self.memory(left)
        self.assertEqual(memory['scanned']['comparisons'], 22)
        self.assertLessEqual(len(queries), 10)

    def test_rehashed_memory_projection_cannot_change_frozen_comparison_facts(self):
        left, _, _, _, failed = self.prepare()
        run = self.feedback(left)
        snapshot = SyncManager().build_snapshot_data()
        changed = copy.deepcopy(snapshot)
        row = next(row for row in changed if row['model'] == 'quant.airun' and row['pk'] == run.pk)
        item = next(item for item in row['fields']['planning_context']['library_memory']['items'] if item['id'] == failed.pk)
        item['evidence']['result']['status'] = 'pass'
        from quant.research.contracts import digest
        item['content_hash'] = digest(item['evidence'])
        with self.assertRaises(SyncError): validate(changed, metadata(changed))

    def test_historical_v6_review_keeps_v1_memory_and_same_retry_fingerprint(self):
        from quant.experiments import reviews
        left, _, dataset, _, _ = self.prepare()
        saved = self.client.post(f'/api/quant/{self.collection.pk}/experiments/', {'request_key': 'memory_legacy_calc_0001',
            'name': '旧版历史实验', 'dataset_id': dataset.pk, 'seeds': [{**self.side(left), 'variants': []}],
            'config': {'seed': 42, 'max_candidates': 2, 'generations': 1, 'threshold': 0, 'fee_bps': 5,
                       'slippage_bps': 5, 'gap': 2, 'seconds': 5}}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        request = ExperimentRequest.objects.get(pk=saved.data['data']['id'])
        calculate(request.job.pk)
        original = reviews.validate_input
        def legacy(entry, values, existing=None):
            return original(entry, values, existing=existing or SimpleNamespace(kind='experiment_review', review_version=6, planning_context=None))
        with patch('quant.experiments.reviews.validate_input', side_effect=legacy):
            run = start_review(request.result, request_key='memory_legacy_review_0001')
        self.assertEqual(run.review_version, 6)
        self.assertEqual(run.planning_context['version'], 2)
        self.assertEqual(run.planning_context['research_memory']['version'], 1)
        self.assertNotIn('comparisons', run.planning_context['research_memory']['scanned'])
        value = self.value(run, review_fixtures.response())
        with patch('quant.worker.complete', return_value=json.dumps(value)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        before, fingerprint = prompt(run), run.input_hash
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        replay = start_review(request.result, request_key='memory_legacy_review_0001')
        self.assertEqual(replay.pk, run.pk); self.assertEqual(replay.input_hash, fingerprint)
        self.assertEqual(prompt(replay), before); self.assertFalse(Job.objects.filter(run=replay).exists())

    def test_historical_feedback_selection_v2_does_not_upgrade_on_restore_or_retry(self):
        from quant.feedback import memory as feedback_memory
        left, _, _, _, _ = self.prepare()
        original = feedback_memory.freeze
        def legacy(source):
            value = original(source)
            value.pop('planning_capabilities',None)
            value.update(version=2, method='feedback-research-2', library_memory=freeze([option(left.pk, left.data)],
                str(self.collection.pk), source_id=source.pk, version=1))
            return value
        with patch('quant.feedback.memory.freeze', side_effect=legacy):
            run = self.feedback(left, 'memory_legacy_feedback_01')
        self.assertEqual(run.planning_context['version'], 2)
        self.assertEqual(run.planning_context['library_memory']['version'], 1)
        self.assertNotIn('memory:comparison:', prompt(run))
        value = self.value(run, feedback_fixtures.response())
        with patch('quant.worker.complete', return_value=json.dumps(value)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        before, fingerprint = prompt(run), run.input_hash
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        saved = self.client.post(f'/api/quant/{self.collection.pk}/entries/{run.entry_id}/runs/', {
            'kind': 'feedback_review', 'source_id': run.source_id, 'request_key': run.request_key}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        replay = AIRun.objects.get(pk=run.pk)
        self.assertEqual(replay.input_hash, fingerprint); self.assertEqual(prompt(replay), before)
        self.assertEqual(replay.planning_context['version'], 2); self.assertFalse(Job.objects.filter(run=replay).exists())
