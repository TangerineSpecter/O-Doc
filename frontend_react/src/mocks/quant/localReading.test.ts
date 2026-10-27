import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import type {QuantAIRun, QuantEntryDetail, QuantImplementation} from '../../types/api/quant.ts';
import type {QuantStageEvidence} from '../../types/api/quantWorkflow.ts';
import {readLocalReading,readingLocations} from '../../utils/quantLocalReading.ts';
import {resolveQuantRoute} from './routes.ts';
import {quantState, resetQuantStateForTests} from './state.ts';
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {value: {getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key),
    key: (i: number) => [...storage.keys()][i] || null, get length() {return storage.size;}}, configurable: true});
Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=sample'), configurable: true});
const scenario = (name: string) => Object.defineProperty(globalThis, 'location', {value: new URL(`http://localhost/?mockState=${name}`), configurable: true});
beforeEach(() => {scenario('sample'); storage.clear(); resetQuantStateForTests();});
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
    assert.equal(run2.workflow?.version, 27); assert.equal(run2.workflow?.stages.length, 11);
    assert.equal(run2.workflow?.maxModelCalls, 8); assert.equal(run2.workflow?.maxSeconds, 960);
    const third = await nextVersion('N=20\ndef factor(x): return x * 4\n');
    const run3 = await invoke<QuantAIRun>(path + 'runs/', 'POST', {kind: 'analyze', sourceId: third.id, resumeRunId: run2.id, requestKey: 'local_incremental_run003'});
    run3.createdAt = '2020-01-01T00:00:00Z'; await invoke(path);
    assert.equal(run3.workflow?.localReading?.reused, 0);
    const evidencePath = path + `runs/${run3.id}/workflow/snippets/`;
    const evidence = await invoke<QuantStageEvidence>(evidencePath);
    const reading = readLocalReading(evidence.localReadingJson!);
    assert.equal(reading.units.length, 2); assert.equal(reading.units.filter(row => row.reused_from.outcome_id).length, 0);
    assert.match(reading.notice, /人工 local/);
    assert.equal(owner.reports!.find(row => row.runId === run2.id)!.sourceId, second.id);
    const report = owner.reports!.find(row => row.runId === run3.id)!;
    assert.equal(report.data.sourceChangeReviewVersion, 2);
    assert.match(report.markdown, /## 源码变化影响复核/);
    assert.match(report.data.sourceChangeAssessment!.summary, /人工 local/);
    const facts = JSON.parse(report.data.sourceChangeFactsJson!);
    assert.equal(facts.new_parser, 'local-presentation-only');
    assert.equal(facts.baseline.run_id, run2.id);
    assert.equal(owner.reports!.find(row => row.runId === run1.id)!.data.sourceChangeReviewVersion, undefined);
    resetQuantStateForTests();
    assert.equal((await invoke<QuantStageEvidence>(evidencePath)).localReadingJson, evidence.localReadingJson);
    const refreshed = await invoke<QuantEntryDetail>(path);
    assert.equal(refreshed.reports!.find(row => row.runId === run3.id)!.data.sourceChangeFactsJson, report.data.sourceChangeFactsJson);
    try {
        scenario('error'); assert.equal((await invoke<Response>(path)).status, 503);
        scenario('slow');
        const delayed = await invoke<QuantEntryDetail>(path);
        assert.equal(delayed.reports!.find(row => row.runId === run3.id)!.data.sourceChangeReviewVersion, 2);
        scenario('empty'); assert.deepEqual(await invoke(base + 'entries/'), []);
        assert.equal((await invoke<Response>(evidencePath)).status, 404);
    } finally {scenario('sample');}
    const bad = structuredClone(reading); bad.units[0].observations[0].end_line = 999;
    assert.throws(() => readLocalReading(JSON.stringify(bad)));
    bad.units[0].observations[0].end_line = 1; bad.units.push(bad.units[0]);
    assert.throws(() => readLocalReading(JSON.stringify(bad)));
});


test('组件依据按各依赖映射引文，拒绝标记行、跨正文与伪造旧合同',()=>{
    const value={scope:'declared_dependency_components_not_runtime_semantics',notice:'人工组件合同样例，未调用模型或证明平台运行。',omitted:0,baseline:{},units:[{
        input_hash:'local-component',locations:[{start_line:10,end_line:11}],reused_from:{},unknowns:['仅声明链，未运行。'],
        component:{name:'main.py::factor',mode:'static_declared_dependencies',context_line_count:5,uncertainties:[],parts:[
            {name:'main.py::N',start_line:3,end_line:3,relative_start_line:2,relative_end_line:2,content_hash:'local-N'},
            {name:'main.py::factor',start_line:10,end_line:11,relative_start_line:4,relative_end_line:5,content_hash:'local-factor'}]},
        observations:[{quote:'N=20',start_line:2,end_line:2,reading:'参数声明'},{quote:'return x*N',start_line:5,end_line:5,reading:'读取参数的公式'}]}]};
    const good=readLocalReading(JSON.stringify(value));
    assert.deepEqual(readingLocations(good.units[0],good.units[0].observations[0]),['main.py::N · L3–3']);
    assert.deepEqual(readingLocations(good.units[0],good.units[0].observations[1]),['main.py::factor · L11–11']);
    for(const mutate of [(v:typeof value)=>{v.units[0].observations[0].start_line=1;},
        (v:typeof value)=>{v.units[0].observations[0].end_line=5;},
        (v:typeof value)=>{v.units[0].component.parts[0].relative_end_line=3;},
        (v:typeof value)=>{v.units[0].component.parts[1].end_line=12;},
        (v:typeof value)=>{v.scope='local_text_only_not_runtime_semantics';},
        (v:typeof value)=>{v.units[0].component.mode='whole_source_invalidation';}]) {
        const bad=structuredClone(value);mutate(bad);assert.throws(()=>readLocalReading(JSON.stringify(bad)));
    }
});
