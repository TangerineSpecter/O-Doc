"""Isolated API, revocable queue and restore checks; no Docker in this suite."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth import get_user_model
from quant.test_factor_comparisons import FactorComparisonIntegrationTests as Fixtures
from quant.test_feedback import response
from quant.models import NativePythonRequest,NativePythonResult,NativePythonJob,AIRun,SourceRevision
from quant.native_python.runtime import PROTOCOL,LIMITS,RuntimeUnavailable,command
from quant.native_python.calculation import portable,compare
from quant.native_python.worker import execute
from quant.native_python.feedback import automatic
from quant.feedback.evidence import for_source
from quant.feedback.contracts import validate_analysis
from quant.research.contracts import digest
from quant.sync import validate,metadata
from quant.worker import execute as execute_ai
from utils.sync_manager import SyncManager,SyncError


def environment():
    return {'image_id':'sha256:'+'1'*64,'os':'linux','architecture':'arm64','limits':LIMITS.copy(),
        'runtime':{'protocol':PROTOCOL,'python':'3.11.17','machine':'aarch64','numpy':'2.3.4','pandas':'2.3.3',
            'supervisor_sha256':'2'*64,'child_sha256':'3'*64}}


class NativePythonTests(TestCase):
    setUp=Fixtures.setUp
    publish=Fixtures.publish
    dataset=Fixtures.dataset
    side=staticmethod(Fixtures.side)

    def prepare(self,*,analyze=False):
        candidate=self.publish('native_python_source0001');dataset=self.dataset()
        values={'request_key':'native_python_request001','name':'原始函数固定对照','dataset_id':dataset.pk,
            **{key:value for key,value in self.side(candidate).items() if key!='candidate_id'},
            'entrypoint':'factor','arguments':[{'name':'close','kind':'series','column':'close'}],
            'row_count':80,'analyze':analyze}
        url=f'/api/quant/{self.collection.pk}/factors/{candidate.pk}/native-python/'
        with patch('quant.native_python.runtime.probe',return_value=environment()):
            saved=self.client.post(url,values,format='json')
        self.assertEqual(saved.status_code,200,saved.data)
        record=NativePythonRequest.objects.get();return candidate,dataset,values,url,record

    def compute(self,record,*,offset=0,reason=None):
        _,values=portable(record.plan,record.dataset.snapshot)
        if offset:values=[value+offset if value is not None else None for value in values]
        child={'status':'failed','reason':reason} if reason else {'status':'completed','values':values}
        with patch('quant.native_python.runtime.probe',return_value=environment()),patch('quant.native_python.runtime.run',return_value={
                'protocol':PROTOCOL,'status':'completed','result':child}) as run:
            execute(NativePythonJob.objects.get().pk)
        return run

    def test_api_completed_direct_evidence_idempotency_and_restore(self):
        candidate,_,values,url,record=self.prepare()
        run=self.compute(record);self.assertEqual(run.call_count,1)
        result=NativePythonResult.objects.get();self.assertEqual(result.data['comparison']['status'],'pass')
        evidence=candidate.verification_evidence.get(kind='native_python')
        self.assertIn('native_python_fixed_match',evidence.data['levels']);self.assertFalse(evidence.data['independent_validation'])
        with patch('quant.native_python.runtime.probe',side_effect=AssertionError('replay probed Docker')):
            self.assertEqual(self.client.post(url,values,format='json').status_code,200)
            snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
            self.assertFalse(any(row['model']=='quant.nativepythonjob' for row in snapshot))
            SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
            self.assertFalse(NativePythonJob.objects.exists())
            self.assertEqual(NativePythonResult.objects.get().data,result.data)
        values['name']='changed';self.assertEqual(self.client.post(url,values,format='json').status_code,409)

    def test_negative_values_and_dependency_failure_do_not_promote(self):
        candidate,_,_,_,record=self.prepare();self.compute(record,offset=.2)
        self.assertEqual(NativePythonResult.objects.get().data['comparison']['status'],'fail')
        self.assertNotIn('native_python_fixed_match',candidate.verification_evidence.get(kind='native_python').data['levels'])

    def test_old_complete_snapshot_prunes_new_native_facts_and_execution_authority(self):
        candidate,_,_,_,record=self.prepare()
        old=[row for row in SyncManager().build_snapshot_data() if row['model'] not in ('quant.nativepythonrequest','quant.nativepythonresult')]
        meta=metadata(old);meta['quant_schema_version']=49
        self.compute(record);self.assertTrue(NativePythonResult.objects.exists())
        with patch('quant.native_python.runtime.run',side_effect=AssertionError('restore executed source')):
            SyncManager().apply_snapshot_data(old,remote_meta=meta)
        self.assertFalse(NativePythonJob.objects.exists());self.assertFalse(NativePythonRequest.objects.exists())
        self.assertFalse(NativePythonResult.objects.exists());self.assertFalse(candidate.verification_evidence.filter(kind='native_python').exists())

    def test_failure_keeps_unknown_outputs(self):
        candidate,_,_,_,record=self.prepare();self.compute(record,reason='dependency_unavailable')
        result=NativePythonResult.objects.get();self.assertIsNone(result.data['native_values']);self.assertIsNone(result.data['comparison'])
        self.assertEqual(candidate.verification_evidence.get(kind='native_python').data['levels'],[])
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))

    def test_cancel_before_execution_and_foreign_access(self):
        _,_,_,_,record=self.prepare()
        url=f'/api/quant/{self.collection.pk}/native-python/{record.pk}/'
        self.assertEqual(self.client.get(url+'cancel/').status_code,405)
        self.assertEqual(self.client.post(url+'cancel/').status_code,200)
        with patch('quant.native_python.runtime.run',side_effect=AssertionError('cancelled source executed')):execute(NativePythonJob.objects.get().pk)
        self.assertEqual(NativePythonResult.objects.get().data['status'],'cancelled')
        self.client.force_authenticate(get_user_model().objects.create_user('native-foreign'))
        self.assertEqual(self.client.get(url).status_code,404)

    def test_unavailable_runner_makes_no_request(self):
        _,_,values,url,_=self.prepare();values['request_key']='native_python_unavail01'
        with patch('quant.native_python.runtime.probe',side_effect=RuntimeUnavailable('runner_image_unavailable')):
            self.assertEqual(self.client.post(url,values,format='json').status_code,503)
        self.assertEqual(NativePythonRequest.objects.count(),1)
        for key,value in [('unknown',1),('seconds',True),('arguments',[{'name':'x','kind':'series','column':[]}])]:
            bad=copy.deepcopy(values);bad[key]=value
            self.assertEqual(self.client.post(url,bad,format='json').status_code,400)

    def test_snapshot_rejects_changed_source_output_mapping_and_claim(self):
        _,_,_,_,record=self.prepare();self.compute(record)
        snapshot=SyncManager().build_snapshot_data()
        for change in ('output','claim','mapping'):
            bad=copy.deepcopy(snapshot)
            row=next(row for row in bad if row['model']==('quant.nativepythonrequest' if change=='mapping' else 'quant.nativepythonresult'))
            if change=='mapping':row['fields']['plan']['native']['arguments'][0]['column']='open'
            elif change=='output':row['fields']['data']['native_values'][-1]+=.1
            else:row['fields']['data']['independent_validation']=True
            row['fields']['content_hash']=digest(row['fields'].get('data',row['fields'].get('plan')))
            with self.assertRaises(SyncError):validate(bad,metadata(bad))

    def test_automatic_ai_report_binds_computed_verdict_and_no_financial_metrics(self):
        _,_,_,_,record=self.prepare(analyze=True);self.compute(record)
        result=NativePythonResult.objects.get();job=NativePythonJob.objects.get()
        automatic(result.pk,job.lease_token);automatic(result.pk,job.lease_token)
        source=SourceRevision.objects.get(payload__feedback_version=4);run=AIRun.objects.get(source=source)
        from quant.feedback.evidence import for_run
        from quant.native_reviews.contracts import acknowledgment
        context=for_run(run);value=response()
        value.update(title='原始函数一致性解读',summary='仅本次样本一致',reported_parameters=[],reported_metrics=[],counter_evidence=[],
            native_review={'verdict':'pass','actual_parameters':{'N':20},'interpretation':'本次逐行一致','parameter_assessment':'N=20为本次配置，不是最优参数',
                'limitations':['未验证其他区间或收益']})
        value['native_review_version']=2;value['native_review'].update(acknowledgment(context['native_check']))
        with patch('quant.worker.complete',side_effect=[json.dumps(value),json.dumps({'decision':'accept','issues':[],'analysis':None})]):execute_ai(run.pk)
        run.refresh_from_db();self.assertEqual(run.status,'completed',run.error)
        self.assertEqual(run.result['native_review']['verdict'],'pass')
        from quant.feedback.contracts import markdown
        self.assertIn('| 候选表达式参数 | 本次实际值 |',markdown(run.result))
        legacy=copy.deepcopy(run.result);legacy.pop('native_markdown_version');legacy.pop('native_review_gate');legacy['native_review_version']=1
        for key in ('comparison_roles','comparison_rule','native_result_id'):legacy['native_review'].pop(key)
        self.assertNotIn('native_markdown_version',validate_analysis(legacy,for_source(source)))
        self.assertIn('"实际参数": {',markdown(legacy))
        wrong=copy.deepcopy(run.result);wrong['native_review_facts']['parameters']['N']=1
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):validate_analysis(wrong,context)
        self.assertEqual(SourceRevision.objects.filter(payload__feedback_version=4).count(),1)
        bad=copy.deepcopy(value);bad['native_review']['verdict']='fail'
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):validate_analysis(bad,context,model_output=True)
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))

    def test_command_has_no_mounts_network_or_host_env(self):
        args=command(environment()['image_id'],'odoc-native-'+'a'*32,'b'*32)
        for forbidden in ('--volume','-v','--mount','--privileged','--env','--network=host'):
            self.assertNotIn(forbidden,args)
        self.assertIn('--network=none',args);self.assertIn('--read-only',args);self.assertIn('--log-driver=none',args)

    def test_revoked_entry_stops_without_publishing_or_creating_ai(self):
        candidate,_,_,_,record=self.prepare(analyze=True)
        def revoked(payload,environment,check):
            entry=candidate.report.entry;entry.is_valid=False;entry.save(update_fields=['is_valid'])
            check();raise AssertionError('authority check did not stop execution')
        with patch('quant.native_python.runtime.probe',return_value=environment()),patch('quant.native_python.runtime.run',side_effect=revoked):
            execute(NativePythonJob.objects.get().pk)
        self.assertFalse(NativePythonResult.objects.exists());self.assertFalse(SourceRevision.objects.filter(payload__feedback_version=4).exists())

    def test_cancellation_during_source_run_retains_cancelled_not_success(self):
        _,_,_,_,record=self.prepare(analyze=True)
        def cancelled(payload,environment,check):
            NativePythonJob.objects.update(cancel_requested=True);check();raise AssertionError('cancel not observed')
        with patch('quant.native_python.runtime.probe',return_value=environment()),patch('quant.native_python.runtime.run',side_effect=cancelled):
            execute(NativePythonJob.objects.get().pk)
        self.assertEqual(NativePythonResult.objects.get().data['status'],'cancelled')
        self.assertFalse(SourceRevision.objects.filter(payload__feedback_version=4).exists())

    def test_syntax_hints_and_file_hashes_do_not_evaluate_default_expressions(self):
        from quant.native_python.contracts import signature_hints,source_files,arguments
        from rest_framework.exceptions import ValidationError
        text='def example(close, N=forbidden_network_call()): return close\n'
        hints=signature_hints(text);self.assertEqual(hints[0]['arguments'][1]['default_text'],'forbidden_network_call()')
        files=source_files({'language':'python','code':text});self.assertEqual(files[0]['text'],text)
        with self.assertRaises(ValidationError):arguments([{'name':'N','kind':'parameter','parameter':'missing'}],{})
        with self.assertRaises(ValidationError):source_files({'language':'python','code':text,'provenance':'source_supplement','files':[
            {'name':'../escape.py','code':text,'role':'primary'}]})

    def test_python_functions_named_like_pine_are_detected_before_call_hints(self):
        from quant.research.intake import detect_language
        for name in ('indicator','strategy','study'):
            self.assertEqual(detect_language(f'def {name}(close, period=14):\n    return close'),'python')
        self.assertEqual(detect_language('//@version=2\nstrategy("sample")'),'pine')
        self.assertEqual(detect_language('indicator("sample", overlay=true)'),'pine')
        self.assertEqual(detect_language('#property indicator_chart_window\nint OnCalculate(){return 0;}'),'mql4')

    def test_native_report_http_projection_preserves_literal_parameter_names(self):
        from quant.feedback.execution import analysis_presentation
        from djangorestframework_camel_case.util import camelize
        raw={'native_review':{'actual_parameters':{'fast_window':21}},'native_review_facts':{'parameters':{'fast_window':21},'bindings':{'price_input':'close'}}}
        value=camelize(analysis_presentation(raw))
        self.assertEqual(value['nativeReview']['actualParameters'],[{'name':'fast_window','value':21}])
        self.assertEqual(json.loads(value['computedNativeJson']),raw['native_review_facts'])
