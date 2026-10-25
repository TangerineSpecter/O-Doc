import {HttpResponse} from 'msw';
import type {QuantEntryDetail, QuantFactorCandidate} from '../../types/api/quant';
import type {QuantGraph, QuantGraphEdge, QuantIndexJob, QuantIndexStatus} from '../../types/api/quantGraph';
import {collectMockFactors} from './factors';
import {mockComparisonEdges} from './comparisons';
import {mockScenario, persistQuantState, quantId, quantState} from './state';

export interface MockGraphState {cache: Record<string, string>; jobs: (QuantIndexJob & {collection: string; candidateIds: string[]})[]}
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
const fingerprint = (item: QuantFactorCandidate) => JSON.stringify([item.data, item.curation]);
const configured = () => mockScenario() !== 'no-embedding';
function status(collection: string, items: QuantFactorCandidate[]): QuantIndexStatus {
    const state = quantState().graph;
    for (const job of state.jobs.filter(job => job.collection === collection && ['pending', 'running'].includes(job.status))) {
        const elapsed = Date.now() - new Date(job.createdAt).getTime();
        job.status = elapsed > 6000 ? 'completed' : 'running';
        job.processed = job.status === 'completed' ? job.total : 0;
        if (job.status === 'completed') for (const identity of job.candidateIds) {
            const item = items.find(row => row.id === identity);
            if (item) state.cache[item.id] = fingerprint(item);
        }
    }
    const ready = configured() ? items.filter(item => state.cache[item.id] === fingerprint(item)).length : 0;
    persistQuantState();
    return {configured: configured(), modelName: configured() ? '本地演示向量（模拟）' : '', modelSignature: configured() ? 'local-fixture' : '', total: items.length, ready, missing: items.length - ready, oversized: 0, batchLimit: 50, jobs: state.jobs.filter(job => job.collection === collection).slice(0, 8)};
}
export function queueMockIndex(collection: string, entries: QuantEntryDetail[]) {
    const items = collectMockFactors(entries);
    const index = status(collection, items);
    if (!index.configured) return null;
    const active = quantState().graph.jobs.filter(job => job.collection === collection && ['pending', 'running'].includes(job.status));
    const reserved = new Set(active.flatMap(job => job.candidateIds));
    const candidateIds = items.filter(item => !reserved.has(item.id) && quantState().graph.cache[item.id] !== fingerprint(item)).slice(0, 50).map(item => item.id);
    if (!candidateIds.length || active.length >= 4) return null;
    const job = {id: quantId('index'), collection, candidateIds, status: 'pending' as const, total: candidateIds.length, processed: 0, modelName: index.modelName, error: '', createdAt: new Date().toISOString()};
    quantState().graph.jobs.unshift(job); persistQuantState();
    return job;
}
export function resolveGraphRoute(request: Request, collection: string, entries: QuantEntryDetail[], section?: string, jobId?: string, action?: string) {
    const items = collectMockFactors(entries);
    const index = status(collection, items);
    if (section === 'index') {
        if (request.method === 'GET' && !jobId) return index;
        if (request.method !== 'POST') return fail(405, '不支持此操作');
        if (jobId) {
            const job = quantState().graph.jobs.find(job => job.collection === collection && job.id === jobId);
            if (!job || action !== 'cancel') return fail(404, '索引任务不存在');
            if (['pending', 'running'].includes(job.status)) {job.status = 'cancelled'; job.error = '用户停止了本机索引任务';}
            persistQuantState(); return job;
        }
        if (!index.configured) return fail(400, '请先配置默认向量模型');
        const job = queueMockIndex(collection, entries);
        return {job, index: status(collection, items)};
    }
    if (request.method !== 'GET' || section) return fail(405, '不支持此操作');
    const params = new URL(request.url).searchParams;
    const focus = params.get('candidateId') || params.get('candidate_id');
    const center = focus ? items.find(item => item.id === focus) : items[0];
    if (focus && !center) return fail(404, '因子不存在');
    const graph: QuantGraph = {focusId: center?.id || '', nodes: [], edges: [], index, limited: false};
    if (!center) return graph;
    const selected = [center];
    for (const item of items.filter(item => item.id !== center.id)) {
        const same = item.fingerprints.expression && item.fingerprints.expression === center.fingerprints.expression;
        const raw = !!item.fingerprints.raw && item.fingerprints.raw === center.fingerprints.raw;
        const semantic = index.configured && quantState().graph.cache[item.id] && quantState().graph.cache[center.id];
        const descendant = item.data.derivation?.parentCandidateIds.includes(center.id);
        if (!same && !raw && !semantic && !descendant) continue;
        if (descendant) {selected.push(item); continue;}
        if (selected.length >= 21) {graph.limited = true; break;}
        selected.push(item);
        const kind = same ? 'same_expression' : raw ? 'same_source' : 'semantic_similar';
        const historical = kind === 'semantic_similar' && [center, item].some(row => quantState().graph.cache[row.id] !== fingerprint(row));
        graph.edges.push({id: `local-edge:${item.id}`, from: `factor:${center.id}`, to: `factor:${item.id}`, kind, historical, similarity: kind === 'semantic_similar' ? .87 : null,
            label: same ? '相同表达式与契约' : raw ? '相同原文与契约' : historical ? '语义相近（历史）' : '语义相近', detail: kind === 'semantic_similar' ? '本地模拟关系与相似度，未调用向量模型，不代表真实研究结果。' : '结构或原文一致，未验证实际输出等价'});
    }
    const evidence = mockComparisonEdges(collection);
    for (const [kind, records] of [['sample_equivalent', evidence.comparisons], ['merged_group', evidence.merges]] as const) {
        for (const record of records) {
            if (![record.leftId, record.rightId].includes(center.id)) continue;
            const otherId = record.leftId === center.id ? record.rightId : record.leftId;
            const other = items.find(row => row.id === otherId);
            if (!other) continue;
            if (!selected.some(row => row.id === otherId)) {
                if (selected.length >= 21) {graph.limited = true; continue;}
                selected.push(other);
            }
            graph.edges.push({id: `${kind}:${record.id}`, from: `factor:${record.leftId}`, to: `factor:${record.rightId}`, kind,
                label: kind === 'sample_equivalent' ? '固定样本一致（模拟）' : '可撤销逻辑分组', historical: false, similarity: null,
                comparisonId: kind === 'sample_equivalent' ? record.id : 'comparisonId' in record ? record.comparisonId : undefined,
                mergeId: kind === 'merged_group' ? record.id : undefined,
                detail: kind === 'sample_equivalent' ? '显式人工样例仅演示固定输入比较证据，未计算历史输出，不证明平台或全局等价。' : '人工整理的直接关系；撤销只移除此边，保留原比较与候选。'});
        }
    }
    for (const item of [...selected]) {
        for (const parent of items.filter(parent => (item.data.derivation?.parentCandidateIds || item.data.formulaVersion?.parentCandidateIds || []).includes(parent.id))) {
            if (!selected.some(row => row.id === parent.id)) selected.push(parent);
            graph.edges.push({id: `derived:${parent.id}:${item.id}`, from: `factor:${parent.id}`, to: `factor:${item.id}`, kind: 'derived_from',
                label: item.data.formulaVersion ? '公式修订' : '实验衍生', historical: false, similarity: null, detail: '本地演示谱系；未计算真实行情，也不证明组合优于父代'});
        }
    }
    const nodes = new Map<string, QuantGraph['nodes'][number]>(), edges = new Map<string, QuantGraphEdge>();
    for (const item of selected) {
        for (const [kind, id, label] of [['factor', item.id, item.curation.name], ['report', item.reportId, item.entryTitle], ['source', item.sourceId, '来源材料']] as const) {
            nodes.set(`${kind}:${id}`, {id: `${kind}:${id}`, kind, label, entryId: item.entryId, reportId: item.reportId});
        }
        for (const [id, from, to, kind, label] of [[`report:${item.id}`, `report:${item.reportId}`, `factor:${item.id}`, item.data.derivation || item.data.formulaVersion ? 'origin_context' : 'extracted_from', item.data.derivation || item.data.formulaVersion ? '祖先来源' : '提取'], [`source:${item.reportId}`, `source:${item.sourceId}`, `report:${item.reportId}`, 'analyzed_from', '分析']] as const) {
            edges.set(id, {id, from, to, kind, label, historical: false, similarity: null, detail: '报告绑定的不可变来源快照'});
        }
    }
    for (const record of quantState().experiments.filter(row => row.collection === collection)) {
        for (const artifact of record.strategyArtifacts || []) {
            const parent = selected.find(row => row.id === record.input.seeds[0].candidateId);
            if (!parent) continue;
            const id = `strategy:${artifact.id}`;
            nodes.set(id, {id, kind: 'strategy', label: `MQ4 EA候选 · ${record.data.name}`, entryId: artifact.entryId, reportId: ''});
            edges.set(`strategy:${artifact.id}`, {id: `strategy:${artifact.id}`, from: `factor:${parent.id}`, to: id, kind: 'generated_strategy', label: 'MQ4 EA候选', historical: false, similarity: null, detail: '人工归档样例，仅演示谱系与来源跳转；未转换公式、编译或执行。'});
        }
    }
    graph.nodes = [...nodes.values()]; graph.edges.push(...edges.values());
    return graph;
}
