import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMockExecution, mockExecutionParameterComparison} from '../mocks/quant/platformEvidence.ts';
import {executionTemplate, decodeExecutionFile} from './quantExecutionTemplates.ts';
import {defaultExecutionOptions, executionPreviewKey, readExecutionPreview, readComputedExecution, executionDocumentBytes} from './quantPlatformEvidence.ts';
import type {QuantSource} from '../types/api/quant.ts';

const input = (sample: 'reconciled' | 'mismatch' | 'partial' = 'reconciled') => ({document: executionTemplate('standard-execution-json-v1', sample), executionAdapter: 'standard-execution-json-v1', executionOptionsJson: JSON.stringify(defaultExecutionOptions())});

test('执行证据 decoder 与本地明确人工模板一致，固定十进制文字、未知与完整引用', () => {
    for (const sample of ['reconciled', 'mismatch', 'partial'] as const) {
        const preview = normalizeMockExecution(input(sample)), json = JSON.stringify(preview);
        const value = readExecutionPreview(json, 'standard-execution-json-v1');
        assert.equal(value.execution_accounting.status, sample === 'partial' ? 'insufficient' : sample);
        assert.equal(value.local_demo, true);
        assert.equal(value.execution_evidence.parameters[0].name, 'N');
        assert.equal(value.execution_evidence.parameters[0].value, '20');
        assert.equal(value.execution_evidence.records[0].kind, 'trade');
        assert.equal(value.execution_evidence.records[0].sequence, 1);
        assert.ok(value.execution_summary.refs.includes('accounting:net_profit'));
        const comparison = mockExecutionParameterComparison(preview, {id: 'source', contentHash: 'source-hash'} as QuantSource);
        const computed = readComputedExecution(JSON.stringify({execution_summary: value.execution_summary, execution_parameter_comparison: comparison}));
        assert.equal(computed.execution_parameter_comparison.source_id, 'source');
        assert.equal(computed.execution_summary.parameters[0].value, '20');
        assert.equal(JSON.stringify(preview), json);
    }
    const document = JSON.parse(input().document);
    document.parameters = [{name: 'Case_Sensitive_N', value: '900719925474099312345', unit: ''}];
    document.records[0].commission = '-0.123456789123456789';
    const value = readExecutionPreview(JSON.stringify(normalizeMockExecution({...input(), document: JSON.stringify(document)})));
    assert.equal(value.execution_evidence.parameters[0].name, 'Case_Sensitive_N');
    assert.equal(value.execution_evidence.parameters[0].value, '900719925474099312345');
    assert.equal(value.execution_evidence.records[0].kind === 'trade' && value.execution_evidence.records[0].commission, '-0.123456789123456789');
    assert.equal(value.execution_accounting.metrics.equity_drawdown_fraction.value, null);
});

test('执行证据拒绝错配摘要、非法金额与未知字段状态，不将坏核算包装成成功', () => {
    const original = normalizeMockExecution(input());
    const mutate: ((value: any) => void)[] = [value => {value.local_demo = 'true';}, value => {value.execution_evidence.method = 'other';},
        value => {value.execution_accounting.evidence_hash = 'other';}, value => {value.execution_summary.accounting_hash = 'other';},
        value => {value.execution_evidence.records[0].profit = 'NaN';}, value => {value.execution_accounting.metrics.net_profit.value = 'Infinity';},
        value => {value.execution_accounting.metrics.net_profit.status = 'unavailable';}, value => {value.execution_evidence.counts.records = 100;},
        value => {value.execution_accounting.counts.known_net_trades = -1;}, value => {value.execution_summary.refs.push('not-in-frozen-evidence');},
        value => {value.execution_summary.sample_records = [];}, value => {value.execution_summary.anomalies.omitted = 1;}];
    for (const change of mutate) {const value = structuredClone(original); change(value); assert.throws(() => readExecutionPreview(JSON.stringify(value)), /无法读取/);}
    assert.throws(() => readExecutionPreview(JSON.stringify(original), 'mt4-tester-html-v1'), /无法读取/);
    assert.throws(() => readExecutionPreview('{'), /无法读取/);
    assert.throws(() => readComputedExecution(JSON.stringify({execution_summary: original.execution_summary, execution_parameter_comparison: {}})), /无法读取/);
    assert.throws(() => normalizeMockExecution({...input(), document: executionTemplate('standard-execution-json-v1', 'invalid')}), /无效|金额|数值/);
});

test('执行原文按编码完整读取并限制 UTF-8 字节，旧预览键绑定全部核算输入和来源', () => {
    const document = '完整原文\nN=20';
    const bytes = new TextEncoder().encode(document);
    assert.equal(decodeExecutionFile(bytes.buffer), document);
    const utf16 = new Uint8Array(2 + document.length * 2); utf16.set([0xff, 0xfe]);
    for (let i = 0; i < document.length; i++) {utf16[2 + 2 * i] = document.charCodeAt(i) & 255; utf16[3 + 2 * i] = document.charCodeAt(i) >> 8;}
    assert.equal(decodeExecutionFile(utf16.buffer), document);
    assert.throws(() => decodeExecutionFile(new Uint8Array([0xff]).buffer), /编码/);
    assert.throws(() => decodeExecutionFile(new Uint8Array(1024 * 1024 + 1).buffer), /1 MiB/);
    assert.throws(() => decodeExecutionFile(new TextEncoder().encode('x\0y').buffer), /二进制/);
    assert.equal(executionDocumentBytes('中'), 3);
    const args = ['collection', 'entry', 'raw', 'standard-execution-json-v1', JSON.stringify(defaultExecutionOptions()), 'source-a'] as const;
    const key = executionPreviewKey(...args);
    for (let index = 0; index < args.length; index++) {const changed = [...args]; changed[index] += '-changed'; assert.notEqual(executionPreviewKey(...changed as unknown as Parameters<typeof executionPreviewKey>), key);}
});
