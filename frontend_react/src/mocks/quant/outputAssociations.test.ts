import assert from 'node:assert/strict';
import {beforeEach, test} from 'node:test';
import {resolveQuantRoute} from './routes';
import {quantState, resetQuantStateForTests} from './state';
import {advanceRun} from './runs';
import {readOutputAssociations} from '../../utils/quantOutputAssociations';
import type {QuantEntryDetail, QuantFactorCandidate} from '../../types/api/quant';
import type {QuantComparison, QuantCorrelation} from '../../types/api/quantComparison';
import type {QuantDataset} from '../../types/api/quantDataset';
import type {QuantExperiment} from '../../types/api/quantExperiment';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {value: {getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key),
    key: (index: number) => [...storage.keys()][index] || null, get length() {return storage.size;}}, configurable: true});
Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=sample'), configurable: true});
beforeEach(() => {storage.clear(); resetQuantStateForTests();});
const base = '/api/quant/local-quant/';
const invoke = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => await resolveQuantRoute(new Request('http://localhost' + base + path,
    {method, headers: {Authorization: 'Token local-demo-token', 'Content-Type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {})})) as T;

async function fixture() {
    const collect = async (key: string) => {
        const {entry} = await invoke<{entry: QuantEntryDetail}>('intake/', 'POST', {requestKey: key, title: key, language: 'python', code: '# LOCAL_COMPARISON_FAIL\nN=20\nclose.pct_change(N)'});
        entry.runs[0].createdAt = '2020-01-01T00:00:00Z'; await invoke(`entries/${entry.id}/`);
        return (await invoke<{items: QuantFactorCandidate[]}>(`factors/?entryId=${entry.id}`)).items[0];
    };
    const a = await collect('association_mock_source_a'), b = await collect('association_mock_source_b');
    const csvText = 'timestamp,open,high,low,close\n' + Array.from({length: 120}, (_, i) => `${new Date(Date.UTC(2024, 0, i + 1)).toISOString()},100,102,99,101`).join('\n');
    const dataset = await invoke<QuantDataset>('datasets/', 'POST', {name: '人工统计样例', csvText, symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', priceAdjustment: 'none', source: '人工'});
    const side = (c: QuantFactorCandidate, value = 20) => ({candidateId: c.id, bindings: [{name: 'close', column: 'close'}], parameters: [{name: 'lookback', value}]});
    const pair = {requestKey: 'association_mock_pair_01', name: '历史配置对照', datasetId: dataset.id, left: side(a), right: side(b), policy: {absoluteTolerance: 0, relativeTolerance: 0, warmupBars: 0}};
    const comparison = await invoke<QuantComparison>('comparisons/', 'POST', pair);
    await invoke<QuantCorrelation>(`comparisons/${comparison.id}/correlation/`, 'POST');
    quantState().comparisons.find(row => row.data.id === comparison.id)!.data.correlation!.createdAt = '2024-01-01T00:00:00Z';
    const experiment = await invoke<QuantExperiment>('experiments/', 'POST', {requestKey: 'association_mock_exp_01', name: '统计冻结样例', datasetId: dataset.id,
        seeds: [{...side(a), variants: []}, {...side(b, 8), variants: []}], config: {seed: 1, maxCandidates: 8, generations: 2, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 10}});
    quantState().experiments.find(row => row.data.id === experiment.id)!.data.createdAt = '2020-01-01T00:00:00Z';
    const detail = await invoke<QuantExperiment>(`experiments/${experiment.id}/`);
    const run = quantState().entries.flatMap(row => row.runs).find(row => row.id === detail.reviews![0].run.id)!;
    return {comparison, pair, experiment, run};
}

test('review freezes original parameters and sample statistics, later observations do not replace them', async () => {
    const {comparison, pair, experiment, run} = await fixture();
    const frozen = run.outputAssociationsJson!;
    const value = readOutputAssociations(frozen)!;
    assert.equal(value.items.length, 1); assert.equal(value.items[0].comparison_id, comparison.id);
    assert.equal(value.items[0].baseline_scope, 'historical_configuration_only');
    assert.equal(value.items[0].sides[1].parameters.lookback, 20);
    assert.equal(value.items[0].sides[1].current_baseline_matches, false);
    const now = Date.now; Date.now = () => now() + 5000;
    try {advanceRun(run);} finally {Date.now = now;}
    assert.equal(run.result.review!.outputAssociationReviews![0].baselineScope, 'historical_configuration_only');
    const later = await invoke<QuantComparison>('comparisons/', 'POST', {...pair, requestKey: 'association_mock_later01', name: '后来的对照'});
    await invoke(`comparisons/${later.id}/correlation/`, 'POST');
    const detail = await invoke<QuantExperiment>(`experiments/${experiment.id}/`);
    assert.equal(detail.reviews![0].run.outputAssociationsJson, frozen);
});

test('unknown coefficients stay null and malformed scopes or booleans cannot masquerade as counts', async () => {
    const {run} = await fixture();
    const raw = JSON.parse(run.outputAssociationsJson!);
    Object.assign(raw.items[0].statistics, {status: 'undefined', reason: 'constant_or_near_constant_output', pearson: null, spearman: null});
    assert.equal(readOutputAssociations(JSON.stringify(raw))!.items[0].statistics.pearson, null);
    raw.items[0].baseline_scope = 'current_baselines_match'; assert.throws(() => readOutputAssociations(JSON.stringify(raw)));
    const bad = JSON.parse(run.outputAssociationsJson!); bad.known_matches = true;
    assert.throws(() => readOutputAssociations(JSON.stringify(bad)));
    assert.equal(readOutputAssociations(), null);
});
