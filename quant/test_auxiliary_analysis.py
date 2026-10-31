"""Scoring overflow must preserve factors without pretending evaluation succeeded."""
import copy
import json
from unittest.mock import patch
from django.test import SimpleTestCase
from quant.workflows.optional_analysis import incomplete_reason
from quant.workflows.algorithm_context import compact


class AuxiliaryAnalysisTests(SimpleTestCase):
    def test_saved_v28_review_prompt_is_unchanged(self):
        from quant.test_stage_reuse import StageInputTests
        from quant.test_research_analysis import result
        from quant.workflows.prompts import prompt
        from quant.research.contracts import digest
        source, outputs, plan, vocabulary = StageInputTests().inputs()
        data = result()
        outputs.update(identify={key: data[key] for key in ('title', 'kind', 'tags', 'source_facts')},
            compare={'research_memory': {'items': []}}, repair={'items': []},
            parameters={'parameters': outputs['extract']['factors'][0]['parameters'], 'risks': '', 'unknowns': []},
            research={key: data[key] for key in ('summary', 'principle', 'formula', 'usage', 'assumptions', 'validation_plan')})
        with patch('quant.source_changes.review.facts', return_value={'nodes': []}):
            text = prompt('review', source, '', outputs, 28, plan, vocabulary)
        self.assertEqual(digest(text), 'd404a52846168028c1cf0d7d2392363851b0acf62b0f79b127d51c4fccc9b400')
        self.assertNotIn('评分对象是材料中完整的原始源码', text)

    def test_planning_failure_explains_invalid_variants_without_raw_output(self):
        from rest_framework.exceptions import ValidationError
        from quant.workflows.runner import validation_reason
        self.assertIn('重复', validation_reason(ValidationError('AI 参数组重复或未改变基线')))
        self.assertIn('parameters', validation_reason(ValidationError({'parameters': ['格式错误']})))

    def test_only_system_fallback_is_unfinished(self):
        self.assertFalse(incomplete_reason('review', {'scores': [{'score': None, 'reason': '没有源码', 'evidence': '只有说明'}]}))
        self.assertFalse(incomplete_reason('plan', {'initial_planning_note': '本次无需实验', 'initial_proposal': None}))
        note = '算法已提取并保留。评分本次未生成，不影响算法入库。辅助阶段输入超出容量。'
        self.assertEqual(incomplete_reason('review', {'scores': [{'score': None, 'reason': note,
            'evidence': '系统保留已完成的源码算法提取成果，未生成评分。'}]}), note)

    def test_old_algorithm_workflows_compact_only_auxiliary_context(self):
        from quant.test_stage_reuse import StageInputTests
        from quant.test_research_analysis import result
        from quant.workflows.prompts import prompt
        source, outputs, plan, vocabulary = StageInputTests().inputs()
        data = result()
        outputs.update(identify={key: data[key] for key in ('title', 'kind', 'tags', 'source_facts')},
            compare={'research_memory': {'items': []}}, repair={'items': []},
            parameters={'parameters': [], 'risks': '', 'unknowns': []},
            research={key: data[key] for key in ('summary', 'principle', 'formula', 'usage', 'assumptions', 'validation_plan')})
        factor = outputs['extract']['factors'][0]
        factor['expression'] = {'op': 'python', 'version': 1, 'code': '# repeated implementation\n' * 7000 + '\ndef compute(inputs, parameters=None):\n    return inputs["close"]\n'}
        factor['formula'] = 'formula kept in library'
        original = copy.deepcopy(outputs)
        for version in (31, 32):
            with patch('quant.source_changes.review.facts', return_value={'nodes': []}):
                text = prompt('review', source, '', outputs, version, plan, vocabulary)
            self.assertIn('评分对象是材料中完整的原始源码', text)
            self.assertIn('不等于这几个维度无法评分', text)
            self.assertLess(len(text), 300000)
            self.assertNotIn('# repeated implementation', text)
            self.assertIn('formula kept in library', json.dumps(outputs))
        self.assertEqual(original, outputs)

    def test_compaction_keeps_source_and_algorithm_metadata(self):
        factor = {'name': 'gain', 'formula': 'P/(P+R)', 'expression': {'op': 'program', 'output': 'gain'},
            'parameters': [{'name': 'period', 'default_value': '20', 'source_binding': {}}], 'inputs': ['close']}
        context = {'source': {'code': 'original source'}, 'previous': {'extract': {'factors': [factor]}}}
        value = compact(context)
        self.assertEqual(value['source'], context['source'])
        self.assertEqual(value['previous']['extract']['factors'][0]['implementation']['output'], 'gain')
        self.assertEqual(value['previous']['extract']['factors'][0]['parameters'][0]['default_value'], '20')

    def test_current_review_explains_deductions_without_penalizing_tools(self):
        from quant.test_stage_reuse import StageInputTests
        from quant.test_research_analysis import result
        from quant.workflows.prompts import prompt
        source, outputs, plan, vocabulary = StageInputTests().inputs()
        data = result()
        outputs.update(identify={key: data[key] for key in ('title', 'kind', 'tags', 'source_facts')},
            compare={'research_memory': {'items': []}}, repair={'items': []},
            parameters={'parameters': [], 'risks': '', 'unknowns': []},
            research={key: data[key] for key in ('summary', 'principle', 'formula', 'usage', 'assumptions', 'validation_plan')})
        with patch('quant.source_changes.review.facts', return_value={'nodes': []}):
            text = prompt('review', source, '', outputs, 41, plan, vocabulary)
        self.assertIn('扣分必须对应原源码中的具体事实', text)
        self.assertIn('没有具体问题不得为了保守而扣分', text)
        for label in ('优点：', '问题与影响：', '扣分说明：', '源码依据：', '验证情况：'):
            self.assertIn(label, text)
        self.assertIn('本系统验证状态，不能给原源码扣分', text)

    def test_review_context_keeps_source_but_excludes_pipeline_limitations(self):
        from quant.research.score_guidance import context
        original = {'source': {'code': 'complete source'}, 'source_structure': {'status': 'partial'},
            'portable_qualification': {'automatic_experiment_ready': False},
            'research_memory': {'items': ['frozen evidence']},
            'previous': {'parameters': {'parameters': [], 'risks': 'not compiled'},
                'research': {'formula': 'x + y', 'validation_plan': 'run later'},
                'extract': {'factors': [{'name': 'x', 'dependencies': ['external file'], 'limitations': 'not tested'}]}}}
        before = copy.deepcopy(original)
        value = context(original)
        self.assertEqual(value['source'], original['source'])
        self.assertEqual(value['research_memory'], original['research_memory'])
        self.assertEqual(value['previous']['extract']['factors'][0]['dependencies'], ['external file'])
        self.assertNotIn('limitations', value['previous']['extract']['factors'][0])
        self.assertNotIn('source_structure', value)
        self.assertNotIn('portable_qualification', value)
        self.assertEqual(original, before)
