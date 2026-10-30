import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { QuantAnalysis } from '../types/api/quant';
import { readingParameterDefault, readingParameterGroup, readingParameterName } from './quantParameterReading.ts';

type Parameter = QuantAnalysis['parameters'][number];
const source = (quote: string, defaultRaw: string): Parameter => ({
    name: 'sourcePrice', type: 'unknown', defaultValue: '', category: 'signal', meaning: '', effect: '', constraints: '', suggestion: '', evidence: '',
    sourceBinding: {version: 1, sourceHash: 'hash', sourceName: 'sourcePrice', status: 'resolved', id: 'id', file: '__source__.pine',
        scope: '<module>', kind: 'exposed_input', ordinal: 1, type: 'unknown', defaultRaw, literal: {kind: 'unknown', value: null}, line: 1, endLine: 1, quote, conditional: false},
});

test('shows Pine label and explains source default without claiming a runtime value', () => {
    const parameter = source('sourcePrice = input.source(close, "Source", tooltip="hello")', 'close');
    assert.deepEqual(readingParameterName(parameter), {title: 'Source', symbol: 'sourcePrice'});
    assert.equal(readingParameterDefault(parameter), '收盘价（close）');
    assert.equal(readingParameterGroup(parameter), 'input');
});

test('retains unknown expressions, other platforms, false and missing values honestly', () => {
    const parameter = source('v = input.source(other, title="Price")', 'other');
    assert.equal(readingParameterName(parameter).title, 'Price');
    assert.equal(readingParameterDefault(parameter), '表达式：other');
    assert.equal(readingParameterDefault({...parameter, type: 'bool', defaultValue: 'false'}), '关闭');
    assert.equal(readingParameterDefault({...parameter, type: 'string', defaultValue: 'false'}), 'false');
    assert.equal(readingParameterDefault({...parameter, sourceBinding: undefined}), '未提供');
    assert.equal(readingParameterName({...parameter, sourceBinding: undefined}).title, 'sourcePrice');
    assert.equal(readingParameterGroup({...parameter, category: 'constant'}), 'internal');
    assert.equal(readingParameterGroup({...parameter, category: 'display'}), 'display');
    assert.equal(readingParameterName(source('v = input.color(color.rgb(1, 2, 3), "My, color")', 'color.rgb(1, 2, 3)')).title, 'My, color');
    assert.equal(readingParameterName(source('v = input.int(1, title=dynamicName)', '1')).title, 'sourcePrice');
});
