import assert from 'node:assert/strict';
import {beforeEach, test} from 'node:test';
import {resolveQuantRoute} from './routes.ts';
import {clearQuantMockData, quantState, resetQuantStateForTests} from './state.ts';
import type {QuantAIRun, QuantEntryDetail, QuantImplementation, QuantAttachment, QuantEntry, QuantCodeVersion} from '../../types/api/quant.ts';
import type {Anthology} from '../../types/api/anthology.ts';
import type {QuantModels} from '../../types/api/quant.ts';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {value: {getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), key: (index: number) => [...storage.keys()][index] || null, get length() {return storage.size;}}, configurable: true});
Object.defineProperty(globalThis, 'location', {value: new URL('http://localhost/?mockState=sample'), writable: true, configurable: true});
const setScenario = (state: string) => Object.defineProperty(globalThis, 'location', {value: new URL(`http://localhost/?mockState=${state}`), writable: true, configurable: true});
beforeEach(() => {storage.clear(); resetQuantStateForTests(); setScenario('sample');});
const base = '/api/quant/local-quant/';
const entryBase = `${base}entries/local-momentum/`;
const invoke = async <T>(path: string, method = 'GET', body?: unknown, authorized = true): Promise<T> => {
    const request = new Request(`http://localhost${path}`, {method, headers: {...(authorized ? {Authorization: 'Token local-demo-token'} : {}), ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})});
    return await resolveQuantRoute(request) as T;
};

test('首页保留已有文集，添加私密量化卡；访客不见量化详情', async () => {
    const list = await invoke<Anthology[]>('/api/anthology/list');
    assert.ok(list.some(row => row.collId === 'col_deploy_001'));
    assert.equal(list.find(row => row.type === 'quant')?.count, 3);
    const visitor = await invoke<Anthology[]>('/api/anthology/list', 'GET', undefined, false);
    assert.equal(visitor.some(row => row.type === 'quant'), false);
    assert.equal((await invoke<Response>(`${base}entries/`, 'GET', undefined, false)).status, 403);
});

test('模型接口使用全局路径且保持认证和场景边界', async () => {
    const models = await invoke<QuantModels>('/api/quant/models/');
    assert.ok(models.models.length > 0);
    assert.ok(models.models.some(row => row.id === models.defaultModelId));
    assert.equal((await invoke<Response>('/api/quant/models/', 'GET', undefined, false)).status, 403);
    assert.equal(await invoke(`${base}models/`), undefined);
    setScenario('empty');
    assert.deepEqual(await invoke('/api/quant/models/'), models);
    setScenario('error');
    assert.equal((await invoke<Response>('/api/quant/models/')).status, 503);
});

test('条目、代码版本、回测与验证状态可修改并在刷新后保留', async () => {
    const entry = await invoke<QuantEntry>(`${base}entries/`, 'POST', {title: '新因子'});
    const path = `${base}entries/${entry.id}/`;
    const impl = await invoke<QuantImplementation>(`${path}implementations/`, 'POST', {name: 'Python', language: 'python', code: 'value = 1'});
    const first = structuredClone(impl.versions[0]);
    const version = await invoke<QuantCodeVersion>(`${path}implementations/${impl.id}/versions/`, 'POST', {code: 'value = 2', note: '第二版'});
    assert.equal(impl.currentVersionId, version.id);
    assert.equal(first.code, 'value = 1');
    await invoke(`${path}backtests/`, 'POST', {name: '首版结果', versionId: first.id, metrics: [{name: '收益', value: ''}]});
    await invoke(`${path}versions/${version.id}/verification/`, 'PATCH', {compileCheck: 'passed', runCheck: 'pending', resultCheck: 'pending'});
    resetQuantStateForTests();
    const detail = await invoke<QuantEntryDetail>(path);
    assert.equal(detail.implementations[0].versions.length, 2);
    assert.equal(detail.implementations[0].versions[1].code, 'value = 1');
    assert.equal(detail.backtests[0].versionId, first.id);
    assert.equal(detail.implementations[0].versions[0].compileCheck, 'passed');
});

test('任务重复提交及采用幂等，候选保存新实现且不覆盖来源代码', async () => {
    const input = {kind: 'convert', sourceVersionId: 'local-quant-version-2', targetLanguage: 'pine', targetVersion: '6', requestKey: 'quant-request-1'};
    const run = await invoke<QuantAIRun>(`${entryBase}runs/`, 'POST', input);
    const repeat = await invoke<QuantAIRun>(`${entryBase}runs/`, 'POST', input);
    assert.equal(run.id, repeat.id);
    assert.equal((await invoke<Response>(`${entryBase}runs/`, 'POST', {...input, targetLanguage: 'mql4'})).status, 409);
    assert.equal((await invoke<Response>(`${entryBase}runs/${run.id}/adopt/`, 'POST')).status, 409);
    quantState().entries[0].runs.find(row => row.id === run.id)!.createdAt = '2020-01-01T00:00:00Z';
    const completed = await invoke<QuantAIRun>(`${entryBase}runs/${run.id}/`);
    assert.equal(completed.status, 'completed');
    const adopted = await invoke<{implementation: QuantImplementation}>(`${entryBase}runs/${run.id}/adopt/`, 'POST');
    const duplicate = await invoke<{implementation: QuantImplementation}>(`${entryBase}runs/${run.id}/adopt/`, 'POST');
    assert.equal(adopted.implementation.id, duplicate.implementation.id);
    assert.equal(adopted.implementation.versions[0].resultCheck, 'pending');
    assert.equal(quantState().entries[0].implementations[0].language, 'python');
});

test('回测修改版本不能与已有附件证据冲突，失败不写入且刷新后状态不变', async () => {
    const versionId = 'local-quant-version-1';
    const backtestPath = `${entryBase}backtests/local-quant-backtest/`;
    const attached = await invoke<QuantAttachment>(`${entryBase}attachments/`, 'POST', {
        assetId: 'local-quant-report', backtestId: 'local-quant-backtest', versionId,
    });
    const before = structuredClone(await invoke<QuantEntryDetail>(entryBase));
    const response = await invoke<Response>(backtestPath, 'PATCH', {name: '不应保存', versionId: 'local-quant-version-2'});
    assert.equal(response.status, 400);
    assert.match((await response.json() as {msg: string}).msg, /附件已关联其他代码版本/);
    resetQuantStateForTests();
    assert.deepEqual(await invoke(entryBase), before);
    await invoke(backtestPath, 'PATCH', {versionId: null});
    assert.equal((await invoke<Response>(backtestPath, 'PATCH', {versionId: 'local-quant-version-2'})).status, 400);
    await invoke(backtestPath, 'PATCH', {versionId});
    await invoke(backtestPath, 'PATCH', {name: '保留原版本'});
    assert.equal((await invoke<QuantEntryDetail>(entryBase)).backtests.find(row => row.id === 'local-quant-backtest')!.versionId, versionId);
    await invoke(`${entryBase}attachments/${attached.id}/`, 'DELETE');
    await invoke(backtestPath, 'PATCH', {versionId: 'local-quant-version-2'});
    assert.equal((await invoke<QuantEntryDetail>(entryBase)).backtests.find(row => row.id === 'local-quant-backtest')!.versionId, 'local-quant-version-2');
});

test('取消任务保持取消；空数据和模拟错误不退到真实接口', async () => {
    const run = await invoke<QuantAIRun>(`${entryBase}runs/`, 'POST', {kind: 'explain', sourceVersionId: 'local-quant-version-2', requestKey: 'cancel'});
    await invoke(`${entryBase}runs/${run.id}/cancel/`, 'POST');
    assert.equal((await invoke<QuantAIRun>(`${entryBase}runs/${run.id}/`)).status, 'cancelled');
    setScenario('empty');
    assert.deepEqual(await invoke(`${base}entries/`), []);
    const newEntry = await invoke<QuantEntry>(`${base}entries/`, 'POST', {title: '空状态新增'});
    assert.equal((await invoke<QuantEntry[]>(`${base}entries/`))[0].id, newEntry.id);
    setScenario('error');
    assert.equal((await invoke<Response>('/api/quant/models/')).status, 503);
    setScenario('sample');
    assert.equal(await invoke('/api/quant/local-quant/not-implemented/'), undefined);
});

test('上传附件、下载、脚本读取及软删后的引用保护', async () => {
    const form = new FormData(); form.append('source_type', 'quant'); form.append('file', new File(['value = 1'], 'factor.py', {type: 'text/plain'}));
    const uploaded = await resolveQuantRoute(new Request('http://localhost/api/resource/upload', {method: 'POST', headers: {Authorization: 'Token local-demo-token'}, body: form})) as {id: string};
    const ref = await invoke<QuantAttachment>(`${entryBase}attachments/`, 'POST', {assetId: uploaded.id});
    const text = await invoke<{code: string; language: string}>(`${entryBase}attachments/${ref.id}/text/`);
    assert.equal(text.code, 'value = 1'); assert.equal(text.language, 'python');
    const download = await invoke<Response>(`/api/resource/download/${uploaded.id}`);
    assert.equal(await download.text(), 'value = 1');
    assert.equal((await invoke<Response>(`${entryBase}attachments/`, 'POST', {assetId: uploaded.id, versionId: 'foreign'})).status, 400);
    await invoke(entryBase, 'DELETE');
    assert.equal((await invoke<Response>(`/api/resource/delete/${uploaded.id}`, 'DELETE')).status, 409);
});

test('重置样例仅清理当前量化mock前缀，保留真实与本地登录数据', () => {
    storage.set('odoc:local:quant:v1:sample', 'sample-state');
    storage.set('odoc:local:quant:v1:empty', 'empty-state');
    storage.set('token', 'real-login');
    storage.set('odoc:local:token', 'local-login');
    storage.set('odoc:local:quant:v2:future', 'another-version');
    clearQuantMockData();
    assert.equal(storage.has('odoc:local:quant:v1:sample'), false);
    assert.equal(storage.has('odoc:local:quant:v1:empty'), false);
    assert.equal(storage.get('token'), 'real-login');
    assert.equal(storage.get('odoc:local:token'), 'local-login');
    assert.equal(storage.get('odoc:local:quant:v2:future'), 'another-version');
    assert.equal(quantState().entries.length, 3);
});
