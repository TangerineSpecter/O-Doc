"""Regression for complete source incorrectly published as zero algorithms."""
import copy
import json
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from quant.algorithms.catalog import source_outputs
from quant.algorithms.correction import require_algorithms
from quant.factors.contracts import extraction_prompt
from quant.test_algorithms import SOURCE, algorithm
from quant import test_research_analysis as fixtures
from quant.models import AIRun, FactorCandidate, WorkflowOutcome
from quant.worker import execute


class AlgorithmPromptTests(SimpleTestCase):
    def test_source_catalog_contains_real_calculations_and_boolean_types(self):
        payload = {'code': SOURCE.read_text(), 'language': 'pine'}
        rows = {row['name']: row for row in source_outputs(payload)}
        for name in ('estimate', 'testStatistic', 'surpriseMeter', 'dampingMeter', 'kalmanGain', 'recentMoves', 'isMajorMove'):
            self.assertEqual(rows[name]['inputs'], ['close'])
        self.assertEqual(rows['isMajorMove']['output_type'], 'boolean_series')
        self.assertNotIn('NEAR_ZERO', rows)
        self.assertEqual(source_outputs({'code':'flag=close>open', 'language':'pine'})[0]['output_type'], 'boolean_series')

    def test_algorithm_instructions_have_no_legacy_null_fallback(self):
        text = extraction_prompt(algorithms=True)
        self.assertNotIn('否则 null', text)
        self.assertNotIn('expression=null', text)
        self.assertNotIn('不要把 RSI/EMA', text)
        self.assertIn('compiled_source_outputs', text)
        self.assertIn('op":"source', text)
        self.assertIn('否则 null', extraction_prompt())

    def test_new_incremental_prompt_does_not_change_frozen_previous_contract(self):
        from quant.test_stage_reuse import StageInputTests
        from quant.workflows.stage_reuse import request, compatible
        source, outputs, plan, vocabulary = StageInputTests().inputs()
        data = fixtures.result()
        outputs.update(identify={key:data[key] for key in ('title','kind','tags','source_facts')},
            parameters={'parameters':outputs['extract']['factors'][0]['parameters'], 'risks':data['risks'], 'unknowns':data['unknowns']},
            research={key:data[key] for key in ('summary','principle','formula','usage','assumptions','validation_plan')})
        old, old_text, error = request('extract', source, '', outputs, 30, plan, vocabulary)
        self.assertIsNone(error)
        current, current_text, error = request('extract', source, '', outputs, 32, plan, vocabulary)
        self.assertIsNone(error)
        self.assertIn('否则 null', old_text)
        self.assertNotIn('compiled_source_outputs', old_text)
        self.assertNotIn('否则 null', current_text)
        self.assertIn('compiled_source_outputs', current_text)
        self.assertFalse(compatible({'version':30, 'stage':'extract', 'model':{}, 'model_input':old},
            {'version':32, 'stage':'extract', 'model':{}, 'model_input':current}))

    def test_bilingual_names_apply_only_to_new_workflows(self):
        from quant.test_stage_reuse import StageInputTests
        from quant.workflows.stage_reuse import request
        source, outputs, plan, vocabulary = StageInputTests().inputs()
        data = fixtures.result()
        outputs.update(identify={key:data[key] for key in ('title','kind','tags','source_facts')},
            parameters={'parameters':outputs['extract']['factors'][0]['parameters'], 'risks':data['risks'], 'unknowns':data['unknowns']},
            research={key:data[key] for key in ('summary','principle','formula','usage','assumptions','validation_plan')})
        _, old, error = request('extract', source, '', outputs, 34, plan, vocabulary)
        self.assertIsNone(error)
        _, current, error = request('extract', source, '', outputs, 36, plan, vocabulary)
        self.assertIsNone(error)
        self.assertNotIn('简洁中文名称（English_Identifier）', old)
        self.assertIn('简洁中文名称（English_Identifier）', current)

    def test_zero_is_allowed_only_without_failed_or_compilable_algorithms(self):
        empty = {'factors':[], 'extraction_note':'纯样式定义'}
        require_algorithms(empty, empty, {'language':'pine','code':'indicator("Style")'})
        with self.assertRaises(ValidationError):
            require_algorithms(empty, empty, {'language':'pine', 'code':'x=close*2'})
        with self.assertRaises(ValidationError):
            require_algorithms({'factors':[{'expression':None}]}, empty, {'language':'python'})


class AlgorithmCorrectionTests(TestCase):
    def setUp(self):
        fixtures.AnalysisTests.setUp(self)
        self.workflow_defaults.stop()

    collect = fixtures.AnalysisTests.collect

    def run_extraction(self, initial, corrected):
        self.payload.update(code=SOURCE.read_text(), language='pine')
        entry = self.collect()
        data = fixtures.result()
        factor = algorithm('surpriseMeter')
        factor['expression'] = {'op':'source', 'name':'surpriseMeter'}
        factor['evidence'] = [{'field':'code', 'quote':'float surpriseMeter = 100.0 * math.max(1.0 - 1.0 / surpriseRatio, 0.0)'}]
        parameters = algorithm()['parameters']
        for row in parameters:
            row['evidence'] = next(line for line in self.payload['code'].splitlines() if line.startswith(row['name'] + ' = input.'))
        data.update(parameters=parameters, extraction_version=1, extraction_note='源码递推提取', factors=[factor],
            initial_planning_version=1, initial_planning_note='仅提取算法', initial_proposal=None)
        extraction_calls = []

        def answer(config, text, **kwargs):
            value = copy.deepcopy(data)
            # Correction has a trailing diagnostic block after the original JSON.
            context = json.JSONDecoder().raw_decode(text.split('材料：',1)[1].lstrip())[0]
            memory = context.get('research_memory')
            if memory:
                value.update(memory_note='无历史观察', memory_assessment=[{'kind':r['kind'],'id':r['id'],
                    'effect':'context_only','reason':'源码计算'} for r in memory['items']])
            if 'compiled_source_outputs' in context:
                self.assertIn('surpriseMeter', [row['name'] for row in context['compiled_source_outputs']])
                mode = initial if not extraction_calls else corrected
                if initial == 'truncated_then_malformed':
                    mode = ['truncated', 'malformed', corrected][min(len(extraction_calls), 2)]
                extraction_calls.append(text)
                if mode == 'null':
                    value['factors'][0]['expression'] = None
                    value['extraction_note'] = '时序索引、na初始化无法由平台无关表达式表示，因此expression使用null'
                elif mode == 'empty':
                    value['factors'] = []
                elif mode == 'truncated':
                    from utils.bounded_completion import AIOutputTruncated
                    raise AIOutputTruncated('length')
                elif mode == 'malformed':
                    return '{"factors":[{"expression":{"code":"bad\\q"}}]}'
            return json.dumps(value)

        run = AIRun.objects.get(entry=entry)
        self.assertEqual(run.workflow_version, 41)
        with patch('quant.worker.complete', side_effect=answer):
            execute(run.pk)
        run.refresh_from_db()
        self.assertEqual(len(extraction_calls), 3 if initial == 'truncated_then_malformed' else 2)
        self.assertIn('自动纠正', extraction_calls[1])
        return entry, run

    def test_null_result_is_corrected_to_executable_published_algorithm(self):
        entry, run = self.run_extraction('null', 'source')
        self.assertEqual(run.status, 'completed', run.error)
        candidate = FactorCandidate.objects.get(report__entry=entry)
        self.assertEqual(candidate.data['expression']['op'], 'program')
        self.assertEqual(candidate.data['expression']['output'], 'surpriseMeter')
        self.assertNotIn('expression使用null', run.result.get('extraction_note', ''))
        from utils.sync_manager import SyncManager, SyncError
        from quant.sync import metadata, validate
        snapshot = SyncManager().build_snapshot_data()
        validate(snapshot, metadata(snapshot))
        old_meta = {**metadata(snapshot), 'quant_schema_version':83}
        with self.assertRaises(SyncError):
            validate(snapshot, old_meta)

    def test_empty_result_is_corrected_when_source_outputs_exist(self):
        entry, run = self.run_extraction('empty', 'source')
        self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(FactorCandidate.objects.filter(report__entry=entry).count(), 1)

    def test_invalid_json_code_escaping_receives_automatic_correction(self):
        entry, run = self.run_extraction('malformed', 'source')
        self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(FactorCandidate.objects.filter(report__entry=entry).count(), 1)

    def test_truncated_output_retries_complete_compact_algorithms(self):
        entry, run = self.run_extraction('truncated', 'source')
        self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(FactorCandidate.objects.filter(report__entry=entry).count(), 1)

    def test_truncation_does_not_consume_the_format_correction_attempt(self):
        _, run = self.run_extraction('truncated_then_malformed', 'source')
        self.assertEqual(run.status, 'completed', run.error)

    def test_repeated_null_fails_extraction_without_publishing_zero_success(self):
        entry, run = self.run_extraction('null', 'null')
        self.assertEqual(run.status, 'failed')
        self.assertIn('自动纠正', run.error)
        self.assertFalse(FactorCandidate.objects.filter(report__entry=entry).exists())
        outcome = WorkflowOutcome.objects.get(step__run=run, step__stage='extract')
        self.assertEqual(outcome.data['status'], 'failed')

    def test_auxiliary_prompt_overflow_does_not_discard_extracted_algorithms(self):
        from quant.workflows.prompts import prompt as original
        def prompt(stage, *args, **kwargs):
            if stage in ('review','plan'):
                raise ValidationError('此阶段输入超过上限，请拆分资料；已完成阶段保留')
            return original(stage,*args,**kwargs)
        with patch('quant.workflows.runner.prompt',side_effect=prompt):
            entry, run = self.run_extraction('null','source')
        self.assertEqual(run.status,'completed',run.error)
        self.assertEqual(FactorCandidate.objects.filter(report__entry=entry).count(),1)
        self.assertIsNone(run.result['total_score'])
        self.assertIn('不影响算法入库',run.result['initial_planning_note'])
        from quant.workflows.presentation import summary
        state = summary(run)
        unfinished = [row for row in state['stages'] if row['status'] == 'partial']
        self.assertEqual([row['stage'] for row in unfinished], ['review', 'plan'])
        self.assertTrue(all('输入超出容量' in row['error'] for row in unfinished))
        self.assertEqual(sum(row['status'] in ('completed', 'reused') for row in state['stages']), 8)
        from utils.sync_manager import SyncManager
        from quant.sync import validate, metadata
        snapshot=SyncManager().build_snapshot_data()
        validate(snapshot,metadata(snapshot))

    def test_invalid_plan_variants_receive_one_correction(self):
        from quant.workflows.contracts import validate_output
        attempts = []
        def validate(stage, *args, **kwargs):
            if stage == 'plan':
                attempts.append(stage)
                if len(attempts) == 1:
                    raise ValidationError('AI 参数组重复或未改变基线')
            return validate_output(stage, *args, **kwargs)
        with patch('quant.workflows.runner.validate_output', side_effect=validate):
            _, run = self.run_extraction('null', 'source')
        self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(len(attempts), 2)
        self.assertEqual(run.result['initial_planning_note'], '仅提取算法')

    def test_repeated_invalid_plan_stays_partial_without_looping(self):
        from quant.workflows.contracts import validate_output
        from quant.workflows.presentation import summary
        attempts = []
        def validate(stage, *args, **kwargs):
            if stage == 'plan':
                attempts.append(stage)
                raise ValidationError('AI 参数组重复或未改变基线')
            return validate_output(stage, *args, **kwargs)
        with patch('quant.workflows.runner.validate_output', side_effect=validate):
            _, run = self.run_extraction('null', 'source')
        self.assertEqual(run.status, 'completed', run.error)
        self.assertEqual(len(attempts), 2)
        stage = next(row for row in summary(run)['stages'] if row['stage'] == 'plan')
        self.assertEqual(stage['status'], 'partial')
        self.assertIn('重复', stage['error'])
