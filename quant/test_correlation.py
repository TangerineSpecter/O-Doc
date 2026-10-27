import copy
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant.graph.correlation import summarize, KIND, METHOD
from quant.research.contracts import digest
from quant import test_factor_comparisons as comparison_fixtures
from quant.models import FactorRelation, FactorMerge, Job
from quant.sync import metadata, validate
from utils.sync_manager import SyncManager, SyncError


class CorrelationNumbersTests(SimpleTestCase):
    def stamps(self, n=50):
        return [(datetime(2024,1,1,tzinfo=timezone.utc)+timedelta(days=i)).isoformat() for i in range(n)]

    def test_linear_rank_ties_negative_and_boolean_observations(self):
        x = list(range(50)); stamps = self.stamps()
        for y, expected in [(x,1), ([-2*v+4 for v in x],-1)]:
            value = summarize(stamps,x,y,0,['numeric_series']*2)
            self.assertEqual((value['pearson'], value['spearman']), (expected,expected))
        value = summarize(stamps,x,[v*v for v in x],0,['numeric_series']*2)
        self.assertEqual(value['spearman'],1); self.assertLess(value['pearson'],1)
        tied=[i//5 for i in x]
        self.assertEqual(summarize(stamps,tied,tied,0,['numeric_series']*2)['spearman'],1)
        binary=[i%2==0 for i in x]
        self.assertEqual(summarize(stamps,binary,[not v for v in binary],0,['boolean_series']*2)['pearson'],-1)

    def test_joint_mask_explicit_warmup_unknown_and_no_independent_shifting(self):
        stamps=self.stamps();x=list(range(50));y=list(range(50))
        x[5]=None;y[6]=None;x[7]=y[7]=None
        value=summarize(stamps,x,y,5,['numeric_series']*2)
        self.assertEqual(value['counts'],{'total_rows':50,'warmup_rows':5,'compared_rows':45,'common_valid':42,'left_missing':2,'right_missing':2,'both_missing':1})
        self.assertEqual(value['paired_indices_hash'],digest([i for i in range(5,50) if i not in (5,6,7)]))
        self.assertEqual(value['pearson'],1)
        self.assertEqual(summarize(stamps,[1]*50,y,0,['numeric_series']*2)['status'],'undefined')
        missing=summarize(stamps,[None]*50,y,0,['numeric_series']*2)
        self.assertEqual(missing['status'],'insufficient');self.assertIsNone(missing['pearson'])
        self.assertIsNone(missing['paired_start'])
        with self.assertRaises(ValidationError):summarize(stamps,x,[float('inf')]*50,0,['numeric_series']*2)
        with self.assertRaises(ValidationError):summarize(stamps,x,[True]*50,0,['numeric_series']*2)


class CorrelationIntegrationTests(TestCase):
    setUp=comparison_fixtures.FactorComparisonIntegrationTests.setUp
    publish=comparison_fixtures.FactorComparisonIntegrationTests.publish
    dataset=comparison_fixtures.FactorComparisonIntegrationTests.dataset
    side=staticmethod(comparison_fixtures.FactorComparisonIntegrationTests.side)
    pair=comparison_fixtures.FactorComparisonIntegrationTests.pair
    compare=comparison_fixtures.FactorComparisonIntegrationTests.compare

    def prepared(self):
        a=self.publish('correlation_source_A01')
        b=self.publish('correlation_source_B01',offset=2)
        record=self.compare(self.pair(a,b,self.dataset(),'correlation_compare_001'),'fail')
        return a,b,record,f'/api/quant/{self.collection.pk}/comparisons/{record.pk}/correlation/'

    def test_fixed_actual_values_archive_graph_idempotency_and_restore(self):
        a,b,comparison,url=self.prepared()
        with patch('quant.worker.complete') as model:
            response=self.client.post(url,{},format='json')
        self.assertEqual(response.status_code,200,response.data);model.assert_not_called()
        saved=response.json()['data'];value=json.loads(saved['evidenceJson'])
        self.assertEqual(value['statistics']['pearson'],1)
        self.assertEqual(value['statistics']['spearman'],1)
        self.assertEqual(value['comparison_hash'],comparison.content_hash)
        self.assertEqual(self.client.post(url,{},format='json').json()['data']['id'],saved['id'])
        self.assertEqual(FactorRelation.objects.filter(kind=KIND).count(),1)
        self.assertFalse(FactorMerge.objects.exists())
        graph=self.client.get(f'/api/quant/{self.collection.pk}/graph/',{'candidateId':a.pk}).json()['data']
        edge=next(row for row in graph['edges'] if row['kind']=='statistical_correlation')
        self.assertIsNone(edge['similarity']);self.assertEqual(edge['comparisonId'],comparison.pk)
        self.assertEqual(json.loads(edge['correlationJson']),value)
        snapshot=SyncManager().build_snapshot_data()
        self.assertEqual(metadata(snapshot)['quant_schema_version'],74)
        with self.assertRaises(SyncError):validate(snapshot,{**metadata(snapshot),'quant_schema_version':71})
        with patch('quant.worker.dispatch') as queue,patch('quant.native_python.runtime.run') as source:
            SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        queue.assert_not_called();source.assert_not_called();self.assertFalse(Job.objects.exists())
        self.assertEqual(self.client.get(f'/api/quant/{self.collection.pk}/comparisons/{comparison.pk}/').json()['data']['correlation']['id'],saved['id'])

    def test_rehashed_statistics_and_wrong_endpoint_or_comparison_cannot_restore(self):
        a,b,comparison,url=self.prepared();self.client.post(url,{},format='json')
        snapshot=SyncManager().build_snapshot_data()
        literal_tamper=copy.deepcopy(snapshot)
        literal_row=next(r for r in literal_tamper if r['model']=='quant.factorrelation')
        literal_row['fields']['evidence']['statistics']['pearson']=True
        with self.assertRaises(SyncError):validate(literal_tamper,metadata(literal_tamper))
        for kind in ('coefficient','target','candidate'):
            bad=copy.deepcopy(snapshot);row=next(r for r in bad if r['model']=='quant.factorrelation')
            f=row['fields'];v=f['evidence']
            if kind=='coefficient':v['statistics']['pearson']=.123
            elif kind=='target':v['comparison_id']='missing'
            else:f['right']=f['left']
            f['content_hash']=digest(v);row['pk']=digest([METHOD,f['left'],f['right'],f['content_hash']])[:40]
            with self.assertRaises(SyncError):validate(bad,metadata(bad))
        self.assertEqual(self.client.post(url,{'warmupBars':10},format='json').status_code,400)
        self.assertEqual(self.client.get(url).status_code,405)
        self.client.force_authenticate(None)
        self.assertIn(self.client.post(url,{},format='json').status_code,(401,403))

    def test_budget_timeout_and_source_deletion_during_calculation_do_not_publish(self):
        from quant.graph.correlation import compute
        a,b,comparison,url=self.prepared()
        with patch('quant.graph.correlation.compute',side_effect=TimeoutError):
            self.assertEqual(self.client.post(url,{},format='json').status_code,400)
        self.assertFalse(FactorRelation.objects.filter(kind=KIND).exists())
        def calculate_then_delete(*args,**kwargs):
            result=compute(*args,**kwargs)
            entry=a.report.entry;entry.is_valid=False;entry.save(update_fields=['is_valid'])
            return result
        with patch('quant.graph.correlation.compute',side_effect=calculate_then_delete):
            self.assertEqual(self.client.post(url,{},format='json').status_code,409)
        self.assertFalse(FactorRelation.objects.filter(kind=KIND).exists())

    def test_statistics_do_not_enter_the_semantic_retrieval_channel(self):
        from types import SimpleNamespace
        from quant.experiments.library_retrieval import retrieve
        from quant.experiments.library_contract import option
        a,b,comparison,url=self.prepared();self.client.post(url,{},format='json')
        with patch('quant.experiments.library_retrieval.base_options',return_value=[option(a.pk,a.data)]):
            result=retrieve(SimpleNamespace(request=SimpleNamespace(anthology_id=self.collection.pk)))
        self.assertTrue(result['retrieved'])
        self.assertTrue(all(row['reason'].get('semantic') is None for row in result['retrieved']))
