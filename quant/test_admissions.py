"""Research layers require direct scoped facts; scores and parent states grant nothing."""
import copy
import json
from unittest.mock import patch
from django.test import SimpleTestCase,TestCase
from quant import test_validation_criteria as fixtures
from quant.test_factors import extracted
from quant.verification.structure import qualification
from quant.admissions.policy import assess
from quant.admissions.services import summary,backfill
from quant.models import FactorAdmission,FactorCandidate,FactorEvidenceLink,Job,ValidationJob
from quant.research.contracts import digest
from quant.sync import validate,metadata
from utils.sync_manager import SyncManager,SyncError


class AdmissionPolicyTests(SimpleTestCase):
    def basis(self,kind,data):
        return {'kind':kind,'id':'evidence','content_hash':'a'*64,'data':{'kind':kind,**data}}

    def test_same_formula_scoped_computation_is_not_an_output_match_or_financial_pass(self):
        qualified=qualification(extracted()['factors'][0])
        basis=self.basis('comparison',{'market':{'symbol':'X','timeframe':'1h'},'dataset_hash':'d','policy':{},
            'verdict':'fail','counts':{'common_valid':3},'sides':[{'side':'left','parameters':[{'name':'N','value':21}],'bindings':[]} ]})
        basis['context']={'start':'a','end':'b','sample_row_count':10,'compared_row_count':10}
        result=assess(qualified,basis)
        self.assertEqual(result['stage'],'calculated');self.assertEqual(result['outcome'],'output_mismatch')
        self.assertEqual(result['scopes'][0]['parameters'][0]['value'],21)
        self.assertEqual(result['scopes'][0]['sample']['start'],'a')
        self.assertFalse(result['independent_validation']);self.assertEqual(result['economic_effectiveness'],'unassessed')
        qualified['reuse_status']='candidate';qualified['blockers']=['types']
        blocked=assess(qualified,basis)
        self.assertEqual(blocked['stage'],'candidate');self.assertEqual(blocked['scopes'][0]['observed_stage'],'calculated')

    def test_fixed_rules_need_fresh_eligibility_and_uploads_never_promote(self):
        qualified=qualification(extracted()['factors'][0])
        fixed={'target_id':'v','market':{},'dataset_hash':'d','config':{},'bounds':{'start_timestamp':'a','end_timestamp':'b'},
            'recipe':{'parameters':{'p0':21},'bindings':{'i0':'close'}},'publication_audit':{},'registered_criteria':{'min_total_return':0},
            'criteria_assessment':{'eligibility':'fresh_scope_criteria_met','status':'met','checks':{}}}
        basis=self.basis('fixed_validation',fixed)
        self.assertEqual(assess(qualified,basis)['stage'],'registered_criteria_met')
        basis['data']['criteria_assessment']['eligibility']='criteria_met_reuse_or_audit_unknown'
        result=assess(qualified,basis);self.assertEqual(result['stage'],'fixed_observation');self.assertEqual(result['outcome'],'reused_criteria_met')
        basis['data']['criteria_assessment'].update(eligibility='criteria_not_met',status='not_met')
        self.assertEqual(assess(qualified,basis)['outcome'],'criteria_not_met')
        uploaded=self.basis('feedback',{'target_id':'u','mode':'live','platform':'user claimed','reported_return':1000})
        self.assertEqual(assess(qualified,uploaded)['stage'],'reusable')


class AdmissionIntegrationTests(TestCase):
    setUp=fixtures.RegisteredCriteriaIntegrationTests.setUp
    collect=fixtures.RegisteredCriteriaIntegrationTests.collect
    publish=fixtures.RegisteredCriteriaIntegrationTests.publish
    prepare=fixtures.RegisteredCriteriaIntegrationTests.prepare
    start=fixtures.RegisteredCriteriaIntegrationTests.start
    execute_source=fixtures.RegisteredCriteriaIntegrationTests.execute_source
    dataset=fixtures.RegisteredCriteriaIntegrationTests.dataset
    action=fixtures.RegisteredCriteriaIntegrationTests.action
    register=fixtures.RegisteredCriteriaIntegrationTests.register
    ready=fixtures.RegisteredCriteriaIntegrationTests.ready

    def layer_url(self,candidate):return f'/api/quant/{self.collection.pk}/factors/{candidate.pk}/admissions/'

    def test_registered_results_automatically_admit_only_exact_version_and_keep_failed_rules(self):
        request=self.ready({'max_drawdown':1,'min_signal_coverage':0})
        links=FactorEvidenceLink.objects.filter(kind='fixed_validation',target_id=request.result.pk)
        self.assertTrue(links.exists())
        for link in links:
            record=link.admission_records.get(policy_version=1)
            self.assertEqual(record.stage,'registered_criteria_met')
            self.assertEqual(record.data['scopes'][0]['recipe'],self.plan.data['recipe'])
            self.assertEqual(record.data['scopes'][0]['config'],self.plan.data['config'])
            self.assertEqual(record.data['scopes'][0]['sample'],request.data['bounds'])
            self.assertEqual(record.data['basis']['content_hash'],link.content_hash)
        candidate=links.first().candidate
        self.assertEqual(candidate.admission_version,1)
        wire=self.client.get(self.layer_url(candidate)).json()['data']
        self.assertEqual(wire['summary']['stage'],'registered_criteria_met');self.assertEqual(wire['summary']['criteriaMetCount'],1)
        self.assertFalse(wire['independentValidation'])
        body=json.loads(next(r['dataJson'] for r in wire['items'] if r['kind']=='fixed_validation'))
        self.assertEqual(body['scopes'][0]['recipe']['parameters'],self.plan.data['recipe']['parameters'])
        self.assertEqual(len(body['candidate_hash']),64)
        # A user rule can be satisfied even on a losing return. Admission only
        # attests those frozen rules, never an invented positive-profit rule.
        self.assertEqual(body['economic_effectiveness'],'unassessed')
        old_count=FactorAdmission.objects.count();backfill(candidate);self.assertEqual(FactorAdmission.objects.count(),old_count)
        definition={key:value for key,value in candidate.data.items() if key not in ('evidence','derivation','formula_version')}
        definition['name']='独立定义';definition['expression']={'op':'neg','args':[definition['expression']]}
        path=f'/api/quant/{self.collection.pk}/factors/{candidate.pk}/formula-versions/'
        edited=self.client.post(path,{'request_key':'admission_select_child01','definition_json':json.dumps(definition),'reason':'新公式独立积累'},format='json')
        self.assertEqual(edited.status_code,200,edited.data)
        child=FactorCandidate.objects.get(pk=edited.json()['data']['candidate']['id'])
        history=edited.json()['data']['history'];self.assertEqual(summary(child)['stage'],'reusable')
        selected=self.client.post(f'/api/quant/{self.collection.pk}/factors/{child.pk}/formula-versions/select/',
            {'request_key':'admission_select_current1','reason':'检验不继承父代层级','expected_selection_id':history['currentSelectionId']},format='json')
        self.assertEqual(selected.status_code,200,selected.data)
        filtered=self.client.get(f'/api/quant/{self.collection.pk}/factors/?groupBy=lineage&admissionStage=registered_criteria_met').json()['data']
        self.assertFalse(any(row.get('formulaLineage',{}).get('rootCandidateId')==history['rootCandidateId'] for row in filtered['items']))
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        with patch('quant.worker.dispatch',side_effect=AssertionError('model')),patch('quant.validation_studies.worker.dispatch',side_effect=AssertionError('execution')):
            SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        self.assertFalse(Job.objects.exists());self.assertFalse(ValidationJob.objects.exists())

    def test_cancelled_fixed_evaluation_records_unknown_and_planned_scope_without_admission(self):
        self.register({'min_entries':1});dataset=self.dataset()
        self.assertEqual(self.action('run',dataset).status_code,200)
        self.assertEqual(self.action('cancel').status_code,200)
        from quant.models import ValidationRequest
        result=ValidationRequest.objects.get(plan=self.plan).result
        link=FactorEvidenceLink.objects.filter(kind='fixed_validation',target_id=result.pk).first()
        self.assertIsNotNone(link)
        self.assertEqual(link.data['result_status'],'cancelled');self.assertEqual(link.data['metrics'],{})
        self.assertEqual(link.data['levels'],[])
        record=link.admission_records.get(policy_version=1)
        self.assertEqual(record.stage,'reusable');self.assertEqual(record.outcome,'criteria_unknown')
        self.assertEqual(record.data['scopes'][0]['sample_status'],'planned_not_completed')
        self.assertFalse(record.data['scopes'][0]['checks']['calculation_completed'])
        self.assertEqual(record.data['scopes'][0]['reason'],'固定验证在计算前停止；数据预约仍保留')
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))

    def test_unmet_criteria_stay_fixed_observations_and_filter_does_not_inherit_parent_layer(self):
        request=self.ready({'min_total_return':1000})
        link=FactorEvidenceLink.objects.filter(kind='fixed_validation',target_id=request.result.pk).first()
        self.assertIsNotNone(link);candidate=link.candidate;record=link.admission_records.get(policy_version=1)
        self.assertEqual(record.stage,'fixed_observation');self.assertEqual(record.outcome,'criteria_not_met')
        self.assertEqual(summary(candidate)['criteria_not_met_count'],1)
        # Use the public formula API so lineage/authoring validation is exercised.
        definition={key:value for key,value in candidate.data.items() if key not in ('evidence','derivation','formula_version')}
        definition['name']='New independent version';definition['formula']='revised definition'
        url=f'/api/quant/{self.collection.pk}/factors/{candidate.pk}/formula-versions/'
        response=self.client.post(url,{'request_key':'admission_child_version01','definition_json':json.dumps(definition),'reason':'独立定义，不继承父版实证'},format='json')
        self.assertEqual(response.status_code,200,response.data)
        child=FactorCandidate.objects.get(pk=response.json()['data']['candidate']['id'])
        self.assertEqual(summary(child)['stage'],'reusable')
        self.assertFalse(child.admission_records.filter(evidence__isnull=False).exists())
        filtered=self.client.get(f'/api/quant/{self.collection.pk}/factors/?groupBy=none&admissionStage=registered_criteria_met').json()['data']
        self.assertEqual(filtered['total'],0)
        self.assertEqual(self.client.get(self.layer_url(child)+'?limit=0').status_code,400)
        self.assertEqual(self.client.get(self.layer_url(child)+'?offset=-1').status_code,400)

    def test_rehashed_scope_forgery_missing_required_record_and_cross_version_reference_rejected(self):
        request=self.ready({'max_drawdown':1})
        snapshot=SyncManager().build_snapshot_data()
        for mutation in ('promote','scope','missing','wrong_candidate'):
            value=copy.deepcopy(snapshot)
            record=next(row for row in value if row['model']=='quant.factoradmission' and row['fields']['evidence'] and (mutation!='promote' or row['fields']['stage']!='registered_criteria_met'))
            if mutation=='missing':value.remove(record)
            elif mutation=='promote':
                record['fields']['data']['stage']='registered_criteria_met';record['fields']['stage']='registered_criteria_met'
            elif mutation=='scope':record['fields']['data']['scopes'][0]['parameters']={'invented':999}
            else:record['fields']['candidate']='other-candidate'
            if mutation!='missing':record['fields']['content_hash']=digest(record['fields']['data'])
            with self.subTest(mutation=mutation),self.assertRaises(SyncError):validate(value,metadata(value))
        link=FactorEvidenceLink.objects.filter(kind='fixed_validation',target_id=request.result.pk).first()
        record=link.admission_records.get(policy_version=1);identity=record.pk
        link.delete()
        self.assertFalse(FactorAdmission.objects.filter(pk=identity).exists())
        from system_settings.models import SyncEntityState
        self.assertTrue(SyncEntityState.objects.get(model_label='quant.factoradmission',object_pk=identity).is_deleted)

    def test_legacy_restore_prunes_new_layers_and_never_borrows_markers_or_starts_work(self):
        self.execute_source();candidate=FactorCandidate.objects.first()
        FactorCandidate.objects.all().update(admission_version=0)
        FactorEvidenceLink.objects.all().update(admission_version=0)
        FactorAdmission.objects.all().delete()
        snapshot=SyncManager().build_snapshot_data()
        for row in snapshot:
            if row['model'] in ('quant.factorcandidate','quant.factorevidencelink'):row['fields'].pop('admission_version')
        meta=metadata(snapshot);meta['quant_schema_version']=52
        response=self.client.post(self.layer_url(candidate),{'offset':0,'limit':20},format='json')
        self.assertEqual(response.status_code,200,response.data);self.assertTrue(FactorAdmission.objects.exists())
        with patch('quant.worker.dispatch',side_effect=AssertionError('restore model')),patch('quant.experiments.worker.dispatch',side_effect=AssertionError('restore execution')):
            SyncManager().apply_snapshot_data(snapshot,remote_meta=meta)
        self.assertFalse(FactorAdmission.objects.exists());candidate.refresh_from_db();self.assertEqual(candidate.admission_version,0)
        self.assertEqual(self.client.get(self.layer_url(candidate)).json()['data']['summary']['stage'],'unrecorded')
        self.assertEqual(self.client.get(f'/api/quant/not-owned/factors/{candidate.pk}/admissions/').status_code,404)
