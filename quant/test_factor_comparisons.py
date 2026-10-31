"""Fixed-sample evidence and reversible groups through isolated real APIs and sync."""
import copy
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from anthology.models import Anthology
from quant import test_research_analysis as analysis_fixtures
from quant import test_experiment_search as search_fixtures
from quant import test_graph as graph_fixtures
from quant.comparisons.contracts import comparison_hash, withdrawal_hash
from quant.comparisons.kernel import evaluate_pair
from quant.experiments.datasets import create_dataset
from quant.experiments.expression import calculate
from quant.experiments.worker import execute as compute
from quant.models import (AIRun, Entry, ExperimentJob, ExperimentRequest, FactorCandidate, FactorComparison,
                          FactorIndexJob, FactorMerge, FactorMergeWithdrawal, FactorRelation, Job)
from quant.research.contracts import digest
from quant.sync import metadata, validate
from quant.test_factors import extracted
from quant.worker import execute
from utils.sync_manager import SyncError, SyncManager


class FactorComparisonIntegrationTests(TestCase):
    setUp = analysis_fixtures.AnalysisTests.setUp

    def publish(self, key, name='动量', *, input_name='close', parameter_name='N', offset=None, collection=None):
        collection = collection or self.collection
        calculation = f'{input_name} / {input_name}.shift({parameter_name}) - 1'
        if offset is not None:
            calculation = f'({calculation}) + {offset}'
        code = f'{parameter_name}=20\ndef factor({input_name}): return {calculation}'
        saved = self.client.post(f'/api/quant/{collection.pk}/intake/',
            {**self.payload, 'request_key': key, 'code': code}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        entry = Entry.objects.get(pk=saved.data['data']['entry']['id'])
        run = AIRun.objects.get(entry=entry)
        value = extracted()
        parameters = copy.deepcopy(value['parameters'])
        parameters[0].update(name=parameter_name, evidence=f'{parameter_name}=20')
        value['parameters'] = copy.deepcopy(parameters)
        factor = value['factors'][0]
        factor.update(name=name, parameters=parameters, formula=calculation,
                      evidence=[{'field': 'code', 'quote': calculation}])
        factor['inputs'][0]['name'] = input_name
        def rename(node):
            if node['op'] == 'input': node['name'] = input_name
            if node['op'] == 'parameter': node['name'] = parameter_name
            for child in node.get('args', []): rename(child)
        rename(factor['expression'])
        if offset is not None:
            factor['expression'] = {'op': 'add', 'args': [factor['expression'], {'op': 'constant', 'value': offset}]}
        with patch('quant.worker.complete', return_value=json.dumps(value)):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        return FactorCandidate.objects.get(report__run=run)

    def dataset(self, collection=None):
        fields = ('timestamp', 'open', 'high', 'low', 'close', 'volume')
        csv = ','.join(fields) + '\n' + '\n'.join(','.join(str(row[field]) for field in fields)
            for row in search_fixtures.data()['rows'])
        return create_dataset(collection or self.collection, {'name': 'Synthetic comparison data', 'csv_text': csv,
            'symbol': 'SYNTHETIC', 'timeframe': '1d', 'timezone': 'UTC', 'source': 'isolated test', 'price_adjustment': 'none'})

    @staticmethod
    def side(candidate, window=20):
        return {'candidate_id': candidate.pk,
            'bindings': [{'name': candidate.data['inputs'][0]['name'], 'column': 'close'}],
            'parameters': [{'name': candidate.data['parameters'][0]['name'], 'value': window}]}

    def pair(self, left, right, dataset, key, *, windows=(20, 20)):
        return {'request_key': key, 'name': '固定样本逐点对照', 'dataset_id': dataset.pk,
            'left': self.side(left, windows[0]), 'right': self.side(right, windows[1]),
            'policy': {'absolute_tolerance': 0, 'relative_tolerance': 0, 'warmup_bars': 0}}

    def compare(self, values, status='pass', collection=None):
        saved = self.client.post(f'/api/quant/{(collection or self.collection).pk}/comparisons/', values, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        body = saved.json()['data']
        self.assertEqual(body['verdict'], status)
        record = FactorComparison.objects.get(pk=body['id'])
        self.assertEqual(json.loads(body['planJson']), record.plan)
        self.assertEqual(json.loads(body['resultJson']), record.result)
        return record

    def merge(self, comparison, key, collection=None):
        values = {'request_key': key, 'comparison_id': comparison.pk, 'name': '人工收藏逻辑组', 'reason': '固定样本相同，保留各自来源'}
        saved = self.client.post(f'/api/quant/{(collection or self.collection).pk}/factor-merges/', values, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        return FactorMerge.objects.get(pk=saved.data['data']['id']), values

    def withdraw(self, merge, key):
        values = {'request_key': key, 'reason': '撤销组织关系，原比较仍保留'}
        saved = self.client.post(f'/api/quant/{self.collection.pk}/factor-merges/{merge.pk}/withdraw/', values, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertFalse(saved.data['data']['active'])
        return values

    def listing(self, mode='merged'):
        saved = self.client.get(f'/api/quant/{self.collection.pk}/factors/', {'groupBy': mode})
        self.assertEqual(saved.status_code, 200, saved.data)
        return saved.json()['data']

    def test_distinct_source_names_match_only_for_explicit_aligned_values(self):
        left = self.publish('comparison_source_left01', '原始动量')
        right = self.publish('comparison_source_right1', '另一名称', input_name='Price', parameter_name='Length')
        data = self.dataset()
        with patch('quant.worker.complete') as model:
            passed = self.compare(self.pair(left, right, data, 'comparison_different_names'))
            failed = self.compare(self.pair(left, right, data, 'comparison_different_params', windows=(20, 8)), 'fail')
            missing = self.compare(self.pair(left, right, data, 'comparison_all_missing', windows=(500, 500)), 'inconclusive')
            model.assert_not_called()
        self.assertEqual(passed.plan['left']['parameters'], {'N': 20})
        self.assertEqual(passed.plan['right']['parameters'], {'Length': 20})
        self.assertEqual(passed.plan['right']['bindings'], {'Price': 'close'})
        for side, candidate in [('left', left), ('right', right)]:
            self.assertEqual(passed.plan[side]['candidate_hash'], candidate.content_hash)
            self.assertEqual(passed.plan[side]['source_hash'], candidate.report.source.content_hash)
            self.assertEqual(passed.plan[side]['report_hash'], candidate.report.content_hash)
        self.assertGreaterEqual(passed.result['counts']['common_valid'], 30)
        self.assertEqual(passed.result['output_hashes']['left'], passed.result['output_hashes']['right'])
        self.assertGreater(failed.result['counts']['missing_mismatches'], 0)
        self.assertEqual(missing.result['counts']['common_valid'], 0)
        self.assertEqual(missing.result['counts']['both_missing'], 180)
        for record in (failed, missing):
            rejected = self.client.post(f'/api/quant/{self.collection.pk}/factor-merges/', {
                'request_key': f'not_passed_{record.pk}', 'comparison_id': record.pk, 'name': '不能合并', 'reason': ''}, format='json')
            self.assertEqual(rejected.status_code, 400, rejected.data)
        self.assertFalse(FactorMerge.objects.exists())
        detail = self.client.get(f'/api/quant/{self.collection.pk}/factors/{left.pk}/').json()['data']
        self.assertEqual(detail['evidenceStatus'], 'static_unverified')

    def test_comparison_merge_withdraw_requests_are_idempotent_and_conflicts_visible(self):
        left = self.publish('comparison_idempotent_l')
        right = self.publish('comparison_idempotent_r', input_name='Price', parameter_name='Length')
        values = self.pair(left, right, self.dataset(), 'comparison_idempotent_fact')
        with patch('quant.comparisons.services.evaluate_pair', wraps=evaluate_pair) as calculator:
            record = self.compare(values)
            self.assertEqual(self.compare(values).pk, record.pk)
            self.assertEqual(calculator.call_count, 1)
            changed = self.client.post(f'/api/quant/{self.collection.pk}/comparisons/',
                {**values, 'name': '同键不同内容'}, format='json')
            self.assertEqual(changed.status_code, 409)
            self.assertEqual(calculator.call_count, 1)
        original_plan = copy.deepcopy(record.plan)
        with patch('quant.comparisons.services.runtime', return_value={
                'python': '3.11.99', 'numpy': '9.9', 'pandas': '9.9'}), \
                patch('quant.comparisons.services.evaluate_pair') as calculator:
            self.assertEqual(self.compare(values).pk, record.pk)
            calculator.assert_not_called()
        record.refresh_from_db()
        self.assertEqual(record.plan, original_plan)
        merge, merge_values = self.merge(record, 'comparison_idempotent_merge')
        path = f'/api/quant/{self.collection.pk}/factor-merges/'
        self.assertEqual(self.client.post(path, merge_values, format='json').data['data']['id'], merge.pk)
        self.assertEqual(self.client.post(path, {**merge_values, 'reason': '不同原因'}, format='json').status_code, 409)
        values = self.withdraw(merge, 'comparison_idempotent_revoke')
        path += merge.pk + '/withdraw/'
        self.assertEqual(self.client.post(path, values, format='json').status_code, 200)
        self.assertEqual(self.client.post(path, {**values, 'reason': '同键改原因'}, format='json').status_code, 409)
        self.assertEqual(self.client.post(path, {**values, 'request_key': 'comparison_repeat_revoke'}, format='json').status_code, 409)
        self.assertEqual(FactorComparison.objects.count(), 1)
        self.assertEqual(FactorMerge.objects.count(), 1)
        self.assertEqual(FactorMergeWithdrawal.objects.count(), 1)
        replacement, _ = self.merge(record, 'comparison_idempotent_remerge')
        self.assertNotEqual(replacement.pk, merge.pk)
        self.assertEqual(FactorMerge.objects.filter(withdrawal__isnull=True).count(), 1)

    def test_private_collection_boundaries_cover_candidates_data_facts_and_events(self):
        left = self.publish('comparison_permission_l')
        right = self.publish('comparison_permission_r', parameter_name='Length')
        data = self.dataset()
        foreign = Anthology.objects.create(type='quant', permission='private', user_id=f'user_{self.user.pk}', title='另一私密库')
        other = self.publish('comparison_permission_other', collection=foreign)
        another = self.publish('comparison_permission_other2', collection=foreign)
        other_data = self.dataset(foreign)
        values = self.pair(left, right, data, 'comparison_permission_local')
        record = self.compare(values)
        merged, _ = self.merge(record, 'comparison_permission_merge')
        other_fact = self.compare(self.pair(other, another, other_data, 'comparison_permission_foreign'), collection=foreign)
        other_merge, _ = self.merge(other_fact, 'comparison_foreign_merge', collection=foreign)
        endpoint = f'/api/quant/{self.collection.pk}/comparisons/'
        for changed in ({**values, 'request_key': 'comparison_cross_candidate', 'right': self.side(other)},
                        {**values, 'request_key': 'comparison_cross_dataset', 'dataset_id': other_data.pk}):
            self.assertIn(self.client.post(endpoint, changed, format='json').status_code, (400, 404))
        self.assertEqual(self.client.get(endpoint, {'factorId': other.pk}).status_code, 404)
        self.assertEqual(self.client.get(endpoint + other_fact.pk + '/').status_code, 404)
        merge_path = f'/api/quant/{self.collection.pk}/factor-merges/'
        self.assertEqual(self.client.post(merge_path, {'request_key': 'comparison_cross_fact_merge',
            'comparison_id': other_fact.pk, 'name': '错误来源', 'reason': ''}, format='json').status_code, 404)
        self.assertEqual(self.client.post(merge_path + other_merge.pk + '/withdraw/', {
            'request_key': 'comparison_cross_withdraw', 'reason': ''}, format='json').status_code, 404)
        self.client.force_authenticate(get_user_model().objects.create_user('comparison-outsider'))
        for url in (endpoint, endpoint + record.pk + '/', merge_path):
            self.assertIn(self.client.get(url).status_code, (403, 404))
        for url, payload in [(endpoint, values), (merge_path, {'request_key': 'comparison_outsider_merge',
                'comparison_id': record.pk, 'name': '禁止', 'reason': ''}),
                (merge_path + merged.pk + '/withdraw/', {'request_key': 'comparison_outsider_withdraw', 'reason': ''})]:
            self.assertIn(self.client.post(url, payload, format='json').status_code, (403, 404))
        self.assertEqual(FactorComparison.objects.count(), 2)
        self.assertEqual(FactorMerge.objects.count(), 2)
        self.assertFalse(FactorMergeWithdrawal.objects.exists())

    def test_owner_change_during_calculation_cannot_publish_a_comparison(self):
        left = self.publish('comparison_transfer_left')
        right = self.publish('comparison_transfer_right', parameter_name='Length')
        values = self.pair(left, right, self.dataset(), 'comparison_transfer_fact')
        successor = get_user_model().objects.create_user('comparison-new-owner')
        def changed_owner(*args, **kwargs):
            result = evaluate_pair(*args, **kwargs)
            Anthology.objects.filter(pk=self.collection.pk).update(user_id=f'user_{successor.pk}')
            return result
        with patch('quant.comparisons.services.evaluate_pair', side_effect=changed_owner) as calculator:
            saved = self.client.post(f'/api/quant/{self.collection.pk}/comparisons/', values, format='json')
        calculator.assert_called_once()
        self.assertIn(saved.status_code, (400, 403, 404, 409))
        self.assertFalse(FactorComparison.objects.exists())
        self.assertFalse(FactorMerge.objects.exists())
        Anthology.objects.filter(pk=self.collection.pk).update(user_id=f'user_{self.user.pk}')
        # The aborted publication also releases bounded calculation capacity.
        values['request_key'] = 'comparison_transfer_retry'
        self.compare(values)

    def test_owner_change_after_publication_cannot_project_the_comparison_response(self):
        from quant.comparisons.services import compare as compute_comparison, comparison_data
        left = self.publish('comparison_response_owner_l')
        right = self.publish('comparison_response_owner_r', parameter_name='Length')
        values = self.pair(left, right, self.dataset(), 'comparison_response_owner_fact')
        successor = get_user_model().objects.create_user('comparison-response-owner')
        def transfer_after_publication(collection, inputs):
            record = compute_comparison(collection, inputs)
            Anthology.objects.filter(pk=collection.pk).update(user_id=f'user_{successor.pk}')
            return record
        with patch('quant.comparisons.views.compare', side_effect=transfer_after_publication), \
                patch('quant.comparisons.views.comparison_data', wraps=comparison_data) as project:
            response = self.client.post(f'/api/quant/{self.collection.pk}/comparisons/', values, format='json')
            self.assertEqual(response.status_code, 404, response.data)
            project.assert_not_called()
        # The completed fact remains in the new owner's collection; the stale
        # original caller receives none of its candidate or dataset evidence.
        self.assertEqual(FactorComparison.objects.count(), 1)
        self.assertIsNone(response.data['data'])

    def test_old_backup_after_publication_returns_not_found_instead_of_stale_detail(self):
        from quant.comparisons.services import compare as compute_comparison, comparison_data
        from quant.models import MarketDataset
        left = self.publish('comparison_response_restore_l')
        right = self.publish('comparison_response_restore_r', parameter_name='Length')
        dataset = self.dataset()
        values = self.pair(left, right, dataset, 'comparison_response_restore_fact')
        def restore_older_state(collection, inputs):
            record = compute_comparison(collection, inputs)
            FactorComparison.objects.filter(pk=record.pk).delete()
            MarketDataset.objects.filter(pk=dataset.pk).delete()
            return record
        with patch('quant.comparisons.views.compare', side_effect=restore_older_state), \
                patch('quant.comparisons.views.comparison_data', wraps=comparison_data) as project:
            response = self.client.post(f'/api/quant/{self.collection.pk}/comparisons/', values, format='json')
            self.assertEqual(response.status_code, 404, response.data)
            project.assert_not_called()
        self.assertFalse(FactorComparison.objects.exists())
        self.assertFalse(MarketDataset.objects.filter(pk=dataset.pk).exists())
        self.assertIsNone(response.data['data'])

    def test_merge_preserves_both_sources_aliases_and_historical_experiment_parents(self):
        left = self.publish('comparison_history_left1', '左侧动量')
        right = self.publish('comparison_history_right', '右侧动量', input_name='Price', parameter_name='Length')
        for factor, alias in [(left, '左侧别名'), (right, '右侧别名')]:
            saved = self.client.patch(f'/api/quant/{self.collection.pk}/factors/{factor.pk}/', {
                'expected_revision_id': '', 'expected_curation_revision_id': '', 'data': {'name': factor.data['name'], 'family': 'momentum',
                    'tags': ['动量'], 'aliases': [alias], 'note': '保留来源'}}, format='json')
            self.assertEqual(saved.status_code, 200, saved.data)
        data = self.dataset()
        plan = {'request_key': 'comparison_prior_experiment', 'name': '合并前实验', 'dataset_id': data.pk,
            'seeds': [{**self.side(candidate), 'variants': []} for candidate in (left, right)],
            'config': {**search_fixtures.SearchTests.config, 'generations': 1, 'max_candidates': 2}}
        saved = self.client.post(f'/api/quant/{self.collection.pk}/experiments/', plan, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        request = ExperimentRequest.objects.get(pk=saved.data['data']['id'])
        compute(request.job.pk)
        original_plan, original_result = copy.deepcopy(request.plan), copy.deepcopy(request.result.data)
        originals = {candidate.pk: (copy.deepcopy(candidate.data), candidate.content_hash, candidate.report.source_id)
                     for candidate in (left, right)}
        record = self.compare(self.pair(left, right, data, 'comparison_history_evidence'))
        merged, _ = self.merge(record, 'comparison_history_group')
        group = self.client.get(f'/api/quant/{self.collection.pk}/factor-merges/', {'factorId': right.pk}).json()['data']['group']
        self.assertEqual(set(group['memberIds']), {left.pk, right.pk})
        self.assertTrue({'左侧别名', '右侧别名'} <= set(group['aliases']))
        self.withdraw(merged, 'comparison_history_undo')
        for factor_id, (data_before, hash_before, source_id) in originals.items():
            candidate = FactorCandidate.objects.get(pk=factor_id)
            self.assertEqual(candidate.data, data_before)
            self.assertEqual(candidate.content_hash, hash_before)
            self.assertEqual(candidate.report.source_id, source_id)
        request.refresh_from_db()
        self.assertEqual(request.plan, original_plan)
        self.assertEqual(request.result.data, original_result)
        self.assertEqual([seed['id'] for seed in request.plan['seeds']], [left.pk, right.pk])
        self.assertEqual(FactorComparison.objects.count(), 1)
        self.assertEqual(FactorMerge.objects.count(), 1)

    def test_connected_logical_groups_split_when_bridge_is_withdrawn_without_transitive_proof(self):
        a = self.publish('comparison_component_a', 'A')
        b = self.publish('comparison_component_b', 'B', input_name='Price', parameter_name='Length')
        c = self.publish('comparison_component_c', 'C', input_name='Settle', parameter_name='Window')
        data = self.dataset()
        ab = self.compare(self.pair(a, b, data, 'comparison_component_ab'))
        bc = self.compare(self.pair(b, c, data, 'comparison_component_bc'))
        merge_ab, _ = self.merge(ab, 'comparison_component_merge_ab')
        merge_bc, _ = self.merge(bc, 'comparison_component_merge_bc')
        listed = self.listing()
        self.assertEqual(listed['total'], 1)
        self.assertEqual(listed['occurrenceTotal'], 3)
        occurrences = self.client.get(f'/api/quant/{self.collection.pk}/factors/{a.pk}/occurrences/', {'groupBy': 'merged'}).json()['data']
        self.assertEqual({row['id'] for row in occurrences['items']}, {a.pk, b.pk, c.pk})
        graph = self.client.get(f'/api/quant/{self.collection.pk}/graph/', {'candidateId': b.pk}).json()['data']
        self.assertEqual({edge['comparisonId'] for edge in graph['edges'] if edge['kind'] == 'sample_equivalent'}, {ab.pk, bc.pk})
        self.assertEqual({edge['mergeId'] for edge in graph['edges'] if edge['kind'] == 'merged_group'}, {merge_ab.pk, merge_bc.pk})
        self.assertFalse(any({edge['from'], edge['to']} == {f'factor:{a.pk}', f'factor:{c.pk}'}
            and edge['kind'] == 'sample_equivalent' for edge in graph['edges']))
        self.withdraw(merge_bc, 'comparison_component_undo_bridge')
        self.assertEqual(self.listing()['total'], 2)
        members = self.client.get(f'/api/quant/{self.collection.pk}/factors/{a.pk}/occurrences/', {'groupBy': 'merged'}).json()['data']
        self.assertEqual({row['id'] for row in members['items']}, {a.pk, b.pk})
        singleton = self.client.get(f'/api/quant/{self.collection.pk}/factors/{c.pk}/occurrences/', {'groupBy': 'merged'}).json()['data']
        self.assertEqual([row['id'] for row in singleton['items']], [c.pk])
        graph = self.client.get(f'/api/quant/{self.collection.pk}/graph/', {'candidateId': b.pk}).json()['data']
        self.assertEqual({edge['mergeId'] for edge in graph['edges'] if edge['kind'] == 'merged_group'}, {merge_ab.pk})
        self.assertIn(bc.pk, {edge['comparisonId'] for edge in graph['edges'] if edge['kind'] == 'sample_equivalent'})
        self.assertEqual(FactorComparison.objects.count(), 2)

    def test_structural_or_semantic_similarity_never_automatically_compares_or_merges(self):
        left = self.publish('comparison_semantic_left1')
        self.publish('comparison_semantic_right')
        self.assertEqual(self.listing('expression')['total'], 1)
        self.publish('comparison_semantic_other', '语义相关候选', input_name='Price', parameter_name='Length')
        graph_fixtures.GraphTests.configure(self)
        from quant.graph.indexing import queue_index
        graph_fixtures.GraphTests.run_job(self, queue_index(self.collection))
        self.assertTrue(FactorRelation.objects.exists())
        graph = self.client.get(f'/api/quant/{self.collection.pk}/graph/', {'candidateId': left.pk}).json()['data']
        self.assertTrue(any(edge['kind'] == 'attribute_similar' for edge in graph['edges']))
        self.assertFalse(any(edge['kind'] == 'semantic_similar' for edge in graph['edges']))
        self.assertFalse(any(edge['kind'] in ('sample_equivalent', 'merged_group') for edge in graph['edges']))
        self.assertEqual(self.listing()['total'], 3)
        self.assertFalse(FactorComparison.objects.exists())
        self.assertFalse(FactorMerge.objects.exists())

    def test_restore_recomputes_evidence_without_models_or_execution_authority(self):
        left = self.publish('comparison_sync_left01')
        right = self.publish('comparison_sync_right1', input_name='Price', parameter_name='Length')
        values = self.pair(left, right, self.dataset(), 'comparison_sync_fact')
        record = self.compare(values)
        merged, merge_values = self.merge(record, 'comparison_sync_merge')
        self.withdraw(merged, 'comparison_sync_withdraw')
        snapshot = SyncManager().build_snapshot_data()
        with patch('quant.comparisons.kernel.calculate', wraps=calculate) as calculator, \
                patch('quant.worker.complete') as provider, patch('quant.worker.dispatch') as dispatch:
            validate(snapshot, metadata(snapshot))
            self.assertGreaterEqual(calculator.call_count, 2)
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
            provider.assert_not_called()
            dispatch.assert_not_called()
        with patch('quant.comparisons.services.evaluate_pair') as calculator:
            self.assertEqual(self.compare(values).pk, record.pk)
            replay = self.client.post(f'/api/quant/{self.collection.pk}/factor-merges/', merge_values, format='json')
            self.assertEqual(replay.status_code, 200, replay.data)
            self.assertFalse(replay.data['data']['active'])
            calculator.assert_not_called()
        self.assertEqual(FactorComparison.objects.get(pk=record.pk).result, record.result)
        self.assertEqual(self.listing()['total'], 2)
        self.assertFalse(Job.objects.exists())
        self.assertFalse(ExperimentJob.objects.exists())
        self.assertFalse(FactorIndexJob.objects.exists())

    def test_rehashed_unknown_comparison_cannot_forge_params_tolerance_outputs_or_ownership(self):
        left = self.publish('comparison_forgery_left1')
        right = self.publish('comparison_forgery_right', input_name='Price', parameter_name='Length', offset=.00001)
        data = self.dataset()
        record = self.compare(self.pair(left, right, data, 'comparison_forgery_original'), 'fail')
        foreign = Anthology.objects.create(type='quant', permission='private', user_id=f'user_{self.user.pk}', title='外部数据')
        foreign_data = self.dataset(foreign)
        original = SyncManager().build_snapshot_data()
        row = next(copy.deepcopy(row) for row in original if row['model'] == 'quant.factorcomparison' and row['pk'] == record.pk)
        key = 'comparison_forgery_unknown'
        row['pk'] = digest(['factor-comparison-v1', str(self.collection.pk), key])[:40]
        row['fields']['request_key'] = key
        # The added unknown id itself is a valid new record; failures below
        # must come from authoritative recomputation/references, not local-id checks.
        validate(original + [copy.deepcopy(row)], metadata(original + [row]))
        for mutation in ('parameter', 'tolerance', 'output', 'source', 'dataset'):
            changed = copy.deepcopy(row)
            fields = changed['fields']
            if mutation == 'parameter': fields['plan']['right']['parameters']['Length'] = 8
            elif mutation == 'tolerance': fields['plan']['policy']['absolute_tolerance'] = .001
            elif mutation == 'output': fields['result']['output_hashes']['left'] = '0' * 64
            elif mutation == 'source': fields['plan']['left']['source_id'] = right.report.source_id
            else:
                fields['dataset'] = foreign_data.pk
                fields['plan'].update(dataset_id=foreign_data.pk, dataset_hash=foreign_data.content_hash)
            fields['content_hash'] = comparison_hash(fields['plan'], fields['result'])
            snapshot = copy.deepcopy(original) + [changed]
            with self.subTest(mutation=mutation), self.assertRaises(SyncError):
                validate(snapshot, metadata(snapshot))

    def test_withdrawal_manifest_integrity_and_legal_historical_restore(self):
        left = self.publish('comparison_backup_left1')
        right = self.publish('comparison_backup_right', parameter_name='Length')
        record = self.compare(self.pair(left, right, self.dataset(), 'comparison_backup_fact'))
        merged, _ = self.merge(record, 'comparison_backup_merge')
        historical = SyncManager().build_snapshot_data()
        self.withdraw(merged, 'comparison_backup_withdraw')
        snapshot = SyncManager().build_snapshot_data()
        missing = [row for row in snapshot if row['model'] != 'quant.factormergewithdrawal']
        with self.assertRaises(SyncError): validate(missing, metadata(snapshot))
        forged = copy.deepcopy(snapshot)
        row = next(row for row in forged if row['model'] == 'quant.factormergewithdrawal')
        row['fields']['reason'] = '重写既有撤销'
        row['fields']['content_hash'] = withdrawal_hash(str(self.collection.pk), merged.pk,
            merged.content_hash, row['fields']['reason'])
        with self.assertRaises(SyncError): validate(forged, metadata(forged))
        # A complete legitimate older backup intentionally restores its older
        # business state; it still cannot restore execution authority.
        with patch('quant.worker.complete') as provider:
            SyncManager().apply_snapshot_data(historical, remote_meta=metadata(historical))
            provider.assert_not_called()
        self.assertFalse(FactorMergeWithdrawal.objects.exists())
        self.assertEqual(self.listing()['total'], 1)
        self.assertTrue(FactorMerge.objects.filter(pk=merged.pk, withdrawal__isnull=True).exists())
        self.assertFalse(Job.objects.exists())
        self.assertFalse(ExperimentJob.objects.exists())
