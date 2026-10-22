import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantFilename, quantScriptLanguage, quantTags } from './quant.ts';

test('only known text scripts become editable drafts', () => {
    assert.equal(quantScriptLanguage('ALPHA.PY'), 'python');
    assert.equal(quantScriptLanguage('factor.mq4'), 'mql4');
    assert.equal(quantScriptLanguage('factor.ipynb'), null);
    assert.equal(quantScriptLanguage('report.csv'), null);
    assert.equal(quantScriptLanguage('payload.py.exe'), null);
});

test('tags normalize separators and preserve first occurrence', () => {
    assert.deepEqual(quantTags(' 趋势,动量，趋势\n均线 '), ['趋势', '动量', '均线']);
    assert.deepEqual(quantTags(' ,， '), []);
});

test('code downloads have language extension and safe filename', () => {
    assert.equal(quantFilename('趋势/均线', 'python'), '趋势_均线.py');
    assert.equal(quantFilename('Alpha', 'mql4'), 'Alpha.mq4');
});
