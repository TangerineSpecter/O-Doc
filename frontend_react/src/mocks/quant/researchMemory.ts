import {mockFixedResearchMemory} from './fixedResearchMemory';
import type {QuantAIRun, QuantEntryDetail} from '../../types/api/quant';
import {readResearchMemory, researchMemoryReference} from '../../utils/quantResearchMemory';
import {collectMockFactors} from './factors';
import {quantState} from './state';
import {mockMemoryRelevance, selectMockResearchMemory, type MockMemoryItem} from './researchMemoryContract';
import {mockComparisonMemory} from './researchComparisonMemory';

const parse = (value?: string | null): Record<string, unknown> => {
    try {const row: unknown = JSON.parse(value || '{}'); return row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : {};} catch {return {};}
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const metricKeys = ['total_return', 'max_drawdown', 'entries', 'turnover', 'exposure_fraction', 'missing_signals', 'bars', 'start', 'end'];
const fields = (value: Record<string, unknown>, names: string[]) => Object.fromEntries(names.filter(key => key in value).map(key => [key, structuredClone(value[key])]));

/** Artificial local context: immutable at submission, no AI or historical-bar execution. */
export function freezeMockResearchMemory(run: QuantAIRun, entry: QuantEntryDetail) {
    if (!['analyze','experiment_review', 'feedback_review'].includes(run.kind)) return;
    if (run.researchMemoryJson) return;
    const state = quantState(), entries = state.entries.filter(row => row.collId === entry.collId && row.isValid);
    const factors = collectMockFactors(entries);
    const current = state.experiments.find(row => row.collection === entry.collId && `result-${row.data.id}` === run.experimentResultId);
    const feedback = entry.sources?.find(row => row.id === run.sourceId);
    const targetExperiment = feedback?.payload.experimentResultId ? state.experiments.find(row => row.collection === entry.collId && `result-${row.data.id}` === feedback.payload.experimentResultId) : undefined;
    const targetIds = (current || targetExperiment)?.input.seeds.map(row => row.candidateId) || (feedback?.payload.factorId ? [feedback.payload.factorId] : factors.filter(row => row.sourceId === feedback?.payload.targetSourceId).map(row => row.id));
    const target: Pick<import('../../types/api/quant').QuantFactorCandidate,'id'|'data'>[] = factors.filter(row => targetIds.includes(row.id));
    if (run.kind==='analyze') {target.length=0;(run.result.analysis?.factors || []).forEach((data,index)=>target.push({id:`current-extraction:${index}`,data}));}
    const dataset = (current || targetExperiment) && state.datasets.find(row => row.collection === entry.collId && row.data.id === (current || targetExperiment)!.data.datasetId)?.data;
    const sameMarket = (historical?: {symbol: string; timeframe: string}) => !!dataset && !!historical && !!dataset.symbol && !!dataset.timeframe && dataset.symbol === historical.symbol && dataset.timeframe === historical.timeframe;
    const experiments = state.experiments.filter(row => row.collection === entry.collId && row !== current && row.data.resultJson && Date.parse(row.data.createdAt) < Date.parse(run.createdAt)).sort((a, b) => Date.parse(b.data.createdAt) - Date.parse(a.data.createdAt) || a.data.id.localeCompare(b.data.id)).slice(0, 2000);
    const feedbackRows = entries.flatMap(owner => (owner.sources || []).filter(source => source.id !== run.sourceId && source.payload.provenance === 'external_feedback' && Date.parse(source.createdAt) < Date.parse(run.createdAt)).map(source => ({owner, source}))).sort((a, b) => Date.parse(b.source.createdAt) - Date.parse(a.source.createdAt) || a.source.id.localeCompare(b.source.id)).slice(0, 2000);
    const items: MockMemoryItem[] = [];
    for (const record of experiments) {
        const parents = factors.filter(row => record.input.seeds.some(seed => seed.candidateId === row.id));
        const historicalDataset = state.datasets.find(row => row.collection === entry.collId && row.data.id === record.data.datasetId)?.data;
        const reason = mockMemoryRelevance(target, parents, sameMarket(historicalDataset));
        if (!reason.rank_score || !parents[0]) continue;
        const raw: unknown = JSON.parse(record.data.attemptsJson || '[]');
        const attempts = Array.isArray(raw) ? raw.filter(object).map(attempt => {
            const recipe = object(attempt.recipe) ? attempt.recipe : null;
            return {...fields(attempt, ['id', 'parents', 'operation', 'generation', 'requested_parameters', 'status', 'reason', 'complexity', 'transformation', 'fold']),
                status: attempt.status,
                metrics: object(attempt.metrics) ? Object.fromEntries(Object.entries(attempt.metrics).filter(([key, value]) => ['train', 'validation'].includes(key) && object(value)).map(([key, value]) => [key, fields(value as Record<string, unknown>, metricKeys)])) : {},
                actual_parameters: recipe && object(recipe.parameters) && Object.keys(recipe.parameters).length ? structuredClone(recipe.parameters) : structuredClone(attempt.requested_parameters),
                formula: recipe ? fields(recipe, ['expression', 'bindings', 'parameter_names', 'output_type', 'units']) : null};
        }) : [];
        const negative = ['failed', 'cancelled', 'partial'].includes(record.data.status) || attempts.some(row => row.status !== 'evaluated' || Object.values(row.metrics).some(metric => typeof metric.total_return === 'number' && metric.total_return <= 0));
        const result = parse(record.data.resultJson), output = object(result.output) ? result.output : {};
        const plan = parse(record.data.planJson);
        const seeds = Array.isArray(plan.seeds) ? plan.seeds.filter(object).map(seed => {
            const candidate = object(seed.candidate) ? seed.candidate : {};
            const origin = parents.find(row => row.id === seed.id);
            return {id: seed.id, entry_id: origin?.entryId, source_id: origin?.sourceId,
                ...fields(candidate, ['name', 'family', 'tags', 'formula', 'expression', 'units']), output_type: candidate.output_type || candidate.outputType,
                bindings: structuredClone(seed.bindings), actual_parameters: structuredClone(seed.parameters)};
        }) : [];
        items.push({id: `result-${record.data.id}`, kind: 'experiment', title: record.data.name, entry_id: parents[0].entryId, created_at: record.data.createdAt,
            content_hash: `local-demo-memory-${record.data.contentHash}`, reason, has_negative_evidence: negative,
            evidence: {local_demo: true, claim: '人工样例历史，不代表真实计算或盈利结论', status: record.data.status,
                request_id: record.data.id, engine_version: plan.engine_version, error: record.data.error,
                seeds, attempts, config: structuredClone(plan.config),
                dataset: historicalDataset ? {...fields(historicalDataset as unknown as Record<string, unknown>, ['symbol', 'timeframe', 'timezone', 'source', 'start', 'end']),
                    price_adjustment: historicalDataset.priceAdjustment, content_hash: historicalDataset.contentHash, row_count: historicalDataset.rowCount} : null,
                historical_holdout_exposed: !!(output.holdout || output.walk_forward), independent_holdout_proven: false,
                stop_reason: output.stop_reason, limitations: structuredClone(output.limitations || []), evidence_status: 'local_simulation_unverified_platform'}});
    }
    for (const {owner, source} of feedbackRows) {
        const linked = source.payload.experimentResultId ? state.experiments.find(row => row.collection === entry.collId && `result-${row.data.id}` === source.payload.experimentResultId) : undefined;
        const historicalDataset = linked && state.datasets.find(row => row.collection === entry.collId && row.data.id === linked.data.datasetId)?.data;
        const parents = factors.filter(row => linked ? linked.input.seeds.some(seed => seed.candidateId === row.id) : source.payload.factorId ? row.id === source.payload.factorId : row.sourceId === source.payload.targetSourceId);
        const reason = mockMemoryRelevance(target, parents, sameMarket(historicalDataset));
        if (!reason.rank_score) continue;
        let payload = fields(source.payload, Object.keys(source.payload).filter(key => key !== 'requestFingerprint'));
        if ([3,5].includes(source.payload.feedbackVersion || 0)) {
            const preview = parse(source.payload.executionPreviewJson);
            const evidence = object(preview.execution_evidence) ? preview.execution_evidence : {};
            // Newly frozen model context uses the bounded fixed summary. The full
            // ledger remains in its immutable source; historical frozen runs stay unchanged.
            payload = Object.fromEntries(Object.entries(payload).filter(([key]) => !['document', 'executionPreviewJson', 'executionAdapter', 'executionOptionsJson'].includes(key)));
            payload.document_hash = typeof evidence.document_hash === 'string' ? evidence.document_hash : 'local-demo-document-hash-unavailable';
            payload.execution_summary = structuredClone(object(preview.execution_summary) ? preview.execution_summary : {});
        }
        items.push({id: source.id, kind: 'feedback', title: source.payload.title || '历史使用反馈', entry_id: owner.id, created_at: source.createdAt,
            content_hash: `local-demo-feedback-${source.id}`, reason,
            has_negative_evidence: null,
            evidence: {local_demo: true, claim: '外部声明尚未独立验证；人工本地样例', feedback: payload,
                candidate_ids: parents.map(row => row.id), evidence_status: 'external_report_unverified', independent_holdout_proven: false}});
    }
    const comparisons = mockComparisonMemory(entry.collId, run.createdAt, factors, target, dataset);
    const fixed=mockFixedResearchMemory(entry.collId,run,factors,target,dataset);
    run.researchMemoryJson = JSON.stringify(selectMockResearchMemory([...items, ...comparisons.items,...fixed.items], run.createdAt,
        {experiments: experiments.length, feedback: feedbackRows.length, comparisons: comparisons.scanned,fixed_validations:fixed.scanned}, 3));
}

export function mockMemoryAssessment(run: QuantAIRun) {
    const memory = readResearchMemory(run.researchMemoryJson);
    if (!memory) return {};
    return {memoryNote: memory.items.length ? '本地人工样例：历史失败和外部声明用于提示下一轮核查，尚未独立复算，也未调用真实模型。' : '本地人工样例：本次未纳入相关历史，不能假设已有验证。',
        memoryAssessment: memory.items.map(row => ({action: 'investigate' as const,
            rationale: row.kind==='fixed_validation'?'人工样例：核对冻结公式、实际参数、费用与失败，已看数据只用于后续假设，需要另外的新数据。':row.kind === 'comparison' ? '人工样例：先对照双方实际参数、输入、样本及当时的合并撤销状态，再安排新数据实验；输出相同或不同都不代表盈利，也不推导传递等价。' : row.hasNegativeEvidence ? '人工样例：保留历史失败为反面线索；先核查输入、成本和失败条件，再用新数据复核。' : '人工样例：相关历史只作为待核查线索；不能把历史声明当成独立证据。',
            evidenceRefs: [researchMemoryReference(row)]}))};
}

export function mockMemoryMarkdown(run: QuantAIRun) {
    const data = run.result.review || run.result.feedback || run.result.analysis;
    return data?.memoryNote ? `\n\n## 历史研究依据与判断\n\n${data.memoryNote}\n\n${(data.memoryAssessment || []).map(row => `- ${row.rationale}\n\n  证据：${row.evidenceRefs.join('、')}`).join('\n\n')}` : '';
}
