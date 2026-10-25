"""Position evidence and history compaction do not execute original source."""
import copy
from datetime import datetime,timedelta,timezone
from unittest.mock import patch
from django.test import SimpleTestCase
from quant.native_reviews.alignment import summarize,acknowledgment,validate_ack
from quant.native_reviews.history import model_memory,statistics
from quant.native_python.calculation import portable
from quant.native_reviews.text_spans import registry,select


class NativeAlignmentTests(SimpleTestCase):
    def test_frozen_text_spans_copy_without_splicing_or_cross_field_references(self):
        original={'native_review_version':3,'summary':'含完整指标列与亏损/回撤记录','comparison':'甲'*2500,'native_review_facts':{'secret':'excluded'}}
        structure,spans=registry(original)
        self.assertEqual(registry(dict(reversed(list(original.items())))),(structure,spans))
        self.assertNotIn('native_review_facts',structure)
        chosen=select(original,'text:/summary#0','/summary')
        self.assertEqual(chosen['quote'],original['summary']);self.assertEqual(chosen['span_start'],0)
        self.assertEqual(select(original,'text:/comparison#1','/comparison')['quote'],'甲'*100)
        self.assertEqual(len([row for row in spans if row['path']=='/comparison']),2)
        with self.assertRaises(ValueError):select(original,'text:/summary#0','/comparison')
        import json
        from quant.native_reviews.prompts import normalized
        material={'draft_structure':structure,'text_spans':spans}
        reversed_spans={**material,'text_spans':list(reversed(spans))}
        self.assertEqual(normalized(json.dumps(material),span_order=True),normalized(json.dumps(reversed_spans),span_order=True))
        changed=copy.deepcopy(material);changed['text_spans'][0]['text']='拼接的假引文'
        self.assertNotEqual(normalized(json.dumps(material),span_order=True),normalized(json.dumps(changed),span_order=True))
    def fixture(self,warmup=0):
        rows=[{'timestamp':(datetime(2020,1,1,tzinfo=timezone.utc)+timedelta(hours=i)).isoformat(),'close':100+i} for i in range(30)]
        plan={'dataset':{'offset':0,'row_count':30},'policy':{'warmup_bars':warmup},
            'candidate':{'bindings':{'close':'close'},'parameters':{'N':3},'data':{'output_type':'numeric_series',
                'expression':{'op':'sma','args':[{'op':'input','name':'close'},{'op':'parameter','name':'N'}]}}}}
        snapshot={'rows':rows};_,left=portable(plan,snapshot)
        return plan,snapshot,{'status':'completed','reason':'','native_values':copy.deepcopy(left)}

    def test_same_first_valid_and_tail_mismatch_are_explicit(self):
        plan,snapshot,data=self.fixture();data['native_values'][-1]=None
        with patch('quant.native_python.runtime.run',side_effect=AssertionError('source')),patch('quant.native_python.runtime.probe',side_effect=AssertionError('Docker')):
            value=summarize(plan,snapshot,data)
        self.assertEqual(value['left']['first_valid']['index'],2);self.assertEqual(value['right']['first_valid']['index'],2)
        self.assertEqual(value['left']['last_valid']['index'],29);self.assertEqual(value['right']['last_valid']['index'],28)
        self.assertEqual(value['compared']['missing_mismatch_examples'],[{'index':29,'timestamp':snapshot['rows'][29]['timestamp'],'left_missing':False,'right_missing':True}])
        validate_ack(acknowledgment(value))

    def test_warmup_scope_and_omissions_are_counted_without_inventing_zero(self):
        plan,snapshot,data=self.fixture(warmup=5)
        data['native_values']=[None]*30
        value=summarize(plan,snapshot,data)
        self.assertEqual(value['left']['first_valid']['index'],2);self.assertIsNone(value['right']['first_valid'])
        self.assertEqual(value['compared']['missing_mismatch_total'],25);self.assertEqual(value['compared']['omitted_missing_mismatches'],13)
        self.assertEqual(value['compared']['missing_mismatch_examples'][0]['index'],5)
        unavailable=summarize(plan,snapshot,{'status':'failed','reason':'dependency_unavailable','native_values':None})
        ack=acknowledgment(unavailable);self.assertIsNone(ack['missing_mismatch_total']);validate_ack(ack)
        ack['left_first_valid_index']=0
        with self.assertRaises(ValueError):validate_ack(ack)
        plan['policy']['warmup_bars']=-1
        with self.assertRaises(ValueError):summarize(plan,snapshot,data)

    def test_compaction_retains_every_metric_attempt_and_failure_and_counts_signs(self):
        attempts=[{'id':'a','operation':'source','status':'evaluated','reason':'','metrics':{'train':{'total_return':-.1,'bars':10},'validation':{'total_return':.2,'bars':5}}},
            {'id':'b','operation':'mean','status':'evaluated','reason':'','metrics':{'train':{'total_return':.1,'drawdown':.05}}},
            {'id':'c','operation':'mean','status':'failed','reason':'invalid_parameters','metrics':{}}]
        memory={'items':[{'id':'one','kind':'experiment','evidence':{'attempts':attempts}}]};before=copy.deepcopy(memory)
        packed=model_memory(memory);evidence=packed['items'][0]['evidence'];self.assertEqual(memory,before)
        for original,row in zip(attempts,evidence['attempts']):
            self.assertEqual(row['status'],original['status']);self.assertEqual(row['reason'],original['reason'])
            for phase,metric in original['metrics'].items():
                value=row['metrics'][phase];present=value.get('present',evidence['metrics_columns'])
                restored={key:item for key,item in zip(evidence['metrics_columns'],value['values']) if key in present}
                self.assertEqual(restored,metric)
        stats=statistics(memory)[0]
        self.assertEqual(stats['attempt_count'],3);self.assertEqual(stats['signs']['train'],{'positive':1,'negative':1,'zero':0,'unknown':1})
