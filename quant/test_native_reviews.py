"""Report review keeps drafts, grounds changes and never revives source execution."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from quant import test_native_python as fixtures
from quant.test_feedback import response
from quant.models import NativePythonResult,NativePythonJob,AIRun,SourceRevision,ResearchReport,WorkflowOutcome,Job
from quant.native_python.feedback import automatic
from quant.feedback.evidence import for_run
from quant.native_reviews.contracts import acknowledgment
from quant.worker import execute
from quant.sync import metadata,validate
from utils.sync_manager import SyncManager,SyncError

ACCEPT={'decision':'accept','issues':[],'analysis':None}


def draft(context,*,bad=False):
    value=response();native=context['native_check']
    value.update(title='原始输出对照解读',summary='只解释本次固定样本',reported_parameters=[],reported_metrics=[],supporting_evidence=[],counter_evidence=[],
        native_review_version=2,native_review={'verdict':native['verdict'] or 'unavailable','actual_parameters':native['parameters'],
            **acknowledgment(native),'interpretation':'左侧为受控表达式，右侧为原始函数','parameter_assessment':'本次候选参数与函数映射分别确认，不称最优',
            'limitations':['同一模型审查不是独立验证，不能推断盈利']},
        hypotheses=['左侧是原始函数' if bad else '左侧为受控表达式，原函数位于右侧'],
        next_steps='绝对误差和相对误差分别满足阈值才通过' if bad else '按绝对容差加相对容差乘双方最大量级的复合规则复核')
    return value


def revision(context,raw):
    value=draft(context)
    return {'decision':'revise','issues':[
        {'code':'side_inversion','path':'/hypotheses/0','quote':raw['hypotheses'][0],'evidence_refs':['native:sides'],'explanation':'左右侧颠倒'},
        {'code':'tolerance_rule','path':'/next_steps','quote':raw['next_steps'],'evidence_refs':['native:tolerance'],'explanation':'应使用复合容差而非独立阈值'}],
        'analysis':value}


class NativeReviewTests(TestCase):
    setUp=fixtures.NativePythonTests.setUp
    publish=fixtures.NativePythonTests.publish
    dataset=fixtures.NativePythonTests.dataset
    side=staticmethod(fixtures.NativePythonTests.side)
    prepare=fixtures.NativePythonTests.prepare
    compute=fixtures.NativePythonTests.compute

    def queued(self,*,legacy=False):
        _,_,_,_,record=self.prepare(analyze=True);self.compute(record)
        result=NativePythonResult.objects.get();job=NativePythonJob.objects.get()
        if legacy:
            with patch('quant.native_reviews.policy.prepare',return_value=None):automatic(result.pk,job.lease_token)
        else:automatic(result.pk,job.lease_token)
        return AIRun.objects.get(source__payload__feedback_version=4)

    def run_model(self,run,answers):
        with patch('quant.worker.complete',side_effect=[json.dumps(value) if isinstance(value,dict) else value for value in answers]) as complete:
            execute(run.pk)
        run.refresh_from_db();return complete

    def test_two_calls_accept_and_restore_without_any_execution(self):
        run=self.queued();self.assertEqual(run.feedback_workflow_version,1)
        complete=self.run_model(run,[draft(for_run(run)),ACCEPT]);self.assertEqual(complete.call_count,2)
        self.assertEqual(run.status,'completed',run.error);self.assertEqual(run.result['native_review_gate']['status'],'audited')
        self.assertEqual(run.workflow_steps.count(),2)
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        with patch('quant.worker.complete',side_effect=AssertionError('restore model')),patch('quant.native_python.runtime.run',side_effect=AssertionError('restore source')):
            SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        self.assertFalse(Job.objects.exists());self.assertFalse(NativePythonJob.objects.exists())
        self.assertEqual(AIRun.objects.get(pk=run.pk).result,run.result)

    def test_one_revision_three_calls_preserves_original_words_and_issues(self):
        run=self.queued();context=for_run(run);original=draft(context,bad=True)
        complete=self.run_model(run,[original,revision(context,original),ACCEPT])
        self.assertEqual(complete.call_count,3);self.assertEqual(run.status,'completed',run.error)
        self.assertEqual(run.result['native_review_gate']['status'],'revised_audited')
        outcomes=list(WorkflowOutcome.objects.filter(step__run=run).order_by('step__ordinal'))
        self.assertEqual(outcomes[0].data['output']['analysis']['hypotheses'],original['hypotheses'])
        self.assertEqual(outcomes[1].data['output']['issues'][1]['code'],'tolerance_rule')
        self.assertNotEqual(run.result['hypotheses'],original['hypotheses'])
        validate(SyncManager().build_snapshot_data())

    def test_unresolved_revision_is_not_published_and_fourth_call_is_impossible(self):
        run=self.queued();context=for_run(run);original=draft(context,bad=True);revised=revision(context,original)
        revised['analysis']['summary']='已证实盈利能力'
        rejected={'decision':'reject','issues':[{'code':'unsupported_inference','path':'/summary','quote':'已证实盈利能力',
            'evidence_refs':['native:scope'],'explanation':'没有收益实验'}],'analysis':None}
        complete=self.run_model(run,[original,revised,rejected])
        self.assertEqual(complete.call_count,3);self.assertEqual(run.status,'failed');self.assertFalse(run.result)
        self.assertFalse(ResearchReport.objects.filter(run=run).exists());self.assertEqual(run.workflow_steps.count(),3)
        self.assertIn('未发布新报告',run.error);self.assertIn('旧报告保留',run.error)
        validate(SyncManager().build_snapshot_data())

    def test_bad_acknowledgment_or_json_retains_rejected_output(self):
        run=self.queued();raw=draft(for_run(run));raw['native_review']['comparison_roles']['left']='original_python_function'
        complete=self.run_model(run,[raw]);self.assertEqual(complete.call_count,1);self.assertEqual(run.status,'failed')
        outcome=WorkflowOutcome.objects.get(step__run=run);self.assertEqual(outcome.data['status'],'failed')
        self.assertIn('original_python_function',outcome.data['raw']['text']);self.assertFalse(outcome.data['output'])
        validate(SyncManager().build_snapshot_data())

    def test_false_quote_does_not_authorize_a_revision(self):
        run=self.queued();context=for_run(run);original=draft(context,bad=True);review=revision(context,original)
        review['issues'][0]['quote']='原稿从未出现的文字'
        self.run_model(run,[original,review]);self.assertEqual(run.status,'failed');self.assertEqual(run.workflow_steps.count(),2)
        self.assertFalse(ResearchReport.objects.filter(run=run).exists())

    def test_sorted_json_roundtrip_and_legacy_prompt_order_do_not_rewrite_recorded_text(self):
        from quant.native_reviews.storage import input_snapshot
        run=self.queued();context=for_run(run);original=draft(context,bad=True)
        def legacy(*args,**kwargs):return input_snapshot(*args,**kwargs,version=3)
        with patch('quant.native_reviews.storage.input_snapshot',side_effect=legacy):
            self.run_model(run,[original,revision(context,original),ACCEPT])
        self.assertEqual(run.status,'completed',run.error)
        snapshot=json.loads(json.dumps(SyncManager().build_snapshot_data(),sort_keys=True))
        validate(snapshot,metadata(snapshot))
        tampered=copy.deepcopy(snapshot)
        step=next(row for row in tampered if row['model']=='quant.workflowstep' and row['fields']['run']==run.pk and row['fields']['stage']=='native_reaudit')
        step['fields']['input']['prompt']=step['fields']['input']['prompt'].replace('left=portable_expression','left=original_python_function')
        step['fields']['content_hash']=fixtures.digest(step['fields']['input'])
        with self.assertRaises(SyncError):validate(tampered,metadata(tampered))

    def test_revision_can_delete_an_unsupported_hypothesis_without_losing_original(self):
        run=self.queued();context=for_run(run);original=draft(context)
        original['hypotheses']+=['假设一','假设二','保证任何参数都盈利']
        review={'decision':'revise','issues':[{'code':'unsupported_inference','path':'/hypotheses/3','quote':'保证任何参数都盈利',
            'evidence_refs':['native:scope'],'explanation':'本次没有收益证据，删除无依据断言'}],'analysis':draft(context)}
        self.run_model(run,[original,review,ACCEPT]);self.assertEqual(run.status,'completed',run.error)
        self.assertEqual(len(run.result['hypotheses']),1)
        self.assertEqual(run.workflow_steps.first().outcome.data['output']['analysis']['hypotheses'][3],'保证任何参数都盈利')
        validate(SyncManager().build_snapshot_data())

    def test_cancel_during_audit_keeps_completed_draft_and_no_final_report(self):
        run=self.queued();value=draft(for_run(run));calls=[]
        def complete(*args,**kwargs):
            calls.append(1)
            if len(calls)==2:Job.objects.filter(run=run).update(cancelled=True)
            return json.dumps(value if len(calls)==1 else ACCEPT)
        with patch('quant.worker.complete',side_effect=complete):execute(run.pk)
        run.refresh_from_db();self.assertEqual(run.status,'cancelled');self.assertEqual(len(calls),2)
        self.assertEqual(run.workflow_steps.count(),2);self.assertEqual(WorkflowOutcome.objects.filter(step__run=run).count(),1)
        self.assertFalse(ResearchReport.objects.filter(run=run).exists());validate(SyncManager().build_snapshot_data())

    def test_existing_legacy_report_can_be_reviewed_without_regenerating_or_running_source(self):
        old=self.queued(legacy=True);context=for_run(old);raw=draft(context,bad=True)
        raw['native_review_version']=1
        for key in ('comparison_roles','comparison_rule','native_result_id'):raw['native_review'].pop(key)
        self.run_model(old,[raw]);self.assertEqual(old.status,'completed',old.error)
        original=ResearchReport.objects.get(run=old);before=copy.deepcopy(original.data)
        response=self.client.post(f'/api/quant/{self.collection.pk}/entries/{old.entry_id}/runs/',{
            'kind':'feedback_review','source_id':old.source_id,'audit_report_id':original.pk,'request_key':'native_reaudit_existing_report01'},format='json')
        self.assertEqual(response.status_code,200,response.data);run=AIRun.objects.get(pk=response.data['data']['id'])
        context=for_run(run);review=revision(context,raw)
        with patch('quant.native_python.runtime.run',side_effect=AssertionError('review ran source')):
            complete=self.run_model(run,[review,ACCEPT])
        self.assertEqual(complete.call_count,2);self.assertEqual(run.status,'completed',run.error)
        original.refresh_from_db();self.assertEqual(original.data,before);self.assertEqual(ResearchReport.objects.filter(source_id=old.source_id).count(),2)
        self.assertEqual(run.workflow_steps.first().outcome.data['output']['origin'],'report_snapshot')
        step=run.workflow_steps.get(stage='native_audit')
        self.assertEqual(step.input['version'],4);self.assertIn('逐项检查自算比值',step.input['prompt'])
        detail=self.client.get(f'/api/quant/{self.collection.pk}/entries/{old.entry_id}/runs/{run.pk}/workflow/native_audit/')
        self.assertEqual(detail.status_code,200,detail.data)
        evidence=json.loads(detail.data['data']['outcome_json']);self.assertEqual(evidence['output']['decision'],'revise')
        from django.contrib.auth import get_user_model
        self.client.force_authenticate(get_user_model().objects.create_user('native-review-foreign'))
        self.assertEqual(self.client.get(f'/api/quant/{self.collection.pk}/entries/{old.entry_id}/runs/{run.pk}/workflow/native_audit/').status_code,404)
        validate(SyncManager().build_snapshot_data())

    def test_rehashed_tampering_or_workflow_downgrade_is_rejected(self):
        run=self.queued();self.run_model(run,[draft(for_run(run)),ACCEPT]);self.assertEqual(run.status,'completed',run.error)
        saved=SyncManager().build_snapshot_data()
        for mode in ('downgrade','quote'):
            rows=copy.deepcopy(saved)
            if mode=='downgrade':
                row=next(row for row in rows if row['model']=='quant.airun' and row['pk']==run.pk);row['fields']['feedback_workflow_version']=0
            else:
                row=next(row for row in rows if row['model']=='quant.workflowoutcome' and row['pk']==run.workflow_steps.last().outcome.pk)
                value=row['fields']['data'];value['raw']['text']=json.dumps({'decision':'reject','issues':[],'analysis':None})
                from quant.native_reviews.storage import raw_capture
                value['raw']=raw_capture(value['raw']['text']);row['fields']['content_hash']=fixtures.digest(value)
            with self.assertRaises(SyncError):validate(rows,metadata(rows))
