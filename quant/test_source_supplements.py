"""Dependency submissions preserve raw files, source ancestry and AI boundaries."""
import copy
import json
from unittest.mock import patch
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from quant import test_research_analysis as fixtures
from quant.models import AIRun, Job, SourceRevision, ResearchReport
from quant.research.contracts import digest
from quant.research.supplements.contracts import build, SupplementInput
from quant.research.acquisition import acquire_source
from quant.source_structure.common import source_lines
from quant.sync import metadata, validate
from quant.worker import execute
from utils.sync_manager import SyncManager, SyncError


class SourceSupplementTests(TestCase):
    setUp = fixtures.AnalysisTests.setUp
    collect = fixtures.AnalysisTests.collect

    def prepare(self, *, analyze=False):
        self.payload['analyze'] = analyze
        entry = self.collect()
        source = entry.sources.get() if hasattr(entry,'sources') else SourceRevision.objects.get(material__entry=entry)
        self.entry,self.source = entry,source
        self.path = f'/api/quant/{self.collection.pk}/entries/{entry.pk}/sources/{source.pk}/supplements/'
        self.input = {'request_key':'supplement_dependency_01','expected_source_id':source.pk,
            'reason':'补交缺失的库正文，请重新核对依赖，保留未知','files':[{'name':'vendor/helper.py','code':'def helper(x):\r\n    return x + 1\r\n'}],
            'analyze':analyze,'model_id':self.model.pk}
        return source

    def submit(self):
        response = self.client.post(self.path,self.input,format='json')
        self.assertEqual(response.status_code,200,response.data)
        return SourceRevision.objects.get(pk=response.data['data']['source_id'])

    def test_files_replace_in_new_versions_without_mutating_parent(self):
        parent = self.prepare()
        original = copy.deepcopy(parent.payload)
        child = self.submit()
        self.assertEqual(child.payload['files'][0]['code'],original['code'])
        self.assertEqual(child.payload['files'][1]['code'],self.input['files'][0]['code'])
        lines = source_lines(child.payload['code'])
        file = child.payload['files'][1]
        self.assertEqual(''.join(lines[file['start_line']-1:file['end_line']]),file['code'])
        self.assertEqual(child.payload['changes'][0]['action'],'add')
        parent.refresh_from_db();self.assertEqual(parent.payload,original)
        self.source=child
        self.path=self.path.replace(f'/sources/{parent.pk}/',f'/sources/{child.pk}/')
        self.input.update(request_key='supplement_dependency_02',expected_source_id=child.pk)
        self.input['files'][0]['code']='def helper(x):\n    return "a\u2028b"\n'
        revised=self.submit()
        self.assertEqual(len(revised.payload['files']),2)
        self.assertEqual(revised.payload['bundle_depth'],2)
        self.assertEqual(revised.payload['changes'][0]['action'],'replace')
        self.assertEqual(revised.payload['changes'][0]['before_hash'],file['content_hash'])
        self.assertEqual(revised.payload['code'].count('SOURCE FILE: __source__.py'),1)
        self.assertEqual(revised.payload['files'][1]['end_line']-revised.payload['files'][1]['start_line'],1)
        validate(SyncManager().build_snapshot_data())

    def test_auto_analysis_publishes_new_report_and_keeps_old_scoring(self):
        self.prepare(analyze=True)
        old=AIRun.objects.get()
        with patch('quant.worker.complete',return_value=json.dumps(fixtures.result())):
            execute(old.pk)
        old.refresh_from_db();self.assertEqual(old.status,'completed',old.error)
        report=ResearchReport.objects.get(run=old);before=report.content_hash
        child=self.submit()
        run=AIRun.objects.get(source=child)
        with patch('quant.worker.complete',return_value=json.dumps(fixtures.result())) as model:
            execute(run.pk)
        run.refresh_from_db();self.assertEqual(run.status,'completed',run.error)
        prompt=model.call_args_list[0].args[1]
        self.assertIn('source_files',prompt)
        self.assertIn('vendor/helper.py',prompt)
        self.assertIn('同名符号或文件名不证明导入已解析',prompt)
        self.assertEqual(ResearchReport.objects.get(run=run).source_id,child.pk)
        report.refresh_from_db();self.assertEqual(report.content_hash,before)
        self.assertEqual(ResearchReport.objects.count(),2)
        data=SyncManager().build_snapshot_data();validate(data,metadata(data))

    def test_tongdaxin_table_attachment_reanalysis_preserves_legacy_report_and_old_bounds(self):
        self.payload.update(language='tongdaxin', code='MOM:C/REF(C,N)-1;', description='参数表稍后补交')
        with patch('quant.workflows.contracts.VERSION', 23): parent = self.prepare(analyze=True)
        old = AIRun.objects.get(source=parent)
        with patch('quant.worker.complete', return_value=json.dumps(fixtures.result())): execute(old.pk)
        old.refresh_from_db(); self.assertEqual(old.status, 'completed', old.error)
        self.assertEqual(old.result['parameter_binding_version'], 1)
        self.assertEqual(json.loads(old.result['parameter_inventory_json'])['status'], 'unsupported')
        report = ResearchReport.objects.get(run=old); original = copy.deepcopy(report.data); original_hash = report.content_hash
        self.input['files'] = [{'name': '参数/原表.csv', 'code': '参数,最小,最大,缺省\r\nN,2,60,20\r\n'}]
        child = self.submit(); run = AIRun.objects.get(source=child)
        with patch('quant.worker.complete', return_value=json.dumps(fixtures.result())): execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(run.workflow_version, 25)
        row = run.result['parameters'][0]
        self.assertEqual(row['domain']['maximum'], 60)
        self.assertEqual(row['source_binding']['file'], '参数/原表.csv')
        self.assertEqual(row['source_binding']['scope'], '<external_parameters:file>')
        self.assertEqual(source_lines(child.payload['code'])[row['source_binding']['line'] - 1].strip(), 'N,2,60,20')
        self.path = self.path.replace(f'/sources/{parent.pk}/', f'/sources/{child.pk}/')
        self.input.update(request_key='tdx_table_replacement_01', expected_source_id=child.pk)
        self.input['files'][0]['code'] = '参数\t最小\t最大\t缺省\nN\t2\t80\t20\n'
        revised = self.submit(); new = AIRun.objects.get(source=revised)
        with patch('quant.worker.complete', return_value=json.dumps(fixtures.result())): execute(new.pk)
        new.refresh_from_db(); self.assertEqual(new.status, 'completed', new.error)
        self.assertEqual(new.result['parameters'][0]['domain']['maximum'], 80)
        run.refresh_from_db(); self.assertEqual(run.result['parameters'][0]['domain']['maximum'], 60)
        report.refresh_from_db(); self.assertEqual(report.data, original); self.assertEqual(report.content_hash, original_hash)
        snapshot = SyncManager().build_snapshot_data(); validate(snapshot, metadata(snapshot))
        from quant.models import WorkflowStep
        WorkflowStep.objects.all().delete()
        validate(snapshot, metadata(snapshot))
        with patch('quant.worker.complete', side_effect=AssertionError('restore must be offline')):
            SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        self.assertEqual(ResearchReport.objects.get(run=old).content_hash, original_hash)
        self.assertFalse(Job.objects.exists())

    def test_csv_parameters_are_not_accepted_as_python_dependencies(self):
        self.prepare()
        for name in ('parameters.csv', 'parameters.tsv'):
            self.input['files'] = [{'name': name, 'code': '参数,最小,最大,缺省\nN,2,60,20'}]
            response = self.client.post(self.path, self.input, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(SourceRevision.objects.count(), 1)
        self.assertFalse(AIRun.objects.exists())

    def test_idempotence_stale_source_and_cross_entry_permissions(self):
        self.prepare();child=self.submit()
        self.assertEqual(self.submit().pk,child.pk)
        self.assertEqual(SourceRevision.objects.count(),2)
        self.input['reason']='不同内容'
        self.assertEqual(self.client.post(self.path,self.input,format='json').status_code,409)
        self.input['request_key']='supplement_stale_source_01'
        self.assertEqual(self.client.post(self.path,self.input,format='json').status_code,409)
        self.assertEqual(self.client.post(self.path.replace(self.entry.pk,'foreign-entry'),self.input,format='json').status_code,404)

    def test_automatic_bundle_analysis_separates_files_and_rebuilds_without_local_steps(self):
        self.payload['code'] = 'from helper import calc\ndef main(x): return calc(x)\n'
        self.prepare(analyze=True)
        old = AIRun.objects.get(source=self.source)
        with patch('quant.worker.complete', return_value=json.dumps(fixtures.result())): execute(old.pk)
        self.input['files'] = [{'name': 'helper.py', 'code': 'N=20\nM=N*2\ndef calc(x): return x*M\n'}]
        child = self.submit(); run = AIRun.objects.get(source=child)
        with patch('quant.worker.complete', return_value=json.dumps(fixtures.result())) as model: execute(run.pk)
        run.refresh_from_db(); self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(run.workflow_version, 25)
        normalized = run.workflow_steps.get(stage='normalize').outcome.data['output']['structure']
        self.assertEqual(normalized['parser'], 'python-provided-file-bindings-v1')
        context = json.loads(model.call_args_list[1].args[1].split('材料：', 1)[1])
        self.assertTrue(any(row['owner'] == '__source__.py::main' and 'helper.py::calc' in row['static_candidates']
            for row in context['source_structure']['references']))
        self.assertEqual(ResearchReport.objects.get(run=run).source_id, child.pk)
        snapshot = SyncManager().build_snapshot_data()
        from quant.models import WorkflowStep
        normalize_id = run.workflow_steps.get(stage='normalize').pk
        WorkflowStep.objects.all().delete()
        validate(snapshot, metadata(snapshot))
        bad = copy.deepcopy(snapshot)
        outcome = next(row for row in bad if row['model'] == 'quant.workflowoutcome' and row['fields']['step'] == normalize_id)
        graph = outcome['fields']['data']['output']['structure']
        # Rehashing a fabricated cross-file candidate is rejected on a fresh
        # device by reconstruction from original file texts and identities.
        row = next(row for row in graph['references'] if row['candidate_ids'])
        row['candidate_ids'] = []
        outcome['fields']['content_hash'] = digest(outcome['fields']['data'])
        with self.assertRaises(SyncError): validate(bad, metadata(bad))

    def test_unsafe_names_and_unchanged_inputs_do_not_create_work(self):
        self.prepare()
        for name in ('../vendor.py','/vendor.py','a/../vendor.py','a//vendor.py','bad.exe','__source__.py','vendor/\nattack.py','a/ /b.py'):
            with self.subTest(name=name):
                data=copy.deepcopy(self.input);data['files'][0]['name']=name
                self.assertEqual(self.client.post(self.path,data,format='json').status_code,400)
        child=self.submit()
        data=copy.deepcopy(self.input);data.update(request_key='supplement_no_change_01',expected_source_id=child.pk)
        path=self.path.replace(f'/sources/{self.source.pk}/',f'/sources/{child.pk}/')
        self.assertEqual(self.client.post(path,data,format='json').status_code,400)
        self.assertEqual(AIRun.objects.count(),0)
        self.assertEqual(SourceRevision.objects.count(),2)
        form=SupplementInput(data=dict(self.input,files=[{'name':'a.py','code':'x=1'},{'name':'A.py','code':'x=2'}]))
        self.assertFalse(form.is_valid())
        unicode_form=SupplementInput(data=dict(self.input,files=[{'name':'依赖/价格 滤波.py','code':'x=1'}]))
        self.assertTrue(unicode_form.is_valid(),unicode_form.errors)
        large=dict(self.input,files=[{'name':'a.py','code':'x'*80000},{'name':'b.py','code':'x'*80000}])
        with self.assertRaises(ValidationError):build(self.source.pk,self.source.content_hash,self.source.payload,large)

    def test_supplement_never_refetches_url_or_executes_sources(self):
        self.payload.update(url='https://example.invalid/original',analyze=False)
        self.prepare()
        self.input['analyze']=True
        child=self.submit();run=AIRun.objects.get(source=child)
        with patch('quant.research.acquisition.fetch_source') as fetch:
            self.assertEqual(acquire_source(run,lambda:None).pk,child.pk)
        fetch.assert_not_called()
        self.assertEqual(child.payload['fetch_status'],'supplied')

    def test_unavailable_model_preserves_new_source_without_execution(self):
        self.prepare()
        self.input.update(analyze=True,model_id='missing-model')
        response=self.client.post(self.path,self.input,format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertTrue(response.data['data']['notice'])
        source=SourceRevision.objects.get(pk=response.data['data']['source_id'])
        self.assertEqual(source.material.current_revision_id,source.pk)
        self.assertEqual(source.payload['files'][1]['code'],self.input['files'][0]['code'])
        self.assertFalse(AIRun.objects.exists())
        self.assertFalse(Job.objects.exists())

    def test_restore_rebuilds_bundle_and_does_not_resume_analysis(self):
        self.prepare();self.input['analyze']=True
        child=self.submit();count=AIRun.objects.count()
        data=SyncManager().build_snapshot_data()
        for key in ('start_line','content_hash'):
            bad=copy.deepcopy(data)
            record=next(row['fields'] for row in bad if row['model']=='quant.sourcerevision' and row['pk']==child.pk)
            record['payload']['files'][1][key]=0 if key=='start_line' else 'forged'
            record['content_hash']=digest(record['payload'])
            with self.assertRaisesRegex(SyncError,'依赖补充'):
                validate(bad,metadata(bad))
        SyncManager().apply_snapshot_data(data,remote_meta=metadata(data))
        self.assertFalse(Job.objects.exists())
        self.assertEqual(self.submit().pk,child.pk)
        self.assertEqual(AIRun.objects.count(),count)
        self.assertFalse(Job.objects.exists())
