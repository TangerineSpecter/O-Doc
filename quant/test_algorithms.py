"""Numerical source extraction on real calculation excerpts; no user DB/media or model calls."""
import ast
import copy
import math
from pathlib import Path
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant.algorithms.pine import compile_output
from quant.algorithms.contract import validate_program, validate_windows
from quant.algorithms.runtime import calculate_program
from quant.algorithms.presentation import python_export, profile
from quant.experiments.expression import calculate
from quant.experiments.search import recipe, combine
from quant.graph.attributes import similarity
from quant.verification.structure import qualification

SOURCE = Path(__file__).parent / 'algorithms/testing/innovation_adaptive_kalman.pine'

def algorithm(target='surpriseMeter', kind='numeric_series'):
    program, inputs, declared = compile_output(SOURCE.read_text(), target, kind)
    parameters = [{'name': name, 'type': row['type'], 'default_value': str(row['default']).lower(), 'category': 'signal',
        'meaning': name, 'constraints': '源码参数', 'effect': name, 'suggestion': '按源码默认值计算', 'evidence': name} for name, row in declared.items()]
    return {'name': target, 'role': 'signal' if kind == 'boolean_series' else 'factor', 'family': 'volatility', 'summary': '从实际源码抽离的计算',
        'inputs': [{'name': name, 'meaning': name, 'availability': '收盘后', 'missing_policy': '源码na/nz'} for name in inputs],
        'parameters': parameters, 'expression': program, 'output_type': kind, 'units': 'bool' if kind == 'boolean_series' else '0-100',
        'timeframe': '随输入K线周期逐根计算，窗口按源码参数', 'dependencies': [], 'tags': [], 'limitations': '算法计算', 'formula': target}

def defaults(data):
    import json
    return {row['name']: json.loads(row['default_value']) for row in data['parameters']}


def reference(prices, p):
    """Independent direct transcription of the scalar Kalman recurrence, not the program interpreter."""
    estimate, covariance = None, 1.0
    r = calm = mean = s = q = 0.0
    ratio = (2.0 / (p['smoothingPeriod'] + 1)) ** 2
    alpha = 2.0 / (p['noiseLookback'] + 1)
    outputs = {name: [] for name in ('estimate', 'surpriseMeter', 'dampingMeter', 'testStatistic', 'isAnomaly', 'isMajorMove')}
    previous = None
    for price in prices:
        if estimate is None:
            estimate = price
            first = 0.0 if previous is None else (price - previous) ** 2
            s = first if first > 0 else .0001
            mean = 0.0; r = calm = covariance = s; q = s * ratio
        predicted = estimate; predicted_covariance = covariance + q
        surprise = price - predicted
        centered = surprise - mean if p['useTrendCentering'] else surprise
        statistic = centered * centered / s
        anomaly = statistic > p['anomalyMultiple'] ** 2
        mean = (1-alpha) * mean + alpha * surprise
        s = (1-alpha) * s + alpha * centered ** 2
        r = r + p['outlierRejection'] * centered ** 2 if anomaly else .1 * s + .9 * r
        calm = .1 * s + .9 * calm
        gain = predicted_covariance / (predicted_covariance + r)
        estimate = predicted + gain * surprise
        covariance = (1-gain) * predicted_covariance; q = s * ratio
        sr = s / max(calm, 1e-12)
        surprise_meter = 100 * max(1-1/sr, 0)
        calm_gain = predicted_covariance / (predicted_covariance + calm)
        damping = 100 * max(1-gain/calm_gain, 0)
        for name, value in zip(outputs, (estimate, surprise_meter, damping, statistic, anomaly, anomaly and math.sqrt(statistic) >= 2*p['anomalyMultiple'])):
            outputs[name].append(value)
        previous = price
    return outputs


class AlgorithmTests(SimpleTestCase):
    def test_actual_source_closes_internal_state_and_preserves_prior_variance_order(self):
        prices = [100 + .05*i + math.sin(i*.7) + (7 if i in (31,32,33,70) else 0) for i in range(120)]
        expected = reference(prices, defaults(algorithm()))
        for target, golden in expected.items():
            kind = 'boolean_series' if target in ('isAnomaly','isMajorMove') else 'numeric_series'
            data = algorithm(target, kind)
            self.assertEqual([row['name'] for row in data['inputs']], ['close'])
            actual = calculate(data['expression'], {'close': prices}, defaults(data), expected=kind)
            for a,b in zip(actual,golden): self.assertAlmostEqual(a,b,places=10)
            self.assertTrue(qualification(data)['automatic_experiment_ready'])
        self.assertGreater(sum(expected['isAnomaly']), 0)

    def test_historical_signals_include_source_state_and_default_parameters(self):
        prices = [100 + .1*i + (5 if i%17==0 else 0) for i in range(160)]
        for name in ('movesCluster','dampingReleased','lineTurnsUp','lineTurnsDown','priceCrossesUp','priceCrossesDown'):
            data=algorithm(name,'boolean_series')
            actual=calculate(data['expression'],{'close':prices},defaults(data),expected='boolean_series')
            self.assertEqual(len(actual),160)
            self.assertTrue(all(type(v) is bool for v in actual))
            self.assertEqual(set(row['name'] for row in data['inputs']),{'close'})

    def test_prefix_is_causal_and_missing_is_not_backfilled(self):
        data=algorithm('estimate');prices=[100+math.sin(i) for i in range(80)]
        full=calculate(data['expression'],{'close':prices},defaults(data))
        self.assertEqual(full[:40],calculate(data['expression'],{'close':prices[:40]},defaults(data)))
        prices[30]=None
        actual=calculate(data['expression'],{'close':prices},defaults(data))
        self.assertEqual(actual[:30],full[:30]);self.assertIsNone(actual[30])

    def test_standard_rsi_ema_and_wilder_seed(self):
        source='N = input.int(3, "Period")\nfloat e = ta.ema(close, N)\nfloat w = ta.rma(close, N)\nfloat r = ta.rsi(close, N)'
        prices=[1.,2.,3.,4.,5.,4.,6.]
        for output,golden in [('e',[1.,1.5,2.25,3.125,4.0625]),('w',[None,None,2.,8/3,31/9]),('r',[None,None,None,100.,100.])]:
            program,_,_=compile_output(source,output)
            values=calculate_program(program,{'close':prices},{'N':3})
            for actual,expected in zip(values,golden):
                if expected is None:self.assertIsNone(actual)
                else:self.assertAlmostEqual(actual,expected)

    def test_standard_macd_tuple_and_untyped_pine_declarations_are_closed(self):
        source = 'fast=input.int(2)\nslow=input.int(3)\nsignal=input.int(2)\n[macdLine, signalLine, histogram] = ta.macd(close,fast,slow,signal)'
        program, inputs, parameters = compile_output(source,'histogram')
        self.assertEqual(inputs,['close']);self.assertEqual(set(parameters),{'fast','slow','signal'})
        values=calculate_program(program,{'close':[1.,2.,3.,4.]},{'fast':2,'slow':3,'signal':2})
        self.assertAlmostEqual(values[0],0);self.assertAlmostEqual(values[1],1/18)
        source='N=input(3)\nrsiValue=ta.rsi(close,N)'
        program, inputs, _ = compile_output(source,'rsiValue')
        self.assertEqual(calculate_program(program,{'close':[1.,2.,3.,4.]},{'N':3})[-1],100)
        constant, _, _ = compile_output('int PERIOD=3\nfloat average=ta.sma(close, PERIOD)', 'average')
        self.assertEqual(calculate(constant,{'close':[1.,2.,3.,4.]},{}),[None,None,2.,3.])

    def test_unsupported_updates_do_not_publish_initializer_as_complete_algorithm(self):
        from quant.algorithms.catalog import source_outputs
        for update in ('for i = 1 to 2\n    total := total + close[i]',
                       'while total < close * 3\n    total += close', 'total += close'):
            source = 'float total = close\n' + update + '\nfloat result = total / 3\nfloat independent = close * 2'
            for target in ('total', 'result'):
                with self.assertRaisesRegex(ValueError, '循环更新|复合赋值'):
                    compile_output(source, target)
            outputs = source_outputs({'language': 'pine', 'code': source})
            self.assertEqual([row['name'] for row in outputs], ['independent'])
            program, _, _ = compile_output(source, 'independent')
            self.assertEqual(calculate_program(program, {'close': [1., 2., 3.]}, {}), [2., 4., 6.])
            # Historical model-input reconstruction retains the old inventory.
            old = source_outputs({'language': 'pine', 'code': source}, legacy=True)
            self.assertIn('result', [row['name'] for row in old])

    def test_exported_combinations_execute_program_children_and_reject_other_platforms(self):
        import json
        from types import SimpleNamespace
        from quant.exports.service import bundle
        numeric = algorithm('estimate')
        signal = algorithm('isAnomaly', 'boolean_series')['expression']
        prices = [100 + math.sin(i) if i != 31 else None for i in range(80)]
        for op, args, kind in (
            ('add', [numeric['expression'], numeric['expression']], 'numeric_series'),
            ('gate', [numeric['expression'], signal], 'numeric_series'),
            ('and', [signal, signal], 'boolean_series'),
        ):
            data = {**numeric, 'expression': {'op': op, 'args': args}, 'output_type': kind}
            candidate = SimpleNamespace(pk='composite', report_id='r', report=SimpleNamespace(source_id='s'), data=data)
            exported = bundle(candidate, 'python')
            spec = json.loads(exported['manifest_json'])['recipe']
            namespace = {}
            # Execute only our generated runtime and fixed repository source fixture.
            exec(compile(exported['code'], '<generated-composite>', 'exec'), namespace)
            actual = namespace['calculate']([{'close': value} for value in prices])
            expected = calculate(spec['expression'], {name: prices for name in spec['bindings']}, spec['parameters'], expected=kind)
            self.assertEqual(actual, expected, op)
            for target in ('pine', 'mql4', 'tongdaxin'):
                with self.assertRaisesRegex(ValidationError, '组合请导出 Python'):
                    bundle(candidate, target)

    def test_python_export_runs_on_standard_library_and_matches_engine(self):
        data=algorithm('dampingMeter');data['name']='算法\rraise RuntimeError("untrusted name")';prices=[100+math.sin(i) for i in range(70)]
        # Execute only code generated by our fixed exporter, never uploaded source/model text.
        namespace={};exec(compile(python_export(data),'generated-algorithm.py','exec'),namespace)
        self.assertEqual(namespace['compute']({'close':prices}),calculate(data['expression'],{'close':prices},defaults(data)))

    def test_recipe_parameter_namespacing_and_combination_keep_program_references(self):
        data=algorithm();seed=recipe(data,{'close':'close'},defaults(data))
        output=calculate(seed['expression'],{key:[100+math.sin(i) for i in range(50)] for key in seed['bindings']},seed['parameters'])
        combined=combine(seed,seed,'mean')
        joined=calculate(combined['expression'],{key:[100+math.sin(i) for i in range(50)] for key in combined['bindings']},combined['parameters'])
        self.assertEqual(output,joined)

    def test_program_rejects_unclosed_state_script_and_future_history(self):
        good=algorithm()['expression']
        bad=copy.deepcopy(good);bad['output']='__import__("os")'
        with self.assertRaises(ValidationError):validate_program(bad,{'close'},set(defaults(algorithm())))
        bad=copy.deepcopy(good);bad['output']='internal_state_without_body'
        with self.assertRaises(ValidationError):validate_program(bad,{'close'},set(defaults(algorithm())))
        bad=copy.deepcopy(good);bad['output']='history("close", -1)'
        with self.assertRaises(ValidationError):validate_windows(bad,defaults(algorithm()))

    def test_new_extraction_keeps_only_closed_algorithms_and_explains_skipped_module(self):
        from quant.algorithms.extraction import resolve
        broken = algorithm(); broken['expression'] = {'op': 'input', 'name': 'testStatistic'}
        broken['inputs'] = [{'name':'testStatistic'}]
        result, skipped = resolve([broken], {'code': SOURCE.read_text(), 'language':'pine'}, [])
        self.assertEqual(result, []); self.assertIn('内部变量', skipped[0])
        forged = algorithm(); forged['expression']['steps'][-1]['value'] = '999'
        rebuilt, failures = resolve([forged], {'code':SOURCE.read_text(),'language':'pine'}, algorithm()['parameters'])
        self.assertFalse(failures);self.assertEqual(rebuilt[0]['expression'],algorithm()['expression'])
        unresolved = algorithm(); unresolved['expression'] = None
        self.assertEqual(resolve([unresolved], {'code': SOURCE.read_text()}, [])[0], [])

    def test_incremental_algorithm_contract_has_new_input_identity_and_preserves_old_one(self):
        from quant.test_stage_reuse import StageInputTests
        from quant.test_research_analysis import result
        from quant.workflows.stage_reuse import request, compatible
        from quant.workflows.contracts import validate_output
        source, outputs, plan, vocabulary = StageInputTests().inputs()
        data = result()
        outputs.update(identify={key:data[key] for key in ('title','kind','tags','source_facts')},
            parameters={'parameters':outputs['extract']['factors'][0]['parameters'],'risks':data['risks'],'unknowns':data['unknowns']},
            research={key:data[key] for key in ('summary','principle','formula','usage','assumptions','validation_plan')})
        old, _, _ = request('extract',source,'',outputs,28,plan,vocabulary)
        current, text, error = request('extract',source,'',outputs,30,plan,vocabulary)
        self.assertIsNone(error);self.assertIn('op":"source',text)
        self.assertNotEqual(old['prompt_hash'],current['prompt_hash'])
        self.assertFalse(compatible({'version':28,'stage':'extract','model':{},'model_input':old},
            {'version':30,'stage':'extract','model':{},'model_input':current}))
        item=copy.deepcopy(outputs['extract']['factors'][0]);item['expression']=None
        checked=validate_output('extract',{'extraction_version':1,'extraction_note':'提取算法','factors':[item]},outputs,source,30,plan)
        self.assertEqual(checked['factors'],[]);self.assertIn('未入库模块',checked['extraction_note'])
        item['expression']={'op':'gt','args':[{'op':'input','name':'close'},{'op':'parameter','name':'N'}]}
        checked=validate_output('extract',{'extraction_version':1,'extraction_note':'提取算法','factors':[item]},outputs,source,30,plan)
        self.assertEqual(checked['factors'],[])
        self.assertIn('声明输出',checked['extraction_note'])

    def test_properties_have_a_reproducible_similarity_breakdown(self):
        a=algorithm();b=algorithm('dampingMeter')
        relation=similarity(a,b)
        self.assertGreater(relation['score'],.7)
        self.assertEqual(sum(row['weight'] for row in relation['axes'].values()),100)
        self.assertEqual(profile(a)['market_scope'],'价格序列通用计算')

from django.test import TestCase
from unittest.mock import patch
from quant import test_research_analysis as research_fixtures
from quant.models import AIRun, FactorCandidate
from quant.worker import execute
from quant.sync import validate, metadata
from utils.sync_manager import SyncManager, SyncError

class AlgorithmPublicationTests(TestCase):
    def setUp(self):
        research_fixtures.AnalysisTests.setUp(self)
        self.workflow_defaults.stop()
    collect = research_fixtures.AnalysisTests.collect

    def test_source_variable_is_closed_published_exported_and_restored(self):
        self.payload['code'] = SOURCE.read_text()
        self.payload['language'] = 'pine'
        entry = self.collect()
        data = research_fixtures.result()
        factor = algorithm('isMajorMove', 'boolean_series')
        factor['expression'] = {'op': 'source', 'name': 'isMajorMove'}
        factor['evidence'] = [{'field':'code','quote':'bool isMajorMove = isAnomaly and math.sqrt(testStatistic) >= 2 * anomalyMultiple'}]
        params = algorithm()['parameters']
        for row in params:
            row['evidence'] = next(line for line in self.payload['code'].splitlines() if line.startswith(row['name'] + ' = input.'))
        data.update(parameters=params, extraction_version=1, extraction_note='提取完整计算算法', factors=[factor])
        data.update(initial_planning_version=1, initial_planning_note='本次完成源码算法入库，不创建行情实验', initial_proposal=None)
        def answer(config, prompt, **kwargs):
            value=copy.deepcopy(data)
            context=__import__('json').loads(prompt.split('材料：',1)[1])
            memory=context.get('research_memory')
            if memory:value.update(memory_note='无历史观察', memory_assessment=[{'kind':r['kind'],'id':r['id'],'effect':'context_only','reason':'源码计算'} for r in memory['items']])
            return __import__('json').dumps(value)
        run=AIRun.objects.get(entry=entry)
        self.assertEqual(run.workflow_version,41)
        with patch('quant.worker.complete',side_effect=answer):execute(run.pk)
        run.refresh_from_db();self.assertEqual(run.status,'completed',run.error)
        candidate=FactorCandidate.objects.get(report__entry=entry)
        self.assertEqual(candidate.data['expression']['op'],'program')
        self.assertEqual([row['name'] for row in candidate.data['inputs']],['close'])
        wire=self.client.get(f'/api/quant/{self.collection.pk}/factors/{candidate.pk}/').json()['data']
        self.assertEqual(wire['data']['expression']['outputType'],'boolean_series')
        self.assertEqual(wire['algorithmProfile']['inputs'],['close'])
        response=self.client.get(f'/api/quant/{self.collection.pk}/factors/{candidate.pk}/export/?target=python')
        self.assertEqual(response.status_code,200,response.data)
        self.assertIn('def compute(', response.data['data']['code'])
        graph=self.client.get(f'/api/quant/{self.collection.pk}/graph/?candidateId={candidate.pk}').data['data']
        self.assertFalse(any(row['kind']=='scenario_hypothesis' for row in graph['edges']))
        snapshot=SyncManager().build_snapshot_data();validate(snapshot,metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot,remote_meta=metadata(snapshot))
        legacy=metadata(snapshot);legacy['quant_schema_version']=82
        with self.assertRaises(SyncError):validate(snapshot,legacy)

        from quant.models import SourceRevision
        from quant.research.contracts import digest
        from quant.test_component_research import answer as component_answer
        from quant.test_source_change_review import artificial_review
        import json
        payload = {**run.source.payload, 'code': run.source.payload['code'] + '\n// independent source revision\n'}
        source = SourceRevision.objects.create(material=run.source.material, payload=payload, content_hash=digest(payload))
        response = self.client.post(f'/api/quant/{self.collection.pk}/entries/{entry.pk}/runs/', {
            'kind': 'analyze', 'source_id': source.pk, 'model_id': self.model.pk,
            'resume_run_id': run.pk, 'request_key': 'algorithm_incremental_42'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        incremental = AIRun.objects.get(pk=response.data['data']['id'])
        self.assertEqual(incremental.workflow_version, 42)
        def incremental_answer(config, text, **kwargs):
            if '量化源码组件分析员' in text:
                plan = incremental.workflow_steps.get(stage='snippets').input['snippet_plan']
                return json.dumps(component_answer(payload, plan))
            value = json.loads(answer(config, text, **kwargs))
            context = json.loads(text.split('材料：', 1)[1])
            if 'source_change_review_facts' in context:
                value.update(artificial_review(context['source_change_review_facts']))
            return json.dumps(value)
        with patch('quant.worker.complete', side_effect=incremental_answer):
            execute(incremental.pk)
        incremental.refresh_from_db()
        self.assertEqual(incremental.status, 'completed', incremental.error)
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        SyncManager().apply_snapshot_data(snapshot, remote_meta=metadata(snapshot))
        old_meta = metadata(snapshot); old_meta['quant_schema_version'] = 89
        with self.assertRaisesRegex(SyncError, '格式90'):
            validate(snapshot, old_meta)
