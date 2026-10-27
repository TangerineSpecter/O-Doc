"""Registered-rule arithmetic, fixed execution and immutable admission boundaries."""
import copy
import json
from unittest.mock import patch
from django.test import SimpleTestCase,TestCase
from rest_framework.exceptions import ValidationError
from quant import test_validation_studies as fixtures
from quant.models import ValidationPlan,ValidationRequest,Job,ValidationJob,FactorEvidenceLink
from quant.validation_studies.criteria import CriteriaInput,freeze,assess
from quant.validation_studies.worker import execute
from quant.research.contracts import digest
from quant.sync import metadata,validate
from utils.sync_manager import SyncManager,SyncError


class CriteriaArithmeticTests(SimpleTestCase):
    def data(self):
        final={'total_return':.06,'max_drawdown':.08,'entries':3,'bars':10,'missing_signals':0,'start':'a','end':'b'}
        output={'final':final,'baseline':dict(final,total_return=.04)}
        request={'mode':'fresh','imported_after_registration':True,'audit':{'complete_scan':True,'conflict_count':0}}
        audit={'complete_scan':True,'conflict_count':0}
        return output,request,audit

    def test_registered_numeric_rules_pass_only_in_their_declared_scope(self):
        output,request,audit=self.data()
        rules=freeze({'min_total_return':.05,'max_drawdown':.1,'min_excess_return':.01,'min_signal_coverage':1,'min_entries':3})
        value=assess(rules,'completed',output,request,audit)
        self.assertEqual(value['status'],'met')
        self.assertEqual([r['observed'] for r in value['rules']],[.06,.08,.06-.04,1.,3])
        self.assertEqual(value['eligibility'],'fresh_scope_criteria_met')
        self.assertFalse(value['independent_validation'])
        self.assertIn('external_prior_data_use',value['unknown_requirements'])
        request['mode']='replication'
        self.assertEqual(assess(rules,'completed',output,request,audit)['eligibility'],'criteria_met_reuse_or_audit_unknown')

    def test_missing_metrics_remain_unknown_and_one_failure_rejects_conjunction(self):
        output,request,audit=self.data();output['final'].pop('max_drawdown')
        rules=freeze({'min_total_return':.1,'max_drawdown':.1})
        value=assess(rules,'completed',output,request,audit)
        self.assertEqual(value['status'],'not_met')
        self.assertEqual([r['status'] for r in value['rules']],['not_met','unknown'])
        output['final'].pop('total_return')
        self.assertEqual(assess(rules,'completed',output,request,audit)['status'],'insufficient')
        self.assertTrue(all(r['observed'] is None for r in assess(rules,'failed',output,request,None)['rules']))

    def test_baseline_must_cover_same_interval_and_coverage_requires_valid_counts(self):
        output,request,audit=self.data();output['baseline']['end']='other'
        output['final']['missing_signals']=True
        value=assess(freeze({'min_excess_return':0,'min_signal_coverage':1}),'completed',output,request,audit)
        self.assertEqual(value['status'],'insufficient')
        self.assertEqual([r['observed'] for r in value['rules']],[None,None])

    def test_tolerance_is_frozen_and_unknown_audits_never_grant_fresh_qualification(self):
        output,request,audit=self.data();output['final']['total_return']=.05-1e-13
        rules=freeze({'min_total_return':.05})
        self.assertEqual(assess(rules,'completed',output,request,audit)['status'],'met')
        audit['complete_scan']=False
        self.assertEqual(assess(rules,'completed',output,request,audit)['eligibility'],'criteria_met_reuse_or_audit_unknown')
        audit.update(complete_scan=True,conflict_count=False)
        self.assertEqual(assess(rules,'completed',output,request,audit)['eligibility'],'criteria_met_reuse_or_audit_unknown')
        rules['fraction_tolerance']=.5
        with self.assertRaises(ValidationError):assess(rules,'completed',output,request,audit)

    def test_invalid_empty_boolean_and_nonfinite_criteria_are_rejected(self):
        for value in ({},{'max_drawdown':2},{'min_entries':True},{'min_total_return':True},
                {'min_total_return':float('nan')},{'min_total_return':float('inf')},{'min_total_return':10**1000},{'unknown':1}):
            with self.subTest(value=str(value)[:60]):
                form=CriteriaInput(data=value)
                self.assertFalse(form.is_valid())
        output,request,audit=self.data();output['final']['total_return']=-.2
        # A weak rule can pass on a loss. The result must not invent a positive-return requirement.
        value=assess(freeze({'max_drawdown':.1}),'completed',output,request,audit)
        self.assertEqual(value['status'],'met');self.assertFalse(value['independent_validation'])


class RegisteredCriteriaIntegrationTests(TestCase):
    setUp=fixtures.ValidationTests.setUp
    collect=fixtures.ValidationTests.collect
    publish=fixtures.ValidationTests.publish
    prepare=fixtures.ValidationTests.prepare
    start=fixtures.ValidationTests.start
    execute_source=fixtures.ValidationTests.execute_source
    dataset=fixtures.ValidationTests.dataset
    action=fixtures.ValidationTests.action

    def register(self,criteria):
        self.source=self.execute_source()
        self.url=f'/api/quant/{self.collection.pk}/validations/'
        self.input={'request_key':'registered_criteria_plan_001','source_request_id':self.source.pk,
            'intervals':10,'seconds':10,'criteria':criteria}
        response=self.client.post(self.url,self.input,format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.plan=ValidationPlan.objects.get(pk=response.data['data']['id'])

    def ready(self,criteria):
        self.register(criteria);dataset=self.dataset()
        response=self.action('run',dataset);self.assertEqual(response.status_code,200,response.data)
        request=ValidationRequest.objects.get(plan=self.plan);execute(request.job.pk)
        request.refresh_from_db();self.assertEqual(request.result.data['status'],'completed',request.result.data)
        return request

    def test_frozen_rules_real_calculation_direct_evidence_and_idempotent_restore(self):
        request=self.ready({'max_drawdown':1,'min_signal_coverage':0})
        self.assertEqual(self.plan.data['version'],2)
        result=request.result
        self.assertEqual(result.data['version'],2)
        self.assertEqual(result.data['criteria_assessment']['status'],'met')
        self.assertEqual(result.data['criteria_assessment']['eligibility'],'fresh_scope_criteria_met')
        links=FactorEvidenceLink.objects.filter(kind='fixed_validation',target_id=result.pk)
        self.assertTrue(links.exists())
        self.assertTrue(all('registered_criteria_met' in row.data['levels'] for row in links))
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        self.assertFalse(Job.objects.exists());self.assertFalse(ValidationJob.objects.exists())
        self.assertEqual(self.action('run',request.dataset).status_code,200)
        self.assertFalse(ValidationJob.objects.exists())
        self.input['criteria']['max_drawdown']=.5
        self.assertEqual(self.client.post(self.url,self.input,format='json').status_code,409)

    def test_failed_thresholds_and_rehashed_forgery_do_not_promote_candidate(self):
        request=self.ready({'min_total_return':1000})
        self.assertEqual(request.result.data['criteria_assessment']['status'],'not_met')
        self.assertFalse(any('registered_criteria_met' in r.data['levels'] for r in FactorEvidenceLink.objects.filter(target_id=request.result.pk)))
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        forged=copy.deepcopy(snapshot)
        value=next(row['fields'] for row in forged if row['model']=='quant.validationresult' and row['pk']==request.result.pk)
        value['data']['criteria_assessment']['status']='met';value['content_hash']=digest(value['data'])
        with self.assertRaisesRegex(SyncError,'登记标准判定'):
            validate(forged,metadata(forged))
        forged=copy.deepcopy(snapshot)
        value=next(row['fields'] for row in forged if row['model']=='quant.validationplan' and row['pk']==self.plan.pk)
        value['data']['criteria']['fraction_tolerance']=.5;value['content_hash']=digest(value['data'])
        with self.assertRaises(SyncError):validate(forged,metadata(forged))

    def test_cancelled_calculation_keeps_unknown_verdict_and_reserved_data(self):
        self.register({'min_entries':1});dataset=self.dataset()
        self.assertEqual(self.action('run',dataset).status_code,200)
        self.assertEqual(self.action('cancel').status_code,200)
        result=ValidationRequest.objects.get(plan=self.plan).result
        self.assertEqual(result.data['status'],'cancelled')
        self.assertEqual(result.data['criteria_assessment']['status'],'insufficient')
        self.assertIsNone(result.data['criteria_assessment']['rules'][0]['observed'])
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))

    def test_ai_acknowledges_exact_code_verdict_and_cannot_rewrite_it(self):
        request=self.ready({'min_total_return':1000})
        from quant.validation_studies.reviews import start
        from quant.experiments.review_evidence import for_run
        from quant.experiments.review_contract import validate_review,review_prompt
        from quant.test_experiment_reviews import response
        from quant.worker import execute as analyze
        run=start(request.result,'registered_criteria_ai_review_01')
        context=for_run(run);assessment=context['evidence']['fixed_validation']['criteria_assessment']
        value=response(context)
        for group in ('findings','risks'):
            value[group][0]['evidence_refs']=['fixed_validation']
        self.assertIn('criteria_review',review_prompt(context,''))
        with self.assertRaisesRegex(ValidationError,'代码计算'):
            validate_review(value,context)
        value['criteria_review']={'status':assessment['status'],'eligibility':assessment['eligibility'],
            'text':'本次结果没有满足预先登记的数值标准，仍保留原始指标与未验证边界。','evidence_refs':['fixed_validation']}
        bad=copy.deepcopy(value);bad['criteria_review']['status']='met'
        with self.assertRaisesRegex(ValidationError,'代码计算'):
            validate_review(bad,context)
        with patch('quant.worker.complete',return_value=json.dumps(value)):
            analyze(run.pk)
        run.refresh_from_db();self.assertEqual(run.status,'completed',run.error)
        self.assertEqual(run.result['criteria_review_version'],1)
        self.assertIn('未满足本次登记标准',run.report.markdown)
        validate(SyncManager().build_snapshot_data())
