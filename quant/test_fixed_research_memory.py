"""Fixed-outcome history changes future planning without retroactive evidence promotion."""
import copy
import json
from datetime import timedelta
from unittest.mock import patch
from pathlib import Path
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from quant import test_validation_studies as fixtures
from quant.research.contracts import digest
from quant.models import AIRun,ValidationResult,ExperimentProposal
from quant.research_memory import freeze,validate_from_rows
from quant.experiments.planning_context import for_result as options
from quant.sync import validate,metadata
from utils.sync_manager import SyncManager,SyncError


def decision(memory):
    return {'memory_note':'测试模型：依据历史负面记录安排新的反例对照。','memory_assessment':[
        {'action':'investigate','rationale':'核对历史固定方案、实际参数和成本，需另外的新数据。',
            'evidence_refs':[f"memory:{row['kind']}:{row['id']}"]} for row in memory['items']]}


class FixedMemoryTests(TestCase):
    setUp=fixtures.ValidationTests.setUp
    collect=fixtures.ValidationTests.collect
    publish=fixtures.ValidationTests.publish
    prepare=fixtures.ValidationTests.prepare
    start=fixtures.ValidationTests.start
    execute_source=fixtures.ValidationTests.execute_source
    register=fixtures.ValidationTests.register
    dataset=fixtures.ValidationTests.dataset
    action=fixtures.ValidationTests.action
    ready=fixtures.ValidationTests.ready

    def freeze(self,version=3):
        return freeze(options(self.source.result),str(self.collection.pk),version=version,
            before=(timezone.now()+timedelta(seconds=1)).isoformat())

    def test_fixed_outcomes_actual_parameters_and_baseline_are_preserved_not_current_independence(self):
        request=self.ready();memory=self.freeze()
        item=next(r for r in memory['items'] if r['kind']=='fixed_validation')
        self.assertEqual(item['evidence']['recipe'],self.plan.data['recipe'])
        self.assertEqual(item['evidence']['final']['total_return'],request.result.data['output']['final']['total_return'])
        self.assertTrue(item['evidence']['historical_evaluation_exposed']);self.assertFalse(item['evidence']['independent_validation'])
        self.assertNotIn('curve',item['evidence']['final']);self.assertNotIn('manifest',item['evidence']['authorization_audit'])
        self.assertTrue(all(r['kind']!='fixed_validation' for r in self.freeze(2)['items']))
        rows={}
        for r in SyncManager().build_snapshot_data():rows.setdefault(r['model'],{})[str(r['pk'])]=r['fields']
        validate_from_rows(memory,rows,collection_id=str(self.collection.pk),latest_at=memory['cutoff'],options=options(self.source.result))
        bad=copy.deepcopy(memory);target=next(r for r in bad['items'] if r['kind']=='fixed_validation');target['evidence']['recipe']['parameters']['p0']=900
        with self.assertRaises(ValidationError):validate_from_rows(bad,rows,collection_id=str(self.collection.pk),latest_at=memory['cutoff'],options=options(self.source.result))
        Path('/private/tmp/odoc-fixed-memory-wire.json').write_text(json.dumps(memory))

    def test_cancelled_result_keeps_no_return_and_live_discovery_excludes_deleted_source(self):
        self.register();dataset=self.dataset();self.action('run',dataset);self.action('cancel')
        memory=self.freeze();item=next(r for r in memory['items'] if r['kind']=='fixed_validation')
        self.assertTrue(item['has_negative_evidence']);self.assertIsNone(item['evidence']['final']);self.assertEqual(item['evidence']['status'],'cancelled')
        from quant.models import Entry
        Entry.objects.filter(pk=item['entry_id']).update(is_valid=False)
        self.assertFalse(any(r['kind']=='fixed_validation' for r in self.freeze()['items']))

    def test_future_review_uses_history_and_current_fixed_review_excludes_self(self):
        request=self.ready()
        from quant.experiments.reviews import start_review
        with patch('django.utils.timezone.now',return_value=timezone.now()+timedelta(seconds=2)):
            ai=start_review(self.source.result,request_key='fixed_history_review_00001')
        self.assertEqual(ai.review_version,10);self.assertEqual(ai.planning_context['version'],5)
        from quant.experiments.review_evidence import for_run
        facts=for_run(ai);history=ai.planning_context['research_memory']
        self.assertTrue(any(r['kind']=='fixed_validation' for r in history['items']))
        from quant.test_experiment_reviews import response
        value=response(facts);value.update(decision(history));value['proposal']={'name':'新数据反例检验','hypothesis':'历史观察可能不能复现','falsification':'新数据与基线差异消失',
            'data_requirement':'另外的新区间','evidence_refs':[f"memory:fixed_validation:{request.result.pk}"],
            'seeds':[{'candidate_id':facts['planning_options'][0]['id'],'variants':[]}]}
        from quant.worker import execute
        with patch('quant.worker.complete',return_value=json.dumps(value)):execute(ai.pk)
        ai.refresh_from_db();self.assertEqual(ai.status,'completed',ai.error);self.assertTrue(ExperimentProposal.objects.filter(run=ai).exists())
        with patch('django.utils.timezone.now',return_value=timezone.now()+timedelta(seconds=3)):
            fixed=start_review(self.source.result,request_key='fixed_self_review_000001',validation_result_id=request.result.pk)
        self.assertFalse(any(r['id']==request.result.pk and r['kind']=='fixed_validation' for r in fixed.planning_context['research_memory']['items']))
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))

    def test_source_analysis_review_and_first_plan_consume_frozen_fixed_history(self):
        self.ready()
        from quant.services import queue
        from quant.worker import execute
        source=self.source.plan['seeds'][0]['id']
        from quant.models import FactorCandidate
        candidate=FactorCandidate.objects.get(pk=source);entry=candidate.report.entry
        with patch('django.utils.timezone.now',return_value=timezone.now()+timedelta(seconds=2)):
            ai=queue(entry,{'kind':'analyze','source_id':candidate.report.source_id,'request_key':'source_fixed_history_00001'})
        from quant import test_research_analysis as analysis_fixtures
        def complete(config,prompt,**kwargs):
            from quant.test_initial_planning import initial_response
            result=initial_response()
            context=json.loads(prompt.split('材料：',1)[1])
            if context.get('research_memory'):
                result.update(decision(context['research_memory']))
                result['initial_proposal']['evidence_refs'] += [f"memory:{r['kind']}:{r['id']}" for r in context['research_memory']['items']]
            return json.dumps(result)
        with patch('quant.worker.complete',side_effect=complete) as model:execute(ai.pk)
        ai.refresh_from_db();self.assertEqual(ai.status,'completed',ai.error)
        self.assertEqual(ai.workflow_version,14);self.assertEqual(ai.result['source_memory_version'],1)
        memory=ai.result['research_memory'];self.assertTrue(any(r['kind']=='fixed_validation' for r in memory['items']))
        self.assertIn('历史研究依据',ai.report.markdown)
        proposal=ExperimentProposal.objects.get(run=ai)
        self.assertTrue(any(ref.startswith('memory:fixed_validation:') for ref in proposal.data['evidence_refs']))
        prompts=[c.args[1] for c in model.call_args_list]
        self.assertTrue(any('固定评价' in p and 'memory:fixed_validation:' in p for p in prompts))
        wire=self.client.get(f'/api/quant/{self.collection.pk}/entries/{entry.pk}/').json()['data']
        Path('/private/tmp/odoc-source-memory-wire.json').write_text(json.dumps(wire))
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))

    def test_feedback_and_legacy_source_retry_keep_their_own_contracts(self):
        self.ready()
        from quant.models import FactorCandidate
        candidate=FactorCandidate.objects.get(pk=self.source.plan['seeds'][0]['id']);entry=candidate.report.entry
        with patch('django.utils.timezone.now',return_value=timezone.now()+timedelta(seconds=2)):
            response=self.client.post(f'/api/quant/{self.collection.pk}/entries/{entry.pk}/feedback/',{'request_key':'fixed_feedback_history_0001','title':'后续使用观察',
                'target_source_id':candidate.report.source_id,'factor_id':candidate.pk,'document':'窗口在不同区间表现不同，尚需新数据。','mode':'backtest'},format='json')
        self.assertEqual(response.status_code,200,response.data)
        feedback=AIRun.objects.get(kind='feedback_review')
        self.assertEqual(feedback.planning_context['version'],4)
        self.assertTrue(any(r['kind']=='fixed_validation' for r in feedback.planning_context['library_memory']['items']))
        from quant.services import queue
        from quant.worker import execute
        from quant.test_initial_planning import initial_response
        old=queue(entry,{'kind':'analyze','source_id':candidate.report.source_id,'request_key':'legacy_source_10_history_01'})
        AIRun.objects.filter(pk=old.pk).update(workflow_version=10)
        with patch('quant.worker.complete',return_value=json.dumps(initial_response())):execute(old.pk)
        old.refresh_from_db();self.assertEqual(old.status,'completed',old.error);self.assertNotIn('source_memory_version',old.result)
        replay=queue(entry,{'kind':'analyze','source_id':candidate.report.source_id,'request_key':'legacy_retry_10_history_01','resume_run_id':old.pk,'restart_stage':'review'})
        with patch('quant.worker.complete',return_value=json.dumps(initial_response())):execute(replay.pk)
        replay.refresh_from_db();self.assertEqual(replay.workflow_version,10);self.assertEqual(replay.status,'completed',replay.error)
        self.assertNotIn('research_memory',replay.result)
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))

    def test_scan_budget_is_disclosed_and_does_not_claim_absence_of_counterexamples(self):
        self.ready()
        with patch('quant.research_memory.scanning.MAX_CHARS',1):memory=self.freeze()
        self.assertTrue(memory['scan_limits']['size_limited']);self.assertEqual(memory['items'],[])
        self.assertEqual(memory['scan_limits']['chars_read'],0)

    def test_source_ai_cannot_ignore_selected_fixed_history(self):
        request=self.ready()
        from quant.models import FactorCandidate,ResearchReport
        candidate=FactorCandidate.objects.get(pk=self.source.plan['seeds'][0]['id'])
        from quant.services import queue
        from quant.worker import execute
        from quant.test_initial_planning import initial_response
        with patch('django.utils.timezone.now',return_value=timezone.now()+timedelta(seconds=2)):
            ai=queue(candidate.report.entry,{'kind':'analyze','source_id':candidate.report.source_id,'request_key':'missing_history_judgment_01'})
        with patch('quant.worker.complete',return_value=json.dumps(initial_response())):execute(ai.pk)
        ai.refresh_from_db();self.assertEqual(ai.status,'failed');self.assertFalse(ResearchReport.objects.filter(run=ai).exists())
        step=ai.workflow_steps.get(stage='review')
        self.assertEqual(step.outcome.data['status'],'failed')
        self.assertTrue(ValidationResult.objects.filter(pk=request.result.pk).exists())
