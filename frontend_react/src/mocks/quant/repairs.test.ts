import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import type {QuantEntryDetail, QuantFactorCandidate} from '../../types/api/quant.ts';
import type {QuantVerification} from '../../types/api/quantVerification.ts';
import type {QuantFormulaHistory} from '../../types/api/quantFormulaVersion.ts';
import {resolveQuantRoute} from './routes.ts';
import {resetQuantStateForTests, quantState} from './state.ts';
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {value: {getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key),
    key: (i: number) => [...storage.keys()][i] || null, get length() {return storage.size;}}, configurable: true});
Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=sample'), configurable: true});
beforeEach(() => {storage.clear(); resetQuantStateForTests();});
const base = '/api/quant/local-quant/';
const api = async <T>(path: string, method = 'GET', data?: unknown): Promise<T> => await resolveQuantRoute(new Request('http://localhost' + path,
    {method, headers: {Authorization: 'Token local-demo-token', 'Content-Type': 'application/json'}, ...(data ? {body: JSON.stringify(data)} : {})})) as T;
async function collect(marker: string) {
    const {entry} = await api<{entry: QuantEntryDetail}>(base + 'intake/', 'POST', {requestKey: 'automatic_repair_fixture01', title: 'AI修订来源身份验收', language: 'python',
        code: '# ' + marker + '\nN=20\ndef factor(close): return close / close.shift(N) - 1'});
    entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    return api<QuantEntryDetail>(base + `entries/${entry.id}/`);
}
test('自动生成 AI 修订版本，原提取不改写，方案明确绑定修订候选并可追溯', async () => {
    const entry = await collect('LOCAL_AI_REPAIR'), report = entry.reports![0];
    assert.equal(entry.runs[0].workflow?.version, 16); assert.equal(entry.runs[0].workflow?.maxModelCalls, 7);
    assert.equal(entry.runs[0].workflow?.stages.length, 10);
    assert.equal(report.data.factorRepair?.items[0].status, 'revised');
    assert.equal(report.data.factors?.[0].expression, null);
    assert.ok(report.markdown.includes('AI 定义修订'));
    const items = (await api<{items: QuantFactorCandidate[]}>(base + `factors/?entryId=${entry.id}&groupBy=none`)).items;
    const child = items.find(row => row.data.formulaVersion?.origin === 'ai_repair')!, parent = items.find(row => !row.data.formulaVersion)!;
    assert.ok(child.data.expression); assert.equal(parent.data.expression, null); assert.equal(child.entryTitle, entry.title);
    const detail = await api<QuantVerification>(base + `factors/${parent.id}/verification/`);
    assert.equal(detail.aiRevisions?.[0].candidateId, child.id);
    assert.equal((await api<QuantVerification>(base + `factors/${child.id}/verification/`)).total, 0);
    const history = await api<QuantFormulaHistory>(base + `factors/${parent.id}/formula-versions/`);
    assert.ok(history.versions.some(row => row.origin === 'ai_repair'));
    assert.equal(report.proposal?.candidates[0].id, child.id);
    const plan = JSON.parse(report.proposal!.dataJson);
    assert.equal(plan.baseline_status, 'ai_revised_definition_defaults_not_native_or_live_settings');
    assert.ok(plan.evidence_refs.includes('repair:0'));
    const count = quantState().derivedFactors.length;
    resetQuantStateForTests();
    await api(base + `entries/${entry.id}/`);
    assert.equal(quantState().derivedFactors.length, count);
});
test('缺依赖时保留未解决原因与原候选，不生成伪造可复用版本', async () => {
    const entry = await collect('LOCAL_AI_REPAIR_UNRESOLVED');
    assert.equal(entry.reports![0].data.factorRepair?.items[0].status, 'unresolved');
    assert.equal(entry.reports![0].proposal, null);
    assert.equal(quantState().derivedFactors.length, 0);
});
