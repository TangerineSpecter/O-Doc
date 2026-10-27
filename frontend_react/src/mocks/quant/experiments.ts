import {validateStrategy, strategySnapshot} from '../../utils/quantStrategy';
import {mockJointSensitivity} from './jointSensitivity';
import {isParameterText} from '../../utils/quantParameterValues';
import {temporalSnapshot, temporalWindows, validateTemporalBudget} from '../../utils/quantTemporal';
import {demoTemporalResult} from './temporalResult';
import {evolutionSnapshot, readEvolution} from '../../utils/quantEvolution';
import {mockSensitivity} from './sensitivity';
import {mockTemporalSensitivity} from './temporalSensitivity';
import {mockCombination} from './combination';
import type {MockLibraryContext} from './libraryResearch';
import {findMockProposal} from './experimentProposals';
import {attachMockProposal, presentMockProposal} from './experimentProposals';
import {queueMockIndex} from './graph';
import {publishMockDerived} from './experimentDerivation';
import {createRun, advanceRun} from './runs';
import {publishMockReport} from './research';
import {HttpResponse} from 'msw';
import type {QuantExperiment, QuantExperimentInput, QuantExperimentProposal} from '../../types/api/quantExperiment';
import {demoExperimentResult} from './experimentResult';
import {decorateLabelSearch} from './labelSearch';
import {experimentEngine,validateLabelWindows} from '../../utils/quantLabelSearch';
import {freezeLabelTarget} from '../../utils/quantLabels';
import {mockSelectionDiagnostic} from './selectionDiagnostic';
import {collectMockFactors} from './factors';
import {checkParameterDomains} from '../../utils/quantParameterDomain';
import {persistQuantState, quantId, quantState} from './state';
export interface MockExperiment {strategyArtifacts?: import('../../types/api/quantStrategyExport').QuantStrategyArtifact[]; collection: string; input: QuantExperimentInput; data: QuantExperiment; libraryContexts?: Record<string, MockLibraryContext>; proposals?: Record<string, QuantExperimentProposal>}
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
const summary = ({combinationAnalysisJson: _combinationAnalysis, temporalSensitivityJson: _temporalSensitivity, selectionDiagnostic: _selectionDiagnostic, jointSensitivityJson: _jointSensitivity, sensitivityJson: _sensitivity, planJson: _plan, resultJson: _result, attemptsJson: _attempts, reviews: _reviews, reviewContext: _reviewContext, derivedCandidates: _derived, originProposal: _origin, ...data}: QuantExperiment) => data;
function validate(input: QuantExperimentInput, collection: string) {
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200 || !/^[A-Za-z0-9_-]{16,64}$/.test(input.requestKey || '')) throw new Error('实验名称或请求标识无效');
    const dataset = quantState().datasets.find(row => row.collection === collection && row.data.id === input.datasetId);
    if (!dataset || dataset.data.rowCount < 60) throw new Error('请选择至少 60 根 K 线的本集合行情');
    const config = input.config;
    if (!config || ['seed', 'maxCandidates', 'generations', 'gap', 'seconds'].some(key => !Number.isInteger(config[key as keyof typeof config])) ||
        config.seed < 0 || config.seed >= 2 ** 32 || config.maxCandidates < 1 || config.maxCandidates > 32 || config.generations < 1 || config.generations > 4 || config.seconds < 1 || config.seconds > 60 || config.gap < 1 || config.gap > 2000 ||
        ![config.threshold, config.feeBps, config.slippageBps].every(Number.isFinite) || config.feeBps < 0 || config.feeBps > 500 || config.slippageBps < 0 || config.slippageBps > 500) throw new Error('实验预算或成本合同无效');
    if (config.strategy) validateStrategy(config.strategy, config.threshold);
    if (config.evolution) {
        readEvolution(evolutionSnapshot(config.evolution));
        if (config.generations < 2 || input.seeds.reduce((sum, seed) => sum + 1 + seed.variants.length, 0) >= config.maxCandidates) throw new Error('请为公式演化保留代数与尝试额度');
    }
    if (config.walkForward) {temporalWindows(dataset.data.rowCount, config.walkForward, config.gap); validateTemporalBudget(config.walkForward, input.seeds, config);}
    if(config.labelTarget)validateLabelWindows(freezeLabelTarget(config.labelTarget),dataset.data.rowCount,config);
    const n = dataset.data.rowCount, a = Math.floor(n * .6), b = Math.floor(n * .8);
    if (!config.walkForward && [a - 2, b - 1 - a - config.gap, n - 1 - b - config.gap].some(size => size < 5)) throw new Error('隔离后的各段至少保留 5 个收益区间');
    if (!Array.isArray(input.seeds) || input.seeds.length < 1 || input.seeds.length > Math.min(8, config.maxCandidates) || new Set(input.seeds.map(seed => seed.candidateId)).size !== input.seeds.length) throw new Error('需要 1–8 个不同父代');
    const candidates = collectMockFactors(quantState().entries.filter(row => row.collId === collection && row.isValid));
    for (const seed of input.seeds) {
        const candidate = candidates.find(row => row.id === seed.candidateId);
        if (!candidate?.data.expression || !['numeric_series', 'boolean_series'].includes(candidate.data.outputType)) throw new Error('候选不存在或没有可计算表达式');
        if (!Array.isArray(seed.bindings) || seed.bindings.length !== candidate.data.inputs.length || new Set(seed.bindings.map(row => row.name)).size !== seed.bindings.length || seed.bindings.some(row => !candidate.data.inputs.some(field => field.name === row.name) || !['open', 'high', 'low', 'close', 'volume'].includes(row.column))) throw new Error('请明确全部输入列绑定');
        const numeric = (value: unknown) => typeof value === 'boolean' || isParameterText(value) || (typeof value === 'number' && Number.isFinite(value));
        if (!Array.isArray(seed.parameters) || seed.parameters.length !== candidate.data.parameters.length || new Set(seed.parameters.map(row => row.name)).size !== seed.parameters.length || seed.parameters.some(row => !candidate.data.parameters.some(field => field.name === row.name) || !numeric(row.value))) throw new Error('请明确全部实际实验参数');
        if (!Array.isArray(seed.variants) || seed.variants.length > 16 || seed.variants.some(values => !Array.isArray(values) || values.some(row => typeof row.name !== 'string' || !numeric(row.value)))) throw new Error('候选参数组无效');
        checkParameterDomains(candidate.data.parameters, Object.fromEntries(seed.parameters.map(row => [row.name, row.value])));
    }
    return {dataset, candidates};
}
function advance(record: MockExperiment) {
    record.data.originProposal = presentMockProposal(findMockProposal(record.input.proposalId, record.collection), record.collection);
    const wasRunning = ['pending', 'running'].includes(record.data.status);
    const elapsed = Date.now() - Date.parse(record.data.createdAt);
    if (record.data.status === 'pending' && elapsed > 300) record.data.status = 'running';
    if (record.data.status === 'running' && elapsed > 1800) {
        record.data.status = 'completed';
        record.data.error = '本地模拟流程；未执行真实历史行情计算，不能据此判断参数表现';
        const dataset = quantState().datasets.find(row => row.data.id === record.input.datasetId)!.data;
        const demo = record.input.config.walkForward ? demoTemporalResult(record.input, dataset.start, dataset.end, dataset.rowCount, JSON.parse(record.data.planJson!).seeds) : demoExperimentResult(record.input, dataset.start, dataset.end, JSON.parse(record.data.planJson!).engine_version, JSON.parse(record.data.planJson!).seeds);
        const frozen = JSON.parse(record.data.planJson!).seeds as {candidate: {parameters: import('../../types/api/quant').QuantAnalysis['parameters']}}[];
        for (const attempt of demo.attempts) {
            if (attempt.operation !== 'parameter_variant' || attempt.status !== 'evaluated') continue;
            try {checkParameterDomains(frozen[0].candidate.parameters, attempt.requested_parameters || {});}
            catch (error) {attempt.status = 'rejected'; attempt.reason = error instanceof Error ? error.message : '参数约束不满足'; attempt.metrics = {} as typeof attempt.metrics;}
        }
        decorateLabelSearch(demo,record.input,dataset.start,dataset.end,dataset.rowCount);
        record.data.attemptCount = demo.attempts.length;
        record.data.attemptsJson = JSON.stringify(demo.attempts);
        record.data.resultJson = JSON.stringify(demo.envelope);
        record.data.selectionDiagnostic=mockSelectionDiagnostic(record);
    }
    record.data.sensitivityJson = mockSensitivity(record);
    record.data.jointSensitivityJson = mockJointSensitivity(record);
    record.data.temporalSensitivityJson = mockTemporalSensitivity(record);
    record.data.combinationAnalysisJson = mockCombination(record);
    const candidate = collectMockFactors(quantState().entries.filter(row => row.collId === record.collection && row.isValid)).find(row => row.id === record.input.seeds[0].candidateId);
    const entry = candidate && quantState().entries.find(row => row.id === candidate.entryId);
    if (entry && candidate && record.data.resultJson) {
        if (wasRunning) {
            publishMockDerived(record, candidate);
            if (record.data.derivedCandidates?.length) queueMockIndex(record.collection, quantState().entries.filter(row => row.collId === record.collection && row.isValid));
        }
        const experimentResultId = `result-${record.data.id}`;
        record.data.reviewContext = {experimentResultId, entryId: entry.id, sourceId: candidate.sourceId};
        if (wasRunning && record.data.status === 'completed' && !entry.runs.some(row => row.experimentResultId === experimentResultId)) createRun(entry, {kind: 'experiment_review', sourceId: candidate.sourceId, experimentResultId, requestKey: `review-${record.data.id}`});
        const reviews = entry.runs.filter(row => row.experimentResultId === experimentResultId);
        reviews.forEach(row => advanceRun(row)); publishMockReport(entry);
        record.data.reviews = reviews.slice(0, 10).map(run => ({run, report: entry.reports?.find(row => row.runId === run.id) || null, proposal: presentMockProposal(record.proposals?.[run.id], record.collection)}));
        record.data.reviewStatus = reviews[0]?.status || null;
    }
}
export async function resolveExperimentRoute(request: Request, collection: string, id?: string, action?: string) {
    const records = quantState().experiments.filter(row => row.collection === collection);
    if (request.method === 'POST' && !id) {
        try {
            const input = await request.json() as QuantExperimentInput;
            const {dataset, candidates} = validate(input, collection);
            const existing = records.find(row => row.input.requestKey === input.requestKey);
            if (existing) return JSON.stringify(existing.input) === JSON.stringify(input) ? existing.data : fail(409, '请求标识已用于不同实验');
            if (records.filter(row => ['pending', 'running'].includes(row.data.status)).length >= 4) return fail(409, '最多同时保留 4 个实验');
            const config = input.config;
            const plan = {version: 1, engine_version: experimentEngine(config), name: input.name, dataset_hash: dataset.data.contentHash,
                seeds: input.seeds.map(seed => ({id: seed.candidateId, candidate: candidates.find(row => row.id === seed.candidateId)!.data,
                    bindings: Object.fromEntries(seed.bindings.map(row => [row.name, row.column])), parameters: Object.fromEntries(seed.parameters.map(row => [row.name, row.value])), variants: seed.variants.map(values => Object.fromEntries(values.map(row => [row.name, row.value])))})),
                config: {...(config.labelTarget?{label_target:freezeLabelTarget(config.labelTarget)}:{}),...(config.strategy ? {strategy: strategySnapshot(config.strategy)} : {}), seed: config.seed, max_candidates: config.maxCandidates, generations: config.generations, threshold: config.threshold, fee_bps: config.feeBps, slippage_bps: config.slippageBps, gap: config.gap, seconds: config.seconds, ...(config.evolution ? {evolution: evolutionSnapshot(config.evolution)} : {}), ...(config.walkForward ? {walk_forward: temporalSnapshot(config.walkForward)} : {})}};
            const originProposal = attachMockProposal(plan, input.proposalId, collection);
            const data: QuantExperiment = {id: quantId('experiment'), name: input.name, datasetId: input.datasetId, createdAt: new Date().toISOString(),
                originProposal, status: 'pending', cancelRequested: false, error: '本地模拟实验任务，不执行真实回测', attemptCount: 0, contentHash: 'local-demo-plan', planJson: JSON.stringify(plan), resultJson: null, attemptsJson: '[]'};
            const record: MockExperiment={collection,input,data};
            data.temporalSensitivityJson=mockTemporalSensitivity(record);
            quantState().experiments.unshift(record); persistQuantState(); return data;
        } catch (cause) {return fail(400, cause instanceof Error ? cause.message : '实验请求无效');}
    }
    const record = records.find(row => row.data.id === id);
    if (id && !record) return fail(404, '实验不存在或无权访问');
    if (request.method === 'POST' && record && action === 'cancel') {
        if (['pending', 'running'].includes(record.data.status)) {
            record.data.status = 'cancelled'; record.data.cancelRequested = true; record.data.error = '本地模拟实验已停止';
        }
        persistQuantState(); return record.data;
    }
    if (request.method !== 'GET' || action) return fail(405, '不支持此操作');
    records.forEach(advance); persistQuantState();
    if (record) return record.data;
    const params = new URL(request.url).searchParams, offset = Number(params.get('offset') || 0), limit = Number(params.get('limit') || 20);
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 40) return fail(400, '分页参数无效');
    return {total: records.length, items: records.slice(offset, offset + limit).map(row => summary(row.data))};
}
