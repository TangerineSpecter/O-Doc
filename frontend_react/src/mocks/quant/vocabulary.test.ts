import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import type {QuantAIRun, QuantEntryDetail, QuantFactorCandidate} from '../../types/api/quant.ts';
import type {QuantVocabulary, VocabularyEdit} from '../../types/api/quantVocabulary.ts';
import {resolveQuantRoute} from './routes.ts';
import {quantState, resetQuantStateForTests} from './state.ts';
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {value: {getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key),
    key: (i: number) => [...storage.keys()][i] || null, get length() {return storage.size;}}, configurable: true});
Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=sample'), configurable: true});
beforeEach(() => {storage.clear(); resetQuantStateForTests(); Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=sample'), configurable: true});});
const base = '/api/quant/local-quant/';
const invoke = async <T>(path: string, method = 'GET', data?: unknown): Promise<T> => await resolveQuantRoute(new Request(`http://localhost${path}`,
    {method, headers: {Authorization: 'Token local-demo-token', 'Content-Type': 'application/json'}, ...(data ? {body: JSON.stringify(data)} : {})})) as T;

test('词表修订保留历史、歧义、稳定含义、请求幂等和私有范围；local 刷新不会改写研究报告', async () => {
    const initial = await invoke<QuantVocabulary>(base + 'vocabulary/');
    assert.ok(initial.catalog.terms.length > 40); assert.equal(initial.historyTotal, 0);
    assert.equal(quantState().vocabularies['local-quant'], undefined);
    const {entry} = await invoke<{entry: QuantEntryDetail}>(base + 'intake/', 'POST', {requestKey: 'vocabulary_source_fixture01', code: 'N=20\ndef factor(close): return close.pct_change(N)', language: 'python'});
    entry.runs[0].createdAt = '2020-01-01T00:00:00Z'; await invoke(base + `entries/${entry.id}/`);
    const reportBefore = JSON.stringify(quantState().entries.find(row => row.id === entry.id)!.reports);
    const term = initial.catalog.terms.find(row => row.id === 'mechanism:momentum')!;
    const body: VocabularyEdit = {term: {...term, aliases: [...term.aliases, '局部延续词', '混合词']}, expectedRevisionId: '', reason: '人工 local 别名测试', requestKey: 'vocabulary_alias_fixture01'};
    const saved = await invoke<QuantVocabulary>(base + 'vocabulary/', 'POST', body);
    assert.equal(saved.historyTotal, 1);
    assert.equal((await invoke<QuantVocabulary>(base + 'vocabulary/', 'POST', body)).historyTotal, 1);
    assert.equal((await invoke<Response>(base + 'vocabulary/', 'POST', {...body, requestKey: 'vocabulary_stale_fixture01'})).status, 409);
    const filtered = await invoke<{items: QuantFactorCandidate[]}>(base + `factors/?q=局部延续词&entryId=${entry.id}&taxonomyTerm=mechanism:momentum`);
    assert.equal(filtered.items.length, 1);
    assert.ok(filtered.items[0].classification?.terms.some(row => row.id === 'mechanism:momentum'));
    assert.ok(!filtered.items[0].classification?.terms.some(row => row.id === 'platform:joinquant'));
    const hybrid = await invoke<{items: QuantFactorCandidate[]}>(base + 'factors/search/', 'POST', {q: '局部延续词', taxonomyTerm: 'mechanism:momentum'});
    assert.ok(hybrid.items[0].searchMatch?.keywordFields.includes('分类词表'));
    const trend = saved.catalog.terms.find(row => row.id === 'mechanism:trend')!;
    const next = await invoke<QuantVocabulary>(base + 'vocabulary/', 'POST', {term: {...trend, aliases: [...trend.aliases, '混合词']}, expectedRevisionId: saved.reference.revisionId, reason: '歧义应显示', requestKey: 'vocabulary_ambig_fixture01'});
    assert.equal(next.ambiguities.find(row => row.label === '混合词')?.codes.length, 2);
    assert.equal((await invoke<Response>(base + 'vocabulary/', 'POST', {term: {...trend, definition: '复用编码'}, expectedRevisionId: next.reference.revisionId, reason: 'bad', requestKey: 'vocabulary_meaning_bad01'})).status, 400);
    resetQuantStateForTests();
    const restored = await invoke<QuantVocabulary>(base + 'vocabulary/?selectedRevisionId=' + saved.reference.revisionId);
    assert.equal(restored.reference.revisionId, saved.reference.revisionId);
    assert.equal(restored.currentReference.revisionId, next.reference.revisionId);
    assert.equal(restored.historyTotal, 2);
    assert.equal(JSON.stringify(quantState().entries.find(row => row.id === entry.id)!.reports), reportBefore);
    assert.equal((await invoke<Response>('/api/quant/foreign-collection/vocabulary/')).status, 404);
});

test('local词表失败与空数据可处理；新研究冻结 v4 引用，同源续跑保留原词表', async () => {
    const {entry} = await invoke<{entry: QuantEntryDetail}>(base + 'intake/', 'POST', {requestKey: 'vocabulary_workflow_fixture01', code: 'N=20\nLOCAL_WORKFLOW_FAIL_RESEARCH', language: 'python'});
    const old = entry.runs[0]; old.createdAt = '2020-01-01T00:00:00Z'; await invoke(base + `entries/${entry.id}/`);
    assert.equal(old.workflow?.version, 14); assert.equal(old.workflow?.maxModelCalls, 7);
    const initial = await invoke<QuantVocabulary>(base + 'vocabulary/');
    const term = initial.catalog.terms.find(row => row.id === 'mechanism:momentum')!;
    const changed = await invoke<QuantVocabulary>(base + 'vocabulary/', 'POST', {term: {...term, label: '动量统一测试'}, expectedRevisionId: '', reason: 'local 调整', requestKey: 'vocabulary_workflow_edit01'});
    const input = {kind: 'analyze', sourceId: old.sourceId, resumeRunId: old.id, requestKey: 'vocabulary_workflow_resume01'};
    const retry = await invoke<QuantAIRun>(base + `entries/${entry.id}/runs/`, 'POST', input);
    assert.deepEqual(retry.workflow?.vocabularyReference, old.workflow?.vocabularyReference);
    const restart = await invoke<QuantAIRun>(base + `entries/${entry.id}/runs/`, 'POST', {...input, restartStage: 'normalize', requestKey: 'vocabulary_workflow_restart01'});
    assert.equal(restart.workflow?.vocabularyReference?.revisionId, changed.reference.revisionId);
    Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=error'), configurable: true});
    assert.equal((await invoke<Response>(base + 'vocabulary/')).status, 503);
    Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=empty'), configurable: true});
    assert.equal((await invoke<QuantVocabulary>(base + 'vocabulary/')).historyTotal, 0);
    assert.equal((await invoke<{items: unknown[]}>(base + 'factors/')).items.length, 0);
});
