"""Frozen statistical review context, synthetic evidence and no provider calls."""
import copy
import json
from datetime import timedelta
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.experiments.output_associations import METHOD, SCOPE, LIMIT, PREFIX, item, validate, evidence
from quant.experiments.output_association_review import validate as validate_review
from quant.graph.correlation import METHOD as STAT_METHOD, CLAIM, summarize


def fixture():
    from quant.test_factors import extracted
    data = extracted()['factors'][0]
    options = [{'id': identity, 'candidate': copy.deepcopy(data), 'parameters': {'N': 20}, 'bindings': {'close': 'close'}} for identity in ('a', 'b')]
    sides = {name: {'id': identity, 'candidate': data, 'candidate_hash': digest(data),
        'parameters': {'N': 20}, 'bindings': {'close': 'close'}} for name, identity in (('left', 'a'), ('right', 'b'))}
    stats = summarize([f'2024-01-01T00:{n:02d}:00Z' for n in range(50)], list(range(50)), list(range(50)), 0, ['numeric_series'] * 2)
    plan = {**sides, 'name': '人工原对照', 'dataset_id': 'd', 'dataset_hash': 'dataset-hash', 'policy': {'warmup_bars': 0}}
    comparison = {'anthology': 'c', 'left': 'a', 'right': 'b', 'dataset': 'd', 'plan': plan,
        'result': {'evaluation_status': 'completed', 'output_hashes': stats['output_hashes']}, 'created_at': '2026-01-01T00:00:00+00:00'}
    from quant.comparisons.contracts import comparison_hash
    comparison['content_hash'] = comparison_hash(plan, comparison['result'])
    raw = {'version': 1, 'method': STAT_METHOD, 'comparison_id': 'comparison', 'comparison_hash': comparison['content_hash'],
        'dataset_id': 'd', 'dataset_hash': 'dataset-hash', 'statistics': stats, 'claim': CLAIM}
    fingerprint = digest(raw); identity = digest([STAT_METHOD, 'a', 'b', fingerprint])[:40]
    edge = {'left': 'a', 'right': 'b', 'kind': 'sample_correlation', 'evidence': raw, 'content_hash': fingerprint, 'created_at': '2026-01-01T00:00:01+00:00'}
    dataset = {'anthology': 'c', 'content_hash': 'dataset-hash', 'snapshot': {'symbol': 'SYNTHETIC'}}
    cutoff = '2026-01-01T00:00:02+00:00'
    projected = item(identity, edge, comparison, dataset, {row['id']: row for row in options}, collection_id='c', dataset_hash='dataset-hash', cutoff=cutoff)
    value = {'version': 1, 'method': METHOD, 'scope': SCOPE, 'cutoff': cutoff, 'limit': LIMIT,
        'known_matches': 1, 'complete_scan': True, 'omitted_at_least': 0, 'items': [projected]}
    rows = {'quant.factorrelation': {identity: edge}, 'quant.factorcomparison': {'comparison': comparison}, 'quant.marketdataset': {'d': dataset}}
    return value, rows, options, {'seeds': [options[0]], 'dataset_hash': 'dataset-hash'}


class OutputAssociationTests(SimpleTestCase):
    def test_scope_and_unknown_survive_without_executing_expressions(self):
        value, rows, options, plan = fixture()
        validate(value, rows, options, plan, collection_id='c', latest_at=value['cutoff'])
        self.assertEqual(value['items'][0]['baseline_scope'], 'current_baselines_match')
        options[1]['parameters'] = {'N': 8}
        with self.assertRaisesRegex(ValidationError, '不可改写'):
            validate(value, rows, options, plan, collection_id='c')
        edge = next(iter(rows['quant.factorrelation'].values())); selected = value['items'][0]
        updated = item(selected['relation_id'], edge, rows['quant.factorcomparison']['comparison'], rows['quant.marketdataset']['d'],
            {row['id']: row for row in options}, collection_id='c', dataset_hash='dataset-hash', cutoff=value['cutoff'])
        self.assertEqual(updated['baseline_scope'], 'historical_configuration_only')
        self.assertFalse(updated['sides'][1]['current_baseline_matches'])

    def test_wrong_owner_time_dataset_and_rehashed_scope_are_rejected(self):
        value, rows, options, plan = fixture()
        with self.assertRaises(ValidationError): validate(value, rows, options, plan, collection_id='other')
        with self.assertRaises(ValidationError): validate(value, rows, options, plan, collection_id='c', latest_at='2025-01-01T00:00:00Z')
        with self.assertRaises(ValidationError): validate(value, rows, options, plan | {'dataset_hash': 'other'}, collection_id='c')
        bad = copy.deepcopy(value); bad['items'][0]['sides'][0]['current_baseline_matches'] = 1
        with self.assertRaises(ValidationError): validate(bad, rows, options, plan, collection_id='c')
        bad = copy.deepcopy(value); bad['items'] *= 2
        with self.assertRaises(ValidationError): validate(bad, rows, options, plan, collection_id='c')

    def test_ai_covers_each_statistic_and_cannot_promote_its_scope(self):
        value, rows, options, plan = fixture()
        facts = evidence(value)
        key = next(key for key in facts if key.startswith(PREFIX))
        answer = {'output_association_reviews': [{'evidence_ref': key, 'baseline_scope': 'current_baselines_match', 'text': '历史描述性观察。'}]}
        result = copy.deepcopy(answer); validate_review(result, facts)
        self.assertEqual(result['output_association_reviews'][0]['facts'], value['items'][0])
        tampered = copy.deepcopy(result); tampered['output_association_reviews'][0]['facts']['statistics']['pearson'] = 0
        for bad in ({}, {'output_association_reviews': []}, tampered):
            with self.assertRaises(ValidationError): validate_review(bad, facts)
        with self.assertRaises(ValidationError): validate_review(copy.deepcopy(answer), {})
        value['items'][0]['baseline_scope'] = 'historical_configuration_only'
        with self.assertRaises(ValidationError): validate_review(copy.deepcopy(answer), evidence(value))


class OutputAssociationIntegrationTests(TestCase):
    from quant.test_factor_comparisons import FactorComparisonIntegrationTests as setup
    setUp, publish, dataset, pair, compare = setup.setUp, setup.publish, setup.dataset, setup.pair, setup.compare
    side = staticmethod(setup.side)

    def prepare(self):
        from quant.experiments.worker import execute as calculate
        from quant.models import ExperimentRequest
        from quant.test_experiment_search import SearchTests
        from quant.graph.correlation import create
        a = self.publish('association_source_a01')
        b = self.publish('association_source_b01', offset=2)
        data = self.dataset()
        comparison = self.compare(self.pair(a, b, data, 'association_compare_001'), 'fail')
        relation = create(self.collection, comparison.pk)
        self.experiment_path = f'/api/quant/{self.collection.pk}/experiments/'
        saved = self.client.post(self.experiment_path, {'request_key': 'association_experiment01', 'name': '合成统计解读', 'dataset_id': data.pk,
            'seeds': [self.side(a, 20) | {'variants': []}, self.side(b, 8) | {'variants': []}], 'config': SearchTests.config}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        request = ExperimentRequest.objects.get(pk=saved.data['data']['id'])
        with patch('quant.experiments.reviews.auto_review'): calculate(request.job.pk)
        return a, b, data, comparison, relation, request

    def test_context_is_frozen_matches_actual_params_and_replays_without_retrieval(self):
        from quant.experiments.reviews import start_review
        from quant.experiments.review_evidence import for_run, for_result
        from quant.experiments.review_contract import review_prompt
        from quant.experiments.review_contract import validate_review as validate_response
        from quant.graph.correlation import create
        from quant.test_experiment_reviews import response
        from quant.worker import execute
        from quant.sync import metadata, validate as validate_sync
        from utils.sync_manager import SyncManager, SyncError
        a, b, data, comparison, relation, request = self.prepare()
        saved_result = copy.deepcopy(request.result.data)
        unknown_comparison = self.compare(self.pair(a, b, data, 'association_unknown_001', windows=(500, 500)), 'inconclusive')
        unknown_relation = create(self.collection, unknown_comparison.pk)
        with patch('django.utils.timezone.now', return_value=timezone.now() + timedelta(seconds=2)):
            with patch('quant.graph.correlation.compute') as calculate:
                run = start_review(request.result, request_key='association_review_00001')
        calculate.assert_not_called()
        self.assertEqual(run.review_version, 17)
        frozen = copy.deepcopy(run.planning_context['output_associations'])
        self.assertEqual(run.planning_context['version'], 7)
        self.assertEqual(frozen['items'][0]['baseline_scope'], 'historical_configuration_only')
        missing = next(row for row in frozen['items'] if row['relation_id'] == unknown_relation.pk)
        self.assertEqual(missing['statistics']['status'], 'insufficient')
        self.assertIsNone(missing['statistics']['pearson'])
        context = for_run(run); before = review_prompt(context, '')
        self.assertIn(PREFIX + relation.pk, context['evidence'])
        legacy = copy.deepcopy(run.planning_context); legacy.pop('output_associations'); legacy['version'] = 6
        old = for_result(request.result, 16, legacy)
        self.assertNotIn('output_associations', old['evidence'])
        # A new observation after queueing cannot replace or extend this request.
        with patch('django.utils.timezone.now', return_value=timezone.now() + timedelta(seconds=3)):
            later = self.compare(self.pair(a, b, data, 'association_later_00001', windows=(20, 8)), 'fail')
            create(self.collection, later.pk)
        with patch('quant.experiments.output_associations.freeze') as retrieve, patch('quant.graph.correlation.compute') as calculate:
            self.assertEqual(review_prompt(for_run(run), ''), before)
        retrieve.assert_not_called(); calculate.assert_not_called()
        answer = response(context)
        from quant.test_fixed_research_memory import decision
        answer.update(decision(run.planning_context['research_memory']))
        validate_response(answer, context)
        with patch('quant.worker.complete', return_value=json.dumps(answer)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        request.result.refresh_from_db(); self.assertEqual(request.result.data, saved_result)
        self.assertIn('历史固定样本输出统计', run.report.markdown)
        snapshot = SyncManager().build_snapshot_data(); validate_sync(snapshot, metadata(snapshot))
        bad = copy.deepcopy(snapshot)
        saved = next(row['fields'] for row in bad if row['model'] == 'quant.airun' and row['pk'] == run.pk)
        saved['result']['output_association_reviews'][0]['facts']['statistics']['pearson'] = 0
        with self.assertRaises(SyncError): validate_sync(bad, metadata(bad))
        with self.assertRaises(SyncError): validate_sync(snapshot, metadata(snapshot) | {'quant_schema_version': 73})
        with patch('quant.worker.dispatch') as dispatch, patch('quant.experiments.output_associations.freeze') as retrieve:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        dispatch.assert_not_called(); retrieve.assert_not_called()

    def test_bounded_pool_discloses_omissions_and_empty_results_do_not_assert_no_correlation(self):
        from quant.graph.correlation import create
        from quant.experiments.output_associations import freeze
        from quant.experiments.planning_context import for_result
        a, b, data, comparison, relation, request = self.prepare()
        for n in range(8):
            record = self.compare(self.pair(a, b, data, f'association_limit_{n:04d}', windows=(20, n + 3)), 'fail')
            create(self.collection, record.pk)
        with patch('django.utils.timezone.now', return_value=timezone.now() + timedelta(seconds=2)):
            value = freeze(request.result, for_result(request.result))
        self.assertEqual(len(value['items']), 8)
        self.assertEqual(value['known_matches'], 9)
        self.assertFalse(value['complete_scan']); self.assertEqual(value['omitted_at_least'], 1)
        options = for_result(request.result)
        value = freeze(request.result, options[:1])
        self.assertEqual(value['items'], [])
        self.assertEqual(value['known_matches'], 0)
