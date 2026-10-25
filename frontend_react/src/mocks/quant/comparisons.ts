import {HttpResponse} from 'msw';
import type {QuantComparison, QuantComparisonInput, QuantComparisonSide, QuantFactorMerge, QuantFactorMergeInput, QuantMergedGroup} from '../../types/api/quantComparison';
import type {QuantFactorCandidate} from '../../types/api/quant';
import {checkParameterDomains} from '../../utils/quantParameterDomain';
import {isParameterText} from '../../utils/quantParameterValues';
import {collectMockFactors} from './factors';
import {mockComparisonResult, comparisonMethod} from './comparisonResult';
import {validateMockComparisonExpression} from './comparisonValidation';
import {mockDatasetTimestamp} from './datasets';
import {persistQuantState, quantId, quantState} from './state';

export interface MockComparison {collection: string; input: QuantComparisonInput; data: QuantComparison}
export interface MockFactorMerge {collection: string; input: QuantFactorMergeInput; data: QuantFactorMerge; withdrawalInput?: {requestKey: string; reason: string}}
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
const keyValid = (key: unknown) => typeof key === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(key);
const factors = (collection: string) => collectMockFactors(quantState().entries.filter(row => row.collId === collection && row.isValid));
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}` : JSON.stringify(value);
const equal = (a: unknown, b: unknown) => stable(a) === stable(b);
const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
const localHash = (id: string) => `local-demo-frozen-${id}`;
const activeMerges = (collection: string) => quantState().factorMerges.filter(row => row.collection === collection && row.data.active);
export function mockMergedGroup(collection: string, candidateId: string, items = factors(collection)): QuantMergedGroup | null {
    if (!items.some(row => row.id === candidateId)) return null;
    const edges = activeMerges(collection), available = new Set(items.map(row => row.id)), ids = new Set([candidateId]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const {data} of edges) {
            if (!available.has(data.leftId) || !available.has(data.rightId) || !(ids.has(data.leftId) || ids.has(data.rightId))) continue;
            for (const identity of [data.leftId, data.rightId]) if (!ids.has(identity)) {ids.add(identity); changed = true;}
        }
    }
    const merged = edges.filter(row => ids.has(row.data.leftId) && ids.has(row.data.rightId));
    const members = items.filter(row => ids.has(row.id));
    const frozen = merged.flatMap(row => {
        const value = JSON.parse(row.data.curationJson) as {left: {data: {name: string; aliases: string[]}}; right: {data: {name: string; aliases: string[]}}};
        return [value.left.data, value.right.data];
    });
    const memberIds = [...ids].sort();
    return {id: `merged:${memberIds[0]}`, memberIds, activeMergeIds: merged.map(row => row.data.id).sort(),
        names: unique([...members.flatMap(row => [row.curation.name, row.data.name]), ...frozen.map(row => row.name), ...merged.map(row => row.data.name)]),
        aliases: unique([...members.flatMap(row => row.curation.aliases), ...frozen.flatMap(row => row.aliases)])};
}
export function mockComparisonEdges(collection: string) {
    return {comparisons: quantState().comparisons.filter(row => row.collection === collection && row.data.verdict === 'pass').map(row => row.data),
        merges: activeMerges(collection).map(row => row.data)};
}
function validateSide(side: QuantComparisonSide, items: QuantFactorCandidate[]) {
    if (!side || Object.keys(side).sort().join(',') !== 'bindings,candidateId,parameters') throw new Error('比较两侧必须且只能提供候选、输入绑定和全部实际参数');
    const candidate = items.find(row => row.id === side?.candidateId);
    if (!candidate?.data.expression || !['numeric_series', 'boolean_series'].includes(candidate.data.outputType)) throw new Error('候选不存在或尚无受控数值/布尔表达式');
    if (!Array.isArray(side.bindings) || side.bindings.length !== candidate.data.inputs.length || new Set(side.bindings.map(row => row.name)).size !== side.bindings.length || side.bindings.some(row => !candidate.data.inputs.some(input => input.name === row.name) || !['open', 'high', 'low', 'close', 'volume'].includes(row.column))) throw new Error('必须明确绑定全部行情输入');
    const scalar = (value: unknown) => typeof value === 'boolean' || isParameterText(value) || typeof value === 'number' && Number.isFinite(value);
    if (!Array.isArray(side.parameters) || side.parameters.length !== candidate.data.parameters.length || new Set(side.parameters.map(row => row.name)).size !== side.parameters.length || side.parameters.some(row => !candidate.data.parameters.some(parameter => parameter.name === row.name) || !scalar(row.value))) throw new Error('必须明确填写全部实际参数');
    const parameters = Object.fromEntries(side.parameters.map(row => [row.name, row.value]));
    checkParameterDomains(candidate.data.parameters, parameters);
    validateMockComparisonExpression(candidate.data, parameters);
    return {candidate, snapshot: {id: candidate.id, candidate: structuredClone(candidate.data), candidate_hash: candidate.contentHash,
        source_id: candidate.sourceId, report_id: candidate.reportId, source_hash: localHash(candidate.sourceId), report_hash: localHash(candidate.reportId),
        bindings: Object.fromEntries(side.bindings.map(row => [row.name, row.column])), parameters}};
}
function presentComparison(record: MockComparison, detail = true): QuantComparison {
    const merges = quantState().factorMerges.filter(row => row.collection === record.collection && row.data.comparisonId === record.data.id).map(row => structuredClone(row.data));
    if (detail) return {...structuredClone(record.data), merges};
    const {planJson: _plan, resultJson: _result, datasetJson: _dataset, ...summary} = record.data;
    return {...summary, merges};
}
function page(request: Request) {
    const params = new URL(request.url).searchParams;
    const offset = Number(params.get('offset') || 0), limit = Number(params.get('limit') || 20);
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 40) throw new Error('分页参数无效');
    return {offset, limit, factorId: params.get('factorId') || params.get('factor_id') || ''};
}
export async function resolveComparisonRoute(request: Request, collection: string, id?: string) {
    const records = quantState().comparisons.filter(row => row.collection === collection);
    if (request.method === 'POST' && !id) {
        try {
            const input = await request.json() as QuantComparisonInput;
            if (!input || !keyValid(input.requestKey) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) throw new Error('比较名称或请求标识无效');
            const existing = records.find(row => row.input.requestKey === input.requestKey);
            if (existing) return equal(existing.input, input) ? presentComparison(existing) : fail(409, '请求标识已用于不同比较');
            const dataset = quantState().datasets.find(row => row.collection === collection && row.data.id === input.datasetId);
            const policy = input.policy;
            if (!dataset || !policy || Object.keys(policy).sort().join(',') !== 'absoluteTolerance,relativeTolerance,warmupBars' || ![policy.absoluteTolerance, policy.relativeTolerance].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= .001) || !Number.isInteger(policy.warmupBars) || policy.warmupBars < 0 || policy.warmupBars > 2000 || dataset.data.rowCount - policy.warmupBars < 30) throw new Error('请选择本集合行情，容差须为0–0.001，共同预热后至少保留30行');
            if (!input.left || !input.right || input.left.candidateId === input.right.candidateId) throw new Error('请选择两个不同候选');
            const items = factors(collection), left = validateSide(input.left, items), right = validateSide(input.right, items);
            const markers = [left.candidate, right.candidate].map(candidate => quantState().entries.find(row => row.id === candidate.entryId)?.sources?.find(row => row.id === candidate.sourceId)?.payload.code || '').join('\n');
            const result = mockComparisonResult(left.candidate, right.candidate, dataset.data, policy, markers, mockDatasetTimestamp(dataset, policy.warmupBars));
            const identity = quantId('comparison');
            const plan = {version: 1, method: comparisonMethod, name: input.name.trim(), left: left.snapshot, right: right.snapshot,
                dataset_id: dataset.data.id, dataset_hash: dataset.data.contentHash, policy: {version: 1, absolute_tolerance: policy.absoluteTolerance, relative_tolerance: policy.relativeTolerance, warmup_bars: policy.warmupBars},
                engine_version: 'quant-controlled-expression-1', runtime: {python: 'local-demo-not-executed', numpy: 'local-demo-not-executed', pandas: 'local-demo-not-executed'}};
            const frozenDataset = {id: dataset.data.id, name: dataset.data.name, content_hash: dataset.data.contentHash, row_count: dataset.data.rowCount, start: dataset.data.start, end: dataset.data.end,
                symbol: dataset.data.symbol, timeframe: dataset.data.timeframe, timezone: dataset.data.timezone, price_adjustment: dataset.data.priceAdjustment, source: dataset.data.source};
            const data: QuantComparison = {id: identity, name: input.name.trim(), leftId: input.left.candidateId, rightId: input.right.candidateId, datasetId: dataset.data.id,
                createdAt: new Date().toISOString(), contentHash: localHash(identity), verdict: result.status, planJson: JSON.stringify(plan), resultJson: JSON.stringify(result), datasetJson: JSON.stringify(frozenDataset)};
            const record = {collection, input: structuredClone(input), data};
            quantState().comparisons.unshift(record); persistQuantState(); return presentComparison(record);
        } catch (cause) {return fail(400, cause instanceof Error ? cause.message : '比较请求无效');}
    }
    if (request.method !== 'GET') return fail(405, '不支持此操作');
    if (id) {const record = records.find(row => row.data.id === id); return record ? presentComparison(record) : fail(404, '比较不存在或无权访问');}
    try {
        const {offset, limit, factorId} = page(request);
        if (factorId && !factors(collection).some(row => row.id === factorId)) return fail(404, '候选不存在或无权访问');
        const filtered = records.filter(row => !factorId || [row.data.leftId, row.data.rightId].includes(factorId));
        return {total: filtered.length, items: filtered.slice(offset, offset + limit).map(row => presentComparison(row, false))};
    } catch (cause) {return fail(400, cause instanceof Error ? cause.message : '分页参数无效');}
}
export async function resolveFactorMergeRoute(request: Request, collection: string, id?: string, action?: string) {
    const records = quantState().factorMerges.filter(row => row.collection === collection);
    if (request.method === 'POST' && id && action === 'withdraw') {
        const target = records.find(row => row.data.id === id);
        if (!target) return fail(404, '合并关系不存在或无权访问');
        const input = await request.json() as {requestKey: string; reason: string};
        if (!keyValid(input?.requestKey) || typeof input.reason !== 'string' || input.reason.length > 3000) return fail(400, '撤销请求无效');
        const existing = records.find(row => row.withdrawalInput?.requestKey === input.requestKey);
        if (existing) return existing === target && equal(existing.withdrawalInput, input) ? structuredClone(target.data) : fail(409, '撤销请求标识已用于其他内容');
        if (!target.data.active) return fail(409, '此合并关系已撤销');
        target.withdrawalInput = structuredClone(input);
        target.data.withdrawal = {id: quantId('merge-withdrawal'), reason: input.reason, createdAt: new Date().toISOString()}; target.data.active = false;
        persistQuantState(); return structuredClone(target.data);
    }
    if (request.method === 'POST' && !id) {
        try {
            const input = await request.json() as QuantFactorMergeInput;
            if (!keyValid(input?.requestKey) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200 || typeof input.reason !== 'string' || input.reason.length > 3000) throw new Error('合并名称、理由或请求标识无效');
            const existing = records.find(row => row.input.requestKey === input.requestKey);
            if (existing) return equal(existing.input, input) ? structuredClone(existing.data) : fail(409, '合并请求标识已用于不同内容');
            const comparison = quantState().comparisons.find(row => row.collection === collection && row.data.id === input.comparisonId)?.data;
            if (!comparison || comparison.verdict !== 'pass' || JSON.parse(comparison.resultJson!).evaluation_status !== 'completed') throw new Error('只有已完成且样本内一致的直接对照证据可建立可撤销合并关系');
            const items = factors(collection), members = [comparison.leftId, comparison.rightId].map(identity => items.find(row => row.id === identity));
            if (members.some(row => !row)) throw new Error('比较候选已不可用');
            if (records.some(row => row.data.active && [row.data.leftId, row.data.rightId].sort().join(',') === [comparison.leftId, comparison.rightId].sort().join(','))) return fail(409, '这两个候选已有有效合并，撤销后可重新建立依据');
            const identity = quantId('factor-merge');
            const frozen = (candidate: QuantFactorCandidate) => ({candidate_id: candidate.id, revision_id: candidate.currentRevisionId, data: structuredClone(candidate.curation)});
            const curation = {version: 1, left: frozen(members[0]!), right: frozen(members[1]!)};
            const data: QuantFactorMerge = {id: identity, comparisonId: comparison.id, leftId: comparison.leftId, rightId: comparison.rightId, name: input.name.trim(), reason: input.reason,
                createdAt: new Date().toISOString(), contentHash: localHash(identity), active: true, curationJson: JSON.stringify(curation), withdrawal: null};
            quantState().factorMerges.unshift({collection, input: structuredClone(input), data}); persistQuantState(); return structuredClone(data);
        } catch (cause) {return fail(400, cause instanceof Error ? cause.message : '合并请求无效');}
    }
    if (request.method !== 'GET' || action || id) return fail(405, '不支持此操作');
    try {
        const {offset, limit, factorId} = page(request), group = factorId ? mockMergedGroup(collection, factorId) : null;
        if (factorId && !group) return fail(404, '候选不存在或无权访问');
        const filtered = records.filter(row => !factorId || [row.data.leftId, row.data.rightId].includes(factorId));
        return {total: filtered.length, items: filtered.slice(offset, offset + limit).map(row => structuredClone(row.data)), group};
    } catch (cause) {return fail(400, cause instanceof Error ? cause.message : '分页参数无效');}
}
