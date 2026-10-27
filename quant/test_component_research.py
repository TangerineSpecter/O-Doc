"""Dependency edits invalidate the right AI component inputs, without a model."""
import copy
import json
from django.test import SimpleTestCase, TestCase
from unittest.mock import patch
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.source_changes.python_bundle import analyze_source
from quant.workflows import snippets


def answer(payload, plan):
    rows = []
    for unit in plan['units']:
        if unit['reused_from']:
            continue
        text = snippets.texts(payload, plan)[unit['input_hash']]
        line = unit['component']['parts'][0]['relative_start_line']
        rows.append({'input_hash': unit['input_hash'], 'observations': [{'quote': text.splitlines()[line - 1],
            'start_line': line, 'end_line': line, 'reading': '人工响应：仅按给定声明与依赖说明计算。'}],
            'unknowns': ['未执行源码或证明运行时依赖。']})
    return {'units': rows}


class ComponentResearchTests(SimpleTestCase):
    code = 'N=20\nM=N*2\ndef linked(x):\n    return x*M\ndef independent(x):\n    return x+1\n'

    def make(self, code=None, baseline=None, **changes):
        source = {'language': 'python', 'code': self.code if code is None else code, **changes}
        plan = snippets.plan(source, analyze_source(source), '检查依赖', {'model_id': 'fake'}, baseline, version=4)
        return source, plan

    def baseline(self, source, plan):
        return {'run_id': 'old', 'source_id': 'source-old', 'source_hash': digest(source),
            'outcome_id': 'old-component-outcome', 'payload': source, 'analysis': {},
            'output': snippets.assemble(answer(source, plan), source, plan)}

    def test_transitive_value_chain_changes_only_dependent_components(self):
        source, plan = self.make()
        old = self.baseline(source, plan)
        target, changed = self.make(self.code.replace('N=20', 'N=30'), old)
        rows = {unit['component']['name'].split('::')[-1]: unit for unit in changed['units']}
        self.assertTrue(rows['independent']['reused_from'])
        for name in ('N', 'M', 'linked'):
            self.assertFalse(rows[name]['reused_from'])
        linked_text = snippets.texts(target, changed)[rows['linked']['input_hash']]
        self.assertIn('N=30', linked_text)
        self.assertIn('M=N*2', linked_text)
        self.assertIn('return x*M', linked_text)
        self.assertNotIn('independent', linked_text)
        output = snippets.assemble(answer(target, changed), target, changed, old)
        self.assertEqual(output['version'], 2)
        snippets.validate_output(output, target, changed, old)
        self.assertEqual(old['output']['units'][-1], output['units'][-1])

    def test_line_moves_reuse_opinions_and_remap_every_dependency_quote(self):
        source, plan = self.make(); old = self.baseline(source, plan)
        target, changed = self.make('\n\n'+self.code, old)
        self.assertTrue(all(unit['reused_from'] for unit in changed['units']))
        for before, after in zip(plan['units'], changed['units']):
            self.assertEqual(after['locations'][0]['start_line'], before['locations'][0]['start_line']+2)
            self.assertEqual(after['component']['parts'][0]['start_line'], before['component']['parts'][0]['start_line']+2)
        result = snippets.assemble({'units': []}, target, changed, old)
        self.assertEqual(result, old['output'])
        # Absolute source positions must not leak into the model's reusable
        # input either. Compare fresh prompts, before reuse removes units.
        _, moved = self.make('\n\n'+self.code)
        before=json.loads(snippets.prompt(source,plan,'检查依赖').split('材料：',1)[1])
        after=json.loads(snippets.prompt(target,moved,'检查依赖').split('材料：',1)[1])
        self.assertEqual(before,after)

    def test_provided_file_import_dependencies_and_nested_scopes_remain_separate(self):
        from quant.test_python_file_bundle import bundle
        # Imported literal declarations, not imports from the host environment.
        source=bundle('from dep import M\ndef factor(x): return x*M\n',{'dep.py':'N=20\nM=N*2\n'})
        plan=snippets.plan(source,analyze_source(source),'检查依赖',{'model_id':'fake'},version=4)
        old=self.baseline(source,plan)
        target=bundle('from dep import M\ndef factor(x): return x*M\n',{'dep.py':'N=30\nM=N*2\n'})
        changed=snippets.plan(target,analyze_source(target),'检查依赖',{'model_id':'fake'},old,version=4)
        root=next(row for row in changed['units'] if row['component']['name'].endswith('::factor'))
        self.assertFalse(root['reused_from'])
        self.assertIn('N=30',snippets.texts(target,changed)[root['input_hash']])
        self.assertEqual(root['component']['mode'],'static_declared_dependencies')
        payload, scoped=self.make('N=20\ndef first(N): return N+1\ndef second(x): return x*N\n')
        prior=self.baseline(payload,scoped)
        _, new=self.make('N=30\ndef first(N): return N+1\ndef second(x): return x*N\n',prior)
        units={unit['component']['name'].split('::')[-1]:unit for unit in new['units']}
        self.assertTrue(units['first']['reused_from']);self.assertFalse(units['second']['reused_from'])

    def test_unresolved_dynamic_effectful_or_other_language_recompute_all(self):
        samples = [('python', self.code+'\ndef f(obj): return obj.method(N)\n'),
            ('python', self.code+'\nN=unknown\n'), ('python', self.code+'\nprint(N)\n'),
            ('python', self.code+'\ndef wrapper(x): return linked(x)\n'),
            ('python', self.code+'\nx=[1]\nx[0]=N\n'), ('python', self.code+'\n@decorator\ndef f(x): return x\n'),
            ('pine', '//@version=5\nN=20\nplot(close)\n'), ('mql4', 'input int N=20;\nvoid OnTick(){Print(N);}\n')]
        for language, code in samples:
            with self.subTest(language=language, code=code[-50:]):
                source, plan = self.make(code, language=language); old = self.baseline(source, plan)
                _, changed = self.make(code.replace('20', '30'), old, language=language)
                self.assertTrue(changed['units'])
                self.assertTrue(all(unit['component']['mode'] == 'whole_source_invalidation' for unit in changed['units']))
                self.assertFalse(any(unit['reused_from'] for unit in changed['units']))

    def test_model_context_contract_old_plan_and_input_changes_do_not_cross_reuse(self):
        source, plan = self.make(); old = self.baseline(source, plan)
        for context in ({'parameters': 'N=2'}, {'platform': 'other'}, {'dependencies': 'other'}):
            _, changed = self.make(baseline=old, **context)
            self.assertFalse(any(unit['reused_from'] for unit in changed['units']))
        changed = snippets.plan(source, analyze_source(source), '不同关注', {'model_id':'fake'}, old, version=4)
        self.assertFalse(any(unit['reused_from'] for unit in changed['units']))
        old1 = copy.deepcopy(old); old1['output'].update(scope=snippets.SCOPE, version=1)
        _, changed = self.make(baseline=old1)
        self.assertFalse(any(unit['reused_from'] for unit in changed['units']))
        _, changed = self.make(self.code.replace('N=20','N=30'), old)
        material = json.loads(snippets.prompt(source, plan, '').split('材料：',1)[1])
        self.assertIn('component', material['units'][0])
        projected = snippets.model_context(old['output'], plan)
        self.assertIn('component', projected['units'][0])
        self.assertNotEqual(changed['scope'], snippets.SCOPE)

    def test_quote_markers_cross_parts_incomplete_and_forged_reuse_rejected(self):
        source, plan = self.make(); good = answer(source, plan)
        bad = copy.deepcopy(good)
        bad['units'][0]['observations'][0].update(quote='# COMPONENT PART', start_line=1, end_line=1)
        with self.assertRaises(ValidationError): snippets.assemble(bad, source, plan)
        bad = copy.deepcopy(good); bad['units'].pop()
        with self.assertRaises(ValidationError): snippets.assemble(bad, source, plan)
        old = self.baseline(source, plan)
        target, changed = self.make('\n'+self.code, old)
        result = snippets.assemble({'units': []}, target, changed, old)
        result['units'][0]['observations'][0]['reading'] = '伪造旧意见'
        with self.assertRaises(ValidationError): snippets.validate_output(result, target, changed, old)

    def test_budgets_duplicates_and_empty_code_preserve_unknowns(self):
        source, plan = self.make('\n'.join(f'def f{i}(x): return x+{i}' for i in range(80)))
        self.assertEqual(len(plan['units']), 48); self.assertEqual(plan['omitted'], 32)
        self.assertLessEqual(plan['selected_chars'],40000)
        source, plan = self.make('N=20\nN=20\ndef f(x): return x*N\n')
        result = snippets.assemble(answer(source, plan), source, plan)
        self.assertEqual(len({unit['input_hash'] for unit in result['units']}),len(result['units']))
        source, plan = self.make('')
        self.assertEqual(snippets.assemble({'units':[]},source,plan)['units'],[])


class ComponentWorkflowTests(TestCase):
    # Real API/worker/snapshot paths, isolated SQLite and artificial responses.
    from quant.test_incremental_workflows import IncrementalWorkflowTests as Fixture
    seed = Fixture.seed
    start = Fixture.start
    version = Fixture.version
    finish = Fixture.finish

    def setUp(self):
        from quant.test_research_analysis import AnalysisTests
        AnalysisTests.setUp(self)
        version=patch('quant.workflows.contracts.INCREMENTAL_VERSION',27)
        version.start();self.addCleanup(version.stop)
        self.payload['code'] = 'N=20\nM=N*2\ndef factor(x): return x*M\n'

    def chain(self):
        old = self.seed()
        source = self.version(self.code.replace('x * 2','x * 3'))
        second = self.start(source,'components_first_0001',old); self.finish(second)
        self.assertEqual(second.workflow_version,27)
        source = self.version(self.code.replace('x * 2','x * 3').replace('M=N*2','M=N*3'))
        third = self.start(source,'components_second_0001',second)
        calls = self.finish(third)
        return old, second, third, source, calls

    def test_live_task_dependency_reuse_full_report_and_restore_without_dispatch(self):
        from quant.models import Job, ResearchReport
        from quant.sync import metadata, validate, reset_execution
        from utils.sync_manager import SyncManager
        old, second, third, source, calls = self.chain()
        plan = third.workflow_steps.get(stage='snippets').input['snippet_plan']
        self.assertEqual(plan['version'],4)
        rows = {unit['component']['name'].split('::')[-1]:unit for unit in plan['units']}
        self.assertTrue(rows['N']['reused_from']); self.assertTrue(rows['independent']['reused_from'])
        self.assertFalse(rows['M']['reused_from']); self.assertFalse(rows['factor']['reused_from'])
        fresh = next(call.args[1] for call in calls.call_args_list if '量化源码组件分析员' in call.args[1])
        self.assertNotIn('def independent',fresh)
        self.assertIn('M=N*3',fresh); self.assertIn('N=20',fresh)
        self.assertEqual(calls.call_count,7)
        self.assertTrue(all(not step.outcome.data['reused_from'] for step in third.workflow_steps.select_related('outcome')))
        evidence = self.client.get(self.base+f'runs/{third.pk}/workflow/snippets/').json()['data']
        reading = json.loads(evidence['localReadingJson'])
        self.assertEqual(reading['scope'],'declared_dependency_components_not_runtime_semantics')
        self.assertEqual(len(reading['units']),4)
        self.__class__.wire = evidence
        self.assertEqual(ResearchReport.objects.filter(run__in=(old,second,third)).count(),3)
        snapshot = SyncManager().build_snapshot_data()
        self.assertEqual(metadata(snapshot)['quant_schema_version'],74)
        validate(snapshot,metadata(snapshot)); reset_execution()
        with patch('quant.worker.dispatch') as dispatch:
            SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        dispatch.assert_not_called(); self.assertFalse(Job.objects.exists())
        self.assertEqual(ResearchReport.objects.get(run=third).source_id,source.pk)

    def test_fresh_restore_rebuilds_dependency_and_quote_facts_against_rehashed_forgery(self):
        from quant.models import WorkflowStep
        from quant.sync import metadata,validate
        from utils.sync_manager import SyncManager,SyncError
        _,_,third,_,_ = self.chain()
        step = third.workflow_steps.get(stage='snippets')
        snapshot=SyncManager().build_snapshot_data()
        WorkflowStep.objects.all().delete()
        validate(snapshot,metadata(snapshot))
        for field in ('mode','parts'):
            bad=copy.deepcopy(snapshot)
            row=next(item['fields'] for item in bad if item['model']=='quant.workflowstep' and item['pk']==step.pk)
            unit=row['input']['snippet_plan']['units'][-1]
            if field=='mode':unit['component']['mode']='whole_source_invalidation'
            else:unit['component']['parts'][0]['start_line']+=1
            row['content_hash']=digest(row['input'])
            with self.assertRaises(SyncError):validate(bad,metadata(bad))

    def test_failed_stage_resume_and_explicit_restart_keep_component_contract(self):
        from quant.models import ResearchReport
        from quant.sync import metadata,validate
        from utils.sync_manager import SyncManager
        old=self.seed();source=self.version(self.code.replace('M=N*2','M=N*3'))
        failed=self.start(source,'components_fail_0001',old)
        self.finish(failed,fail_snippets=True)
        self.assertFalse(ResearchReport.objects.filter(run=failed).exists())
        retry=self.start(source,'components_retry_0001',failed);self.finish(retry)
        again=self.start(source,'components_restart_0001',retry,restart_stage='plan')
        self.assertEqual(self.finish(again).call_count,1)
        self.assertEqual(again.workflow_steps.get(stage='snippets').input,retry.workflow_steps.get(stage='snippets').input)
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))

    def test_cancel_and_restore_revoke_component_call_without_late_outcome(self):
        from quant.models import Job,ResearchReport,WorkflowOutcome
        from quant.worker import execute
        from quant.sync import metadata,validate,reset_execution
        from utils.sync_manager import SyncManager
        for revoke in ('cancel','restore'):
            with self.subTest(revoke=revoke):
                old=self.seed();source=self.version(self.code.replace('M=N*2','M=N*3'))
                run=self.start(source,'component_revoke_'+revoke,old)
                def late(_config,text,**kwargs):
                    self.assertIn('量化源码组件分析员',text)
                    if revoke=='cancel':Job.objects.filter(run=run).update(cancelled=True)
                    else:reset_execution()
                    plan=run.workflow_steps.get(stage='snippets').input['snippet_plan']
                    return json.dumps(answer(source.payload,plan))
                with patch('quant.worker.complete',side_effect=late):execute(run.pk)
                run.refresh_from_db()
                self.assertEqual(run.status,'cancelled' if revoke=='cancel' else 'interrupted')
                self.assertFalse(WorkflowOutcome.objects.filter(step__run=run,step__stage='snippets').exists())
                self.assertFalse(ResearchReport.objects.filter(run=run).exists())
                snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
