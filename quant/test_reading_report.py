"""Reading contracts must not rewrite historical inputs or lose incremental reuse."""
import json
from django.test import SimpleTestCase
from quant.research.contracts import digest
from quant.test_research_analysis import result
from quant.test_stage_reuse import StageInputTests
from quant.workflows.prompts import prompt
from quant.workflows.stage_reuse import request


class ReadingReportTests(SimpleTestCase):
    def setUp(self):
        self.source, self.outputs, self.plan, self.vocabulary = StageInputTests().inputs()
        data = result()
        self.outputs.update(
            identify={key: data[key] for key in ('title', 'kind', 'tags', 'source_facts')},
            parameters={'parameters': self.outputs['extract']['factors'][0]['parameters'],
                        'risks': data['risks'], 'unknowns': data['unknowns']},
        )

    def text(self, version):
        return prompt('research', self.source, '', self.outputs, version, self.plan, self.vocabulary)

    def test_saved_previous_prompts_are_unchanged(self):
        for version, expected in (
            (35, 'd24ef6c2c6a4f00e8991f8f9240f6904548eb4ce2dc5c777252442695c2acb16'),
            (36, '1f0e8e782a9025798ceb2cec4e1187aaab83fa7b76d27027f22bc42e049da5f4'),
            (37, 'd591f035b5aae46562c09141d55c86c38f248d144f8184b8942770b4800aa432'),
            (38, '01848f4b5ff301b7075f0e2d6f53f2957147db616c868dc55edccb1307e33ffe'),
        ):
            self.assertEqual(digest(self.text(version)), expected)

    def test_both_new_routes_request_readable_sections_and_keep_evidence_separate(self):
        for version in (37, 38):
            text = self.text(version)
            shape = json.JSONDecoder().raw_decode(text.split('输出结构：', 1)[1])[0]
            self.assertTrue(shape['principle'].startswith('Markdown分节'))
            self.assertTrue(shape['usage'].startswith('Markdown分节'))
            self.assertNotIn('源码定位', shape['principle'])
            self.assertNotIn('情景假设', shape['usage'])
            self.assertNotIn('使用行号或逐字引文定位关键结论', text)
            self.assertIn('源码行号、代码行数', text)
            self.assertIn('来源定位保留在 source_facts、参数 evidence', text)
            self.assertIn('独立公式使用单独成行的 $$', text)
        contract, text, error = request('research', self.source, '', self.outputs, 38, self.plan, self.vocabulary)
        self.assertIsNone(error)
        self.assertEqual(contract['prompt_hash'], digest(text))

    def test_guided_report_order_and_saved_original_are_separate(self):
        from quant.research.analysis import analysis_markdown, validate_analysis
        data = validate_analysis(result())
        data.update(summary='作用说明', principle='1. **输入：**读取价格。', formula='公式正文',
                    usage='## 输出怎么看\n\n读数\n\n## 主要参数\n\n参数\n\n## 怎么使用\n\n使用步骤')
        legacy = analysis_markdown(data)
        self.assertIn('## 原理与计算逻辑', legacy)
        self.assertNotIn('## 它是怎么计算的', legacy)
        for kind, label in [('indicator', '指标'), ('strategy', '策略'), ('factor', '因子')]:
            text = analysis_markdown({**data, 'kind': kind}, guided_reading=True)
            titles = [f'## 这个{label}做什么', '## 它是怎么计算的', '## 关键公式与解读',
                      '## 输出怎么看', '## 主要参数', '## 怎么使用']
            positions = [text.index(title) for title in titles]
            self.assertEqual(positions, sorted(positions))
            self.assertNotIn('## 原理与计算逻辑', text)
        for version in (39, 40):
            text = self.text(version)
            shape = json.JSONDecoder().raw_decode(text.split('输出结构：', 1)[1])[0]
            self.assertIn('这个指标/策略/因子做什么', shape['summary'])
            self.assertIn('它是怎么计算的', shape['principle'])
            self.assertIn('关键公式与解读', shape['formula'])
            self.assertIn('## 输出怎么看、## 主要参数、## 怎么使用', shape['usage'])
