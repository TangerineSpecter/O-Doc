"""Continuation reuses only a complete prefix and never reruns source execution."""
import copy
import json
from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from quant import test_native_reviews as fixtures
from quant.test_native_reviews import draft,revision,ACCEPT,selected_issues
from quant.models import AIRun,Job,NativePythonJob,NativePythonResult,ResearchReport,WorkflowOutcome
from quant.feedback.evidence import for_run
from quant.native_reviews.storage import raw_capture
from quant.research.contracts import digest
from quant.sync import metadata,validate
from quant.worker import execute
from utils.sync_manager import SyncManager,SyncError


class NativeResumeTests(TestCase):
    setUp=fixtures.NativeReviewTests.setUp
    publish=fixtures.NativeReviewTests.publish
    dataset=fixtures.NativeReviewTests.dataset
    side=staticmethod(fixtures.NativeReviewTests.side)
    prepare=fixtures.NativeReviewTests.prepare
    compute=fixtures.NativeReviewTests.compute
    queued=fixtures.NativeReviewTests.queued
    run_model=fixtures.NativeReviewTests.run_model

    def resume(self,run,**changes):
        values={'kind':'feedback_review','source_id':run.source_id,'native_resume_run_id':run.pk,
            'request_key':f'native_resume_{AIRun.objects.count():020d}',**changes}
        response=self.client.post(f'/api/quant/{self.collection.pk}/entries/{run.entry_id}/runs/',values,format='json')
        return response,values

    def failed_audit(self):
        run=self.queued();self.run_model(run,[draft(for_run(run)),'{"incomplete":'])
        self.assertEqual(run.status,'failed');return run

    def test_audit_retry_reuses_original_draft_with_one_new_call_and_restores(self):
        old=self.failed_audit();before=copy.deepcopy(old.workflow_steps.first().outcome.data)
        response,values=self.resume(old);self.assertEqual(response.status_code,200,response.data)
        run=AIRun.objects.get(pk=response.data['data']['id']);self.assertEqual(run.planning_context,old.planning_context)
        again,_=self.resume(old,**values);self.assertEqual(again.data['data']['id'],run.pk)
        with patch('quant.native_python.runtime.run',side_effect=AssertionError('continuation executed source')):
            complete=self.run_model(run,[ACCEPT])
        self.assertEqual(complete.call_count,1);self.assertEqual(run.status,'completed',run.error)
        retained=run.workflow_steps.get(stage='native_draft');value=retained.outcome.data
        self.assertEqual(retained.input['version'],10);self.assertEqual(value['version'],3)
        self.assertEqual(value['output'],before['output']);self.assertEqual(value['raw'],raw_capture(''))
        self.assertEqual(value['usage']['request_count'],0);self.assertEqual(value['reused_from']['run_id'],old.pk)
        old.refresh_from_db();self.assertEqual(old.status,'failed');self.assertEqual(old.workflow_steps.first().outcome.data,before)
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        with patch('quant.worker.complete',side_effect=AssertionError('restore called model')),patch('quant.native_python.runtime.run',side_effect=AssertionError('restore executed source')):
            SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        self.assertFalse(Job.objects.exists());self.assertFalse(NativePythonJob.objects.exists())
        self.assertEqual(AIRun.objects.get(pk=run.pk).result,run.result)

    def test_cancelled_review_resumes_saved_draft_without_an_old_audit_outcome(self):
        run=self.queued();answers=[draft(for_run(run)),ACCEPT]
        def complete(*args,**kwargs):
            if len(answers)==1:Job.objects.filter(run=run).update(cancelled=True)
            return json.dumps(answers.pop(0))
        with patch('quant.worker.complete',side_effect=complete):execute(run.pk)
        run.refresh_from_db();self.assertEqual(run.status,'cancelled')
        self.assertEqual(WorkflowOutcome.objects.filter(step__run=run).count(),1)
        response,_=self.resume(run);self.assertEqual(response.status_code,200,response.data)
        next_run=AIRun.objects.get(pk=response.data['data']['id']);self.run_model(next_run,[ACCEPT])
        self.assertEqual(next_run.status,'completed',next_run.error);validate(SyncManager().build_snapshot_data())

    def test_failed_first_draft_restarts_only_ai_and_keeps_its_invalid_raw_output(self):
        old=self.queued();self.run_model(old,['incomplete JSON']);self.assertEqual(old.status,'failed')
        before=copy.deepcopy(old.workflow_steps.first().outcome.data)
        response,_=self.resume(old);self.assertEqual(response.status_code,200,response.data)
        child=AIRun.objects.get(pk=response.data['data']['id'])
        with patch('quant.native_python.runtime.run',side_effect=AssertionError('draft retry executed source')):
            complete=self.run_model(child,[draft(for_run(child)),ACCEPT])
        self.assertEqual(complete.call_count,2);self.assertEqual(child.status,'completed',child.error)
        self.assertEqual(old.workflow_steps.first().outcome.data,before)
        self.assertTrue(all(step.outcome.data['version']==2 for step in child.workflow_steps.all()))
        validate(SyncManager().build_snapshot_data())

    def test_native_record_read_exposes_an_expired_review_as_interrupted_without_dispatch(self):
        from quant.native_python.feedback import presentation
        run=self.queued();run.status='running';run.save(update_fields=['status'])
        Job.objects.filter(run=run).update(lease_until=timezone.now()-timedelta(seconds=1))
        with patch('quant.worker.dispatch',side_effect=AssertionError('read reauthorized execution')):
            value=presentation(NativePythonResult.objects.get())
        self.assertEqual(value['status'],'interrupted');self.assertTrue(value['audit']['can_resume'])
        self.assertTrue(Job.objects.get(run=run).cancelled);self.assertEqual(run.workflow_steps.count(),0)

    def test_final_review_retry_keeps_revision_limit_across_a_chain(self):
        old=self.queued();context=for_run(old);original=draft(context,bad=True)
        self.run_model(old,[original,revision(context,original),'invalid JSON']);self.assertEqual(old.status,'failed')
        response,_=self.resume(old);self.assertEqual(response.status_code,200,response.data)
        child=AIRun.objects.get(pk=response.data['data']['id'])
        # A final reviewer cannot ask for a second revision, including after retry.
        complete=self.run_model(child,[revision(context,original)]);self.assertEqual(complete.call_count,1)
        self.assertEqual(child.status,'failed');self.assertFalse(ResearchReport.objects.filter(run=child).exists())
        response,_=self.resume(child);self.assertEqual(response.status_code,200,response.data)
        final=AIRun.objects.get(pk=response.data['data']['id']);complete=self.run_model(final,[ACCEPT])
        self.assertEqual(complete.call_count,1);self.assertEqual(final.status,'completed',final.error)
        self.assertEqual(final.result['native_review_gate']['status'],'revised_audited')
        self.assertEqual(final.workflow_steps.get(stage='native_audit').outcome.data['reused_from']['run_id'],child.pk)
        validate(SyncManager().build_snapshot_data())

    def test_rejected_audit_requires_new_full_analysis_instead_of_review_shopping(self):
        old=self.queued();context=for_run(old);original=draft(context)
        rejected={'decision':'reject','issues':selected_issues(context,original,[{'code':'unresolved_scope','path':'/summary',
            'quote':original['summary'],'evidence_refs':['native:scope'],'explanation':'重新核对本次范围'}]),'analysis':None}
        self.run_model(old,[original,rejected]);self.assertEqual(old.status,'failed')
        response,_=self.resume(old);self.assertEqual(response.status_code,400)
        from quant.native_reviews.presentation import summary
        self.assertFalse(summary(old)['can_resume'])
        response,values=self.resume(old,native_resume_run_id='')
        self.assertEqual(response.status_code,200,response.data)
        child=AIRun.objects.get(pk=response.data['data']['id']);self.assertEqual(child.native_resume_run_id,'')
        complete=self.run_model(child,[draft(for_run(child)),ACCEPT]);self.assertEqual(complete.call_count,2)
        self.assertEqual(child.status,'completed',child.error)
        self.assertTrue(all(step.outcome.data['version']==2 for step in child.workflow_steps.all()))
        self.assertEqual(old.workflow_steps.get(stage='native_audit').outcome.data['output']['decision'],'reject')
        from quant.native_python.feedback import presentation
        history=presentation(NativePythonResult.objects.get())['history']
        self.assertEqual(history[0]['run_id'],old.pk);self.assertEqual(history[0]['audit']['stages'][-1]['decision'],'reject')
        request_id=NativePythonResult.objects.get().request_id
        wire=self.client.get(f'/api/quant/{self.collection.pk}/native-python/{request_id}/').json()['data']['analysis']
        self.assertEqual(wire['history'][0]['runId'],old.pk);self.assertIsInstance(wire['history'][0]['createdAt'],str)
        self.assertFalse(wire['history'][0]['audit']['canResume'])

    def test_publish_failure_can_reuse_both_accepted_steps_without_a_new_model_call(self):
        old=self.queued()
        with patch('quant.research.services.publish_report',side_effect=RuntimeError('synthetic publication failure')):
            self.run_model(old,[draft(for_run(old)),ACCEPT])
        self.assertEqual(old.status,'failed');self.assertFalse(old.result)
        response,_=self.resume(old);child=AIRun.objects.get(pk=response.data['data']['id'])
        complete=self.run_model(child,[]);self.assertEqual(complete.call_count,0);self.assertEqual(child.status,'completed',child.error)
        self.assertTrue(all(row.outcome.data['version']==3 for row in child.workflow_steps.all()))
        validate(SyncManager().build_snapshot_data())

    def test_interruption_before_copying_a_checkpoint_still_reuses_the_ancestor_revision(self):
        old=self.queued();context=for_run(old);original=draft(context,bad=True)
        self.run_model(old,[original,revision(context,original),'invalid JSON'])
        response,_=self.resume(old);child=AIRun.objects.get(pk=response.data['data']['id'])
        with patch('quant.native_reviews.storage.start',side_effect=InterruptedError('synthetic checkpoint interruption')):
            self.run_model(child,[])
        self.assertEqual(child.status,'interrupted');self.assertEqual(child.workflow_steps.count(),0)
        response,_=self.resume(child);final=AIRun.objects.get(pk=response.data['data']['id'])
        complete=self.run_model(final,[ACCEPT]);self.assertEqual(complete.call_count,1)
        self.assertEqual(final.status,'completed',final.error)
        self.assertEqual(final.workflow_steps.get(stage='native_audit').outcome.data['reused_from']['run_id'],old.pk)
        validate(SyncManager().build_snapshot_data())
        from quant.native_reviews.resume import checkpoints,_merge
        older=checkpoints(old);changed=copy.deepcopy(older['native_draft'])
        changed['output']['analysis']['summary']='newer draft text'
        self.assertEqual(set(_merge({'native_draft':changed},older)),{'native_draft'})

    def test_invalid_parent_input_or_foreign_owner_cannot_create_a_continuation(self):
        old=self.failed_audit()
        for changes in ({'requirements':'changed'},{'model_id':'different'},{'audit_report_id':'missing'},
                {'resume_run_id':old.pk},{'native_resume_run_id':'missing'},{'kind':'analyze'}):
            self.assertEqual(self.resume(old,**changes)[0].status_code,400)
        count=AIRun.objects.count()
        with patch('quant.feedback.contracts.prompt',return_value='x'*210001):
            response,_=self.resume(old)
        self.assertEqual(response.status_code,400);self.assertIn('固定上下文',str(response.data))
        self.assertEqual(AIRun.objects.count(),count)
        with patch('quant.worker.complete',side_effect=AssertionError('invalid parent called model')):
            old.status='completed';old.save(update_fields=['status']);self.assertEqual(self.resume(old)[0].status_code,400)
            old.status='failed';old.save(update_fields=['status'])
        self.client.force_authenticate(get_user_model().objects.create_user('native-resume-foreign'))
        self.assertEqual(self.resume(old)[0].status_code,404)

    def test_rehashed_resume_provenance_output_or_frozen_memory_tampering_is_rejected(self):
        old=self.failed_audit();response,_=self.resume(old);child=AIRun.objects.get(pk=response.data['data']['id'])
        self.run_model(child,[ACCEPT]);saved=SyncManager().build_snapshot_data()
        for mode in ('reference','output','memory','source','missing_parent','parent_output_shape'):
            rows=copy.deepcopy(saved)
            run=next(row['fields'] for row in rows if row['model']=='quant.airun' and row['pk']==child.pk)
            if mode=='parent_output_shape':
                record=next(row for row in rows if row['model']=='quant.workflowoutcome' and row['pk']==old.workflow_steps.first().outcome.pk)
                record['fields']['data']=['malformed parent output'];record['fields']['content_hash']=digest(record['fields']['data'])
            elif mode in ('memory','source','missing_parent'):
                if mode=='memory':run['planning_context']={}
                if mode=='source':run['source']='missing'
                if mode=='missing_parent':run['native_resume_run_id']='missing'
            else:
                record=next(row for row in rows if row['model']=='quant.workflowoutcome' and row['pk']==child.workflow_steps.first().outcome.pk)
                if mode=='reference':record['fields']['data']['reused_from']['content_hash']='0'*64
                else:record['fields']['data']['output']['analysis']['summary']='forged text'
                record['fields']['content_hash']=digest(record['fields']['data'])
            with self.assertRaises(SyncError):validate(rows,metadata(rows))

    def test_old_snapshot_does_not_borrow_a_new_continuation_link(self):
        old=self.failed_audit();saved=SyncManager().build_snapshot_data()
        for row in saved:
            if row['model']=='quant.airun':row['fields'].pop('native_resume_run_id',None)
        response,_=self.resume(old);child=AIRun.objects.get(pk=response.data['data']['id']);self.run_model(child,[ACCEPT])
        with patch('quant.worker.complete',side_effect=AssertionError('old snapshot restarted review')):
            SyncManager().apply_snapshot_data(saved,remote_meta=metadata(saved))
        self.assertFalse(AIRun.objects.filter(pk=child.pk).exists());self.assertEqual(AIRun.objects.get(pk=old.pk).native_resume_run_id,'')
        self.assertFalse(Job.objects.exists())
