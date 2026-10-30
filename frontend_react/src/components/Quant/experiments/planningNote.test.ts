import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planningNoteParagraphs, planningNoteSections} from './planningNoteSections.ts';
import {blockedPlanningNoteSample} from '../../../mocks/quant/planningNote.ts';

test('long prose groups only explicit themes and preserves evidence values', () => {
    const sections = planningNoteSections(blockedPlanningNoteSample);
    assert.deepEqual(sections.map(row => row.title), ['说明与边界', '源码事实', '参数默认值方面', '平台语义未知', '时点方面', '综合', '待补充内容']);
    assert.match(sections[2].text, /anomalyMultiple=2.05/);
    assert.match(sections[5].text, /initial_proposal 为 null/);
    assert.match(sections[6].text, /完整行情映射/);
});
test('markdown fences, headings and unstructured notes remain available', () => {
    for (const text of ['## 结论\n\n正文\n\n```python\n# 源码事实：不是章节\nx=2.05\n```', '普通短说明。']) {
        assert.equal(planningNoteSections(text)[0].text, text);
    }
    assert.deepEqual(planningNoteSections('  '), []);
});
test('paragraphs preserve decimal, quoted punctuation and every non-whitespace character', () => {
    const text = '说明'.repeat(60) + '。参数 anomalyMultiple=2.05，引用“第一句。第二句。”，函数 math.sqrt(x)。\n下一段。';
    const paragraphs = planningNoteParagraphs(text);
    assert.equal(paragraphs.length, 3);
    assert.ok(paragraphs[1].includes('“第一句。第二句。”'));
    assert.equal(paragraphs.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
});
test('markdown tables and lists retain line structure', () => {
    const text = '- 第一项\n- 第二项\n\n|参数|值|\n|---|---|\n|a|2.05|';
    assert.deepEqual(planningNoteParagraphs(text), [text]);
    const table = '|参数|值|\n|---|---|\n|a|2.05|';
    assert.deepEqual(planningNoteParagraphs(table), [table]);
});

test('reading view drops preamble navigation and separates conclusions from technical evidence', async () => {
    const {planningNoteReading} = await import('./planningNoteReading.ts');
    const result = planningNoteReading(blockedPlanningNoteSample);
    assert.deepEqual(result.primary.map(row => row.title), ['研究结论', '需要补齐', '下一步']);
    assert.ok(result.evidence.length > 0);
    assert.ok(!JSON.stringify(result).includes('说明与边界'));
    assert.ok(!result.primary.some(row => row.text.includes('initial_proposal')));
    assert.ok(!result.primary.some(row => row.text.includes('不执行源码')));
    assert.match(blockedPlanningNoteSample, /initial_proposal 为 null/);
});

test('reading copy removes locations while preserving numeric values and parameter names', async () => {
    const {planningReadingText} = await import('./planningNoteReading.ts');
    const text = '第4行版本声明，anomalyMultiple=2.05（第66行），NOISE_DECAY=0.9（第90行）；平台检查（第178、214行），告警（第489–520行）。';
    const result = planningReadingText(text);
    assert.doesNotMatch(result, /第\d+|\d+行/);
    assert.match(result, /anomalyMultiple=2.05/);
    assert.match(result, /NOISE_DECAY=0.9/);
    assert.match(text, /第66行/);
});

test('missing inputs become a list without splitting expressions or nested enumerations', async () => {
    const {planningMissingItems} = await import('./planningNoteReading.ts');
    assert.deepEqual(planningMissingItems('受控表达式（尤其 factor:0、factor:1）、状态定义、行情映射，以及平台验证。'),
        ['受控表达式（尤其 factor:0、factor:1）', '状态定义', '行情映射，以及平台验证']);
});
