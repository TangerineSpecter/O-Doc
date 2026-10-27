"""Complete evidence survives prompt sharing; old requests remain byte exact."""
import copy
import json
from pathlib import Path
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.experiments.context_encoding import VERSION, encode, decode, dumps
from quant.experiments.review_contract import review_prompt,validate_review


class ContextEncodingTests(SimpleTestCase):
    def captured(self):
        return json.loads((Path(__file__).resolve().parent.parent/'docs/quant/验收记录/2026-10-26-window-review-input.json').read_text())

    def test_captured_input_shares_exact_facts_without_losing_any_window_failure_or_parameter(self):
        original=self.captured()['evidence'];canonical={**copy.deepcopy(original),'model_context_encoding':VERSION}
        before=copy.deepcopy(canonical);packed=encode(canonical)
        self.assertEqual(decode(packed),canonical)
        self.assertEqual(canonical,before)
        self.assertEqual(len(packed['exact_facts']),97)
        self.assertLess(len(dumps(packed)),len(dumps(canonical)))
        restored=decode(packed)
        self.assertEqual(len([key for key in restored['evidence'] if key.startswith('temporal_window:')]),9)
        self.assertEqual(len([key for key in restored['evidence'] if key.startswith('attempt-')]),16)
        self.assertEqual(restored['evidence']['reuse'],original['evidence']['reuse'])
        self.assertEqual(restored['evidence']['temporal_parameter_stability']['status'],'no_supported_region')
        restored['evidence']['attempt-1']['requested_parameters']['period']=999
        self.assertEqual(decode(packed),before)
        from quant.acceptance.context_encoding_replay import replay
        with patch('utils.bounded_completion.complete',side_effect=AssertionError('offline benchmark')):
            summary=replay(Path(__file__).resolve().parent.parent/'docs/quant/验收记录')
        self.assertEqual((summary['retained_attempts'],summary['retained_planned_windows']),(16,9))
        self.assertEqual(summary['new_provider_calls'],0)
        self.assertFalse(summary['token_saving_measured'])

    def test_numeric_types_unknown_empty_failed_and_reserved_user_data_are_lossless(self):
        literal={'$fact':'value:1'}
        values={'zero':0,'float_zero':0.0,'negative_zero':-0.0,'false':False,'missing':None,'empty':[],
            'literal':[literal,{'$literal':literal},{'$literal':{'$fact':'not-real'}}],
            'repeated':[{'status':'failed','reason':'原始失败理由'*80,'parameters':{'BBmult':2,'RSILength':14}},
                {'status':'failed','reason':'原始失败理由'*80,'parameters':{'BBmult':2,'RSILength':14}}]}
        restored=decode(encode(values))
        self.assertEqual(digest(restored),digest(values))
        self.assertIs(type(restored['false']),bool)
        self.assertIs(type(restored['zero']),int)
        self.assertIs(type(restored['float_zero']),float)
        self.assertEqual(decode(encode({'user':literal})),{'user':literal})
        self.assertEqual(encode({'small':[0,None,False]})['exact_facts'],{})

    def test_key_order_is_not_a_prompt_dependency_but_array_order_is(self):
        canonical={**self.captured()['evidence'],'model_context_encoding':VERSION}
        reordered=json.loads(json.dumps(canonical,ensure_ascii=False,sort_keys=True))
        self.assertEqual(encode(canonical),encode(reordered))
        self.assertEqual(review_prompt(canonical,''),review_prompt(reordered,''))
        changed=copy.deepcopy(canonical);changed['planning_options'].reverse()
        if len(changed['planning_options'])>1:self.assertNotEqual(encode(canonical),encode(changed))
        self.assertNotEqual(encode({'values':[0,1]}),encode({'values':[1,0]}))

    def test_legacy_real_prompt_is_exact_and_new_prompt_has_same_canonical_evidence(self):
        capture=self.captured();original=capture['evidence']
        self.assertEqual(review_prompt(original,capture['requirements']),capture['prompt'])
        canonical={**original,'model_context_encoding':VERSION}
        text=review_prompt(canonical,capture['requirements'])
        packed=json.loads(text.split('\n实验依据：',1)[1].split('\n补充关注：',1)[0])
        self.assertEqual(decode(packed),canonical)
        refs=json.loads(text.split('\n可用证据引用键（仅从中逐字选择）：',1)[1].split('\n输出结构：',1)[0])
        self.assertEqual(set(refs),{key for key,value in original['evidence'].items() if value is not None})
        self.assertLess(len(text),len(capture['prompt'])*.75)
        from quant.test_experiment_reviews import response
        answer=response(canonical);answer['findings'][0]['evidence_refs']=[next(iter(packed['exact_facts']))]
        with self.assertRaises(ValidationError):validate_review(answer,canonical)
        with self.assertRaises(ValidationError):review_prompt({**original,'model_context_encoding':'unsupported'},'')

    def test_bad_hash_unknown_unused_or_cyclic_references_are_rejected(self):
        block={'value':'原始证据'*100};good=encode({'a':block,'b':block})
        for mode in ('hash','dangling','cycle','unused','version','literal','fields'):
            with self.subTest(mode=mode):
                bad=copy.deepcopy(good);identity=next(iter(bad['exact_facts']))
                if mode=='hash':bad['canonical_hash']='0'*64
                elif mode=='dangling':bad['context']['a']={'$fact':'value:2048'}
                elif mode=='cycle':bad['exact_facts'][identity]={'$fact':identity}
                elif mode=='unused':bad['exact_facts']['value:2048']={'unrelated':'must not ride along'}
                elif mode=='version':bad['encoding']='unknown'
                elif mode=='literal':bad['context']['a']={'$literal':5}
                else:bad['extra']='not part of the frozen input'
                with self.assertRaises(ValidationError):decode(bad)

    def test_decompression_is_bounded_before_materializing_large_expansion(self):
        packed={'encoding':VERSION,'context':{'rows':[{'$fact':'value:1'}]*1000},
            'exact_facts':{'value:1':{'text':'x'*2000}},'canonical_hash':'0'*64}
        with self.assertRaisesMessage(ValidationError,'字符上限'):decode(packed)
        for value in ({'x':'x'*160001},{'x':float('nan')},{'x':(1,2)},{True:'bad key'},{'x':'\ud800'}):
            with self.subTest(value_type=type(value)),self.assertRaises(ValidationError):encode(value)
        deep={'leaf':1}
        for _ in range(90):deep={'child':deep}
        with self.assertRaises(ValidationError):encode(deep)

    def test_new_window_parameter_pairs_are_deterministic_without_changing_legacy_order(self):
        from quant.experiments.window_review import project
        from quant.test_window_review import WindowReviewTests
        sample=WindowReviewTests();sample.setUp()
        plan,attempts=copy.deepcopy(sample.plan),copy.deepcopy(sample.attempts)
        plan['seeds'][0]['parameters']={'RSILength':14,'BBmult':2}
        attempts[0]['recipe']['parameters']={'p0':14,'p1':2}
        attempts[0]['recipe']['parameter_names']={'p0':'RSILength','p1':'BBmult'}
        sorted_plan=json.loads(json.dumps(plan,sort_keys=True));sorted_attempts=json.loads(json.dumps(attempts,sort_keys=True))
        value=project(plan,sample.snapshot,attempts,canonical_pairs=True)
        self.assertEqual(value,project(sorted_plan,sample.snapshot,sorted_attempts,canonical_pairs=True))
        baseline=value['temporal_window:1:1']['baselines'][0]
        self.assertEqual([row['name'] for row in baseline['effective_parameters']],['BBmult','RSILength'])
        old=project(plan,sample.snapshot,attempts)['temporal_window:1:1']['baselines'][0]
        self.assertEqual([row['name'] for row in old['planned_parameters']],['RSILength','BBmult'])


class EncodedReviewIntegrationTests(TestCase):
    from quant.test_nested_validation import NestedIntegrationTests as setup
    setUp,collect,publish,prepare,start=setup.setUp,setup.collect,setup.publish,setup.prepare,setup.start

    def test_worker_sends_encoded_complete_input_but_validates_and_syncs_canonical_facts(self):
        from quant.test_nested_validation import CONFIG
        from quant.experiments.worker import execute as calculate
        from quant.experiments.reviews import start_review
        from quant.experiments.review_evidence import for_run,for_result
        from quant.test_experiment_reviews import response
        from quant.worker import execute
        from quant.sync import metadata,validate
        from quant.models import Job,ExperimentJob
        from utils.sync_manager import SyncManager,SyncError
        self.prepare();self.input['config']=copy.deepcopy(CONFIG)
        request=self.start()
        with patch('quant.experiments.reviews.auto_review'):calculate(request.job.pk)
        run=start_review(request.result,request_key='encoded_review_api_test01',model_id=self.model.pk)
        self.assertEqual(run.review_version,15)
        evidence=for_run(run);self.assertEqual(evidence['model_context_encoding'],VERSION)
        calls=[]
        def complete(config,text,**kwargs):
            packed=json.loads(text.split('\n实验依据：',1)[1].split('\n补充关注：',1)[0]);calls.append(packed)
            self.assertEqual(decode(packed),evidence)
            return json.dumps(response(decode(packed)))
        with patch('quant.worker.complete',side_effect=complete):execute(run.pk)
        run.refresh_from_db();self.assertEqual(run.status,'completed',run.error)
        self.assertEqual(len(calls),1)
        self.assertEqual(run.result['evidence_hash'],digest(evidence))
        self.assertNotIn('model_context_encoding',run.result)
        self.assertEqual(len(run.result['temporal_parameter_review']['window_reviews']),9)
        with self.assertRaises(ValidationError): for_result(request.result,13,run.planning_context)
        old=for_result(request.result,13,{**run.planning_context, 'method': 'related-library-v1'})
        self.assertNotIn('model_context_encoding',old)
        manager=SyncManager();snapshot=manager.build_snapshot_data();validate(snapshot,metadata(snapshot))
        snapshot=json.loads(json.dumps(snapshot,sort_keys=True))
        validate(snapshot,metadata(snapshot))
        with patch('quant.worker.dispatch') as dispatch,patch('quant.experiments.worker.run_batch') as search:
            manager.apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        dispatch.assert_not_called();search.assert_not_called()
        self.assertFalse(Job.objects.exists());self.assertFalse(ExperimentJob.objects.exists())
        run.refresh_from_db();self.assertEqual(for_run(run),evidence)
        self.assertEqual(review_prompt(for_run(run),run.requirements),review_prompt(evidence,run.requirements))
        bad=copy.deepcopy(snapshot)
        next(row['fields'] for row in bad if row['model']=='quant.airun' and row['pk']==run.pk)['review_version']=13
        with self.assertRaises((ValidationError,SyncError)):validate(bad,metadata(bad))
