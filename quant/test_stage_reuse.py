"""A real source edit skips only a model stage whose actual input is unchanged."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase,SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.workflows import snippets
from quant.workflows.contracts import normalized,validate_output,input_snapshot
from quant.workflows.stage_reuse import request,compatible,revalidate
from quant.workflows.repair_material import context as material_context
from quant.source_changes.python_bundle import analyze_source
from quant import test_research_analysis as fixtures
from quant.test_factors import extracted
from quant.test_component_research import answer as component_answer


def factor_result():
    value=extracted();factor=value['factors'][0]
    factor.update(formula='x*N',summary='按声明参数缩放输入',dependencies=[],expression=None,
        evidence=[{'field':'code','quote':'def factor(x): return x*N'}])
    return value


def repair_result():
    from quant.repairs.contracts import original_definition
    definition=original_definition(factor_result()['factors'][0])
    definition['expression']={'op':'mul','args':[{'op':'input','name':'close'},{'op':'parameter','name':'N'}]}
    return {'items':[{'factor_index':0,'status':'revised','summary':'人工修订响应：补齐声明缩放表达式，未运行原平台。',
        'definition':definition,'evidence':[{'field':'code','quote':'def factor(x): return x*N'}],
        'remaining_unknowns':['输入序列映射及平台语义仍待验证。']}]}


class StageInputTests(SimpleTestCase):
    def inputs(self,code='N=20\ndef factor(x): return x*N\ndef independent(x): return x+1\n'):
        from quant.taxonomy.builtins import catalog
        from quant.taxonomy.contracts import reference
        # Supplied immutable vocabulary; no DB or model call.
        vocabulary=catalog()
        source={'code':code,'language':'python'}
        from quant.workflows.contracts import normalized
        normalized_source=normalized('s',source,28,reference(vocabulary))
        plan=snippets.plan(source,analyze_source(source),'',{},version=4)
        outputs={'normalize':normalized_source,'extract':factor_result()}
        from quant.parameters.bindings import bind
        parameters=outputs['extract']['factors'][0]['parameters']
        outputs['extract']['factors'][0]['parameters']=bind(parameters,parameters,normalized_source['parameter_inventory'])
        outputs['snippets']=snippets.assemble(component_answer(source,plan),source,plan)
        return source,outputs,plan,vocabulary

    def test_actual_request_stays_identical_for_unrelated_change_and_differs_for_dependency(self):
        first,outputs,plan,vocab=self.inputs()
        before=copy.deepcopy((first,outputs,plan,vocab))
        old,text,_=request('repair',first,'',outputs,28,plan,vocab)
        self.assertEqual((first,outputs,plan,vocab),before)
        second,other,next_plan,vocab=self.inputs(first['code'].replace('x+1','x+2'))
        changed,other_text,_=request('repair',second,'',other,28,next_plan,vocab)
        self.assertEqual(old,changed);self.assertEqual(text,other_text)
        self.assertNotIn('def independent',text);self.assertIn('N=20',text)
        third,other,next_plan,vocab=self.inputs(first['code'].replace('x*N','x*N+1'))
        changed,_,_=request('repair',third,'',other,28,next_plan,vocab)
        self.assertNotEqual(old,changed)
        self.assertEqual(old['prompt_hash'],digest(text))

    def test_missing_ambiguous_and_dynamic_dependencies_retain_full_source(self):
        for code in ('N=20\ndef factor(x): return x*N\ndef independent(x): return x+1\nprint(N)\n',
            'N=20\ndef factor(x): return x*N\ndef independent(x): return unknown(x)\n'):
            source,outputs,plan,vocab=self.inputs(code)
            value,text,_=request('repair',source,'',outputs,28,plan,vocab)
            self.assertEqual(value['material_scope']['mode'],'complete_source')
            self.assertIn('def independent',text)
        source,outputs,plan,vocab=self.inputs()
        outputs['extract']['factors'][0]['dependencies']=['未提供的外部库']
        self.assertEqual(request('repair',source,'',outputs,28,plan,vocab)[0]['material_scope']['mode'],'complete_source')

    def test_model_config_and_contract_are_required_and_unseen_quote_is_not_reused(self):
        source,outputs,plan,vocab=self.inputs()
        contract,_,_=request('repair',source,'',outputs,28,plan,vocab)
        old={'version':28,'stage':'repair','model':{'id':'model1'},'model_input':contract}
        self.assertTrue(compatible(old,copy.deepcopy(old)))
        self.assertFalse(compatible(old,{**old,'version':27}))
        self.assertFalse(compatible(old,{**old,'model':{'id':'other'}}))
        bad=repair_result();bad['items'][0]['evidence'][0]['quote']='def independent(x): return x+1'
        from quant.workflows.repair_material import validate_evidence
        with self.assertRaisesRegex(ValidationError,'未提供源码'):validate_evidence(bad,source,outputs,plan)

    def test_blocked_context_and_legacy_versions_never_claim_model_input_reuse(self):
        source,outputs,plan,vocab=self.inputs()
        self.assertEqual(request('repair',source,'',outputs,27,plan,vocab),(None,None,None))
        with patch('quant.workflows.prompts.prompt',side_effect=ValidationError('输入超过上限')):
            contract,text,error=request('repair',source,'',outputs,28,plan,vocab)
        self.assertEqual(contract['status'],'blocked');self.assertIsNone(text);self.assertIsInstance(error,ValidationError)
        row={'version':28,'stage':'repair','model':{},'model_input':contract}
        self.assertFalse(compatible(row,row))


class StageReuseAPITests(TestCase):
    setUp=fixtures.AnalysisTests.setUp
    from quant.test_incremental_workflows import IncrementalWorkflowTests as Fixture
    start=Fixture.start
    version=Fixture.version

    def seed(self):
        from quant.models import Entry,SourceRevision
        self.entry=Entry.objects.create(anthology=self.collection,title='修订阶段依赖')
        self.base=f'/api/quant/{self.collection.pk}/entries/{self.entry.pk}/'
        self.code='N=20\ndef factor(x): return x*N\ndef independent(x): return x+1\n'
        response=self.client.post(self.base+'implementations/',{'name':'Python','language':'python','code':self.code},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.implementation_id=response.data['data']['id']
        source=SourceRevision.objects.get(material__entry=self.entry)
        old=self.start(source,'stage_reuse_baseline01');self.finish(old)
        return old

    def finish(self,run):
        from quant.worker import execute
        def artificial(_config,text,**kwargs):
            if '量化源码组件分析员' in text:
                step=run.workflow_steps.get(stage='snippets')
                return json.dumps(component_answer(run.source.payload,step.input['snippet_plan']))
            context=json.loads(text.split('\n材料：',1)[1])
            value=repair_result() if '“修订候选定义”' in text else factor_result()
            default='30' if 'N=30' in run.source.payload['code'] else '20'
            for parameter in value.get('parameters',[]):
                parameter.update(default_value=default,evidence='N='+default)
            for item in value.get('items',[]):
                for parameter in (item.get('definition') or {}).get('parameters',[]):
                    parameter.update(default_value=default,evidence='N='+default)
            if 'source_change_review_facts' in context:
                from quant.test_source_change_review import artificial_review
                value.update(artificial_review(context['source_change_review_facts']))
            return json.dumps(value)
        from quant.workflows.runner import execute as stages
        errors=[]
        def checked(*args,**kwargs):
            try:return stages(*args,**kwargs)
            except Exception as exc:errors.append(str(exc));raise
        with patch('quant.worker.complete',side_effect=artificial) as model,patch('quant.workflows.runner.execute',side_effect=checked):execute(run.pk)
        run.refresh_from_db();self.assertEqual(run.status,'completed',str(errors) or run.error)
        return model

    def chain(self):
        old=self.seed()
        second_source=self.version(self.code.replace('x+1','x+2'))
        second=self.start(second_source,'stage_reuse_first001',old);self.finish(second)
        third_source=self.version(self.code.replace('x+1','x+3'))
        third=self.start(third_source,'stage_reuse_second01',second);calls=self.finish(third)
        return old,second,third,calls

    def test_real_edit_reuses_repair_and_rebinds_current_source_while_global_stages_run(self):
        from quant.models import ResearchReport,Job
        from quant.sync import metadata,validate,reset_execution
        from utils.sync_manager import SyncManager
        old,second,third,calls=self.chain()
        self.assertEqual(third.workflow_version,28)
        step=third.workflow_steps.get(stage='repair');prior=second.workflow_steps.get(stage='repair')
        self.assertNotEqual(step.input['source_hash'],prior.input['source_hash'])
        self.assertEqual(step.input['model_input'],prior.input['model_input'])
        self.assertEqual(step.outcome.data['reused_from'],prior.outcome.pk)
        self.assertNotEqual(step.outcome.data['output'],prior.outcome.data['output'])
        origin=step.outcome.data['output']['items'][0]['definition']['parameters'][0]['source_binding']
        self.assertEqual(origin['source_hash'],third.source.content_hash)
        self.assertTrue(all(not row.outcome.data['reused_from'] for row in third.workflow_steps.filter(stage__in=('parameters','research','extract','review','plan')).select_related('outcome')))
        self.assertFalse(any('“修订候选定义”' in call.args[1] for call in calls.call_args_list))
        self.assertEqual(calls.call_count,7)
        wire=self.client.get(self.base+f'runs/{third.pk}/workflow/repair/').json()['data']
        self.__class__.wire=wire
        self.assertEqual(json.loads(wire['modelInputJson'])['material_scope']['mode'],'provided_declaration_closure')
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot));reset_execution()
        with patch('quant.worker.dispatch') as dispatch:SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        dispatch.assert_not_called();self.assertFalse(Job.objects.exists())
        self.assertEqual(ResearchReport.objects.filter(run__in=(old,second,third)).count(),3)

    def test_new_device_rebuilds_hash_scope_and_rebound_output_not_only_outer_digests(self):
        from quant.models import WorkflowStep
        from quant.sync import metadata,validate
        from utils.sync_manager import SyncManager,SyncError
        _,_,third,_=self.chain()
        step=third.workflow_steps.get(stage='repair');snapshot=SyncManager().build_snapshot_data()
        WorkflowStep.objects.all().delete();validate(snapshot,metadata(snapshot))
        for mutate in ('fingerprint','scope','output'):
            bad=copy.deepcopy(snapshot)
            row=next(item['fields'] for item in bad if item['model']=='quant.workflowstep' and item['pk']==step.pk)
            if mutate=='fingerprint':row['input']['model_input']['prompt_hash']='f'*64
            elif mutate=='scope':row['input']['model_input']['material_scope']['parts'].pop()
            else:
                outcome=next(item['fields'] for item in bad if item['model']=='quant.workflowoutcome' and item['fields']['step']==step.pk)
                outcome['data']['output']['items'][0]['summary']='伪造历史意见'
                outcome['content_hash']=digest(outcome['data'])
            row['content_hash']=digest(row['input'])
            with self.assertRaises(SyncError):validate(bad,metadata(bad))

    def test_related_default_and_model_changes_force_new_repair_and_explicit_restart_is_honored(self):
        from quant.sync import metadata,validate
        from utils.sync_manager import SyncManager
        _,_,third,_=self.chain()
        source=self.version(self.code.replace('N=20','N=30').replace('x+1','x+3'))
        changed=self.start(source,'stage_reuse_default1',third);calls=self.finish(changed)
        self.assertTrue(any('“修订候选定义”' in call.args[1] for call in calls.call_args_list))
        self.assertFalse(changed.workflow_steps.get(stage='repair').outcome.data['reused_from'])
        again=self.start(source,'stage_reuse_restart1',changed,restart_stage='repair')
        self.assertEqual(self.finish(again).call_count,3)
        self.assertEqual(again.workflow_steps.get(stage='repair').input['model_input'],changed.workflow_steps.get(stage='repair').input['model_input'])
        self.assertFalse(again.workflow_steps.get(stage='repair').outcome.data['reused_from'])
        from system_settings.models import AIModel
        other=AIModel.objects.create(provider=self.model.provider,name='fake-different-model',type='chat')
        next_source=self.version(self.code.replace('N=20','N=30').replace('x+1','x+4'))
        next_run=self.start(next_source,'stage_reuse_newmodel',changed,model_id=other.pk)
        calls=self.finish(next_run)
        self.assertTrue(any('“修订候选定义”' in call.args[1] for call in calls.call_args_list))
        self.assertFalse(next_run.workflow_steps.get(stage='repair').outcome.data['reused_from'])
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))

    def test_failed_current_revalidation_uses_fresh_model_path_instead_of_copying_old_snapshot(self):
        from quant.workflows.stage_reuse import revalidate as real_check
        from quant.sync import metadata,validate
        from utils.sync_manager import SyncManager
        _,_,third,_=self.chain()
        source=self.version(self.code.replace('x+1','x+4'))
        current=self.start(source,'stage_reuse_checkfail',third)
        def reject(stage,*args,**kwargs):
            if stage=='repair':raise ValidationError('当前依据未通过，不接受旧意见')
            return real_check(stage,*args,**kwargs)
        with patch('quant.workflows.stage_reuse.revalidate',side_effect=reject):calls=self.finish(current)
        self.assertTrue(any('“修订候选定义”' in call.args[1] for call in calls.call_args_list))
        self.assertFalse(current.workflow_steps.get(stage='repair').outcome.data['reused_from'])
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
