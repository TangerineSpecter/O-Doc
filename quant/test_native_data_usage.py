"""Native source requests consume their supplied rows even without a result."""
import copy
import json
from unittest.mock import patch,PropertyMock
from django.test import TestCase
from quant import test_validation_studies as fixtures
from quant.test_native_python import environment
from quant.models import NativePythonRequest


class NativeUsageTests(TestCase):
    setUp,collect,publish,prepare,start=fixtures.ValidationTests.setUp,fixtures.ValidationTests.collect,fixtures.ValidationTests.publish,fixtures.ValidationTests.prepare,fixtures.ValidationTests.start
    execute_source,register,dataset,action=fixtures.ValidationTests.execute_source,fixtures.ValidationTests.register,fixtures.ValidationTests.dataset,fixtures.ValidationTests.action

    def native(self,dataset,*,offset=None,count=30,warmup=0,key='native_usage_request_0001'):
        seed=self.input['seeds'][0]
        values={'request_key':key,'name':'原始函数已预约片段','dataset_id':dataset.pk,
            'bindings':copy.deepcopy(seed['bindings']),'parameters':copy.deepcopy(seed['parameters']),
            'entrypoint':'factor','arguments':[{'name':'close','kind':'series','column':'close'}],
            'offset':len(dataset.snapshot['rows'])-31 if offset is None else offset,'row_count':count,'warmup_bars':warmup,'analyze':False}
        url=f'/api/quant/{self.collection.pk}/factors/{seed["candidate_id"]}/native-python/'
        with patch('quant.native_python.runtime.probe',return_value=environment()):
            response=self.client.post(url,values,format='json')
        self.assertEqual(response.status_code,200,response.data)
        return NativePythonRequest.objects.get(pk=response.data['data']['id'])

    def test_native_pending_request_blocks_fresh_on_the_same_post_registration_dataset(self):
        self.register();dataset=self.dataset()
        before=json.loads(self.action('preview',dataset).json()['data']['previewJson'])
        self.assertTrue(before['fresh_allowed'])
        native=self.native(dataset)
        after=json.loads(self.action('preview',dataset).json()['data']['previewJson'])
        self.assertFalse(after['fresh_allowed'])
        self.assertTrue(any(row['key']=='native_python:'+native.pk for row in after['audit']['conflicts']))
        self.assertEqual(self.action('run',dataset).status_code,400)
        from pathlib import Path
        from quant.validation_studies.usage import universe,audit
        legacy=audit(dataset.snapshot,after['bounds'],universe(self.collection.user_id,dataset.pk,version=1))
        Path('/private/tmp/odoc-native-usage-preview.json').write_text(json.dumps({'legacy':legacy,'current':after['audit']},ensure_ascii=False))

    def test_only_supplied_rows_are_counted_and_native_warmup_is_not_excluded(self):
        from datetime import datetime,timedelta
        from quant.experiments.datasets import create_dataset
        self.register()
        source=self.source.dataset
        last=datetime.fromisoformat(source.snapshot['rows'][-1]['timestamp'])
        csv=source.raw_csv.rstrip()+'\n'+'\n'.join(f'{(last+timedelta(days=i+1)).isoformat()},101,103,100,102,1000' for i in range(61))
        dataset=create_dataset(self.collection,{'name':'原函数预热覆盖未来评价','csv_text':csv,
            **{key:source.snapshot[key] for key in ('symbol','timeframe','timezone','price_adjustment','source')}})
        self.native(dataset,offset=0)
        self.assertTrue(json.loads(self.action('preview',dataset).json()['data']['previewJson'])['fresh_allowed'])
        record=self.native(dataset,offset=len(source.snapshot['rows']),count=50,warmup=20,key='native_usage_warmup_0002')
        preview=json.loads(self.action('preview',dataset).json()['data']['previewJson'])
        conflict=next(row for row in preview['audit']['conflicts'] if row['key']=='native_python:'+record.pk)
        self.assertFalse(preview['fresh_allowed'])
        self.assertEqual(conflict['native_sample'],{'offset':len(source.snapshot['rows']),'row_count':50,'scope':'all_supplied_rows_including_warmup'})
        self.assertEqual(conflict['start'],dataset.snapshot['rows'][len(source.snapshot['rows'])]['timestamp'])

    def test_cancel_failed_missing_job_and_soft_deleted_source_do_not_erase_use(self):
        from quant.models import NativePythonJob,Entry
        from quant.sync import reset_execution
        self.register();dataset=self.dataset();record=self.native(dataset)
        for status in ('failed','interrupted','cancelled'):
            with self.subTest(status=status):
                NativePythonJob.objects.filter(request=record).update(status=status)
                self.assertFalse(json.loads(self.action('preview',dataset).json()['data']['previewJson'])['fresh_allowed'])
        reset_execution();self.assertFalse(NativePythonJob.objects.exists())
        Entry.objects.filter(pk=record.candidate.report.entry_id).update(is_valid=False)
        current=json.loads(self.action('preview',dataset).json()['data']['previewJson'])
        self.assertFalse(current['fresh_allowed'])
        self.assertTrue(any(row['key']=='native_python:'+record.pk for row in current['audit']['conflicts']))

    def test_request_after_binding_changes_publication_and_current_audit_without_rewriting_authorization(self):
        from quant.models import ValidationRequest,ValidationPlan
        from quant.validation_studies.worker import execute
        from quant.validation_studies.evidence import for_result
        self.register()
        response=self.client.post(self.url,{'request_key':'native_use_criteria_plan01','source_request_id':self.source.pk,
            'intervals':10,'seconds':10,'criteria':{'min_total_return':-1}},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.plan=ValidationPlan.objects.get(pk=response.data['data']['id'])
        dataset=self.dataset();self.assertEqual(self.action('run',dataset).status_code,200)
        request=ValidationRequest.objects.get(plan=self.plan);authorization=copy.deepcopy(request.data)
        native=self.native(dataset)
        with patch('quant.validation_studies.reviews.automatic'):execute(request.job.pk)
        request.refresh_from_db();result=request.result
        self.assertEqual(result.data['status'],'completed',result.data)
        self.assertEqual(result.data['criteria_assessment']['eligibility'],'criteria_met_reuse_or_audit_unknown')
        self.assertEqual(request.data,authorization)
        summary=for_result(result)['publication_audit']
        self.assertEqual(summary['version'],2)
        self.assertTrue(any(row['key']=='native_python:'+native.pk for row in summary['conflict_sample']))
        self.assertFalse(summary['global_independent_validation'])

    def test_restore_reconstructs_sample_and_rejects_rehashed_facts_and_downgraded_new_request(self):
        from quant.sync import metadata,validate
        from quant.research.contracts import digest
        from utils.sync_manager import SyncManager,SyncError
        from quant.models import ValidationRequest,NativePythonJob,ValidationJob,Job
        self.register();dataset=self.dataset();native=self.native(dataset)
        self.assertEqual(self.action('run',dataset,'replication').status_code,200)
        request=ValidationRequest.objects.get(plan=self.plan)
        self.assertEqual(request.data['version'],2)
        manager=SyncManager();snapshot=manager.build_snapshot_data();validate(snapshot,metadata(snapshot))
        for mode in ('offset','count','range','hash','boolean','version'):
            with self.subTest(mode=mode):
                bad=copy.deepcopy(snapshot)
                fields=next(row['fields'] for row in bad if row['model']=='quant.validationrequest')
                value=fields['data'];fact=next(row for row in value['audit']['manifest'] if row['key']=='native_python:'+native.pk)
                if mode=='offset':fact['native_sample']['offset']+=1
                elif mode=='count':fact['native_sample']['row_count']-=1
                elif mode=='range':fact['end']=fact['start']
                elif mode=='hash':fact['record_hash']='0'*64
                elif mode=='boolean':fact['native_sample']['row_count']=True
                else:value['audit']['version']=1
                fields['content_hash']=digest(value)
                with self.assertRaises((SyncError,ValueError)):validate(bad,metadata(bad))
        with patch('quant.native_python.runtime.run',side_effect=AssertionError('restore source')),patch('quant.worker.dispatch') as ai:
            manager.apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        ai.assert_not_called()
        self.assertFalse(NativePythonJob.objects.exists());self.assertFalse(ValidationJob.objects.exists());self.assertFalse(Job.objects.exists())
        self.assertEqual(ValidationRequest.objects.get(pk=request.pk).data,request.data)
        current=json.loads(self.action('preview',dataset).json()['data']['previewJson'])
        self.assertFalse(current['fresh_allowed'])

    def test_scan_limits_bad_bounds_and_owner_filter_cannot_claim_clean_coverage(self):
        from quant.validation_studies.usage import universe
        self.register();dataset=self.dataset();native=self.native(dataset)
        with patch.object(NativePythonRequest,'plan',new_callable=PropertyMock,side_effect=AssertionError('full source JSON loaded')):
            value=universe(self.collection.user_id,dataset.pk)
        self.assertEqual(value['totals']['native_python'],1)
        self.assertEqual(universe('another-owner',dataset.pk)['totals']['native_python'],0)
        for field,value in (('offset',True),('offset',99999),('row_count',29),('row_count',30.0)):
            with self.subTest(field=field,value=value):
                plan=copy.deepcopy(native.plan);plan['dataset'][field]=value
                NativePythonRequest.objects.filter(pk=native.pk).update(plan=plan)
                current=json.loads(self.action('preview',dataset).json()['data']['previewJson'])
                self.assertFalse(current['fresh_allowed']);self.assertFalse(current['audit']['complete_scan'])
        NativePythonRequest.objects.filter(pk=native.pk).update(plan=native.plan)
        with patch('quant.validation_studies.usage.LIMIT',1):
            current=json.loads(self.action('preview',dataset).json()['data']['previewJson'])
        self.assertFalse(current['fresh_allowed']);self.assertFalse(current['audit']['complete_scan'])

    def test_legacy_v1_audit_stays_exact_while_current_preview_includes_native_use(self):
        from quant.validation_studies.usage import universe,audit,SCOPE
        from quant.validation_studies.contracts import bounds
        self.register();dataset=self.dataset();limits=bounds(self.plan.data,dataset.snapshot)
        original=audit(dataset.snapshot,limits,universe(self.collection.user_id,dataset.pk,version=1))
        self.native(dataset)
        legacy=audit(dataset.snapshot,limits,universe(self.collection.user_id,dataset.pk,version=1))
        self.assertEqual(legacy,original)
        self.assertEqual((legacy['version'],legacy['scope']),(1,SCOPE))
        self.assertNotIn('native_python',legacy['totals'])
        self.assertFalse(json.loads(self.action('preview',dataset).json()['data']['previewJson'])['fresh_allowed'])

    def test_another_private_collection_of_same_owner_keeps_the_native_counterexample(self):
        from anthology.models import Anthology
        from quant.experiments.datasets import create_dataset
        from quant.sync import metadata,validate
        from utils.sync_manager import SyncManager
        self.register();dataset=self.dataset()
        original_collection,original_url,original_input=self.collection,self.url,copy.deepcopy(self.input)
        other=Anthology.objects.create(coll_id='native-other-private',title='另一个私密量化库',
            user_id=self.collection.user_id,type='quant',permission='private')
        try:
            self.collection=other;self.url=f'/api/quant/{other.pk}/intake/'
            candidate=self.publish('native_cross_source_00001')
            market=create_dataset(other,{'name':'另一库的相同行情','csv_text':dataset.raw_csv,
                **{key:dataset.snapshot[key] for key in ('symbol','timeframe','timezone','price_adjustment','source')}})
            self.input=copy.deepcopy(original_input);self.input['seeds'][0]['candidate_id']=candidate.pk
            native=self.native(market,key='native_cross_request_00001')
        finally:
            self.collection,self.url,self.input=original_collection,original_url,original_input
        current=json.loads(self.action('preview',dataset).json()['data']['previewJson'])
        conflict=next(row for row in current['audit']['conflicts'] if row['key']=='native_python:'+native.pk)
        self.assertEqual(conflict['collection_id'],other.pk)
        self.assertFalse(current['fresh_allowed'])
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
