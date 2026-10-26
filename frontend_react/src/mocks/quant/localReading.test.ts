import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import type {QuantAIRun, QuantEntryDetail, QuantImplementation} from '../../types/api/quant.ts';
import type {QuantStageEvidence} from '../../types/api/quantWorkflow.ts';
import {readLocalReading} from '../../utils/quantLocalReading.ts';
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

test('local跨源码研究展示片段复用，保留历史合同与新增有界修订步骤，刷新可读取原依据', async () => {
    const {entry} = await invoke<{entry: QuantEntryDetail}>(base + 'intake/', 'POST', {requestKey: 'local_incremental_source01',
        title: '人工增量流程', code: 'N=20\ndef factor(x): return x * 2\n', language: 'python'});
    const path = `${base}entries/${entry.id}/`;
    const owner = quantState().entries.find(row => row.id === entry.id)!;
    entry.runs[0].createdAt = '2020-01-01T00:00:00Z';
    await invoke<QuantEntryDetail>(path);
    const first = entry.runs[0];
    assert.equal(first.workflow?.maxModelCalls, 7);
    const impl = await invoke<QuantImplementation>(path + 'implementations/', 'POST', {name: '人工来源', code: 'N=20\ndef factor(x): return x * 2\n', language: 'python'});
    const oldSource = owner.sources!.find(row => row.codeVersionId === impl.currentVersionId)!;
    const run1 = await invoke<QuantAIRun>(path + 'runs/', 'POST', {kind: 'analyze', sourceId: oldSource.id, requestKey: 'local_incremental_base001'});
    run1.createdAt = '2020-01-01T00:00:00Z'; await invoke(path);
    const nextVersion = async (code: string) => {
        const version = await invoke<{id: string}>(path + `implementations/${impl.id}/versions/`, 'POST', {code, language: 'python'});
        return owner.sources!.find(row => row.codeVersionId === version.id)!;
    };
    const second = await nextVersion('N=20\ndef factor(x): return x * 3\n');
    const run2 = await invoke<QuantAIRun>(path + 'runs/', 'POST', {kind: 'analyze', sourceId: second.id, resumeRunId: run1.id, requestKey: 'local_incremental_run002'});
    run2.createdAt = '2020-01-01T00:00:00Z'; await invoke(path);
    assert.equal(run2.workflow?.version, 17); assert.equal(run2.workflow?.stages.length, 11);
    assert.equal(run2.workflow?.maxModelCalls, 8); assert.equal(run2.workflow?.maxSeconds, 960);
    const third = await nextVersion('N=20\ndef factor(x): return x * 4\n');
    const run3 = await invoke<QuantAIRun>(path + 'runs/', 'POST', {kind: 'analyze', sourceId: third.id, resumeRunId: run2.id, requestKey: 'local_incremental_run003'});
    run3.createdAt = '2020-01-01T00:00:00Z'; await invoke(path);
    assert.equal(run3.workflow?.localReading?.reused, 1);
    const evidencePath = path + `runs/${run3.id}/workflow/snippets/`;
    const evidence = await invoke<QuantStageEvidence>(evidencePath);
    const reading = readLocalReading(evidence.localReadingJson!);
    assert.equal(reading.units.length, 2); assert.equal(reading.units.filter(row => row.reused_from.outcome_id).length, 1);
    assert.match(reading.notice, /人工 local/);
    assert.equal(owner.reports!.find(row => row.runId === run2.id)!.sourceId, second.id);
    resetQuantStateForTests();
    assert.equal((await invoke<QuantStageEvidence>(evidencePath)).localReadingJson, evidence.localReadingJson);
    const bad = structuredClone(reading); bad.units[0].observations[0].end_line = 999;
    assert.throws(() => readLocalReading(JSON.stringify(bad)));
    bad.units[0].observations[0].end_line = 1; bad.units.push(bad.units[0]);
    assert.throws(() => readLocalReading(JSON.stringify(bad)));
});
