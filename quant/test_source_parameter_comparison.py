"""Literal declaration comparisons are source facts, never runtime or profit proof."""
import copy
import json
from unittest.mock import patch
from django.test import SimpleTestCase,TestCase
from rest_framework.exceptions import ValidationError
from quant.parameters.source_comparison import compare
from quant.parameters.comparison import compare as compare_legacy
from quant import test_execution_feedback as fixtures
from quant.feedback.evidence import for_source,for_run
from quant.feedback.execution_analysis import validate as validate_execution
from quant.models import AIRun,SourceRevision,ResearchReport,ExperimentJob,Job
from quant.worker import execute,prompt
from quant.research.contracts import digest
from quant.sync import validate,metadata
from utils.sync_manager import SyncManager,SyncError


def target(code,language):return {'id':'fixed-source','content_hash':digest(code),'payload':{'code':code,'language':language}}
def parameters(**values):return {'parameters':[{'name':key,'raw_value':str(value)} for key,value in values.items()]}


class SourceParameterTests(SimpleTestCase):
    def test_pine_inputs_named_positional_legacy_constraints_and_literals_keep_exact_locations(self):
        code='''//@version=6
N = input.int(title="N,source", defval=20, minval=1, maxval=50, step=2)
Mode = input.string("FAST", options=["FAST","SLOW"])
Enabled = input.bool(true)
Factor = input.float(2)
Old = input(6, "legacy", type=integer, minval=1)
RSIOverSold = 50 // initial source literal, not input
text = "fake = input.int(99)"
// Phantom = input.int(99)
'''
        result=compare(parameters(N=10,Mode='SLOW',Enabled='false',Factor='2',Old=6,RSIOverSold=30),target(code,'pine'))
        rows={row['name']:row for row in result['rows']}
        self.assertEqual(result['version'],2);self.assertEqual(rows['N']['status'],'different')
        self.assertEqual(rows['N']['declaration']['line'],2);self.assertIn('minval=1',rows['N']['declaration']['quote'])
        self.assertEqual(rows['Mode']['status'],'different');self.assertEqual(rows['Factor']['configured']['kind'],'float')
        self.assertEqual(rows['Factor']['status'],'same');self.assertEqual(rows['Old']['default']['value'],6)
        self.assertEqual(rows['RSIOverSold']['status'],'literal_differs')
        self.assertEqual(rows['RSIOverSold']['declaration']['binding_kind'],'module_literal')
        self.assertEqual(result['missing'],[])
        bounded=compare(parameters(N=0,Mode='OTHER'),target(code,'pine'))
        self.assertEqual([row['status'] for row in bounded['rows']],['constraint_mismatch','constraint_mismatch'])
        self.assertEqual({row['name'] for row in bounded['missing']},{'Enabled','Factor','Old'})
        # Step is an editor increment, not a proven hard grid or optimization range.
        self.assertEqual(compare(parameters(N=3),target(code,'pine'))['rows'][0]['status'],'different')

    def test_pine_multiline_comments_strings_and_transformed_or_dynamic_values(self):
        code='''//@version=6
N = input.int(
    defval=/*comment*/20,
    title="not // a comment, = x",
    minval=1)
Mode = input.string('A\\nB')
Flag = input.string("On") == "On"
Dynamic = input.int(factory())
Series = input.source(close)
N2 = input.int(2)
    + 1
'''
        result=compare(parameters(N=30,Mode='A\nB',Flag='true',Dynamic=10,Series='close',N2=3),target(code,'pine'))
        rows={row['name']:row for row in result['rows']}
        self.assertEqual(rows['N']['default']['value'],20)
        self.assertEqual(rows['Mode']['default']['value'],'A\nB')
        self.assertEqual(rows['Mode']['status'],'same')
        self.assertEqual(rows['Flag']['status'],'unresolved');self.assertEqual(rows['Dynamic']['status'],'default_unknown')
        self.assertEqual(rows['Series']['status'],'unknown_type');self.assertEqual(rows['N2']['status'],'unresolved')

    def test_python_unicode_defaults_annotations_required_and_initial_assignments_are_distinct(self):
        code='''N = 20
STATE = 0
RSIOverSold = 50
def 因子(close, /, length: int=10, *, mode="FAST", dynamic=factory(), active=False):
    return close
'''
        result=compare(parameters(N=30,length=20,mode='FAST',dynamic=3,active='false',close=1,RSIOverSold=30),target(code,'python'))
        rows={row['name']:row for row in result['rows']}
        self.assertEqual(rows['N']['status'],'literal_differs');self.assertEqual(rows['N']['declaration']['scope'],'<module>')
        self.assertEqual(rows['length']['status'],'different');self.assertEqual(rows['length']['declaration']['scope'],'因子')
        self.assertEqual(rows['length']['declaration']['quote'],'length: int=10')
        self.assertEqual(rows['mode']['status'],'same');self.assertEqual(rows['active']['status'],'same')
        self.assertEqual(rows['dynamic']['status'],'unknown_type');self.assertEqual(rows['close']['status'],'unresolved');self.assertEqual(rows['RSIOverSold']['status'],'unresolved')
        self.assertEqual(result['missing'],[])
        self.assertEqual(compare(parameters(active=0),target(code,'python'))['rows'][0]['status'],'type_mismatch')
        missing=compare(parameters(N=20),target(code,'python'))['missing']
        self.assertEqual({row['name'] for row in missing},{'length','mode','dynamic','active'})
        self.assertNotIn('STATE',{row['name'] for row in missing})

    def test_duplicate_shadowing_rewrites_and_incomplete_sources_are_not_silently_resolved(self):
        for code,language in [('N=20\nN+=1','python'),('def a(N=20): pass\ndef b(N=30): pass','python'),
                ('N=input.int(20)\nN=input.int(30)','pine'),('N=20\nN:=30','pine')]:
            with self.subTest(code=code):self.assertEqual(compare(parameters(N=20),target(code,language))['rows'][0]['status'],'ambiguous')
        for code,language in [('def broken(','python'),('N=input.int(20, defval=30)','pine'),('N=input.int(20','pine'),('/* bad','pine')]:
            result=compare(parameters(N=20),target(code,language));self.assertEqual(result['parser_status'],'unparsed')
            self.assertEqual(result['rows'][0]['status'],'unresolved')
        unknown=compare(parameters(N=20),target('N:=MA(CLOSE,N);','tongdaxin'))
        self.assertEqual(unknown['parser_status'],'unsupported');self.assertEqual(unknown['rows'][0]['status'],'unresolved')

    def test_parsers_do_not_evaluate_calls_names_or_oversize_numbers_and_limits_are_explicit(self):
        code='N = 999999999999999999999999\ndef factor(close, length=__import__("os").system("never")): pass'
        result=compare(parameters(N=1,length=10),target(code,'python'))
        self.assertTrue(all(row['default']['kind']=='unknown' for row in result['rows']))
        self.assertTrue(all(row['status']=='unknown_type' for row in result['rows']))
        for code,language in [('N=input.int(1)\n'*301,'pine'),('\n'.join(f'P{i}={i}' for i in range(301)),'python'),('x'*200001,'python')]:
            value=compare(parameters(N=20),target(code,language));self.assertEqual(value['parser_status'],'limited')
            self.assertEqual(value['rows'][0]['status'],'unresolved')

    def test_legacy_mql_comparison_stays_identical_while_new_envelope_is_versioned(self):
        source=target('input int N=20;\ninput bool Enabled=true;','mql4');value=parameters(N=10)
        old=compare_legacy(value,source);new=compare(value,source)
        self.assertEqual([{k:v for k,v in row.items() if k!='ref'} for row in new['rows']],old['rows']);self.assertEqual([{k:v for k,v in row.items() if k!='ref'} for row in new['missing']],old['missing'])
        self.assertEqual(old['version'],1);self.assertEqual(new['version'],2)
        self.assertNotIn('parser',old)
        self.assertEqual(compare(value,source)['refs'],new['refs'])
        self.assertNotEqual(compare(parameters(N=11),source)['ref'],new['ref'])


class SourceParameterFeedbackTests(TestCase):
    setUp=fixtures.ExecutionFeedbackTests.setUp
    collect=fixtures.ExecutionFeedbackTests.collect
    prepare=fixtures.ExecutionFeedbackTests.prepare
    input=fixtures.ExecutionFeedbackTests.input
    save=fixtures.ExecutionFeedbackTests.save
    finish=fixtures.ExecutionFeedbackTests.finish

    def test_new_feedback_ai_report_and_restore_freeze_pine_comparison_without_promoting_evidence(self):
        self.payload.update(language='pine',code='N=input.int(20,minval=1)\nRSIOverSold=50\nMode=input.string("FAST")')
        raw=json.loads(fixtures.document());raw['parameters'].append({'name':'RSIOverSold','value':'30','unit':'RSI points'})
        _,_,_,_,source,_=self.save(document=json.dumps(raw))
        context=for_source(source);compared=context['execution_parameter_comparison']
        self.assertEqual(source.payload['feedback_version'],5);self.assertEqual(compared['version'],2)
        self.assertEqual(compared['rows'][0]['status'],'different');self.assertEqual(compared['rows'][0]['default']['value'],20)
        self.assertEqual(compared['rows'][1]['status'],'literal_differs')
        self.assertEqual([row['name'] for row in compared['missing']],['Mode'])
        value=fixtures.analysis(context)
        bad=copy.deepcopy(value);bad['execution_assessment']['findings']=bad['execution_assessment']['findings'][:1]
        with self.assertRaises(ValidationError):validate_execution(bad,context)
        bad=copy.deepcopy(value);bad['execution_assessment']['findings'][1]['kind']='supports'
        with self.assertRaises(ValidationError):validate_execution(bad,context)
        run=self.finish(source)
        self.assertIn('module_literal',prompt(run));self.assertIn('参数语法对照：pine',run.report.markdown)
        self.assertNotIn('total_score',run.report.data)
        original=prompt(run);snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        self.assertEqual(prompt(AIRun.objects.get(pk=run.pk)),original)
        self.assertFalse(Job.objects.exists());self.assertFalse(ExperimentJob.objects.exists())
        self.preview_data={'computed':{key:context[key] for key in ('execution_summary','execution_parameter_comparison')},'assessment':run.result['execution_assessment']}

    def test_old_v3_feedback_preserves_legacy_prompt_and_report_on_restore(self):
        _,_,_,_,source,_=self.save(analyze=False)
        # Import an old immutable document rather than rewriting a published source.
        old_payload=copy.deepcopy(source.payload);old_payload['feedback_version']=3
        from quant.models import SourceMaterial
        material=SourceMaterial.objects.create(entry=source.material.entry,title='Historical v3')
        old=SourceRevision.objects.create(material=material,payload=old_payload,content_hash=digest(old_payload))
        material.current_revision_id=old.pk;material.save(update_fields=['current_revision_id'])
        context=for_source(old)
        self.assertEqual(context['execution_parameter_comparison']['version'],1)
        self.assertNotIn('parser',context['execution_parameter_comparison'])
        from quant.feedback.execution_analysis import instruction
        self.assertNotIn('参数对照v2',instruction(context))
        from quant.services import queue
        run=queue(old.material.entry,{'kind':'feedback_review','source_id':old.pk,'request_key':'old_v3_parameter_contract_01'})
        with patch('quant.worker.complete',return_value=json.dumps(fixtures.analysis(for_run(run)))):execute(run.pk)
        run.refresh_from_db();self.assertEqual(run.status,'completed',run.error)
        original=prompt(run);snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        self.assertEqual(prompt(AIRun.objects.get(pk=run.pk)),original)
        self.assertNotIn('参数语法对照',ResearchReport.objects.get(run_id=run.pk).markdown)

    def test_bool_numeric_or_changed_default_cannot_forge_system_comparison(self):
        self.payload.update(language='python',code='def factor(close,N=1): return close')
        _,_,_,_,source,_=self.save()
        context=for_source(source);value=fixtures.analysis(context)
        good=validate_execution(value,context)
        self.assertEqual(good['execution_parameter_comparison']['rows'][0]['default']['value'],1)
        for bad in (True,99):
            forged=copy.deepcopy(good);forged['execution_parameter_comparison']['rows'][0]['default']['value']=bad
            with self.assertRaises(ValidationError):validate_execution(forged,context)
        run=self.finish(source)
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        forged=copy.deepcopy(snapshot)
        fields=next(row['fields'] for row in forged if row['model']=='quant.airun' and row['pk']==run.pk)
        fields['result']['execution_parameter_comparison']['rows'][0]['default']['value']=True
        from quant.feedback.contracts import markdown
        report=next(row['fields'] for row in forged if row['model']=='quant.researchreport' and row['fields']['run']==run.pk)
        report.update(data=copy.deepcopy(fields['result']),markdown=markdown(fields['result']))
        report['content_hash']=digest({'schema_version':5,'data':report['data'],'markdown':report['markdown']})
        with self.assertRaises(SyncError):validate(forged,metadata(forged))
