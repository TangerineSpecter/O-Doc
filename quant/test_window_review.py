"""Every planned window is interpreted; verified facts never come from prose."""
import copy
import json
from pathlib import Path
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant.experiments.window_review import project, PREFIX
from quant.experiments.review_contract import validate_review, review_markdown
from quant.test_experiment_reviews import response


class WindowReviewTests(SimpleTestCase):
    def setUp(self):
        root = Path(__file__).resolve().parent.parent / 'docs/quant/验收记录'
        self.plan = json.loads((root/'2026-10-26-nested-planning-plan.json').read_text())['proposal']
        self.attempts = json.loads((root/'2026-10-26-nested-planning-experiment.json').read_text())['output']['attempts']
        self.snapshot = next(row['fields']['snapshot'] for row in json.loads(
            (root/'2026-10-25-real-plan-loop-research-snapshot.json').read_text()) if row['model']=='quant.marketdataset')
        from quant.experiments.temporal_sensitivity import analyze
        self.facts = {'execution': {}, 'temporal_parameter_stability': analyze(self.plan, self.attempts),
            **{row['id']: row for row in self.attempts}, **project(self.plan, self.snapshot, self.attempts)}
        self.evidence = {'version': 2, 'planning_options': [], 'evidence': self.facts}

    def test_all_nine_planned_windows_use_actual_baseline_and_original_inner_numbers(self):
        values = project(self.plan, self.snapshot, self.attempts)
        self.assertEqual(len(values), 9)
        first, last = values[PREFIX+'1:1'], values[PREFIX+'3:3']
        self.assertEqual(first['baselines'][0]['effective_parameters'], [{'name':'period','value':14}])
        self.assertEqual(first['ranges']['validation']['start'], '2024-01-29T08:00:00+00:00')
        self.assertEqual(last['ranges']['validation']['end'], '2024-01-31T10:00:00+00:00')
        self.assertEqual(first['complete_inner_attempts'], first['started_attempts'])
        self.assertEqual(first['partial_inner_attempts'], 0)
        self.assertNotIn('metrics', first)  # Numeric evidence remains in its immutable attempt.
        legacy = copy.deepcopy(self.plan); legacy['config']['walk_forward']['version']=1
        self.assertEqual(project(legacy, self.snapshot, self.attempts), {})

    def test_unstarted_outer_and_partial_failed_inner_are_retained_with_frozen_ranges(self):
        attempts = copy.deepcopy(self.attempts[:1])
        attempts[0]['status']='failed'
        attempts[0]['inner_evaluation']['folds']=attempts[0]['inner_evaluation']['folds'][:1]
        attempts[0]['inner_evaluation']['folds'][0]['metrics'].pop('validation')
        values = project(self.plan, self.snapshot, attempts)
        self.assertEqual((values[PREFIX+'1:1']['partial_inner_attempts'],values[PREFIX+'1:1']['failed_attempts']), (1,1))
        self.assertEqual(values[PREFIX+'1:2']['missing_inner_attempts'],1)
        missing=values[PREFIX+'3:3']
        self.assertEqual(missing['started_attempts'],0)
        self.assertEqual(missing['baselines'][0]['attempt_status'],'not_run')
        self.assertIsNone(missing['baselines'][0]['effective_parameters'])
        self.assertEqual(missing['baselines'][0]['planned_parameters'],[{'name':'period','value':14}])
        self.assertIsNotNone(missing['ranges']['validation'])

    def test_two_pass_normalization_copies_facts_and_markdown_covers_all_windows(self):
        raw = response(self.evidence)
        raw['temporal_parameter_review']['window_reviews'].reverse()
        result = validate_review(validate_review(raw), self.evidence)
        self.assertEqual(result['temporal_parameter_review_version'],2)
        self.assertEqual(result['rubric_version'],'experiment-research-v2')
        self.assertEqual(validate_review(result,self.evidence),result)
        windows = result['temporal_parameter_review']['window_reviews']
        self.assertEqual(windows[0]['facts'], self.facts[PREFIX+'1:1'])
        self.assertNotIn('facts',raw['temporal_parameter_review']['window_reviews'][0])
        markdown=review_markdown(result)
        self.assertEqual(markdown.count('### 外折'),9)
        self.assertIn('实际配方',markdown)
        self.assertIn('14',markdown)
        self.assertIn('失败/拒绝状态',markdown)

    def test_missing_duplicate_fabricated_cross_fold_and_rehashed_facts_rejected(self):
        for mode in ('omitted','missing','duplicate','foreign','cross_fold','other_window','facts','boolean_facts','nonfinite_facts','boolean','version'):
            with self.subTest(mode=mode):
                raw=response(self.evidence); row=raw['temporal_parameter_review']; windows=row['window_reviews']
                if mode=='omitted':row.pop('window_reviews')
                elif mode=='missing':windows.pop()
                elif mode=='duplicate':windows[-1]=copy.deepcopy(windows[0])
                elif mode=='foreign':windows[-1]['outer_fold']=5
                elif mode=='cross_fold':windows[0]['evidence_refs'].append('attempt-12')
                elif mode=='other_window':windows[0]['evidence_refs']=[PREFIX+'1:2']
                elif mode=='facts':windows[0]['facts']={**self.facts[PREFIX+'1:1'],'started_attempts':999}
                elif mode=='boolean_facts':
                    windows[0]['facts']=copy.deepcopy(self.facts[PREFIX+'1:1'])
                    windows[0]['facts']['baselines'][0]['complete_metrics']=1
                elif mode=='nonfinite_facts':windows[0]['facts']={'number':float('nan')}
                elif mode=='boolean':windows[0]['inner_fold']=True
                else:raw['temporal_parameter_review_version']=1
                with self.assertRaises(ValidationError):validate_review(raw,self.evidence)

    def test_legacy_v12_prompt_and_result_stay_unchanged_and_reject_new_fields(self):
        old=copy.deepcopy(self.evidence)
        old['evidence']={key:value for key,value in old['evidence'].items() if not key.startswith(PREFIX)}
        raw=response(old); result=validate_review(raw,old)
        self.assertEqual(result['temporal_parameter_review_version'],1)
        self.assertNotIn('window_reviews',result['temporal_parameter_review'])
        with self.assertRaises(ValidationError):validate_review(response(self.evidence),old)
        # Inspect only the new instruction: legacy prompt text is preserved verbatim.
        from quant.experiments.temporal_review import instruction
        self.assertNotIn('window_reviews',instruction(old['evidence']))
        self.assertIn('window_reviews',instruction(self.facts))


class WindowReviewIntegrationTests(TestCase):
    from quant.test_nested_validation import NestedIntegrationTests as setup
    setUp,collect,publish,prepare,start=setup.setUp,setup.collect,setup.publish,setup.prepare,setup.start

    def test_api_publish_sync_roundtrip_and_changed_bound_facts_rejected(self):
        from quant.test_nested_validation import CONFIG
        from quant.experiments.worker import execute as calculate
        from quant.experiments.reviews import start_review
        from quant.experiments.review_evidence import for_run
        from quant.worker import execute
        from quant.models import Job
        from quant.sync import metadata,validate
        from quant.research.contracts import digest
        from utils.sync_manager import SyncManager,SyncError
        self.prepare();self.input['config']=copy.deepcopy(CONFIG)
        request=self.start()
        with patch('quant.experiments.reviews.auto_review'):calculate(request.job.pk)
        run=start_review(request.result,request_key='all_windows_review_api_01',model_id=self.model.pk)
        evidence=for_run(run)
        with patch('quant.worker.complete',return_value=json.dumps(response(evidence))):execute(run.pk)
        run.refresh_from_db();self.assertEqual(run.status,'completed',run.error)
        self.assertEqual(run.result['temporal_parameter_review_version'],2)
        self.assertEqual(len(run.result['temporal_parameter_review']['window_reviews']),9)
        self.assertEqual(run.review_version,17)
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        original=copy.deepcopy(run.result)
        with patch('quant.worker.dispatch') as dispatch,patch('quant.experiments.worker.run_batch') as search:
            SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        dispatch.assert_not_called();search.assert_not_called();self.assertFalse(Job.objects.exists())
        run.refresh_from_db();self.assertEqual(run.result,original)
        bad=copy.deepcopy(snapshot)
        fields=next(row['fields'] for row in bad if row['model']=='quant.airun' and row['pk']==run.pk)
        fields['result']['temporal_parameter_review']['window_reviews'][0]['facts']['baselines'][0]['effective_parameters'][0]['value']=999
        report=next(row['fields'] for row in bad if row['model']=='quant.researchreport' and row['fields']['run']==run.pk)
        report['data']=copy.deepcopy(fields['result']);report['markdown']=review_markdown(fields['result'])
        report['content_hash']=digest({'schema_version':report['schema_version'],'data':report['data'],'markdown':report['markdown']})
        with self.assertRaises((ValidationError,SyncError)):validate(bad,metadata(bad))


class CapturedWindowTimeoutTests(TestCase):
    def test_actual_timeout_restore_has_nine_windows_no_report_unknown_usage_and_no_execution(self):
        from quant.acceptance.window_review_replay import replay
        root=Path(__file__).resolve().parent.parent/'docs/quant/验收记录'
        with patch('utils.bounded_completion.complete',side_effect=AssertionError('no provider')), \
                patch('quant.native_python.runtime.run',side_effect=AssertionError('no source')):
            result=replay(root)
        self.assertEqual(result['restored_planned_windows'],9)
        self.assertEqual(result['captured_status'],'failed')
        self.assertEqual(result['numeric_segments'],102)
        self.assertEqual((result['new_provider_calls'],result['new_source_executions'],result['new_report_count'],result['restored_jobs']),(0,0,0,0))
        self.assertIsNone(result['reported_total_tokens'])
        self.assertTrue(result['prior_immutable_records_unchanged'])
