import {findMockProposal} from './experimentProposals';
import {HttpResponse} from 'msw';
import type {QuantCampaign, QuantCampaignInput} from '../../types/api/quantCampaign';
import type {QuantExperiment} from '../../types/api/quantExperiment';
import {readProposal} from '../../components/Quant/experiments/proposal';
import {resolveExperimentRoute} from './experiments';
import {persistQuantState, quantId, quantState} from './state';
import {quantModels} from './fixtures';
export interface MockCampaign {collection: string; input: QuantCampaignInput; data: QuantCampaign}
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
const active = (row: QuantCampaign) => ['pending', 'running'].includes(row.status);
function stop(record: MockCampaign, reason: string, message: string) {
    const status = ['round_budget', 'model_stop'].includes(reason) ? 'completed' : reason === 'cancelled' ? 'cancelled' : 'stopped';
    Object.assign(record.data, {status, reason, message: `本地流程样例，未计算真实行情或请求模型。${message}`,
        outcome: {version: 1, status, reason, message, roundCount: record.data.rounds.length, independentValidationProven: false}});
}
function findProposal(id: string, collection: string) {
    return findMockProposal(id, collection);
}
async function stopChildren(record: MockCampaign) {
    for (const step of record.data.rounds) {
        await resolveExperimentRoute(new Request('http://local/cancel', {method: 'POST'}), record.collection, step.experiment.id, 'cancel');
        const source = quantState().experiments.find(row => row.data.id === step.experiment.id);
        if (source?.data.reviewContext) for (const entry of quantState().entries) for (const run of entry.runs) {
            if (run.experimentResultId === source.data.reviewContext.experimentResultId && ['pending', 'running'].includes(run.status)) {run.status = 'cancelled'; run.error = '连续研究已停止';}
        }
    }
}
async function advance(record: MockCampaign) {
    const row = record.data, input = record.input;
    if (!active(row)) return;
    if (Date.now() - Date.parse(row.createdAt) >= input.wallSeconds * 1000) {await stopChildren(record); stop(record, 'wall_budget', '达到总耗时上限'); return;}
    row.status = 'running';
    let proposal = findProposal(input.proposalId, record.collection);
    const latest = row.rounds[row.rounds.length - 1];
    if (latest) {
        const result = await resolveExperimentRoute(new Request('http://local/experiment'), record.collection, latest.experiment.id);
        if (result instanceof Response || !result || !('id' in result)) {stop(record, 'experiment_failed', '实验记录不可用'); return;}
        latest.experiment = result as QuantExperiment;
        latest.reviewStatus = latest.experiment.reviewStatus || null;
        row.modelCalls = row.rounds.filter(step => step.experiment.reviews?.length).length;
        if (['pending', 'running'].includes(latest.experiment.status)) return;
        if (latest.experiment.status !== 'completed') {stop(record, 'experiment_failed', '实验失败或停止'); return;}
        if (!latest.reviewStatus || ['pending', 'running'].includes(latest.reviewStatus)) return;
        if (latest.reviewStatus !== 'completed') {stop(record, 'review_failed', '解读失败或停止'); return;}
        if (row.rounds.length >= input.maxRounds) {stop(record, 'round_budget', '达到轮数预算'); return;}
        proposal = latest.experiment.reviews?.[0]?.proposal || undefined;
        if (!proposal) {stop(record, 'model_stop', '没有下一方案'); return;}
    }
    if (!proposal) {stop(record, 'invalid_next_plan', '起点方案不可用'); return;}
    if (row.rounds.length >= input.datasetIds.length) {stop(record, 'datasets_exhausted', '预选行情已用完'); return;}
    const design = readProposal(proposal);
    if (row.reservedAttempts + design.config.maxCandidates > input.maxAttempts) {stop(record, 'attempt_budget', '剩余候选预算不足'); return;}
    if (row.reservedComputeSeconds + design.config.seconds > input.computeSeconds) {stop(record, 'compute_budget', '剩余计算预算不足'); return;}
    const index = row.rounds.length;
    const result = await resolveExperimentRoute(new Request('http://local/experiment', {method: 'POST', body: JSON.stringify({requestKey: `${row.id}-round-${index + 1}`,
        name: design.name, proposalId: proposal.id, datasetId: input.datasetIds[index], seeds: design.seeds, config: design.config})}), record.collection);
    if (result instanceof Response || !result || !('id' in result)) {stop(record, 'invalid_next_plan', '下一方案无法启动'); return;}
    row.rounds.push({ordinal: index + 1, experiment: result as QuantExperiment, reviewStatus: null});
    row.reservedAttempts += design.config.maxCandidates; row.reservedComputeSeconds += design.config.seconds;
}
export async function resolveCampaignRoute(request: Request, collection: string, id?: string, action?: string) {
    const records = quantState().campaigns.filter(row => row.collection === collection);
    if (request.method === 'POST' && !id) {
        try {
            const input = await request.json() as QuantCampaignInput;
            if (!input || !/^[A-Za-z0-9_-]{16,64}$/.test(input.requestKey || '') || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) throw new Error('连续研究名称或标识无效');
            for (const [key, min, max] of [['maxRounds', 1, 5], ['maxAttempts', 1, 160], ['computeSeconds', 1, 300], ['wallSeconds', 30, 1200]] as const) if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) throw new Error('连续研究预算无效');
            if (!Array.isArray(input.datasetIds) || !input.datasetIds.length || input.datasetIds.length > input.maxRounds || new Set(input.datasetIds).size !== input.datasetIds.length || input.datasetIds.some(id => !quantState().datasets.some(row => row.collection === collection && row.data.id === id))) throw new Error('请选择本集合不同的行情记录');
            const proposal = findProposal(input.proposalId, collection);
            if (!proposal) throw new Error('方案不存在或无权使用');
            const design = readProposal(proposal);
            if (design.config.maxCandidates > input.maxAttempts || design.config.seconds > input.computeSeconds) throw new Error('总预算不足以执行第一轮');
            const prior = records.find(row => row.input.requestKey === input.requestKey);
            if (prior) return JSON.stringify(prior.input) === JSON.stringify(input) ? prior.data : fail(409, '请求标识已用于其他连续研究');
            if (records.filter(row => active(row.data)).length >= 2) return fail(409, '最多同时执行 2 项连续研究');
            const {requestKey: _key, ...plan} = input;
            const row: QuantCampaign = {id: quantId('campaign'), name: input.name, createdAt: new Date().toISOString(), status: 'pending',
                message: '本地流程样例，未计算真实行情或请求模型', reason: '', plan: {...plan, modelId: input.modelId || quantModels.defaultModelId, version: 1},
                reservedAttempts: 0, reservedComputeSeconds: 0, modelCalls: 0, rounds: [], outcome: null};
            quantState().campaigns.unshift({collection, input, data: row}); persistQuantState(); return row;
        } catch (cause) {return fail(400, cause instanceof Error ? cause.message : '连续研究请求无效');}
    }
    const record = records.find(row => row.data.id === id);
    if (id && !record) return fail(404, '连续研究不存在或无权访问');
    if (request.method === 'POST' && action === 'cancel' && record) {if (active(record.data)) {await stopChildren(record); stop(record, 'cancelled', '用户停止连续研究');} persistQuantState(); return record.data;}
    if (request.method !== 'GET' || action) return fail(405, '不支持此操作');
    for (const row of records) await advance(row);
    persistQuantState();
    if (record) return record.data;
    const params = new URL(request.url).searchParams, offset = Number(params.get('offset') || 0), limit = Number(params.get('limit') || 10);
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 20) return fail(400, '分页参数无效');
    return {total: records.length, items: records.slice(offset, offset + limit).map(row => row.data)};
}
