"""Registered fixed evaluation on synthetic data, with mock AI and no platform calls."""
import copy
import json
from datetime import datetime,timedelta
from pathlib import Path
from unittest.mock import patch
from django.test import TestCase,SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant import test_strategy_execution as fixtures
from quant.models import ValidationPlan,ValidationRequest,ValidationJob,ValidationResult,AIRun,MarketDataset
from quant.experiments.datasets import create_dataset
from quant.validation_studies.contracts import required_history,bounds
from quant.validation_studies.worker import execute
from quant.validation_studies.reviews import automatic
from quant.sync import validate,metadata,reset_execution
from quant.research.contracts import digest
from utils.sync_manager import SyncManager,SyncError


class ValidationTests(TestCase):
    setUp=fixtures.StrategyExperimentTests.setUp
    collect=fixtures.StrategyExperimentTests.collect
    publish=fixtures.StrategyExperimentTests.publish
    prepare=fixtures.StrategyExperimentTests.prepare
    start=fixtures.StrategyExperimentTests.start
    execute_source=fixtures.StrategyExperimentTests.execute

    def register(self,source=None,key='fixed_validation_plan_0001'):
        self.source=source or self.execute_source()
        self.url=f'/api/quant/{self.collection.pk}/validations/'
        response=self.client.post(self.url,{'request_key':key,'source_request_id':self.source.pk,'intervals':10,'seconds':10},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.plan=ValidationPlan.objects.get(pk=response.data['data']['id'])
        return self.plan

    def dataset(self,name='Later data',shift=0):
        rows=copy.deepcopy(self.source.dataset.snapshot['rows'])
        last=datetime.fromisoformat(rows[-1]['timestamp'])
        for i in range(31):
            value=101+i*.5+shift
            rows.append({'timestamp':(last+timedelta(days=i+1)).isoformat(),'open':value,'high':value+2,'low':value-2,'close':value+.1,'volume':1000.})
        csv='timestamp,open,high,low,close,volume\n'+'\n'.join(','.join(str(r[k]) for k in ('timestamp','open','high','low','close','volume')) for r in rows)
        return create_dataset(self.collection,{'name':name,'csv_text':csv,**{k:self.source.dataset.snapshot[k] for k in ('symbol','timeframe','timezone','price_adjustment','source')}})

    def action(self,action,dataset=None,mode='fresh'):
        return self.client.post(self.url+self.plan.pk+'/'+action+'/',{'dataset_id':dataset.pk,'mode':mode} if dataset else {},format='json')

    def ready(self):
        self.register();dataset=self.dataset()
        response=self.action('run',dataset);self.assertEqual(response.status_code,200,response.data)
        request=ValidationRequest.objects.get(plan=self.plan);execute(request.job.pk)
        request.refresh_from_db();self.assertEqual(request.result.data['status'],'completed',request.result.data)
        return request

    def test_registered_formula_exact_parameters_one_interval_no_search_and_api_wire(self):
        request=self.ready();result=request.result
        source=next(r for r in self.source.result.data['output']['attempts'] if r['id']==self.plan.data['source']['attempt_id'])
        self.assertEqual(self.plan.data['recipe'],source['recipe'])
        self.assertEqual(result.data['output']['final']['bars'],10)
        self.assertEqual(result.data['publication_audit']['range_status'],'no_tracked_conflict')
        self.assertFalse(result.data['output']['independent_validation'])
        self.assertIn('execution',result.data['output']['final'])
        self.assertEqual(self.action('run',request.dataset).status_code,200)
        self.assertEqual(ValidationRequest.objects.count(),1)
        summary=self.client.get(self.url+'?sourceRequestId='+self.source.pk).json()['data']['items'][0]
        self.assertNotIn('planJson',summary);self.assertNotIn('resultJson',summary['evaluation'])
        self.assertLess(len(json.dumps(summary)),1000)
        another=self.dataset('Another',1)
        self.assertEqual(self.action('run',another).status_code,409)
        wire=self.client.get(self.url+self.plan.pk+'/').json()['data']
        Path('/private/tmp/odoc-fixed-validation-wire.json').write_text(json.dumps(wire))

    def test_prior_import_and_reuse_block_fresh_replication_explicit_cancel_keeps_reservation(self):
        source=self.execute_source();self.source=source;dataset=self.dataset()
        self.register(source)
        preview=json.loads(self.action('preview',dataset).json()['data']['previewJson'])
        self.assertFalse(preview['imported_after_registration']);self.assertFalse(preview['fresh_allowed'])
        self.assertEqual(self.action('run',dataset).status_code,400)
        self.assertEqual(self.action('run',dataset,'replication').status_code,200)
        self.assertEqual(self.action('cancel').status_code,200)
        request=ValidationRequest.objects.get(plan=self.plan)
        self.assertEqual(request.result.data['status'],'cancelled')
        old_plan=self.plan;self.register(source,'fixed_validation_plan_0002')
        report=json.loads(self.action('preview',dataset).json()['data']['previewJson'])['audit']
        self.assertEqual(report['range_status'],'reused')
        self.assertTrue(any(r['key']=='fixed_validation:'+request.pk for r in report['conflicts']))
        self.assertEqual(ValidationPlan.objects.count(),2);self.assertNotEqual(old_plan.pk,self.plan.pk)

    def test_alias_identical_rows_and_other_collection_dataset_are_known_use(self):
        self.register();dataset=self.dataset()
        alias=MarketDataset.objects.create(anthology=self.collection,name='alias',raw_csv=dataset.raw_csv,snapshot={**dataset.snapshot,'symbol':'ALIAS'},content_hash='a'*64)
        preview=json.loads(self.action('preview',dataset).json()['data']['previewJson'])
        self.assertFalse(preview['fresh_allowed'])
        self.assertTrue(any(r['reason']=='identical_rows' for r in preview['audit']['conflicts']))
        alias.delete()
        from anthology.models import Anthology
        coll=Anthology.objects.get(pk=self.collection.pk);coll.pk=None;coll.id='other_private_quant';coll.title='Other quant';coll.save()
        MarketDataset.objects.create(anthology=coll,name='other',raw_csv=dataset.raw_csv,snapshot=dataset.snapshot,content_hash=dataset.content_hash)
        preview=json.loads(self.action('preview',dataset).json()['data']['previewJson'])
        self.assertFalse(preview['fresh_allowed'])
        self.assertTrue(any(r['collection_id']==coll.pk for r in preview['audit']['conflicts']))

    def test_audit_bound_is_unknown_not_clean(self):
        self.register();dataset=self.dataset()
        with patch('quant.validation_studies.usage.BYTE_LIMIT',1):
            preview=json.loads(self.action('preview',dataset).json()['data']['previewJson'])
        self.assertFalse(preview['audit']['complete_scan']);self.assertFalse(preview['fresh_allowed'])
        self.assertEqual(preview['audit']['range_status'],'unknown_incomplete_scan')

    def test_current_audit_can_change_without_rewriting_frozen_result(self):
        request=self.ready();frozen=copy.deepcopy(request.result.data)
        self.dataset('Known duplicate')
        wire=self.client.get(self.url+self.plan.pk+'/').json()['data']
        self.assertEqual(json.loads(wire['evaluation']['currentAuditJson'])['range_status'],'reused')
        self.assertEqual(json.loads(wire['evaluation']['resultJson']),frozen)

    def test_restore_full_replay_tamper_and_no_queue_authority(self):
        request=self.ready();snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        self.assertNotIn('quant.validationjob',{r['model'] for r in snapshot})
        changed=copy.deepcopy(snapshot);row=next(r for r in changed if r['model']=='quant.validationresult')
        row['fields']['data']['output']['final']['execution']['fees']+=.01
        row['fields']['content_hash']=digest(row['fields']['data'])
        with self.assertRaises(SyncError):validate(changed,metadata(changed))
        with patch('quant.validation_studies.worker.dispatch') as calc,patch('quant.worker.dispatch') as ai:
            SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        calc.assert_not_called();ai.assert_not_called();self.assertFalse(ValidationJob.objects.exists())
        self.assertEqual(ValidationResult.objects.get().content_hash,request.result.content_hash)

    def test_restored_pending_reservation_cannot_restart_or_call_ai(self):
        self.register();dataset=self.dataset();self.assertEqual(self.action('run',dataset).status_code,200)
        request=ValidationRequest.objects.get();token=request.job.lease_token;reset_execution()
        self.assertEqual(self.action('run',dataset).status_code,200);self.assertFalse(ValidationJob.objects.exists())
        with patch('quant.validation_studies.reviews.start') as start:
            automatic('missing',token)
        start.assert_not_called()
        wire=self.client.get(self.url+self.plan.pk+'/').json()['data']
        self.assertEqual(wire['evaluation']['status'],'interrupted')

    def test_automatic_review_and_actual_fixed_evidence_context_restore(self):
        request=self.ready()
        automatic(request.result.pk,request.job.lease_token)
        ai=AIRun.objects.get(validation_result=request.result)
        self.assertEqual(ai.review_version,12);self.assertEqual(ai.planning_context['version'],6)
        from quant.experiments.review_evidence import for_run
        from quant.experiments.review_contract import review_prompt
        evidence=for_run(ai);self.assertEqual(evidence['evidence']['fixed_validation']['plan'],self.plan.data)
        self.assertIn('fixed_validation',review_prompt(evidence,''))
        from quant.test_experiment_reviews import response
        result=response(evidence)
        for group in ('findings','risks'):
            result[group][0]['evidence_refs']=['fixed_validation']
        from quant.worker import execute as analyze
        with patch('quant.worker.complete',return_value=json.dumps(result)):
            analyze(ai.pk)
        ai.refresh_from_db();self.assertEqual(ai.status,'completed',ai.error)
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        with patch('quant.worker.dispatch') as provider:
            reset_execution();automatic(request.result.pk,request.job.lease_token)
        provider.assert_not_called()


    def test_review_followup_preserves_original_full_search_and_direct_factor_evidence(self):
        request=self.ready()
        from quant.models import FactorEvidenceLink,ExperimentProposal
        links=FactorEvidenceLink.objects.filter(kind='fixed_validation',target_id=request.result.pk)
        self.assertTrue(links.exists())
        self.assertTrue(all(row.data['levels']==['fixed_observation'] and row.data['independent_validation'] is False for row in links))
        from quant.validation_studies.reviews import start
        ai=start(request.result,'fixed_review_with_proposal_001')
        from quant.experiments.review_evidence import for_run
        from quant.test_experiment_reviews import response
        facts=for_run(ai);result=response(facts)
        for group in ('findings','risks'):result[group][0]['evidence_refs']=['fixed_validation']
        result['proposal']={'name':'后续新数据假设','hypothesis':'冻结假设需继续复核','falsification':'费用后差异消失',
            'data_requirement':'另外的新数据，不能复用已看固定验证','evidence_refs':['fixed_validation'],
            'seeds':[{'candidate_id':facts['planning_options'][0]['id'],'variants':[]}]}
        from quant.worker import execute as analyze
        with patch('quant.worker.complete',return_value=json.dumps(result)):analyze(ai.pk)
        ai.refresh_from_db();self.assertEqual(ai.status,'completed',ai.error)
        proposal=ExperimentProposal.objects.get(run=ai)
        from quant.experiments.campaigns.contracts import experiment_input
        prepared=experiment_input(proposal,request.dataset_id,'fixed_followup_request_001')
        self.assertEqual(prepared['config'],self.source.plan['config'])
        wire=self.client.get(f'/api/quant/{self.collection.pk}/factors/{links.first().candidate_id}/verification/').json()['data']
        Path('/private/tmp/odoc-fixed-verification-wire.json').write_text(json.dumps(wire))
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))

    def test_deadline_and_revoked_queue_never_create_success(self):
        self.register();dataset=self.dataset();self.action('run',dataset)
        request=ValidationRequest.objects.get()
        with patch('quant.validation_studies.worker.evaluate',side_effect=TimeoutError):execute(request.job.pk)
        self.assertEqual(request.result.data['status'],'failed');self.assertIsNone(request.result.data['output'])
        self.assertEqual(self.action('run',dataset).status_code,200)
        self.assertEqual(ValidationJob.objects.get().status,'failed')
        old=SyncManager().build_snapshot_data()
        self.assertEqual(self.client.get(self.url+'?sourceRequestId='+self.source.pk).json()['data']['total'],1)
        validate(old,metadata(old))

    def test_historical_complete_backup_does_not_borrow_new_review_pointer(self):
        source=self.execute_source();self.source=source
        old=SyncManager().build_snapshot_data()
        self.register(source);dataset=self.dataset();self.action('run',dataset)
        request=ValidationRequest.objects.get();execute(request.job.pk)
        automatic(request.result.pk,request.job.lease_token)
        self.assertTrue(AIRun.objects.filter(validation_result=request.result).exists())
        with patch('quant.worker.dispatch') as provider,patch('quant.validation_studies.worker.dispatch') as worker:
            SyncManager().apply_snapshot_data(old,remote_meta=metadata(old))
        provider.assert_not_called();worker.assert_not_called()
        self.assertFalse(ValidationPlan.objects.exists());self.assertFalse(AIRun.objects.filter(validation_result__isnull=False).exists())

    def test_foreign_dataset_is_not_available_and_read_does_not_initiate_review(self):
        self.register();dataset=self.dataset()
        from anthology.models import Anthology
        other=Anthology.objects.get(pk=self.collection.pk);other.pk=None;other.id='foreign_quant';other.user_id='someone_else';other.title='Foreign quant';other.save()
        foreign=MarketDataset.objects.create(anthology=other,name='foreign',raw_csv=dataset.raw_csv,snapshot=dataset.snapshot,content_hash=dataset.content_hash)
        self.assertEqual(self.action('preview',foreign).status_code,404)
        self.assertEqual(self.action('run',foreign).status_code,404)
        preview=json.loads(self.action('preview',dataset).json()['data']['previewJson'])
        self.assertTrue(preview['fresh_allowed'])
        with patch('quant.worker.dispatch') as provider:
            self.client.get(self.url+self.plan.pk+'/')
        provider.assert_not_called()


class HistoryTests(SimpleTestCase):
    def test_nested_windows_and_first_new_bar_cannot_be_skipped(self):
        node={'op':'lag','args':[{'op':'sma','args':[{'op':'input','name':'close'},{'op':'constant','value':5}]},{'op':'constant','value':3}]}
        self.assertEqual(required_history(node,{}),7)
        plan={'target':{'symbol':'S','timeframe':'1d','after_timestamp':'2024-01-01'},'required_history':7,'intervals':5}
        data={'symbol':'S','timeframe':'1d','rows':[{'timestamp':f'2024-01-{i:02d}'} for i in range(1,20)]}
        with self.assertRaises(ValidationError):bounds(plan,data)
