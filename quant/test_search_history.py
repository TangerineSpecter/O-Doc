"""Cross-request trial facts, bounded accounting and restoration without execution."""
import copy
import json
from unittest.mock import patch, PropertyMock
from django.test import TestCase, SimpleTestCase
from quant import test_experiment_jobs as fixtures
from quant.experiments.worker import execute
from quant.models import ExperimentRequest, ExperimentCheckpoint, ExperimentJob, SelectionDiagnostic, Job
from quant.research.contracts import digest
from quant.search_diagnostics.history import build, summary, request_fact, REQUEST_LIMIT
from quant.search_diagnostics.history_store import freeze
from quant.sync import validate,metadata
from utils.sync_manager import SyncManager,SyncError


class HistoryProjectionTests(SimpleTestCase):
    def test_bounded_whole_records_keep_current_and_explicit_unknown_counts(self):
        def fact(n):
            return request_fact({'id':str(n),'content_hash':'a'*64,'anthology':'one','dataset':'market',
                'created_at':'2024-01-01T00:00:00+00:00','candidate_budget':32},{'content_hash':'b'*64},[],None)
        records=[fact(n) for n in range(REQUEST_LIMIT+1)]
        value=build({'symbol':'TEST','timeframe':'1d'},'200','2024-01-02T00:00:00+00:00',201,records)
        self.assertFalse(value['complete_scan']);self.assertEqual(value['request_count'],200)
        self.assertIn('200',[row['request_id'] for row in value['manifest']]);self.assertEqual(value['attempt_count'],0)
        self.assertEqual(value['reserved_candidate_budget'],6400)
        with patch('quant.search_diagnostics.history.MAX_CHARS',1):
            limited=build(value['market'],'200',value['observed_at'],201,records)
        self.assertFalse(limited['complete_scan']);self.assertEqual(limited['manifest'],[])
        self.assertEqual(limited['attempt_count'],0)


class SearchHistoryTests(TestCase):
    setUp=fixtures.ExperimentJobsTests.setUp
    collect=fixtures.ExperimentJobsTests.collect
    publish=fixtures.ExperimentJobsTests.publish
    prepare=fixtures.ExperimentJobsTests.prepare
    start=fixtures.ExperimentJobsTests.start

    def next_request(self,key):
        self.input['request_key']=key
        return self.start()

    def completed(self,key=None):
        request=self.next_request(key) if key else self.start()
        execute(request.job.pk)
        return request

    def test_real_api_counts_previous_failed_cancelled_pending_and_preserves_frozen_snapshot(self):
        self.prepare();first=self.completed()
        cancelled=self.next_request('history_cancelled_0001')
        self.client.post(self.path+cancelled.pk+'/cancel/')
        failed=self.next_request('history_failed_000001')
        point=copy.deepcopy(first.checkpoints.first().attempt)
        def fail_after_checkpoint(snapshot,seeds,config,**kwargs):
            kwargs['checkpoint'](point)
            raise ValueError('isolated deliberate worker failure')
        with patch('quant.experiments.worker.run_batch',side_effect=fail_after_checkpoint):execute(failed.job.pk)
        pending=self.next_request('history_pending_00001')
        current=self.completed('history_current_00001')
        data=SelectionDiagnostic.objects.get(result=current.result).data
        value=data['search_history']
        self.assertEqual(data['version'],2);self.assertEqual(value['request_count'],5)
        self.assertEqual(value['attempt_count'],first.checkpoints.count()+failed.checkpoints.count()+current.checkpoints.count())
        self.assertEqual(value['without_published_result'],1)
        facts={row['request_id']:row for row in value['manifest']}
        self.assertEqual(facts[cancelled.pk]['outcome']['status'],'cancelled')
        self.assertEqual(facts[failed.pk]['outcome']['status'],'failed')
        self.assertEqual(len(facts[failed.pk]['checkpoints']),1);self.assertIsNone(facts[pending.pk]['outcome'])
        self.assertGreater(value['status_counts']['rejected'],0)
        response=self.client.get(self.path+current.pk+'/').json()['data']
        self.assertEqual(json.loads(response['selectionDiagnostic']['dataJson']),data)
        self.client.post(self.path+pending.pk+'/cancel/')
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        with patch('quant.experiments.search.run_batch',side_effect=AssertionError('restore cannot search')):
            SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        self.assertFalse(ExperimentJob.objects.exists());self.assertFalse(Job.objects.exists())
        self.assertEqual(SelectionDiagnostic.objects.get(result=current.result).data,data)
        self.preview_data=data

    def test_metadata_reader_never_loads_other_full_plans_attempts_or_prices(self):
        self.prepare();first=self.completed()
        # Access to the current dataset is already materialized; metadata-only queries
        # must not instantiate or read full plans and attempt bodies from peer records.
        _=first.dataset.snapshot;_=first.anthology
        with patch.object(ExperimentRequest,'plan',new_callable=PropertyMock,side_effect=AssertionError('large plan read')), \
                patch.object(ExperimentCheckpoint,'attempt',new_callable=PropertyMock,side_effect=AssertionError('large attempt read')):
            value=freeze(first.result)
        self.assertEqual(value['request_count'],1);self.assertEqual(value['attempt_count'],first.checkpoints.count())
        self.assertNotIn('rows',json.dumps(summary(value)));self.assertNotIn('expression',json.dumps(summary(value)))

    def test_rehashed_count_checkpoint_hash_omission_and_market_tampering_are_rejected(self):
        self.prepare();first=self.completed();current=self.completed('history_restore_00001')
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        for action in ('count','status','hash','omit_point','omit_request','market','scope','version','bool'):
            altered=copy.deepcopy(snapshot)
            fields=next(row['fields'] for row in altered if row['model']=='quant.selectiondiagnostic' and row['fields']['result']==current.result.pk)
            ledger=fields['data']['search_history'];prior=next(row for row in ledger['manifest'] if row['request_id']==first.pk)
            if action=='count':ledger['attempt_count']=0
            elif action=='status':prior['checkpoints'][0]['status']='cancelled'
            elif action=='hash':prior['checkpoints'][0]['content_hash']='f'*64
            elif action=='omit_point':
                prior['checkpoints'].pop()
                ledger.update(build(ledger['market'],ledger['current_request_id'],ledger['observed_at'],ledger['eligible_requests'],ledger['manifest']))
            elif action=='omit_request':
                ledger['manifest'].remove(prior)
                ledger.update(build(ledger['market'],ledger['current_request_id'],ledger['observed_at'],1,ledger['manifest']))
            elif action=='market':ledger['market']['symbol']='OTHER'
            elif action=='scope':ledger['scope']='all_external_trials'
            elif action=='version':fields['data']['version']=1
            elif action=='bool':ledger['eligible_requests']=True
            fields['content_hash']=digest(fields['data'])
            with self.subTest(action=action),self.assertRaises(SyncError):validate(altered,metadata(altered))

    def test_ai_summary_and_published_report_copy_counts_without_changing_old_contract(self):
        from quant.experiments.reviews import start_review
        from quant.experiments.review_evidence import for_run
        from quant.experiments.review_contract import validate_review,review_prompt,review_markdown
        from quant.test_experiment_reviews import response
        from quant.worker import execute as analyze
        from rest_framework.exceptions import ValidationError
        self.prepare();first=self.completed();current=self.completed('history_ai_000000001')
        run=start_review(current.result,request_key='history_review_0000001');evidence=for_run(run)
        def answer(context):
            value=response(context)
            value.update(memory_note='人工测试：保留失败与未知，不将历史重复当独立验证。',
                memory_assessment=[{'action':'investigate','rationale':'测试：参考完整历史，另用独立数据验证。',
                    'evidence_refs':[key]} for key in context['evidence'] if key.startswith('memory:')])
            return value
        ledger=evidence['evidence']['selection_diagnostic']['search_history']
        self.assertEqual(ledger['request_count'],2);self.assertNotIn('manifest',ledger)
        self.assertEqual(ledger['omitted_requests'],0)
        self.assertNotIn('checkpoints',ledger['request_sample'][0])
        self.assertIn('跨请求记账',review_prompt(evidence,''))
        result=validate_review(answer(evidence),evidence)
        facts=result['selection_review']['search_history_facts']
        self.assertEqual(facts['attempt_count'],ledger['attempt_count'])
        self.assertIn('跨请求尝试记录',review_markdown(result))
        forged=copy.deepcopy(result);forged['selection_review']['search_history_facts']['attempt_count']=True
        with self.assertRaises(ValidationError):validate_review(forged,evidence)
        with patch('quant.worker.complete',return_value=json.dumps(answer(evidence))):analyze(run.pk)
        run.refresh_from_db();self.assertEqual(run.status,'completed',run.error)
        self.assertEqual(run.result['selection_review']['search_history_facts'],facts)
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        old=copy.deepcopy(evidence);old['evidence']['selection_diagnostic'].pop('search_history');old['evidence']['selection_diagnostic']['version']=1
        original=validate_review(answer(old),old)
        self.assertNotIn('search_history_facts',original['selection_review'])
        self.assertNotIn('跨请求记账',review_prompt(old,''))

    def test_same_owner_other_collection_is_counted_and_foreign_owner_or_market_is_excluded(self):
        from anthology.models import Anthology
        from quant.experiments.datasets import create_dataset
        self.prepare();first=self.completed()
        original_collection=self.collection;original_url=self.url
        self.collection=Anthology.objects.create(type='quant',permission='private',user_id=original_collection.user_id,title='另一个私密研究库')
        self.url=f'/api/quant/{self.collection.pk}/intake/'
        self.prepare();second=self.completed('history_other_collection01')
        ledger=SelectionDiagnostic.objects.get(result=second.result).data['search_history']
        self.assertEqual({row['collection_id'] for row in ledger['manifest']},{original_collection.pk,self.collection.pk})
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        original_collection.is_valid=False;original_collection.save(update_fields=['is_valid'])
        self.assertEqual(freeze(second.result)['request_count'],2)
        alien=Anthology.objects.create(type='quant',permission='private',user_id='user_foreign',title='其他所有者')
        other_dataset=create_dataset(alien,{'name':'same synthetic data','csv_text':first.dataset.raw_csv,
            'symbol':'SYNTHETIC','timeframe':'1d','timezone':'UTC','price_adjustment':'not applicable','source':'test'})
        # The query must enforce ownership even if a malformed foreign request was present.
        ExperimentRequest.objects.create(anthology=alien,dataset=other_dataset,request_key='foreign_history_00001',plan=first.plan,content_hash=first.content_hash)
        different=create_dataset(self.collection,{'name':'other market','csv_text':first.dataset.raw_csv,
            'symbol':'OTHER','timeframe':'1d','timezone':'UTC','price_adjustment':'not applicable','source':'test'})
        plan=copy.deepcopy(second.plan);plan['dataset_hash']=different.content_hash
        ExperimentRequest.objects.create(anthology=self.collection,dataset=different,request_key='other_market_history01',plan=plan,content_hash=digest(plan))
        value=freeze(second.result);self.assertEqual(value['request_count'],2)
        self.assertEqual(value['attempt_count'],first.checkpoints.count()+second.checkpoints.count())
        self.collection=original_collection;self.url=original_url

    def test_later_merged_older_request_does_not_rewrite_frozen_local_visibility(self):
        from datetime import timedelta
        self.prepare();first=self.completed();record=SelectionDiagnostic.objects.get(result=first.result)
        original=copy.deepcopy(record.data)
        later=self.next_request('history_later_merge_0001')
        ExperimentRequest.objects.filter(pk=later.pk).update(created_at=first.created_at-timedelta(milliseconds=1))
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        self.assertEqual(SelectionDiagnostic.objects.get(pk=record.pk).data,original)
        self.assertEqual(freeze(first.result)['request_count'],2)
