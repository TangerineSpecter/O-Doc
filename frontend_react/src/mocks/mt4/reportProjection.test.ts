import assert from 'node:assert/strict';
import test from 'node:test';
import {preserveHiddenMT4Parameters, projectMT4Report} from './reportProjection';
import {resolveMT4Route} from './routes';
import {quantState, resetQuantStateForTests} from '../quant/state';
import type {MT4ExpertDetail, MT4TestDetail} from '../../types/api/mt4Archive';

test('report responses omit recognized annotations and magic while keeping real settings', () => {
    const report = {fields: {parameters: 'comm2=annotation;magic=1', symbol: 'EURUSD'}, parameters: [
        {name: 'comm2', value: '"Max spread:"'}, {name: 'MaxSpread', value: '5'},
        {name: 'Trade_Lot_Settings', value: '"Trade lot:"'}, {name: 'Comments', value: '"EA"'},
        {name: 'Magic_Number', value: '1'}, {name: 'commission', value: '2'},
        {name: 'MagicMultiplier', value: '3'}, {name: 'Lot_Settings', value: '4'},
    ]};
    const projected = projectMT4Report(report);
    assert.deepEqual(projected.parameters?.map(item => item.name), ['MaxSpread', 'commission', 'MagicMultiplier', 'Lot_Settings']);
    assert.deepEqual(projected.fields, {symbol: 'EURUSD'});
    assert.equal(report.parameters.length, 8);
    const merged = preserveHiddenMT4Parameters(report, {...projected, parameters: [{name: 'MaxSpread', value: '6'}]});
    assert.deepEqual(merged.parameters?.map(item => item.name), ['comm2', 'MaxSpread', 'Trade_Lot_Settings', 'Comments', 'Magic_Number']);
    assert.equal(merged.fields?.parameters, report.fields.parameters);
});

test('local mock projects both list and detail while preserving stored sample', async () => {
    resetQuantStateForTests();
    const stored = quantState().mt4Records[0].tests[0];
    assert.ok(stored.data.parameters?.some(item => item.name === 'magic'));
    const url = 'http://localhost/api/quant/local-mt4/mt4/experts/local-mt4-expert/';
    const detail = await resolveMT4Route(new Request(url), 'local-mt4', ['experts', 'local-mt4-expert']) as MT4ExpertDetail;
    const testDetail = await resolveMT4Route(new Request(`${url}tests/local-mt4-test/`), 'local-mt4', ['experts', 'local-mt4-expert', 'tests', 'local-mt4-test']) as MT4TestDetail;
    const expected = ['MaxSpread', 'start_lot', 'increment', 'tp_in_money'];
    assert.deepEqual(detail.backtests[0].data.parameters?.map(item => item.name), expected);
    assert.deepEqual(testDetail.backtest.data.parameters?.map(item => item.name), expected);
    assert.ok(stored.data.parameters?.some(item => item.name === 'magic'));
    const edit = new Request(`${url}tests/local-mt4-test/`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({title: '编辑后', data: testDetail.backtest.data})});
    await resolveMT4Route(edit, 'local-mt4', ['experts', 'local-mt4-expert', 'tests', 'local-mt4-test']);
    assert.ok(stored.data.parameters?.some(item => item.name === 'magic'));
    assert.ok(stored.data.parameters?.some(item => item.name === 'comm2'));
});

test('local mock persists, returns and validates attachment notes', async () => {
    resetQuantStateForTests();
    const row = quantState().mt4Records[0];
    row.attachments.push({id: 'note-ref', assetId: 'demo', backtestId: null, role: 'attachment', note: '', name: 'sample.zip', fileType: 'archive', url: ''});
    const url = 'http://localhost/api/quant/local-mt4/mt4/experts/local-mt4-expert/';
    const route = ['experts', 'local-mt4-expert', 'attachments', 'note-ref'];
    const edit = (note: unknown) => new Request(`${url}attachments/note-ref/`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({note})});
    await resolveMT4Route(edit('示例用途'), 'local-mt4', route);
    const detail = await resolveMT4Route(new Request(url), 'local-mt4', ['experts', 'local-mt4-expert']) as MT4ExpertDetail;
    assert.equal(detail.attachments[0].note, '示例用途');
    const invalid = await resolveMT4Route(edit('x'.repeat(501)), 'local-mt4', route) as Response;
    assert.equal(invalid.status, 400);
    await resolveMT4Route(edit(''), 'local-mt4', route);
    assert.equal(row.attachments[0].note, '');
});
