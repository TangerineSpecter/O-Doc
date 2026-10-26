"""Cross-source proposals freeze selection evidence and survive independent restore."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from quant import test_experiment_reviews as fixtures
from quant.test_factors import extracted
from quant.models import AIRun, FactorCandidate, ExperimentProposal, ExperimentRequest, Job, FactorRelation
from quant.experiments.worker import execute as calculate
from quant.experiments.review_evidence import for_run
from quant.experiments.reviews import start_review
from quant.experiments.campaigns.contracts import experiment_input
from quant.worker import execute, prompt
from quant.research.contracts import digest
from quant.sync import metadata, validate
from utils.sync_manager import SyncManager, SyncError


class LibraryResearchTests(TestCase):
    setUp = fixtures.ExperimentReviewTests.setUp
    collect = fixtures.ExperimentReviewTests.collect
    publish = fixtures.ExperimentReviewTests.publish
    prepare = fixtures.ExperimentReviewTests.prepare
    start = fixtures.ExperimentReviewTests.start

    def candidate(self, key, *, window='10', family='momentum', expression=True, role='factor', units='比率', unknown_input=False):
        self.payload['request_key'] = key
        entry = self.collect()
        value = extracted(); data = value['factors'][0]
        data.update(name='库内候选 ' + key, family=family, role=role, units=units)
        data['parameters'][0]['default_value'] = window
        if not expression: data['expression'] = None
        if unknown_input:
            data['inputs'][0]['name'] = 'price'
            def rename(node):
                if node['op'] == 'input': node['name'] = 'price'
                for child in node.get('args', []): rename(child)
            rename(data['expression'])
        from quant.repairs.contracts import plan as repair_plan
        targets = repair_plan(value['factors'])['selected']
        def answer(config, prompt, **kwargs):
            if '只完成“修订候选定义”' in prompt:
                return json.dumps({'items': [{'factor_index': i, 'status': 'unresolved', 'summary': '测试保留原始缺项', 'definition': None, 'evidence': [], 'remaining_unknowns': ['数据待补齐']} for i in targets]})
            answer=copy.deepcopy(value)
            context=json.loads(prompt.split('材料：',1)[1]) if '材料：' in prompt else {}
            memory=context.get('research_memory')
            if memory: answer.update(memory_note='测试：历史是后续假设线索。',memory_assessment=[{'action':'investigate','rationale':'测试保留历史反例，另用新数据验证。','evidence_refs':[f"memory:{r['kind']}:{r['id']}"]} for r in memory['items']])
            return json.dumps(answer)
        with patch('quant.worker.complete', side_effect=answer):
            execute(AIRun.objects.get(entry=entry).pk)
        return FactorCandidate.objects.get(report__entry=entry)

    def reviewed_result(self):
        request = self.start()
        with self.captureOnCommitCallbacks(execute=True): calculate(request.job.pk)
        return request, AIRun.objects.get(kind='experiment_review')

    def test_source_library_proposal_executes_combination_and_restores_without_retrieval(self):
        _, dataset = self.prepare()
        extra = self.candidate('cross_source_candidate_01')
        request, run = self.reviewed_result()
        self.assertEqual(run.review_version, 14)
        context = copy.deepcopy(run.planning_context)
        self.assertEqual([row['candidate_id'] for row in context['retrieved']], [extra.pk])
        evidence = for_run(run)
        self.assertEqual(evidence['evidence'][f'library:{extra.pk}']['status'], 'not_evaluated_in_this_result')
        self.assertIn('不是收益', prompt(run))
        response = fixtures.response(evidence)
        response.update(planning_note='检验不同来源窗口的组合是否在新数据改善稳定性', proposal={
            'name': '跨来源窗口组合', 'hypothesis': '两个窗口的平均信号减少反复', 'falsification': '组合不优于单独窗口',
            'data_requirement': '新时间段，保持成本与品种口径', 'evidence_refs': ['execution', f'library:{extra.pk}'],
            'seeds': [{'candidate_id': request.plan['seeds'][0]['id'], 'variants': []}, {'candidate_id': extra.pk, 'variants': []}]})
        # Adding new material after queueing cannot rewrite the model input.
        before = prompt(run)
        self.candidate('later_library_candidate_01', window='30')
        self.assertEqual(prompt(run), before)
        with patch('quant.worker.complete', return_value=json.dumps(response)): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        proposal = ExperimentProposal.objects.get(run=run)
        self.assertEqual(proposal.data['library_retrieval']['candidates'][0]['candidate_id'], extra.pk)
        self.assertEqual(proposal.data['seeds'][1]['parameters'], {'N': 10})
        self.input = experiment_input(proposal, dataset.pk, 'cross_source_execute_01')
        followup = self.start(); calculate(followup.job.pk)
        self.assertEqual(followup.result.data['status'], 'completed')
        self.assertTrue(any(row.attempt['operation'] == 'mean' for row in followup.checkpoints.all()))
        detail = self.client.get(self.path + request.pk + '/').json()['data']
        self.assertEqual(detail['reviews'][0]['run']['libraryRetrieval']['candidates'][0]['candidateId'], extra.pk)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        restored = AIRun.objects.get(pk=run.pk)
        self.assertEqual(restored.planning_context, context)
        self.assertEqual(prompt(restored), before)
        self.assertFalse(Job.objects.exists())
        with patch('quant.experiments.library_retrieval.retrieve', side_effect=AssertionError('must not retrieve on replay')):
            self.assertEqual(start_review(request.result, request_key=run.request_key).pk, run.pk)
        self.assertFalse(Job.objects.exists())

    def test_ineligible_duplicates_foreign_and_deleted_materials_are_excluded(self):
        self.prepare()
        good = self.candidate('eligible_library_0001')
        self.candidate('duplicate_library_001')
        self.candidate('unknown_default_0001', window='')
        self.candidate('no_expression_00001', expression=False)
        self.candidate('display_library_001', role='display')
        self.candidate('different_units_001', units='价格')
        self.candidate('unknown_binding_001', unknown_input=True)
        deleted = self.candidate('deleted_library_001', window='40')
        deleted.report.entry.is_valid = False; deleted.report.entry.save()
        foreign = self.candidate('foreign_library_001', window='50')
        from anthology.models import Anthology
        collection = Anthology.objects.create(type='quant', permission='private', user_id='foreign', title='其他库')
        foreign.report.entry.anthology = collection; foreign.report.entry.save()
        _, run = self.reviewed_result()
        ids = [row['candidate_id'] for row in run.planning_context['retrieved']]
        self.assertEqual(len(ids), 1)
        self.assertEqual(run.planning_context['eligible'], 1)
        self.assertIn(FactorCandidate.objects.get(pk=ids[0]).data['parameters'][0]['default_value'], ['10'])
        self.assertNotIn(deleted.pk, ids); self.assertNotIn(foreign.pk, ids)

    def test_semantic_evidence_and_diverse_mechanism_are_frozen_and_validated(self):
        original, _ = self.prepare()
        extras = [self.candidate(f'related_library_{i:04}', window=str(i + 7)) for i in range(4)]
        diverse = self.candidate('diverse_library_0001', window='30', family='volatility')
        from quant.graph.projection import projection
        left, right = sorted([original, extras[-1]], key=lambda item: item.pk)
        evidence = {'method': 'embedding-cosine-v1', 'projection_version': 1, 'model_signature': 'a' * 64,
            'model_name': 'test', 'similarity': .92, 'threshold': .7, 'left_projection_hash': projection(left)[1],
            'right_projection_hash': projection(right)[1], 'left_revision_id': '', 'right_revision_id': '',
            'claim': 'semantic_similarity_only', 'comparison_limit': 2000}
        edge = FactorRelation.objects.create(id=digest(['semantic-relation-v1', left.pk, right.pk, digest(evidence)])[:40],
            left=left, right=right, evidence=evidence, content_hash=digest(evidence))
        _, run = self.reviewed_result()
        selected = run.planning_context['retrieved']
        self.assertEqual(len(selected), 4)
        self.assertEqual(selected[0]['candidate_id'], extras[-1].pk)
        self.assertEqual(selected[0]['reason']['semantic']['relation_id'], edge.pk)
        self.assertEqual(selected[-1]['candidate_id'], diverse.pk)
        self.assertEqual(selected[-1]['selection'], 'diversity')
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        for change in ('missing', 'score', 'parameters', 'foreign'):
            altered = copy.deepcopy(snapshot)
            row = next(item['fields'] for item in altered if item['model'] == 'quant.airun' and item['pk'] == run.pk)
            if change == 'missing': row.pop('planning_context')
            elif change == 'score': row['planning_context']['retrieved'][0]['reason']['rank_score'] = 99
            elif change == 'parameters': row['planning_context']['options'][-1]['parameters']['N'] = 999
            else: row['planning_context']['retrieved'][0]['entry_id'] = 'foreign'
            with self.assertRaises(SyncError): validate(altered, metadata(altered))

    def test_legacy_v2_replay_does_not_gain_new_library_inputs(self):
        self.prepare(); request, run = self.reviewed_result()
        from quant.services import _run_input, canonical_hash
        values = _run_input(run.entry, {'kind': 'experiment_review', 'source_id': run.source_id,
            'experiment_result_id': request.result.pk, 'request_key': run.request_key})
        values.pop('planning_context'); values['review_version'] = 2
        AIRun.objects.filter(pk=run.pk).update(review_version=2, planning_context={}, input_hash=canonical_hash(values))
        run.refresh_from_db()
        before = prompt(run)
        self.candidate('legacy_other_source_01')
        self.assertEqual(start_review(request.result, request_key=run.request_key).pk, run.pk)
        self.assertEqual(prompt(run), before)
        with patch('quant.worker.complete', return_value=json.dumps(fixtures.response())): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        snapshot = SyncManager().build_snapshot_data()
        for row in snapshot:
            if row['model'] == 'quant.airun': row['fields'].pop('planning_context', None)
        validate(snapshot, metadata(snapshot))
