import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import type {QuantEntryDetail, QuantFactorCandidate} from '../../types/api/quant.ts';
import type {QuantFormulaHistory, QuantFormulaEditResult} from '../../types/api/quantFormulaVersion.ts';
import {resolveQuantRoute} from './routes.ts';
import {quantState, resetQuantStateForTests} from './state.ts';
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {value: {getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key),
    key: (i: number) => [...storage.keys()][i] || null, get length() {return storage.size;}}, configurable: true});
Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=sample'), configurable: true});
beforeEach(() => {storage.clear(); resetQuantStateForTests();});
const base = '/api/quant/local-quant/';
const invoke = async <T>(path: string, method = 'GET', data?: unknown): Promise<T> => await resolveQuantRoute(new Request(`http://localhost${path}`,
    {method, headers: {Authorization: 'Token local-demo-token', 'Content-Type': 'application/json'}, ...(data ? {body: JSON.stringify(data)} : {})})) as T;

test('公式完整定义新建独立候选、两版对照、当前版选择与回退留痕，刷新与源报告不漂移', async () => {
    const {entry} = await invoke<{entry: QuantEntryDetail}>(base + 'intake/', 'POST', {requestKey: 'formula_versions_source_001',
        title: '人工版本样例', code: 'N=20\nclose.pct_change(N)', language: 'python'});
    entry.runs[0].createdAt = '2020-01-01T00:00:00Z'; await invoke(`${base}entries/${entry.id}/`);
    const parent = (await invoke<{items: QuantFactorCandidate[]}>(base + `factors/?entryId=${entry.id}`)).items[0];
    const original = JSON.stringify(quantState().entries.find(row => row.id === entry.id)!.reports);
    const path = (id: string) => base + `factors/${id}/formula-versions/`;
    const first = await invoke<QuantFormulaHistory>(path(parent.id));
    assert.equal(first.versionsTotal, 1); assert.equal(first.currentCandidateId, parent.id);
    assert.equal((await invoke<Response>(path(parent.id), 'POST', {requestKey: 'formula_versions_same_001', definitionJson: first.definitionJson, reason: '没有变化'})).status, 400);
    const definition = JSON.parse(first.definitionJson);
    assert.ok('output_type' in definition && !('outputType' in definition));
    assert.ok('default_value' in definition.parameters[0]);
    definition.name = '人工修订的两倍公式'; definition.formula = '(old expression) * 2';
    definition.expression = {op: 'mul', args: [definition.expression, {op: 'constant', value: 2}]};
    const input = {requestKey: 'formula_versions_edit_001', definitionJson: JSON.stringify(definition), reason: '人工 local 版本，无实证晋升'};
    const saved = await invoke<QuantFormulaEditResult>(path(parent.id), 'POST', input);
    assert.notEqual(saved.candidate.id, parent.id); assert.equal(saved.candidate.data.evidence.length, 0);
    assert.equal(saved.candidate.data.formulaVersion?.rootId, parent.id); assert.equal(saved.history.versionsTotal, 2);
    assert.equal(saved.history.currentCandidateId, parent.id);
    const grouped = await invoke<{total: number; items: QuantFactorCandidate[]}>(base + `factors/?groupBy=lineage&entryId=${entry.id}`);
    assert.equal(grouped.total, 1); assert.equal(grouped.items[0].id, parent.id);
    assert.equal((await invoke<QuantFormulaEditResult>(path(parent.id), 'POST', input)).candidate.id, saved.candidate.id);
    assert.equal((await invoke<Response>(path(parent.id), 'POST', {...input, reason: 'changed'})).status, 409);
    const selected = await invoke<QuantFormulaHistory>(path(saved.candidate.id) + 'select/', 'POST',
        {requestKey: 'formula_versions_head_001', reason: '工作研究版，不改分数', expectedSelectionId: ''});
    assert.equal(selected.currentCandidateId, saved.candidate.id);
    assert.equal((await invoke<{items: QuantFactorCandidate[]}>(base + `factors/?groupBy=lineage&entryId=${entry.id}`)).items[0].id, saved.candidate.id);
    assert.equal((await invoke<Response>(path(parent.id) + 'select/', 'POST', {requestKey: 'formula_versions_stale01', reason: 'stale', expectedSelectionId: ''})).status, 409);
    const reverted = await invoke<QuantFormulaHistory>(path(parent.id) + 'select/', 'POST',
        {requestKey: 'formula_versions_revert01', reason: '恢复旧版继续对照', expectedSelectionId: selected.currentSelectionId});
    assert.equal(reverted.currentCandidateId, parent.id); assert.equal(reverted.selectionsTotal, 2);
    assert.equal((await invoke<{items: QuantFactorCandidate[]}>(base + `factors/?groupBy=lineage&entryId=${entry.id}`)).items[0].id, parent.id);
    assert.equal(JSON.stringify(quantState().entries.find(row => row.id === entry.id)!.reports), original);
    resetQuantStateForTests();
    const after = await invoke<QuantFormulaHistory>(path(saved.candidate.id));
    assert.equal(after.currentSelectionId, reverted.currentSelectionId); assert.equal(after.rootCandidateId, parent.id);
    assert.equal(JSON.parse(after.definitionJson).expression.args[1].value, 2);
    const invalid = {...definition, expression: {op: 'exec', args: []}};
    assert.equal((await invoke<Response>(path(parent.id), 'POST', {...input, requestKey: 'formula_versions_bad_001', definitionJson: JSON.stringify(invalid)})).status, 400);
});
