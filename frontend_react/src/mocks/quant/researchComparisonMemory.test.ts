import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import type {QuantAIRun, QuantEntryDetail, QuantFactorCandidate, QuantSource} from '../../types/api/quant.ts';
import type {QuantComparison, QuantFactorMerge} from '../../types/api/quantComparison.ts';
import {readResearchMemory, researchMemoryReference} from '../../utils/quantResearchMemory.ts';
import {resolveQuantFixtureRequest as resolveQuantRoute} from './testReadingFixture.ts';
import {quantState, resetQuantStateForTests} from './state.ts';
import {mockComparisonMemory} from './researchComparisonMemory.ts';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {value: {getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key),
    key: (i: number) => [...storage.keys()][i] || null, get length() {return storage.size;}}, configurable: true});
Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=sample'), configurable: true});
beforeEach(() => {storage.clear(); resetQuantStateForTests();});
const base = '/api/quant/local-quant/';
const invoke = async <T>(path: string, method = 'GET', data?: unknown): Promise<T> => await resolveQuantRoute(new Request(`http://localhost${path}`,
    {method, headers: {Authorization: 'Token local-demo-token', 'Content-Type': 'application/json'}, ...(data ? {body: JSON.stringify(data)} : {})})) as T;

test('local AI冻结直接对照/反例与当时合并，覆盖判断和实验引用；后续撤销不改原输入', async () => {
    const candidates: QuantFactorCandidate[] = [];
    for (const [name, marker] of [['A', 'PASS'], ['B', 'PASS'], ['C', 'PASS'], ['D', 'FAIL']]) {
        const {entry} = await invoke<{entry: QuantEntryDetail}>(base + 'intake/', 'POST', {requestKey: `memory_compare_source_${name}_001`,
            title: `人工来源 ${name}`, code: `# LOCAL_COMPARISON_${marker}\nclose.pct_change(20)`, language: 'python'});
        entry.runs[0].createdAt = '2020-01-01T00:00:00Z'; await invoke(`${base}entries/${entry.id}/`);
        candidates.push((await invoke<{items: QuantFactorCandidate[]}>(`${base}factors/?entryId=${entry.id}`)).items[0]);
    }
    const [a, b, c, d] = candidates;
    const csvText = 'timestamp,open,high,low,close\n' + Array.from({length: 90}, (_, i) => `${new Date(Date.UTC(2024, 0, i + 1)).toISOString()},100,103,99,102`).join('\n');
    const dataset = await invoke<{id: string}>(base + 'datasets/', 'POST', {name: '人工对照行情', symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', source: '人工数据', priceAdjustment: '不适用', csvText});
    const side = (row: QuantFactorCandidate) => ({candidateId: row.id, bindings: [{name: 'close', column: 'close'}], parameters: [{name: 'lookback', value: 20}]});
    const compare = (left: QuantFactorCandidate, right: QuantFactorCandidate, key: string) => invoke<QuantComparison>(base + 'comparisons/', 'POST',
        {requestKey: key, name: `人工 ${key}`, datasetId: dataset.id, left: side(left), right: side(right), policy: {absoluteTolerance: 0, relativeTolerance: 0, warmupBars: 20}});
    const ab = await compare(a, b, 'memory_comparison_AB_01'), bc = await compare(b, c, 'memory_comparison_BC_01'), ad = await compare(a, d, 'memory_comparison_AD_01');
    const merge = await invoke<QuantFactorMerge>(base + 'factor-merges/', 'POST', {requestKey: 'memory_direct_merge_AB1', comparisonId: ab.id, name: '人工整理 A-B', reason: '保留独立来源'});
    // Artificial past timestamps make cutoff selection deterministic without timers.
    for (const row of quantState().comparisons) row.data.createdAt = '2021-01-01T00:00:00Z';
    quantState().factorMerges[0].data.createdAt = '2021-01-02T00:00:00Z';
    const path = `${base}entries/${a.entryId}/`;
    const saved = await invoke<{source: QuantSource}>(path + 'feedback/', 'POST', {requestKey: 'memory_compare_feedback_01', title: '人工对照反馈',
        targetSourceId: a.sourceId, factorId: a.id, experimentResultId: '', mode: 'backtest', documentFormat: 'text', document: 'N=20\nnet=-2%', platform: '', notes: '', analyze: true});
    const owner = quantState().entries.find(row => row.id === a.entryId)!;
    const run = owner.runs.find(row => row.sourceId === saved.source.id)!;
    const memory = readResearchMemory(run.researchMemoryJson)!;
    assert.equal(memory.version, 3); assert.equal(memory.scanned.comparisons, 3);
    assert.deepEqual(new Set(memory.items.filter(row => row.kind === 'comparison').map(row => row.id)), new Set([ab.id, ad.id]));
    assert.ok(!memory.items.some(row => row.id === bc.id)); assert.equal(memory.items[0].id, ad.id);
    const abItem = memory.items.find(row => row.id === ab.id)!;
    assert.deepEqual((abItem.evidence.sides as {left: {parameters: unknown}}).left.parameters, {lookback: 20});
    assert.equal((abItem.evidence.logical_merges as {items: {active_at_cutoff: boolean}[]}).items[0].active_at_cutoff, true);
    const before = run.researchMemoryJson!;
    run.createdAt = '2020-01-01T00:00:00Z'; await invoke(path);
    const report = owner.reports!.find(row => row.runId === run.id)!;
    const refs = memory.items.map(researchMemoryReference);
    assert.ok(refs.every(ref => report.data.memoryAssessment!.some(row => row.evidenceRefs.includes(ref))));
    assert.ok(JSON.parse(report.proposal!.dataJson).evidence_refs.includes(`memory:comparison:${ad.id}`));
    await invoke(`${base}factor-merges/${merge.id}/withdraw/`, 'POST', {requestKey: 'memory_comparison_withdraw1', reason: '人工撤销整理，保留原对照'});
    assert.equal(run.researchMemoryJson, before);
    const future = mockComparisonMemory('local-quant', new Date(Date.now() + 1000).toISOString(), candidates, [a]);
    const current = future.items.find(row => row.id === ab.id)!;
    assert.equal((current.evidence.logical_merges as {items: {active_at_cutoff: boolean}[]}).items[0].active_at_cutoff, false);
    resetQuantStateForTests(); const restored = await invoke<QuantEntryDetail>(path);
    assert.equal((restored.runs.find(row => row.id === run.id) as QuantAIRun).researchMemoryJson, before);
});
