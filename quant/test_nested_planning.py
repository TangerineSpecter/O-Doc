"""AI sees the real nested capability; designs do not grant execution authority."""
import copy
import json
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant.experiments.planning_capabilities import contract, validate, instruction
from quant.test_nested_validation import POLICY


class PlanningCapabilityTests(SimpleTestCase):
    def test_replay_refuses_disk_database_external_database_or_enabled_workers(self):
        from django.conf import settings
        from quant.acceptance.nested_planning_replay import replay
        database=settings.DATABASES['default']
        for change in ({'NAME':'/private/tmp/not-an-acceptance-database.sqlite3'},
                       {'ENGINE':'django.db.backends.postgresql','NAME':':memory:'}):
            with patch.dict(database,change),self.assertRaises(RuntimeError):replay('/not-read')
        with self.settings(QUANT_DISABLE_WORKERS=False),self.assertRaises(RuntimeError):replay('/not-read')

    def test_independent_sma_oracle_and_two_sided_cash_cost(self):
        from quant.acceptance.nested_planning_reference import signals,ledger
        from decimal import Decimal
        trial={'expression':{'op':'sub','args':[{'op':'div','args':[{'op':'input','name':'close'},{'op':'sma','args':[{'op':'input','name':'close'},{'op':'parameter','name':'N'}]}]},{'op':'constant','value':1}]},
            'parameters':{'N':2},'bindings':{'close':'close'}}
        rows=[{'timestamp':str(i),'open':v,'close':v} for i,v in enumerate([100,100,110,110,121])]
        result=signals(trial,rows)
        self.assertIsNone(result[0]);self.assertEqual(result[1],0)
        self.assertAlmostEqual(float(result[2]),float(Decimal(110)/Decimal(105)-1))
        actual=ledger(trial,rows,3,4)
        self.assertAlmostEqual(actual['total_return'],.999*1.1*.999-1)
        self.assertEqual((actual['entries'],actual['turnover'],actual['bars']),(1,2,1))

    def test_captured_real_plan_and_archived_market_replay_without_provider_or_source(self):
        from pathlib import Path
        from quant.acceptance.nested_planning_replay import replay
        with patch('utils.bounded_completion.complete',side_effect=AssertionError('no provider')), patch('quant.native_python.runtime.run',side_effect=AssertionError('no source')):
            value=replay(Path(__file__).resolve().parent.parent/'docs/quant/验收记录')
        self.assertEqual((value['captured_provider_calls'],value['new_provider_calls'],value['source_executions']),(1,0,0))
        self.assertEqual(value['checked_segments'],102)
        self.assertEqual(value['actual_parameters'],{'period':14})
        self.assertTrue(all(number<0 for number in value['outer_returns']))
        self.assertFalse(value['independent_validation'])

    def test_capability_is_bounded_versioned_and_cannot_be_mutated_or_rehashed(self):
        first = contract(); first['inner_folds'][1] = 99
        self.assertEqual(contract()['inner_folds'], [2,4])
        for field, value in [('maximum_attempts',33), ('maximum_seconds',61), ('version',True), ('selection','best_test_return'), ('scope','execution_authority')]:
            bad = contract(); bad[field] = value
            with self.assertRaises(ValidationError): validate(bad)
        self.assertIn('summary为null', instruction())
        self.assertIn('不增加config字段', instruction(inherited=True))


class SourceNestedPlanningTests(TestCase):
    from quant.test_initial_planning import InitialPlanningTests as setup
    setUp, collect, ready, dataset = setup.setUp, setup.collect, setup.ready, setup.dataset

    def test_source_plan_inputs_new_prompt_and_nested_proposal_survive_execution_restore(self):
        from quant.test_initial_planning import initial_response
        from quant.experiments.campaigns.contracts import experiment_input
        from quant.experiments.worker import execute
        from quant.models import ExperimentProposal, ExperimentRequest, ExperimentJob
        from quant.sync import metadata,validate as validate_snapshot
        from utils.sync_manager import SyncManager
        value = initial_response(); value['initial_proposal']['config'].update(max_candidates=16,walk_forward=copy.deepcopy(POLICY))
        value['initial_proposal']['data_requirement'] = '至少108根同口径日线，成本为假设，尚未提供新行情'
        entry, run = self.ready(value)
        self.assertEqual(run.workflow_version,25)
        step = run.workflow_steps.get(stage='plan')
        self.assertEqual(step.input['planning_capabilities'],contract())
        from quant.workflows.prompts import prompt
        from quant.taxonomy.services import resolve
        # Build using the exact stored prior outputs and frozen vocabulary.
        outputs = {row.stage:row.outcome.data['output'] for row in run.workflow_steps.select_related('outcome') if row.stage!='plan' and row.stage!='publish'}
        vocabulary = resolve(entry.anthology_id, outputs['normalize']['vocabulary_ref'])
        text = prompt('plan',run.source.payload,run.requirements,outputs,16,vocabulary=vocabulary)
        self.assertIn('planning_capabilities',text); self.assertIn('inner_folds',text)
        old_text = prompt('plan',run.source.payload,run.requirements,outputs,14,vocabulary=vocabulary)
        self.assertNotIn('planning_capabilities',old_text)
        self.assertNotIn('inner_folds',old_text)
        proposal = ExperimentProposal.objects.get(run=run)
        self.assertFalse(ExperimentJob.objects.exists())
        dataset = self.dataset()
        response = self.client.post(f'/api/quant/{self.collection.pk}/experiments/', experiment_input(proposal,dataset.pk,'nested_ai_compute_01'),format='json')
        self.assertEqual(response.status_code,200,response.data)
        request=ExperimentRequest.objects.get(pk=response.data['data']['id']);execute(request.job.pk)
        self.assertEqual(request.plan['engine_version'],'quant-local-search-7')
        self.assertFalse(request.plan['proposal_adapted'])
        self.assertEqual(request.result.data['output']['walk_forward']['summary']['tested_folds'],3)
        snapshot=SyncManager().build_snapshot_data();validate_snapshot(snapshot,metadata(snapshot))
        with patch('quant.worker.dispatch') as dispatch,patch('quant.experiments.worker.run_batch') as calculate:
            SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        dispatch.assert_not_called();calculate.assert_not_called();self.assertFalse(ExperimentJob.objects.exists())


class ReviewNestedPlanningTests(TestCase):
    from quant.test_nested_validation import NestedIntegrationTests as setup
    setUp,collect,publish,prepare,start=setup.setUp,setup.collect,setup.publish,setup.prepare,setup.start

    def test_new_review_freezes_capabilities_and_uses_all_inner_evidence(self):
        from quant.test_nested_validation import CONFIG
        from quant.experiments.worker import execute
        from quant.experiments.reviews import start_review
        from quant.experiments.review_evidence import for_run
        from quant.experiments.review_contract import review_prompt as prompt
        from quant.sync import validate as validate_snapshot,metadata
        from utils.sync_manager import SyncManager
        self.prepare();self.input['config']=copy.deepcopy(CONFIG)
        request=self.start();execute(request.job.pk)
        run=start_review(request.result,request_key='nested_ai_review_01',model_id=self.model.pk)
        self.assertEqual(run.review_version,15);self.assertEqual(run.planning_context['version'],6)
        self.assertEqual(run.planning_context['planning_capabilities'],contract())
        evidence=for_run(run)
        self.assertEqual(evidence['planning_capabilities'],contract())
        self.assertEqual(evidence['evidence']['attempt-1']['inner_evaluation']['planned_folds'],3)
        temporal=evidence['evidence']['temporal_parameter_stability']
        self.assertEqual(temporal['planned_windows'],9)
        self.assertNotIn('metrics',temporal['families'][0]['axes'][0]['windows'][0]['points'][0])
        self.assertIn('metrics',evidence['evidence']['attempt-1']['inner_evaluation']['folds'][0])
        self.assertIn('顶层metrics只属于最后已启动内层',prompt(evidence,''))
        snapshot=SyncManager().build_snapshot_data();validate_snapshot(snapshot,metadata(snapshot))
        bad=copy.deepcopy(snapshot)
        target=next(row['fields'] for row in bad if row['model']=='quant.airun' and row['pk']==run.pk)
        target['planning_context']['planning_capabilities']['maximum_attempts']=99
        with self.assertRaises(ValidationError): for_run(type('Run',(),dict(experiment_result=request.result,review_version=11,planning_context=target['planning_context'],validation_result=None))())


class FeedbackNestedPlanningTests(TestCase):
    from quant.test_feedback_planning import FeedbackPlanningTests as setup
    setUp,collect,publish,prepare,start,ready,finish=setup.setUp,setup.collect,setup.publish,setup.prepare,setup.start,setup.ready,setup.finish

    def test_feedback_proposes_nested_without_changing_actual_baseline_or_auto_execution(self):
        from quant.feedback.evidence import for_run
        from quant.feedback.contracts import prompt
        from quant.models import ExperimentJob
        from quant.sync import validate as validate_snapshot,metadata
        from utils.sync_manager import SyncManager
        _,_,run,value,_,_=self.ready()
        self.assertEqual(run.planning_context['version'],5)
        context=for_run(run);self.assertEqual(context['research_memory']['planning_capabilities'],contract())
        self.assertIn('inner_folds',prompt(context,''))
        value['feedback_proposal']['config'].update(max_candidates=16,walk_forward=copy.deepcopy(POLICY))
        proposal=self.finish(run,value)
        self.assertEqual(proposal.data['config']['walk_forward'],POLICY)
        self.assertFalse(ExperimentJob.objects.exists())
        snapshot=SyncManager().build_snapshot_data();validate_snapshot(snapshot,metadata(snapshot))

