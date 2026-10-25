"""Fixed numerical oracles, holdout exclusion and immutable diagnostic admission."""
import copy
import json
from unittest.mock import patch
from django.test import SimpleTestCase,TestCase
from quant.search_diagnostics.core import summarize_matrix,analyze_blocks
from quant.search_diagnostics.calculation import compute
from quant import test_experiment_search as search_fixtures
from quant.experiments.search import run_batch
from quant.research.contracts import digest


class SelectionArithmeticTests(SimpleTestCase):
    def test_consistent_family_retains_winner_in_every_symmetric_split(self):
        value=summarize_matrix({'better':[.02]*80,'worse':[.01]*80})
        self.assertEqual(value['combinations'],70);self.assertEqual(value['retained_count'],70)
        self.assertEqual(value['ambiguity_lower'],0);self.assertEqual(value['ambiguity_upper'],0)
        self.assertEqual(value['reversal_fraction_resolved'],0)

    def test_opposing_regimes_reveal_reversal_and_keep_ties_in_bounds(self):
        value=analyze_blocks({'a':[.02]*4+[-.01]*4,'b':[-.01]*4+[.02]*4})
        self.assertEqual(value['reversal_count'],34);self.assertEqual(value['ambiguous_count'],36)
        self.assertEqual(value['retained_count'],0);self.assertEqual(value['reversal_fraction_resolved'],1)
        self.assertAlmostEqual(value['ambiguity_lower'],34/70);self.assertEqual(value['ambiguity_upper'],1)

    def test_identical_returns_are_insufficient_not_zero_risk(self):
        value=summarize_matrix({'a':[0.]*80,'b':[0.]*80})
        self.assertEqual(value['status'],'insufficient');self.assertIsNone(value['reversal_fraction_resolved'])
        self.assertEqual((value['ambiguity_lower'],value['ambiguity_upper']),(0,1))

    def test_remainder_is_fixed_and_bad_or_insufficient_data_is_not_filled(self):
        value=summarize_matrix({'a':[.99]*3+[.02]*80,'b':[-.99]*3+[.01]*80})
        self.assertEqual(value['dropped_oldest_intervals'],3);self.assertEqual(value['retained_count'],70)
        for matrix in ({'a':[0.]*20,'b':[0.]*20},{'a':[True]*80,'b':[0.]*80},
                {'a':[float('nan')]*80,'b':[0.]*80},{'a':[0.]*80,'b':[0.]*79}):
            with self.assertRaises(ValueError):summarize_matrix(matrix)

    def test_development_replay_excludes_final_holdout_and_preserves_all_attempts(self):
        snapshot=search_fixtures.data();parents=[search_fixtures.seed('a',5,variants=True)]
        config=search_fixtures.SearchTests.config;output=run_batch(snapshot,parents,config)
        plan={'config':config};before=copy.deepcopy(output)
        value=compute(plan,snapshot,output);family=value['families'][0]
        self.assertEqual(family['attempted'],len(output['attempts']));self.assertEqual(family['status_counts']['rejected'],1)
        self.assertIsNotNone(family['analysis'],family)
        changed=copy.deepcopy(snapshot)
        for row in changed['rows'][output['partitions']['validation'][1]+1:]:
            row.update(open=999999,close=888888,high=999999,low=777777)
        self.assertEqual(compute(plan,changed,output),value);self.assertEqual(output,before)
        stopped=compute(plan,snapshot,output,seconds=0)
        self.assertEqual(stopped['families'][0]['reason'],'budget_stopped')
        self.assertIsNone(stopped['families'][0]['analysis'])
        def cancel():raise InterruptedError('fixture cancellation')
        cancelled=compute(plan,snapshot,output,check=cancel)
        self.assertEqual(cancelled['families'][0]['reason'],'cancelled')
        self.assertIsNone(cancelled['families'][0]['analysis'])


class SelectionIntegrationTests(TestCase):
    from quant.test_experiment_jobs import ExperimentJobsTests as JobFixtures
    setUp=JobFixtures.setUp;collect=JobFixtures.collect;publish=JobFixtures.publish;prepare=JobFixtures.prepare;start=JobFixtures.start

    def test_worker_detail_restore_and_tamper_do_not_rerun_search_or_queue(self):
        from quant.experiments.worker import execute
        from quant.models import SelectionDiagnostic,ExperimentJob,Job
        from quant.sync import validate,metadata
        from utils.sync_manager import SyncManager,SyncError
        self.prepare();request=self.start();execute(request.job.pk)
        record=SelectionDiagnostic.objects.get(result=request.result)
        response=self.client.get(self.path+request.pk+'/').json()['data']
        self.assertEqual(json.loads(response['selectionDiagnostic']['dataJson']),record.data)
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        altered=copy.deepcopy(snapshot)
        fields=next(row['fields'] for row in altered if row['model']=='quant.selectiondiagnostic')
        fields['data']['families'][0]['analysis']['ambiguity_upper']=0
        fields['content_hash']=digest(fields['data'])
        with self.assertRaises(SyncError):validate(altered,metadata(altered))
        with patch('quant.experiments.search.run_batch',side_effect=AssertionError('restore must not search')):
            SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        self.assertEqual(SelectionDiagnostic.objects.get(pk=record.pk).data,record.data)
        self.assertFalse(ExperimentJob.objects.exists());self.assertFalse(Job.objects.exists())

    def test_new_ai_review_requires_diagnostic_interpretation_while_legacy_projection_is_unchanged(self):
        from rest_framework.exceptions import ValidationError
        from quant.experiments.worker import execute as calculate
        from quant.experiments.reviews import start_review
        from quant.experiments.review_evidence import for_result,for_run
        from quant.experiments.review_contract import validate_review
        from quant.test_experiment_reviews import response
        from quant.worker import execute as analyze
        self.prepare();request=self.start();calculate(request.job.pk)
        self.assertNotIn('selection_diagnostic',for_result(request.result)['evidence'])
        run=start_review(request.result,request_key='selection_review_contract_001')
        evidence=for_run(run);self.assertIn('selection_diagnostic',evidence['evidence'])
        self.assertNotIn('splits',evidence['evidence']['selection_diagnostic']['families'][0]['analysis'])
        with self.assertRaisesRegex(ValidationError,'搜索选择诊断'):validate_review(response(),evidence)
        value=response(evidence)
        with patch('quant.worker.complete',return_value=json.dumps(value)):analyze(run.pk)
        run.refresh_from_db();self.assertEqual(run.status,'completed',run.error)
        self.assertEqual(run.result['selection_review_version'],1)
        self.assertIn('搜索选择与过拟合风险',run.report.markdown)
