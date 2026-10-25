import {HttpResponse} from 'msw';
import type {QuantBatch, QuantBatchInput, QuantBatchRetry, QuantBatchStatus} from '../../types/api/quantIntake';
import type {QuantEntryDetail} from '../../types/api/quant';
import {validateMaterials, batchStatus} from '../../utils/quantIntake';
import {detectQuantLanguage} from '../../utils/quantLanguage';
import {quantModels} from './fixtures';
import {persistQuantState, quantId, quantState} from './state';
import {createRun, advanceRun} from './runs';
import {acquireMockSources, publishMockReport} from './research';
import {setMockMaterialCurrent} from './sourceSnapshots';

export interface MockBatch {collection: string; key: string; fingerprint: string; deadline: number; data: QuantBatch}
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
const active = (status: string) => ['pending', 'running'].includes(status);
const runs = (batch: MockBatch) => batch.data.items.map(item => ({item, entry: quantState().entries.find(entry => entry.id === item.entryId && entry.collId === batch.collection)!}));

function project(batch: MockBatch) {
    batch.data.retryBatchId = quantState().batches.find(row => row.collection === batch.collection && row.data.plan.parentId === batch.data.id)?.data.id || null;
    for (const {item, entry} of runs(batch)) {
        item.title = entry.title; item.available = entry.isValid;
        const run = entry.runs.find(row => row.id === item.runId);
        if (run) {item.status = run.status; item.message = run.error; item.reportId = entry.reports?.find(report => report.runId === run.id)?.id || null;}
    }
    batch.data.completed = batch.data.items.filter(item => item.status === 'completed').length;
    batch.data.reservedCalls = batch.data.items.filter(item => item.runId).length;
}

function finish(batch: MockBatch, reason: QuantBatchStatus) {
    for (const {item, entry} of runs(batch)) {
        const run = entry.runs.find(row => row.id === item.runId);
        if (run && active(run.status)) {run.status = 'cancelled'; run.error = '本地演示：批次已停止';}
        if (item.status === 'waiting') item.status = 'not_started';
    }
    project(batch);
    const status = reason === 'completed' && batch.data.completed < batch.data.items.length ? 'partial' : reason;
    batch.data.status = status;
    batch.data.message = `本地模拟：${batchStatus[status]}，没有调用真实模型。`;
    batch.data.outcome = {version: 1, reason, status, message: batch.data.message,
        dispatched: batch.data.items.filter(item => item.runId || item.status === 'rejected').length,
        completed: batch.data.completed, reservedCalls: batch.data.reservedCalls};
    persistQuantState();
}

function advance(batch: MockBatch) {
    if (!active(batch.data.status)) {project(batch); return;}
    if (Date.now() >= batch.deadline) {finish(batch, 'wall_budget'); return;}
    batch.data.status = 'running';
    for (const {item, entry} of runs(batch)) {
        const run = entry.runs.find(row => row.id === item.runId);
        if (run && active(run.status)) {
            acquireMockSources(entry);
            advanceRun(run, entry.sources?.find(source => source.id === (run.resolvedSourceId || run.sourceId)));
            publishMockReport(entry); project(batch);
            if (active(run.status)) return;
        }
    }
    const next = batch.data.items.find(item => item.status === 'waiting');
    if (!next) {finish(batch, 'completed'); return;}
    const entry = quantState().entries.find(row => row.id === next.entryId)!;
    if (!entry.isValid) {next.status = 'rejected'; next.message = '资料已删除'; return;}
    if (quantState().entries.filter(row => row.collId === batch.collection).flatMap(row => row.runs).filter(run => active(run.status)).length >= 4) return;
    if (!quantModels.models.some(model => model.id === batch.data.plan.modelId)) {finish(batch, 'waiting_model'); return;}
    next.runId = createRun(entry, {kind: 'analyze', sourceId: next.sourceId, requestKey: `${batch.key}_${next.ordinal}`, modelId: batch.data.plan.modelId}).id;
    project(batch); persistQuantState();
}

function create(collection: string, input: QuantBatchInput | QuantBatchRetry, fingerprint: string, entries: QuantEntryDetail[], parentId = '') {
    const modelId = input.modelId || quantModels.defaultModelId;
    const analyze = 'analyze' in input ? input.analyze : true;
    const id = quantId('intake-batch'), name = 'name' in input ? input.name : '重试未完成资料';
    const items: QuantBatch['items'] = entries.map((entry, index) => ({ordinal: index + 1, sourceId: entry.sources![0].id, entryId: entry.id, title: entry.title, available: true, status: 'waiting', message: '', runId: null, reportId: null}));
    const batch: MockBatch = {collection, key: input.requestKey, fingerprint, deadline: Date.now() + input.wallSeconds * 1000,
        data: {id, name, createdAt: new Date().toISOString(), status: 'pending', message: '本地流程样例，不调用真实模型', completed: 0, retryBatchId: null,
            reservedCalls: 0, callLimit: analyze ? items.length : 0, outcome: null, items,
            plan: {version: 1, name, sources: items.map(item => item.sourceId), modelId, analyze, wallSeconds: input.wallSeconds, parentId, requestHash: 'local-mock'}}};
    quantState().batches.unshift(batch);
    if (!analyze) finish(batch, 'archived');
    else if (!quantModels.models.some(model => model.id === modelId)) finish(batch, 'waiting_model');
    persistQuantState(); return batch.data;
}

export async function resolveBatchRoute(request: Request, collection: string, id?: string, action?: string) {
    const records = quantState().batches.filter(row => row.collection === collection);
    const batch = records.find(row => row.data.id === id);
    if (id && !batch) return fail(404, '收集批次不存在');
    if (request.method === 'GET' && !action) {
        records.forEach(advance);
        if (batch) return batch.data;
        const params = new URL(request.url).searchParams, offset = Number(params.get('offset') || 0), limit = Number(params.get('limit') || 10);
        if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 10) return fail(400, '分页无效');
        return {total: records.length, items: records.slice(offset, offset + limit).map(row => row.data)};
    }
    if (request.method !== 'POST') return fail(405, '不支持此操作');
    if (batch && action === 'cancel') {if (active(batch.data.status)) finish(batch, 'cancelled'); return batch.data;}
    if (id && action !== 'retry') return fail(405, '不支持此操作');
    const body = await request.json() as QuantBatchInput;
    body.modelId ||= ''; body.wallSeconds ??= 1800;
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(body.requestKey || '') || !Number.isInteger(body.wallSeconds) || body.wallSeconds < 30 || body.wallSeconds > 3600) return fail(400, '请求或时间预算无效');
    const fingerprint = JSON.stringify([id || '', body]);
    const existing = records.find(row => row.key === body.requestKey);
    if (existing) return existing.fingerprint === fingerprint ? existing.data : fail(409, '请求标识已用于其他批次');
    if (records.filter(row => active(row.data.status)).length >= 2 && (batch || body.analyze)) return fail(409, '最多同时分析 2 个收集批次');
    if (batch) {
        project(batch);
        if (active(batch.data.status)) return fail(409, '批次仍在运行');
        if (records.some(row => row.data.plan.parentId === id)) return fail(409, '请从最新重试批次继续');
        const pending = batch.data.items.filter(item => item.status !== 'completed');
        if (!pending.length || pending.some(item => !item.available)) return fail(400, '没有可重试资料或资料已删除');
        const entries = pending.map(item => {
            const entry = quantState().entries.find(row => row.id === item.entryId)!;
            return {...entry, sources: [entry.sources!.find(source => source.id === item.sourceId)!]};
        });
        return create(collection, body, fingerprint, entries, id);
    }
    if (!Array.isArray(body.items)) return fail(400, '缺少资料');
    const invalid = validateMaterials(body.items);
    if (invalid) return fail(400, invalid);
    if (!body.name?.trim() || body.name.length > 200) return fail(400, '批次名称无效');
    const entries = body.items.map(material => {
        const identity = quantId('intake'), now = new Date().toISOString();
        const entry: QuantEntryDetail = {id: identity, collId: collection, title: material.title || '待分析资料', kind: 'factor', content: '', sourceUrl: material.url,
            tags: [], isValid: true, createdAt: now, updatedAt: now, implementations: [], backtests: [], attachments: [], runs: [], reports: [],
            sources: [{id: identity, materialId: identity, codeVersionId: null, createdAt: now, payload: {...material, language: material.language === 'auto' ? detectQuantLanguage(material.code) : material.language, fetchStatus: 'not_fetched', provenance: 'intake'}}]};
        quantState().entries.unshift(entry); setMockMaterialCurrent(entry.sources![0]); return entry;
    });
    return create(collection, body, fingerprint, entries);
}
