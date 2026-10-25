"""Native source generation/archival; no claim that a Python test compiles MQL4."""
import copy
import hashlib
import json
from pathlib import Path
from unittest.mock import patch
from django.test import TestCase, SimpleTestCase
from utils.sync_manager import SyncManager, SyncError
from quant.sync import metadata, validate
from quant.models import StrategyArtifact, CodeVersion, Implementation, SourceRevision
from quant import test_strategy_execution as strategy_fixtures


class StrategyExportTests(TestCase):
    setUp=strategy_fixtures.StrategyExperimentTests.setUp
    collect=strategy_fixtures.StrategyExperimentTests.collect
    publish=strategy_fixtures.StrategyExperimentTests.publish
    prepare=strategy_fixtures.StrategyExperimentTests.prepare
    start=strategy_fixtures.StrategyExperimentTests.start
    execute=strategy_fixtures.StrategyExperimentTests.execute

    def ready(self, rolling=False):
        request=self.execute(rolling)
        return request, self.path+request.pk+'/strategy-export/'

    def test_preview_actual_parameters_and_read_only_state_then_idempotent_archive(self):
        request,path=self.ready()
        before=(CodeVersion.objects.count(),Implementation.objects.count(),SourceRevision.objects.count())
        response=self.client.get(path)
        self.assertEqual(response.status_code,200,response.data)
        data=response.json()['data']; manifest=json.loads(data['manifestJson'])
        self.assertEqual(manifest['context']['recipe']['parameters'],next(row for row in request.result.data['output']['attempts'] if row['id']==manifest['context']['attempt_id'])['recipe']['parameters'])
        self.assertEqual(manifest['code_sha256'],hashlib.sha256(data['code'].encode()).hexdigest())
        self.assertEqual(before,(CodeVersion.objects.count(),Implementation.objects.count(),SourceRevision.objects.count()))
        self.assertFalse(StrategyArtifact.objects.exists())
        self.assertIn('input double QLongEntry',data['code'])
        self.assertIn('if(!IsTesting() || IsOptimization())',data['code'])
        self.assertNotIn('#property indicator_',data['code'])
        self.assertIn('QOpen(target)',data['code']); self.assertIn('QMaxHoldingBars',data['code'])
        self.assertIn('rates_total-2',data['code']); self.assertNotIn('tick_volume',data['code'])
        with patch('quant.worker.dispatch') as ai,patch('quant.experiments.worker.dispatch') as worker:
            saved=self.client.post(path,{},format='json')
        self.assertEqual(saved.status_code,200,saved.data); ai.assert_not_called(); worker.assert_not_called()
        artifact=StrategyArtifact.objects.get(); version=artifact.version
        self.assertEqual(version.strategy_artifact_id,artifact.pk)
        self.assertEqual((version.compile_check,version.run_check,version.result_check),('pending',)*3)
        self.assertEqual(self.client.post(path,{},format='json').data['data']['id'],artifact.pk)
        self.assertEqual(StrategyArtifact.objects.count(),1)
        self.assertEqual(artifact.version.code,data['code'])
        self.assertEqual(SourceRevision.objects.get(code_version=version).payload['code'],data['code'])
        Path('/private/tmp/odoc-native-ea-bundle.json').write_text(json.dumps(data))
        Path('/private/tmp/odoc-native-ea-generated.mq4').write_text(data['code'])

    def test_restore_requires_complete_artifact_code_and_exact_actual_recipe_and_no_execution(self):
        request,path=self.ready(); self.client.post(path,{},format='json')
        snapshot=SyncManager().build_snapshot_data(); validate(snapshot,metadata(snapshot))
        artifact=StrategyArtifact.objects.get()
        from quant.research.contracts import digest
        for mode in ('missing','changed_policy','changed_code'):
            changed=copy.deepcopy(snapshot)
            row=next(row for row in changed if row['model']=='quant.strategyartifact')
            if mode=='missing': changed.remove(row)
            elif mode=='changed_policy':
                row['fields']['data']['context']['config']['strategy']['position_fraction']=.8
                row['fields']['content_hash']=digest(row['fields']['data'])
            else:
                code=next(row for row in changed if row['model']=='quant.codeversion' and row['pk']==artifact.version_id)
                code['fields']['code']+='// edited\n'; code['fields']['content_hash']=hashlib.sha256(code['fields']['code'].encode()).hexdigest()
            with self.assertRaises(SyncError): validate(changed,metadata(changed))
        with patch('quant.worker.dispatch') as ai,patch('quant.experiments.worker.dispatch') as worker:
            SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        ai.assert_not_called(); worker.assert_not_called()
        self.assertEqual(StrategyArtifact.objects.get().version.code,artifact.version.code)

    def test_explicit_failed_attempt_foreign_collection_and_legacy_indicator_are_rejected(self):
        request,path=self.ready()
        failed=next(row for row in request.result.data['output']['attempts'] if row['status']=='rejected')
        self.assertEqual(self.client.get(path,{'attempt_id':failed['id']}).status_code,400)
        self.assertEqual(self.client.get(path.replace(str(self.collection.pk),'foreign-collection')).status_code,404)
        from rest_framework.test import APIClient
        self.assertIn(APIClient().get(path).status_code,(401,403))
        self.assertFalse(StrategyArtifact.objects.exists())
        from quant.strategy_exports.spec import from_facts
        plan=copy.deepcopy(request.plan); plan['config'].pop('strategy'); plan['engine_version']='quant-local-search-2'
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError): from_facts(plan,request.result.data,request.dataset.snapshot,request.pk,request.result.pk,request.result.content_hash)

    def test_rolling_attempt_keeps_explicit_fold_and_archive_survives_later_manual_code_version(self):
        request,path=self.ready(True)
        chosen=next(row for row in request.result.data['output']['attempts'] if row['fold']==1 and row['status']=='evaluated')
        response=self.client.post(path,{'attempt_id':chosen['id']},format='json')
        self.assertEqual(response.status_code,200,response.data)
        artifact=StrategyArtifact.objects.get(); self.assertEqual(artifact.data['context']['fold'],1)
        from quant.services import save_version
        manual=save_version(artifact.version.implementation,{'code':artifact.version.code+'// manual child\n','source_version_id':artifact.version_id})
        self.assertEqual(manual.strategy_artifact_id,'')
        snapshot=SyncManager().build_snapshot_data(); validate(snapshot,metadata(snapshot))


class NativeCompilerContractTests(SimpleTestCase):
    def test_pinned_expression_compiler_matches_current_indicator_math_and_missing_guard_is_distinct(self):
        from quant.exports.mql import calculations
        from quant.strategy_exports.signal_v1 import calculations as pinned
        from quant.test_experiment_search import seed
        from quant.experiments.search import recipe
        selected=seed(); spec=recipe(selected['candidate'],selected['bindings'],selected['parameters'])
        spec.update(windows=['p0'],string_choices={})
        self.assertEqual(calculations(spec),pinned(spec))
        self.assertIn('return EMPTY_VALUE;',pinned(spec,invalid='EMPTY_VALUE')[0])
        self.assertIn('return 0;',calculations(spec)[0])

class NativeArchiveRestoreTests(TestCase):
    setUp=StrategyExportTests.setUp
    collect=StrategyExportTests.collect
    publish=StrategyExportTests.publish
    prepare=StrategyExportTests.prepare
    start=StrategyExportTests.start
    execute=StrategyExportTests.execute
    ready=StrategyExportTests.ready

    def test_old_complete_backup_drops_new_artifacts_and_never_borrows_origin_marker(self):
        request,path=self.ready()
        from quant.services import create_implementation
        owner=request.plan['seeds'][0]['id']
        from quant.models import FactorCandidate
        entry=FactorCandidate.objects.get(pk=owner).report.entry
        ordinary=create_implementation(entry,{'name':'ordinary','language':'python','code':'print(1)'})
        snapshot=SyncManager().build_snapshot_data()
        for row in snapshot:
            if row['model']=='quant.codeversion': row['fields'].pop('strategy_artifact_id',None)
        old=metadata(snapshot); old['quant_schema_version']=42
        self.assertEqual(self.client.post(path,{},format='json').status_code,200)
        self.assertEqual(StrategyArtifact.objects.count(),1)
        with patch('quant.worker.dispatch') as ai,patch('quant.experiments.worker.dispatch') as worker:
            SyncManager().apply_snapshot_data(snapshot,remote_meta=old)
        self.assertFalse(StrategyArtifact.objects.exists())
        self.assertEqual(CodeVersion.objects.get(implementation=ordinary).strategy_artifact_id,'')
        ai.assert_not_called(); worker.assert_not_called()

    def test_rehashed_native_code_is_rejected_by_regeneration_without_local_version_comparison(self):
        request,path=self.ready(); self.client.post(path,{},format='json')
        snapshot=SyncManager().build_snapshot_data()
        rows={}
        for row in snapshot:
            if row['model'].startswith('quant.'): rows.setdefault(row['model'],{})[str(row['pk'])]=row['fields']
        artifact=next(iter(rows['quant.strategyartifact'].values()))
        version=rows['quant.codeversion'][artifact['version']]
        version['code']=version['code'].replace('if(!IsTesting() || IsOptimization())','if(false)')
        version['content_hash']=hashlib.sha256(version['code'].encode()).hexdigest()
        artifact['data']['code_sha256']=version['content_hash']
        from quant.research.contracts import digest
        artifact['content_hash']=digest(artifact['data'])
        from quant.strategy_exports.sync import validate_artifacts
        def fail(message): raise SyncError(message)
        with self.assertRaises(SyncError): validate_artifacts(rows,fail)

    def test_native_strategy_lineage_archives_to_actual_parent_in_a_multi_seed_request(self):
        self.prepare()
        first=self.input['seeds'][0]['candidate_id']
        second=self.publish('native_second_source01')
        self.input=copy.deepcopy(self.input)
        extra=copy.deepcopy(self.input['seeds'][0]); extra.update(candidate_id=second.pk,parameters=[{'name':'N','value':8}],variants=[])
        self.input['seeds'].append(extra)
        from quant.test_strategy_execution import policy
        self.input['config']['strategy']=policy()
        request=self.start()
        from quant.experiments.worker import execute
        execute(request.job.pk)
        attempt=next(row for row in request.result.data['output']['attempts'] if row['operation']=='source_candidate' and row['parents']==[second.pk])
        path=self.path+request.pk+'/strategy-export/'
        queried=self.client.get(path,{'attemptId':attempt['id']})
        self.assertEqual(json.loads(queried.json()['data']['manifestJson'])['context']['attempt_id'],attempt['id'])
        response=self.client.post(path,{'attempt_id':attempt['id']},format='json')
        self.assertEqual(response.status_code,200,response.data)
        artifact=StrategyArtifact.objects.get()
        self.assertEqual([row['id'] for row in artifact.data['context']['parents']],[second.pk])
        self.assertNotEqual(first,second.pk)
        self.assertEqual(artifact.version.implementation.entry_id,second.report.entry_id)
        from quant.graph.presentation import graph_data
        graph=graph_data(self.collection,second.pk)
        self.assertTrue(any(node['id']==f'strategy:{artifact.pk}' for node in graph['nodes']))
        self.assertTrue(any(edge['kind']=='generated_strategy' and edge['from']==f'factor:{second.pk}' for edge in graph['edges']))
        snapshot=SyncManager().build_snapshot_data(); validate(snapshot,metadata(snapshot))

class EmittedControlFlowTests(SimpleTestCase):
    def test_native_period_mapping_keeps_ambiguous_case_unknown(self):
        from quant.strategy_exports.generator import native_inputs
        from quant.test_strategy_execution import policy
        context={'config':{'strategy':policy(),'threshold':0},'recipe':{'parameters':{}},'market':{'symbol':'TEST','timeframe':'1M'}}
        self.assertEqual(native_inputs(context,'a'*40)['QExpectedPeriod'],0)
        context['market']['timeframe']='1m'
        self.assertEqual(native_inputs(context,'a'*40)['QExpectedPeriod'],1)

    def test_emitted_numeric_signal_tester_guard_lot_floor_stop_budget_and_json_roundtrip_in_api_doubles(self):
        import shutil
        import subprocess
        import tempfile
        if not shutil.which('clang++'): self.skipTest('Optional C++ synthetic contract harness unavailable; native MT4 still pending')
        from quant.strategy_exports.generator import bundle
        from quant.test_experiment_search import data,seed,SearchTests
        from quant.experiments.search import run_batch
        from quant.test_strategy_execution import policy
        from quant.strategy_exports.spec import from_facts
        config=copy.deepcopy(SearchTests.config)|{'strategy':policy(position_fraction=.5,max_entries=1,stop_loss_fraction=.1)}
        market=data(); plan={'engine_version':'quant-local-search-5','config':config,'seeds':[seed(variants=False)],'dataset_hash':'fixture'}
        output=run_batch(market,plan['seeds'],config,engine_version=plan['engine_version'])
        context=from_facts(plan,{'status':'completed','output':output},market,'request-test','result-test','result-hash')
        exported=bundle(context)
        from quant.strategy_exports.testing.emitted_contract import cpp_source
        main=r'''
int main() {
    for(int i=1;i<=20;i++) history.push_back({double(i),double(i),double(i),double(i)});
    testing=false; assert(OnInit()==INIT_FAILED); clockTime+=86400; OnTick(); assert(deals.empty());
    testing=true; int original=p0; p0=0; assert(OnInit()==INIT_PARAMETERS_INCORRECT); p0=original; assert(OnInit()==INIT_SUCCEEDED);
    assert(std::abs(QClosedSignal()-(19./(19-p0)-1))<1e-12);
    clockTime+=86400; OnTick(); assert(deals.size()==1); assert(deals[0].lots==.04);
    Bid=80; Ask=80.1; OnTick(); assert(deals[0].closed); assert(deals.size()==1);
    Bid=100; Ask=100.1; clockTime+=86400; OnTick(); assert(deals.size()==1);
    OnTester(); assert(!fileName.empty());
    return 0;
}'''
        with tempfile.TemporaryDirectory(prefix='odoc-emitted-contract-') as directory:
            path=Path(directory); (path/'program.cpp').write_text(cpp_source(exported['code'],main))
            compiled=subprocess.run(['clang++','-std=c++17','program.cpp','-o','program'],cwd=path,capture_output=True,text=True,timeout=30)
            self.assertEqual(compiled.returncode,0,compiled.stderr[-5000:])
            executed=subprocess.run([str(path/'program')],cwd=path,capture_output=True,text=True,timeout=10)
            self.assertEqual(executed.returncode,0,executed.stderr)
            artifact=next(path.glob('odoc-*.json')).read_text()
            from quant.execution_evidence.common import normalize_options
            from quant.execution_evidence.standard import parse
            meta,records,params,reported,warnings=parse(artifact,'standard-execution-json-v1',normalize_options())
            self.assertEqual(len(records),1); self.assertLess(float(records[0]['profit']),0)
            self.assertEqual(records[0]['commission'],'-0.25'); self.assertIsNone(records[0]['fees'])
            self.assertEqual(meta['timezone'],''); self.assertEqual(meta['cash_flow_coverage'],'unknown')
            self.assertEqual(next(row['value'] for row in params if row['name']=='QMaxEntries'),'1')
