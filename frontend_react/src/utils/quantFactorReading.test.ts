import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { conciseFactorSummary, factorReadingNotes, pythonExpression, pythonFormula } from './quantFactorReading.ts';

test('reads explicitly delimited factor notes without losing surrounding report text', () => {
    const text = '# 报告\n\n## 原理\n正文\n\n<!-- quant-factor-calculations:v1 -->\n## 因子计算说明\n\n### alpha\n\n计算差值。\n\n```python\nresult = a - b\n```\n\n<!-- /quant-factor-calculations -->\n\n## 后记\n保留';
    const result = factorReadingNotes(text);
    assert.deepEqual(result.notes.alpha, {summary: '计算差值。', code: 'result = a - b'});
    assert.match(result.body, /## 原理\n正文/);
    assert.match(result.body, /## 后记\n保留/);
    assert.doesNotMatch(result.body, /因子计算说明/);
    assert.equal(factorReadingNotes(text.replace('<!-- /quant-factor-calculations -->', '')).body, text.replace('<!-- /quant-factor-calculations -->', ''));
    const invalid = text.replace('```python', '```text');
    assert.equal(factorReadingNotes(invalid).body, invalid);
    const withComment = text.replace('result = a - b', '### 这是代码注释\nresult = a - b');
    assert.match(factorReadingNotes(withComment).notes.alpha.code, /^### 这是代码注释/);
});

test('only presents marked Python and supported expression nodes as Python', () => {
    assert.equal(pythonFormula('文字\n```python\nx = 1\n```'), 'x = 1');
    assert.equal(pythonFormula('x = a ? b : c'), null);
    assert.equal(pythonExpression({op: 'sub', args: [{op: 'input', name: 'price'}, {op: 'parameter', name: 'mean'}]}), 'result = (price - mean)');
    assert.equal(pythonExpression({op: 'sum', args: [{op: 'input', name: 'price'}, {op: 'constant', value: 2}]}), null);
    assert.equal(pythonExpression({op: 'input', name: 'import'}), null);
    assert.equal(conciseFactorSummary('计算价格差值。作者引用了某论文。'), '计算价格差值。');
});
