"""Collection-wide historical evidence through real isolated API, workers and sync.

Only the provider response is faked. Calculations use synthetic OHLCV and the
test settings' temporary media/database; no restored record gains execution.
"""
import copy
import json
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from anthology.models import Anthology
from quant import test_experiment_jobs as experiment_fixtures
from quant import test_experiment_reviews as review_fixtures
from quant import test_feedback as feedback_fixtures
from quant.experiments.review_evidence import for_run as experiment_evidence
from quant.experiments.review_evidence import for_result
from quant.experiments.review_contract import validate_review
from quant.experiments.worker import execute as calculate
from quant.feedback.evidence import for_run as feedback_evidence
from quant.feedback.contracts import validate_analysis
from quant.models import AIRun, ExperimentJob, ExperimentResult, Job, ResearchReport, SourceRevision
from quant.research.contracts import digest
from quant.sync import metadata, validate
from quant.worker import execute, prompt
from utils.sync_manager import SyncError, SyncManager


class ResearchMemoryIntegrationTests(TestCase):
    setUp = experiment_fixtures.ExperimentJobsTests.setUp
    collect = experiment_fixtures.ExperimentJobsTests.collect
    publish = experiment_fixtures.ExperimentJobsTests.publish
    prepare = experiment_fixtures.ExperimentJobsTests.prepare
    start = experiment_fixtures.ExperimentJobsTests.start

    @staticmethod
    def memory(run):
        return run.planning_context.get('research_memory', run.planning_context.get('library_memory'))

    def with_assessment(self, value, run):
        value=review_fixtures.acknowledge_selection(value,run)
        memory = self.memory(run)
        if memory is not None:
            value['memory_note'] = '跨来源记录只形成待验证研究依据，负面证据也须保留'
            value['memory_assessment'] = [{
                'action': 'reject' if item['kind'] == 'experiment' else 'investigate',
                'rationale': '历史尝试含失败或尚未核对的反馈，拒绝直接沿用其参数为推荐结论',
                'evidence_refs': [f"memory:{item['kind']}:{item['id']}"],
            } for item in memory['items']]
        return value

    def calculate_candidate(self, candidate, dataset, key):
        """The rejected N=0 trial must remain visible beside successful trials."""
        self.input = {
            **copy.deepcopy(self.base_input), 'request_key': key, 'dataset_id': dataset.pk,
            'seeds': [{
                'candidate_id': candidate.pk, 'bindings': [{'name': 'close', 'column': 'close'}],
                'parameters': [{'name': 'N', 'value': 5}],
                'variants': [[{'name': 'N', 'value': n}] for n in (3, 8, 0)],
            }],
        }
        request = self.start()
        with self.captureOnCommitCallbacks(execute=True):
            calculate(request.job.pk)
        self.assertEqual(request.result.data['status'], 'completed')
        self.assertTrue(AIRun.objects.filter(experiment_result=request.result).exists(),
                        'The completed calculation must automatically queue a review')
        return request, AIRun.objects.get(experiment_result=request.result)

    def finish_experiment(self, run, evidence_ref=None):
        value = self.with_assessment(review_fixtures.response(), run)
        if evidence_ref:
            value['findings'][0] = {
                'text': '另一来源的历史计算含失败尝试，不能把相关性当作独立验证',
                'evidence_refs': [evidence_ref],
            }
        with patch('quant.worker.complete', return_value=json.dumps(value)) as provider:
            execute(run.pk)
        provider.assert_called_once()
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        return ResearchReport.objects.get(run=run)

    def feedback(self, candidate, key, *, finish=False):
        path = f'/api/quant/{self.collection.pk}/entries/{candidate.report.entry_id}/feedback/'
        values = {
            'request_key': key, 'title': '历史负面用户反馈',
            'target_source_id': candidate.report.source_id,
            'mode': 'backtest', 'document': 'N=10\nnet=-2%',
        }
        saved = self.client.post(path, values, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        run = AIRun.objects.get(kind='feedback_review', source_id=saved.data['data']['source']['id'])
        if finish:
            value = self.with_assessment(feedback_fixtures.response(), run)
            with patch('quant.worker.complete', return_value=json.dumps(value)):
                execute(run.pk)
            run.refresh_from_db()
            self.assertEqual(run.status, 'completed', run.error)
        return run, path, values

    def history(self):
        current, dataset = self.prepare()
        self.base_input = copy.deepcopy(self.input)
        previous = self.publish('research_memory_prior_source', '历史动量')
        self.assertNotEqual(current.report.source_id, previous.report.source_id)
        old_request, old_run = self.calculate_candidate(previous, dataset, 'research_memory_old_experiment')
        self.finish_experiment(old_run)
        old_feedback, _, _ = self.feedback(previous, 'research_memory_old_feedback', finish=True)
        return current, dataset, old_request, old_feedback

    def test_new_review_uses_cross_source_experiment_and_feedback_with_all_trials(self):
        current, dataset, previous, feedback = self.history()
        request, run = self.calculate_candidate(current, dataset, 'research_memory_current_experiment')
        self.assertEqual(run.review_version, 14)
        self.assertEqual(run.planning_context['version'], 6)
        selected = {(item['kind'], item['id']): item for item in self.memory(run)['items']}
        self.assertIn(('experiment', previous.result.pk), selected)
        self.assertIn(('feedback', feedback.source_id), selected)
        self.assertNotIn(('experiment', request.result.pk), selected)
        old_facts = selected[('experiment', previous.result.pk)]
        self.assertTrue(old_facts['has_negative_evidence'])
        self.assertEqual(len(old_facts['evidence']['attempts']), previous.checkpoints.count())
        self.assertTrue(any(item['status'] == 'rejected' for item in old_facts['evidence']['attempts']))
        self.assertNotIn('holdout', old_facts['evidence'])
        self.assertNotIn('rows', old_facts['evidence']['dataset'])
        feedback_facts = selected[('feedback', feedback.source_id)]
        self.assertEqual(feedback_facts['evidence']['feedback']['document'], 'N=10\nnet=-2%')
        self.assertEqual(feedback_facts['evidence']['evidence_status'], 'external_report_unverified')
        context = experiment_evidence(run)
        experiment_ref = f'memory:experiment:{previous.result.pk}'
        feedback_ref = f'memory:feedback:{feedback.source_id}'
        self.assertIn(experiment_ref, context['evidence'])
        self.assertIn(feedback_ref, context['evidence'])
        self.assertIn('net=-2%', prompt(run))
        report = self.finish_experiment(run, experiment_ref)
        self.assertEqual(report.data['memory_assessment'][0]['action'], 'reject')
        self.assertEqual(report.data['findings'][0]['evidence_refs'], [experiment_ref])
        self.assertFalse(report.data['independent_holdout_proven'])
        self.assertIn('memory_assessment', run.result)
        detail = self.client.get(f'/api/quant/{self.collection.pk}/entries/{run.entry_id}/').json()['data']
        presented = next(row for row in detail['runs'] if row['id'] == run.pk)
        self.assertEqual(json.loads(presented['researchMemoryJson']), self.memory(run))
        self.assertEqual(presented['result']['review']['memoryAssessment'][0]['action'], 'reject')

    def test_feedback_receives_library_history_without_changing_quoted_current_values(self):
        current, _, previous, historical = self.history()
        run, path, values = self.feedback(current, 'research_memory_current_feedback')
        self.assertEqual(run.planning_context['version'], 5)
        self.assertEqual(run.planning_context['method'], 'feedback-research-5')
        # Same-source history stays distinct from collection-wide retrieval.
        self.assertEqual(run.planning_context['history_ids'], [])
        items = self.memory(run)['items']
        self.assertIn(('feedback', historical.source_id), {(item['kind'], item['id']) for item in items})
        self.assertIn(('experiment', previous.result.pk), {(item['kind'], item['id']) for item in items})
        self.assertNotIn(('feedback', run.source_id), {(item['kind'], item['id']) for item in items})
        context = feedback_evidence(run)
        value = self.with_assessment(feedback_fixtures.response(), run)
        with patch('quant.worker.complete', return_value=json.dumps(value)):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        report = ResearchReport.objects.get(run=run)
        self.assertEqual(report.data['reported_metrics'][0]['value'], '-2%')
        self.assertIn(f'memory:feedback:{historical.source_id}', {
            ref for item in report.data['memory_assessment'] for ref in item['evidence_refs']})
        self.assertEqual(report.data['evidence_hash'], digest(context))
        self.assertNotIn('total_score', report.data)
        detail = self.client.get(f'/api/quant/{self.collection.pk}/entries/{run.entry_id}/').json()['data']
        presented = next(row for row in detail['runs'] if row['id'] == run.pk)
        self.assertEqual(json.loads(presented['researchMemoryJson']), self.memory(run))
        replay = self.client.post(path, values, format='json')
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(AIRun.objects.filter(source_id=run.source_id).count(), 1)

    def test_freeze_remains_identical_after_new_experiment_and_feedback_and_restore(self):
        current, dataset, previous, _ = self.history()
        request, run = self.calculate_candidate(current, dataset, 'research_memory_frozen_review')
        before = prompt(run)
        original = copy.deepcopy(run.planning_context)
        self.finish_experiment(run, f'memory:experiment:{previous.result.pk}')
        future, future_run = self.calculate_candidate(current, dataset, 'research_memory_future_experiment')
        self.finish_experiment(future_run)
        self.feedback(current, 'research_memory_future_feedback', finish=True)
        frozen = AIRun.objects.get(pk=run.pk)
        self.assertEqual(frozen.planning_context, original)
        self.assertEqual(prompt(frozen), before)
        self.assertNotIn(('experiment', future.result.pk), {
            (item['kind'], item['id']) for item in self.memory(frozen)['items']})
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        with patch('quant.worker.complete') as provider, patch('quant.experiments.worker.run_batch') as calculator:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
            provider.assert_not_called()
            calculator.assert_not_called()
        self.assertFalse(Job.objects.exists())
        self.assertFalse(ExperimentJob.objects.exists())
        self.assertEqual(prompt(AIRun.objects.get(pk=run.pk)), before)
        # Reading and repeating a completed request never authorizes execution.
        self.input['request_key'] = request.request_key
        self.assertEqual(self.start().pk, request.pk)
        self.assertFalse(ExperimentJob.objects.exists())
        self.assertFalse(Job.objects.exists())

    def test_legacy_v5_projection_has_no_library_history_and_remains_valid(self):
        current, dataset, _, _ = self.history()
        request, run = self.calculate_candidate(current, dataset, 'research_memory_legacy_comparison')
        legacy = {key: copy.deepcopy(value) for key, value in run.planning_context.items() if key not in ('research_memory','fixed_validation','selection_diagnostic')}
        legacy['version'] = 1
        before = for_result(request.result, 5, legacy)
        self.assertNotIn('research_memory', before)
        self.assertFalse(any(key.startswith('memory:') for key in before['evidence']))
        normalized = validate_review(review_fixtures.response(), before)
        self.assertNotIn('memory_assessment', normalized)
        self.assertNotIn('memory_note', normalized)
        self.assertIn('parameter_joint_sensitivity', before['evidence'])
        self.assertEqual(before, for_result(request.result, 5, legacy))

    def test_pending_memory_review_restore_requires_new_explicit_execution_authority(self):
        current, dataset, _, _ = self.history()
        request, run = self.calculate_candidate(current, dataset, 'research_memory_pending_restore')
        job_id = request.job.pk
        self.assertEqual(run.status, 'pending')
        before = prompt(run)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        with patch('quant.worker.complete') as provider, patch('quant.experiments.worker.run_batch') as calculator:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
            execute(run.pk)
            calculate(job_id)
            provider.assert_not_called()
            calculator.assert_not_called()
        run.refresh_from_db()
        self.assertEqual(run.status, 'interrupted')
        self.assertEqual(prompt(run), before)
        self.assertFalse(Job.objects.exists())
        self.assertFalse(ExperimentJob.objects.exists())
        self.assertEqual(self.start().pk, request.pk)
        self.assertFalse(ExperimentJob.objects.exists())

    def test_history_reader_batches_same_source_queries_as_record_count_grows(self):
        from quant.experiments.library_contract import option
        from quant.research_memory import freeze
        candidate, dataset = self.prepare()
        self.base_input = copy.deepcopy(self.input)
        options = [option(candidate.pk, candidate.data)]
        attempts = {}
        for index in range(4):
            request, run = self.calculate_candidate(candidate, dataset, f'research_memory_query_experiment_{index}')
            attempts[request.result.pk] = request.checkpoints.count()
            self.finish_experiment(run)
            self.feedback(candidate, f'research_memory_query_feedback_{index}', finish=True)
            if index == 1:
                with CaptureQueriesContext(connection) as queries:
                    smaller = freeze(options, str(self.collection.pk))
                smaller_count = len(queries)
        with CaptureQueriesContext(connection) as queries:
            larger = freeze(options, str(self.collection.pk))
        self.assertEqual(smaller['scanned'], {'experiments': 2, 'feedback': 2})
        self.assertEqual(larger['scanned'], {'experiments': 4, 'feedback': 4})
        self.assertEqual(larger['eligible'], {'experiments': 4, 'feedback': 4})
        # Both runs fit in one 20-record ORM batch; doubling same-source
        # history must not add one query for every experiment and feedback.
        self.assertLessEqual(len(queries), smaller_count + 1,
                             f'History queries grew from {smaller_count} to {len(queries)}')
        self.assertLessEqual(len(queries), 10)
        for item in larger['items']:
            if item['kind'] == 'experiment':
                self.assertEqual(len(item['evidence']['attempts']), attempts[item['id']])

    def test_feedback_history_excludes_same_millisecond_and_restores_older_history(self):
        from quant.feedback.memory import project
        candidate, _ = self.prepare()
        current_time = (timezone.now() + timedelta(seconds=2)).replace(microsecond=123900)
        path = f'/api/quant/{self.collection.pk}/entries/{candidate.report.entry_id}/feedback/'
        document = {'title': '同毫秒边界反馈', 'target_source_id': candidate.report.source_id,
                    'mode': 'backtest', 'document': 'N=10\nnet=-2%', 'analyze': False}
        archived = []
        for key, created_at in [('research_memory_ms_older', current_time.replace(microsecond=122900)),
                                ('research_memory_ms_same', current_time.replace(microsecond=123100))]:
            with patch('django.utils.timezone.now', return_value=created_at):
                saved = self.client.post(path, {**document, 'request_key': key}, format='json')
            self.assertEqual(saved.status_code, 200, saved.data)
            archived.append(SourceRevision.objects.get(pk=saved.data['data']['source']['id']))
        older, same = archived
        with patch('django.utils.timezone.now', return_value=current_time):
            run, _, _ = self.feedback(candidate, 'research_memory_ms_current')
        self.assertEqual(run.planning_context['version'], 5)
        self.assertEqual(run.planning_context['history_ids'], [older.pk])
        self.assertNotIn(same.pk, {item['id'] for item in self.memory(run)['items']})
        context = feedback_evidence(run)
        self.assertEqual([item['id'] for item in context['research_memory']['history']], [older.pk])
        # The v1 projector retains its historical microsecond string ordering;
        # conservative millisecond exclusion belongs only to new selections.
        sources = {source.pk: {'entry_id': source.material.entry_id, 'payload': source.payload,
                              'content_hash': source.content_hash, 'created_at': source.created_at.isoformat()}
                   for source in (older, same, run.source)}
        legacy = {'version': 1, 'method': 'feedback-research-1', 'candidate_ids': [], 'history_ids': [same.pk]}
        self.assertEqual(project(legacy, run.source_id, sources[run.source_id], {}, sources)['history'][0]['id'], same.pk)
        # Valid ISO zero-fraction dates sort after a fractional date as text
        # ('Z' > '.'). New v2 projections compare canonical instants instead.
        replay_sources = copy.deepcopy(sources)
        replay_sources[run.source_id]['created_at'] = '2026-10-25T00:00:00.123Z'
        replay_sources[older.pk]['created_at'] = '2026-10-25T00:00:00Z'
        replay_selection = {'version': 2, 'method': 'feedback-research-2', 'candidate_ids': [],
                            'history_ids': [older.pk], 'library_memory': {'items': []}}
        replayed = project(replay_selection, run.source_id, replay_sources[run.source_id], {}, replay_sources)
        self.assertEqual([item['id'] for item in replayed['history']], [older.pk])
        self.assertEqual(replay_sources[older.pk]['created_at'], '2026-10-25T00:00:00Z')
        value = self.with_assessment(feedback_fixtures.response(), run)
        with patch('django.utils.timezone.now', return_value=current_time + timedelta(milliseconds=1)), \
                patch('quant.worker.complete', return_value=json.dumps(value)):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(run.status, 'completed', run.error)
        before = prompt(run)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        with patch('quant.worker.complete') as provider:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
            provider.assert_not_called()
        restored = AIRun.objects.get(pk=run.pk)
        self.assertEqual(restored.planning_context['history_ids'], [older.pk])
        self.assertEqual(prompt(restored), before)
        self.assertFalse(Job.objects.exists())

    def test_linked_feedback_same_millisecond_is_retrieved_before_and_after_restore(self):
        from quant.experiments.library_contract import option
        from quant.research_memory import freeze
        candidate, dataset = self.prepare()
        self.base_input = copy.deepcopy(self.input)
        result_time = (timezone.now() + timedelta(seconds=2)).replace(microsecond=123100)
        feedback_time = result_time.replace(microsecond=123900)
        cutoff = result_time.replace(microsecond=125000).isoformat()
        with patch('django.utils.timezone.now', return_value=result_time):
            request, run = self.calculate_candidate(candidate, dataset, 'research_memory_linked_ms_experiment')
            self.finish_experiment(run)
        path = f'/api/quant/{self.collection.pk}/entries/{candidate.report.entry_id}/feedback/'
        values = {'request_key': 'research_memory_linked_ms_feedback', 'title': '关联实验的同毫秒反馈',
                  'target_source_id': candidate.report.source_id, 'factor_id': candidate.pk,
                  'experiment_result_id': request.result.pk, 'mode': 'backtest',
                  'document': 'N=10\nnet=-2%', 'analyze': False}
        with patch('django.utils.timezone.now', return_value=feedback_time):
            saved = self.client.post(path, values, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        source = SourceRevision.objects.get(pk=saved.data['data']['source']['id'])
        self.assertLess(request.result.created_at, source.created_at)
        self.assertEqual(request.result.created_at.microsecond // 1000, source.created_at.microsecond // 1000)
        options = [option(candidate.pk, candidate.data)]
        first = freeze(options, str(self.collection.pk), before=cutoff)
        recalled = next(item for item in first['items'] if item['kind'] == 'feedback' and item['id'] == source.pk)
        self.assertEqual(recalled['evidence']['feedback']['experiment_result_id'], request.result.pk)
        self.assertEqual(recalled['evidence']['candidate_ids'], [candidate.pk])
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        with patch('quant.worker.complete') as provider:
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
            provider.assert_not_called()
        restored_result = ExperimentResult.objects.get(pk=request.result.pk)
        restored_source = SourceRevision.objects.get(pk=source.pk)
        self.assertEqual(restored_result.created_at, restored_source.created_at)
        second = freeze(options, str(self.collection.pk), before=cutoff)
        self.assertEqual(second, first)
        self.assertFalse(Job.objects.exists())
        self.assertFalse(ExperimentJob.objects.exists())
        # Equality within the persisted millisecond is allowed for linked
        # dependencies; a linked experiment in a later millisecond is not.
        ExperimentResult.objects.filter(pk=request.result.pk).update(
            created_at=feedback_time + timedelta(milliseconds=2))
        invalid = freeze(options, str(self.collection.pk), before=cutoff)
        self.assertNotIn(('feedback', source.pk), {(item['kind'], item['id']) for item in invalid['items']})

    def test_memory_assessments_cannot_omit_records_or_cite_invented_history(self):
        from rest_framework.exceptions import ValidationError
        current, dataset, previous, _ = self.history()
        _, run = self.calculate_candidate(current, dataset, 'research_memory_assessment_check')
        context = experiment_evidence(run)
        value = self.with_assessment(review_fixtures.response(), run)
        broken = copy.deepcopy(value)
        broken['memory_assessment'] = []
        with self.assertRaises(ValidationError):
            validate_review(broken, context)
        broken = copy.deepcopy(value)
        broken['memory_assessment'][0]['evidence_refs'] = ['memory:experiment:invented']
        with self.assertRaises(ValidationError):
            validate_review(broken, context)
        # Historical records can inform hypotheses; they cannot replace a
        # current evaluated attempt for a numeric performance score.
        broken = copy.deepcopy(value)
        score = next(item for item in broken['scores'] if item['dimension'] == '验证表现')
        score.update(score=4, evidence_refs=[f'memory:experiment:{previous.result.pk}'])
        with self.assertRaises(ValidationError):
            validate_review(broken, context)
        feedback, _, _ = self.feedback(current, 'research_memory_assessment_feedback')
        value = self.with_assessment(feedback_fixtures.response(), feedback)
        value['memory_assessment'][0]['evidence_refs'] = ['memory:feedback:invented']
        with self.assertRaises(ValidationError):
            validate_analysis(value, feedback_evidence(feedback))

    def test_snapshot_rejects_rehashed_memory_item_or_future_and_foreign_evidence(self):
        current, dataset, previous, _ = self.history()
        _, run = self.calculate_candidate(current, dataset, 'research_memory_restore_target')
        self.finish_experiment(run, f'memory:experiment:{previous.result.pk}')
        future, future_run = self.calculate_candidate(current, dataset, 'research_memory_restore_future')
        self.finish_experiment(future_run)
        # A second private collection has fully valid records, not a dangling
        # reference that the general snapshot validator would reject first.
        from quant.research_memory import freeze
        saved_context = (self.collection, self.url, self.path, self.input, self.base_input)
        self.collection = Anthology.objects.create(
            type='quant', permission='private', user_id=f'user_{self.user.pk}', title='另一本私密研究')
        self.url = f'/api/quant/{self.collection.pk}/intake/'
        foreign_candidate, foreign_dataset = self.prepare()
        self.base_input = copy.deepcopy(self.input)
        foreign, foreign_run = self.calculate_candidate(
            foreign_candidate, foreign_dataset, 'research_memory_foreign_experiment')
        self.finish_experiment(foreign_run)
        foreign_memory = freeze(run.planning_context['options'], self.collection.pk)
        foreign_item = next(item for item in foreign_memory['items'] if item['kind'] == 'experiment' and item['id'] == foreign.result.pk)
        self.collection, self.url, self.path, self.input, self.base_input = saved_context
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        altered = copy.deepcopy(snapshot)
        fields = next(item['fields'] for item in altered if item['model'] == 'quant.airun' and item['pk'] == run.pk)
        item = next(item for item in fields['planning_context']['research_memory']['items'] if item['kind'] == 'experiment')
        item['evidence']['attempts'][0]['reason'] = '被篡改成未经发生的历史结论'
        item['content_hash'] = digest(item['evidence'])
        with self.assertRaises(SyncError):
            validate(altered, metadata(altered))
        # A real future result, with genuine hashes and facts, remains outside
        # the older run's cutoff. Mutating only the frozen record is rejected.
        future_memory = freeze(run.planning_context['options'], str(self.collection.pk),
                               exclude_result_id=run.experiment_result_id)
        replacement = next(item for item in future_memory['items'] if item['kind'] == 'experiment' and item['id'] == future.result.pk)
        altered = copy.deepcopy(snapshot)
        fields = next(item['fields'] for item in altered if item['model'] == 'quant.airun' and item['pk'] == run.pk)
        memory = fields['planning_context']['research_memory']
        index = next(index for index, item in enumerate(memory['items']) if item['kind'] == 'experiment')
        memory['items'][index] = replacement
        with self.assertRaises(SyncError):
            validate(altered, metadata(altered))
        # A genuine foreign item cannot cross the collection boundary even
        # though every underlying source/result/hash is individually valid.
        altered = copy.deepcopy(snapshot)
        fields = next(item['fields'] for item in altered if item['model'] == 'quant.airun' and item['pk'] == run.pk)
        memory = fields['planning_context']['research_memory']
        index = next(index for index, item in enumerate(memory['items']) if item['kind'] == 'experiment')
        memory['items'][index] = foreign_item
        with self.assertRaises(SyncError):
            validate(altered, metadata(altered))
        self.client.force_authenticate(get_user_model().objects.create_user('memory-outsider'))
        endpoint = f'/api/quant/{self.collection.pk}/entries/{run.entry_id}/'
        self.assertIn(self.client.get(endpoint).status_code, (403, 404))
        self.assertIn(self.client.post(endpoint + 'runs/', {
            'kind': 'experiment_review', 'source_id': run.source_id,
            'experiment_result_id': run.experiment_result_id,
            'request_key': 'research_memory_outsider_review',
        }, format='json').status_code, (403, 404))
