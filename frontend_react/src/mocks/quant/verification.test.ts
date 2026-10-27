import {beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import type {QuantEntryDetail, QuantFactorCandidate} from '../../types/api/quant.ts';
import type {QuantVerification, VerificationIndexProgress} from '../../types/api/quantVerification.ts';
import type {QuantExperiment} from '../../types/api/quantExperiment.ts';
import type {QuantFormulaHistory, QuantFormulaEditResult} from '../../types/api/quantFormulaVersion.ts';
import {readQualification, readVerification} from '../../utils/quantVerification.ts';
import {resolveQuantRoute} from './routes.ts';
import {quantState, resetQuantStateForTests} from './state.ts';
import {mockQualification} from './qualification.ts';
import type {QuantGraph} from '../../types/api/quantGraph.ts';
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {value: {getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key),
    key: (i: number) => [...storage.keys()][i] || null, get length() {return storage.size;}}, configurable: true});
Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=sample'), configurable: true});
beforeEach(() => {storage.clear(); resetQuantStateForTests(); Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=sample'), configurable: true});});
const base = '/api/quant/local-quant/';
const invoke = async <T>(path: string, method = 'GET', data?: unknown): Promise<T> => await resolveQuantRoute(new Request(`http://localhost${path}`,
    {method, headers: {Authorization: 'Token local-demo-token', 'Content-Type': 'application/json'}, ...(data ? {body: JSON.stringify(data)} : {})})) as T;
async function seed(marker = '') {
    const {entry} = await invoke<{entry: QuantEntryDetail}>(base + 'intake/', 'POST', {requestKey: 'verification_source_0001',
        code: 'N=20\nclose.pct_change(N)\n' + marker, language: 'python'});
    entry.runs[0].createdAt = '2020-01-01T00:00:00Z'; await invoke(base + `entries/${entry.id}/`);
    const candidate = (await invoke<{items: QuantFactorCandidate[]}>(base + `factors/?entryId=${entry.id}`)).items[0];
    return {entry, candidate};
}
test('图谱中的外部观察绑定当前公式，未分析的反馈没有伪造报告入口',async()=>{
    const {entry,candidate}=await seed();
    await invoke(base+`entries/${entry.id}/feedback/`,'POST',{requestKey:'graph_feedback_local_001',title:'人工反面记录',targetSourceId:candidate.sourceId,factorId:candidate.id,
        mode:'live',documentFormat:'text',document:'人工样例，尚未核实的亏损记录',analyze:false});
    const graph=await invoke<QuantGraph>(base+`graph/?candidateId=${candidate.id}`);
    const node=graph.nodes.find(row=>row.kind==='feedback')!;
    assert.equal(node.label,'人工反面记录');assert.equal(node.evidence?.candidateHash,candidate.contentHash);
    assert.equal(node.reportId,'');assert.ok(node.evidence?.targetId);
    const edge=graph.edges.find(row=>row.to===node.id)!;
    assert.equal(edge.kind,'direct_observation');assert.equal(edge.similarity,null);assert.match(edge.detail,/不代表支持/);
    assert.ok(!graph.edges.some(row=>row.kind==='direct_observation'&&row.from!==`factor:${candidate.id}`));
    const source=quantState().entries.find(row=>row.id===entry.id)!.sources!.find(row=>row.id===node.evidence!.targetId)!;
    source.payload.feedbackVersion=4; // Explicit artificial document, not another external observation.
    const nativeGraph=await invoke<QuantGraph>(base+`graph/?candidateId=${candidate.id}`);
    assert.equal(nativeGraph.edges.find(row=>row.to===node.id)!.label,'同一次原函数验证的解读材料');
    const nativeProof=await invoke<QuantVerification>(base+`factors/${candidate.id}/verification/`);
    assert.deepEqual(nativeProof.levels,[]);
});
test('local 自动结构检查、限定证据、失败尝试与人工新公式独立，解码不授予平台或独立验证', async () => {
    const {entry, candidate} = await seed();
    const path = (id: string) => base + `factors/${id}/verification/`;
    const first = await invoke<QuantVerification>(path(candidate.id));
    assert.equal(first.reuseStatus, 'reusable'); assert.equal(first.total, 0);
    assert.equal(readQualification(first.qualificationJson).platform_equivalence, 'unverified');
    const unsafeWindow = structuredClone(candidate);
    unsafeWindow.data.parameters[0].type = 'float';
    assert.equal(mockQualification(unsafeWindow).reuse_status, 'candidate');
    const unsafeDefault = structuredClone(candidate);
    unsafeDefault.data.parameters[0].defaultValue = 'true';
    assert.equal(mockQualification(unsafeDefault).configuration.status, 'invalid_declared_defaults');
    const csvText = 'timestamp,open,high,low,close,volume\n' + Array.from({length: 90}, (_, index) => `${new Date(Date.UTC(2024, 0, index + 1)).toISOString()},100,103,99,102,1000`).join('\n');
    const dataset = await invoke<{id: string}>(base + 'datasets/', 'POST', {name: '人工验证行情', symbol: 'SYNTHETIC', timeframe: '1d', timezone: 'UTC', source: '人工构造', priceAdjustment: '不适用', csvText});
    const experiment = await invoke<QuantExperiment | Response>(base + 'experiments/', 'POST', {requestKey: 'verification_experiment01', name: '本地验证样例', datasetId: dataset.id,
        seeds: [{candidateId: candidate.id, bindings: [{name: 'close', column: 'close'}], parameters: [{name: 'lookback', value: 20}], variants: [[{name: 'lookback', value: 15}]]}],
        config: {seed: 1, maxCandidates: 8, generations: 2, threshold: 0, feeBps: 5, slippageBps: 5, gap: 2, seconds: 10}});
    if (experiment instanceof Response) assert.fail(await experiment.text());
    const record = quantState().experiments.find(row => row.data.id === experiment.id)!;
    record.data.createdAt = '2020-01-01T00:00:00Z'; await invoke(base + `experiments/${experiment.id}/`);
    const after = await invoke<QuantVerification>(path(candidate.id));
    assert.equal(after.total, 1);
    const proof = readVerification(after.items[0].dataJson);
    assert.equal(proof.kind, 'experiment'); assert.equal(proof.local_demo, true);
    if (proof.kind !== 'experiment') throw new Error('expected experiment');
    assert.equal(proof.independent_validation, false);
    assert.ok(proof.attempts.some(row => row.status === 'rejected'));
    assert.ok(proof.attempts.every(row => ['source_candidate', 'parameter_variant'].includes(row.operation)));
    const history = await invoke<QuantFormulaHistory>(base + `factors/${candidate.id}/formula-versions/`);
    const definition = JSON.parse(history.definitionJson); definition.name = '独立公式'; definition.expression = {op: 'neg', args: [definition.expression]};
    const edited = await invoke<QuantFormulaEditResult>(base + `factors/${candidate.id}/formula-versions/`, 'POST', {requestKey: 'verification_formula001', reason: '新版本不继承祖先证据', definitionJson: JSON.stringify(definition)});
    assert.equal((await invoke<QuantVerification>(path(edited.candidate.id))).total, 0);
    const input = {requestKey: 'verification_feedback01', title: '用户实盘声明', targetSourceId: candidate.sourceId, factorId: candidate.id, mode: 'live', documentFormat: 'text', document: '记录一次亏损', analyze: false};
    await invoke(base + `entries/${entry.id}/feedback/`, 'POST', input);
    const observed = await invoke<QuantVerification>(path(candidate.id));
    const feedback = observed.items.map(row => readVerification(row.dataJson)).find(row => row.kind === 'feedback');
    assert.equal(feedback?.kind, 'feedback');
    if (feedback?.kind === 'feedback') assert.equal(feedback.platform_authenticated, false);
    for (const bad of [{...proof, version: 99}, {...proof, independent_validation: true}, {...proof, attempts: [{id: 'bad'}]}, {...proof, levels: ['fully_verified']}]) assert.throws(() => readVerification(JSON.stringify(bad)));
    assert.throws(() => readQualification(JSON.stringify({...readQualification(first.qualificationJson), checks: [{code: 'x', status: {}, message: {}}]})));
});

test('旧样例显式归集保持幂等、筛选可复用层；错误与空数据不落到真实后端', async () => {
    const {candidate, entry} = await seed('LOCAL_VERIFICATION_UNCHECKED');
    const path = base + `factors/${candidate.id}/verification/`;
    assert.equal((await invoke<QuantVerification>(path)).reuseStatus, 'unchecked');
    assert.equal(quantState().verificationIndexed[candidate.id], undefined);
    const before = quantState().entries.find(row => row.id === entry.id)!.runs.length;
    for (const kind of ['experiment', 'comparison', 'feedback','fixed_validation','native_python']) {
        const result = await invoke<VerificationIndexProgress>(path, 'POST', {kind, offset: 0, limit: 1});
        assert.equal(result.hasMore, false);
    }
    assert.equal((await invoke<QuantVerification>(path)).reuseStatus, 'reusable');
    assert.equal(quantState().entries.find(row => row.id === entry.id)!.runs.length, before);
    resetQuantStateForTests(); assert.equal((await invoke<QuantVerification>(path)).reuseStatus, 'reusable');
    const filtered = await invoke<{items: QuantFactorCandidate[]}>(base + `factors/?entryId=${entry.id}&reuseStatus=reusable`);
    assert.equal(filtered.items.length, 1);
    assert.equal((await invoke<{items: unknown[]}>(base + `factors/?entryId=${entry.id}&reuseStatus=unchecked`)).items.length, 0);
    assert.equal((await invoke<Response>(path, 'POST', {limit: 51})).status, 400);
    assert.equal((await invoke<Response>('/api/quant/foreign/factors/' + candidate.id + '/verification/')).status, 404);
    Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=error'), configurable: true});
    assert.equal((await invoke<Response>(path)).status, 503);
    Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=empty'), configurable: true});
    assert.equal((await invoke<Response>(path)).status, 404);
});
