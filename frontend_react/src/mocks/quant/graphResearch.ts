import type {QuantEntryDetail, QuantFactorCandidate, QuantReport} from '../../types/api/quant';
import type {QuantGraph, QuantGraphEdge, QuantGraphNode} from '../../types/api/quantGraph';
import type {GraphResearch, GraphCombinationObservation} from '../../types/api/quantGraphResearch';
import {readCombinationAnalysis} from '../../utils/quantCombination';
import {graphCombinationOutcomes} from '../../utils/quantGraphResearch';
import {mockCombination} from './combination';
import {quantState} from './state';

const hash = (candidate: QuantFactorCandidate) => `local-demo-formula-${candidate.id}`;
const names = {supports: '满足本样本描述规则（模拟）', counterexample: '本样本反例（模拟）', mixed: '跨窗分歧或缺测（模拟）', unknown: '组合证据不足（模拟）'};
const base = (center: QuantFactorCandidate, kind: string, id: string, contentHash: string, createdAt: string) => ({
    version: 1 as const, method: 'graph-research-evidence-1' as const, candidate_id: center.id,
    candidate_hash: hash(center), independent_evidence: false as const,
    origin: {kind, id, content_hash: contentHash, created_at: createdAt}});
interface Attempt {
    id: string; parents: string[]; operation: string; status: string;
    recipe?: {parameters?: Record<string, number | boolean | string>; parameter_names?: Record<string, string>; bindings?: Record<string, string>};
}
function direct(id: string, center: QuantFactorCandidate, request: string, rows: Attempt[]): boolean {
    const seen = new Set<string>();
    while (!seen.has(id)) {
        seen.add(id); const row = rows.find(row => row.id === id);
        if (!row) return false;
        if (center.data.derivation?.requestId === request && center.data.derivation.attemptId === id) return true;
        if (row.operation === 'source_candidate') return row.parents.length === 1 && row.parents[0] === center.id;
        if (row.operation !== 'parameter_variant' || row.parents.length !== 1) return false;
        id = row.parents[0];
    }
    return false;
}
interface ProposalData {
    name: string; hypothesis: string; falsification: string; data_requirement: string; evidence_refs: string[]; config: Record<string, unknown>;
    seeds: {id: string; candidate: {name: string}; parameters: Record<string, number | string | boolean>; bindings: Record<string, string>; variants: Record<string, number | string | boolean>[]}[];
}
/** Artificial source snapshots and saved fixture metrics, never embeddings or a CSV computation. */
export function appendMockGraphResearch(graph: QuantGraph, center: QuantFactorCandidate, collection: string, entries: QuantEntryDetail[], all: QuantFactorCandidate[]) {
    const emit = (id: string, kind: QuantGraphNode['kind'], label: string, relation: QuantGraphEdge['kind'], value: GraphResearch, report?: QuantReport, entryId = center.entryId, requestId?: string) => {
        const incoming = relation.startsWith('reported_');
        graph.nodes.push({id, kind, label, entryId, reportId: report?.id || ''});
        graph.edges.push({id: `research:${id}`, from: incoming ? id : `factor:${center.id}`, to: incoming ? `factor:${center.id}` : id,
            kind: relation, label, historical: false, similarity: null, requestId, researchJson: JSON.stringify(value),
            detail: '人工本地研究关系，仅演示原参数、假设与正反证据；未调用模型或计算导入行情，不晋升实证等级。'});
    };
    const parentEntry = entries.find(row => row.id === center.entryId);
    const sourceReport = parentEntry?.reports?.find(row => row.id === center.reportId);
    const sourceAnalysis = parentEntry?.runs.find(row => row.id === sourceReport?.runId)?.result.analysis;
    if (!center.data.derivation && !center.data.formulaVersion && sourceReport && sourceAnalysis?.usage) {
        emit(`scenario:${sourceReport.id}:${center.id}`, 'scenario', '来源用途与条件（AI假设 · 模拟）', 'scenario_hypothesis', {
            ...base(center, 'report', sourceReport.id, 'local-demo-report-' + sourceReport.id, sourceReport.createdAt),
            kind: 'scenario_hypothesis', status: 'hypothesis', text: sourceAnalysis.usage,
            scope: 'source_level_context_not_component_applicability', assumptions_count: sourceAnalysis.assumptions.length,
            unknowns_count: sourceAnalysis.unknowns.length, condition_availability: 'not_established',
            qualification: 'ai_static_usage_conditions_not_causal_regime_evidence'}, sourceReport);
    }
    const proposals = new Map(entries.flatMap(entry => (entry.reports || []).flatMap(report => report.proposal ? [{proposal: report.proposal, report, entryId: entry.id}] : [])).map(row => [row.proposal.id, row]));
    for (const record of quantState().experiments.filter(row => row.collection === collection)) {
        for (const {proposal, report} of record.data.reviews || []) if (proposal && report) {
            const run = entries.flatMap(entry => entry.runs).find(row => row.id === report.runId);
            proposals.set(proposal.id, {proposal, report, entryId: run?.entryId || center.entryId});
        }
    }
    if (proposals.size > 200) graph.limited = true;
    let count = 0;
    for (const {proposal, report, entryId} of [...proposals.values()].sort((a, b) => b.proposal.createdAt.localeCompare(a.proposal.createdAt)).slice(0, 200)) {
        const data = JSON.parse(proposal.dataJson) as ProposalData;
        if (data.seeds.length < 2 || !data.seeds.some(row => row.id === center.id)) continue;
        if (count++ >= 6) {graph.limited = true; continue;}
        for (const seed of data.seeds) {
            const parent = all.find(row => row.id === seed.id);
            if (!parent || graph.nodes.some(node => node.id === `factor:${parent.id}`)) continue;
            if (graph.nodes.filter(node => node.kind === 'factor').length >= 21) {graph.limited = true; continue;}
            graph.nodes.push({id: `factor:${parent.id}`, kind: 'factor', label: parent.curation.name, entryId: parent.entryId, reportId: parent.reportId});
        }
        emit(`hypothesis:${proposal.id}`, 'hypothesis', data.name, 'complement_hypothesis', {
            ...base(center, 'proposal', proposal.id, proposal.contentHash, proposal.createdAt), kind: 'combination_hypothesis', status: 'hypothesis',
            hypothesis: data.hypothesis, falsification: data.falsification, data_requirement: data.data_requirement,
            config: data.config, evidence_refs: data.evidence_refs, participants: data.seeds.map(seed => ({id: seed.id, name: seed.candidate.name,
                candidate_hash: 'local-demo-formula-' + seed.id, parameters: seed.parameters, bindings: seed.bindings, variants: seed.variants})),
            qualification: 'ai_proposed_combination_not_executed_or_verified'}, report, entryId);
    }
    count = 0;
    const observed = quantState().experiments.filter(row => row.collection === collection && row.data.resultJson);
    if (observed.length > 12) graph.limited = true;
    for (const record of observed.slice(0, 12)) {
        const analysis = readCombinationAnalysis(mockCombination(record))!;
        const attempts = JSON.parse(record.data.attemptsJson || '[]') as Attempt[];
        const dataset = quantState().datasets.find(row => row.data.id === record.input.datasetId)?.data;
        if (!dataset) continue;
        const review = record.data.reviews?.find(row => row.report);
        for (const group of analysis.groups) {
            if (!group.parent_ids.some(id => direct(id, center, record.data.id, attempts))) continue;
            if (count++ >= 6) {graph.limited = true; continue;}
            const configurations = [...group.parent_ids, group.attempt_id].map(id => {
                const row = attempts.find(row => row.id === id), recipe = row?.recipe;
                return {attempt_id: id, status: row?.status || 'missing', parameters: Object.entries(recipe?.parameters || {}).map(([name, value]) => ({name, original_name: recipe?.parameter_names?.[name] || name, value})),
                    bindings: recipe?.bindings || {}, expression_hash: 'local-demo-expression-' + id};
            });
            const text = review?.run.result.review?.combinationReviews?.find(row => row.evidenceRef === group.id)?.text;
            const value: GraphCombinationObservation = {...base(center, 'experiment_result', `result-${record.data.id}`, record.data.contentHash, record.data.createdAt),
                kind: 'combination_observation', ...graphCombinationOutcomes(group), rule: {method: 'positive-return-risk-turnover-dominance-1', epsilon: 1e-12,
                    claim: 'positive_validation_net_return_above_both_parents_without_more_drawdown_or_turnover_with_entries', registered_before_experiment: false, uses_holdout: false},
                analysis: {...analysis, groups: [group]}, config: JSON.parse(record.data.planJson!).config,
                market: {symbol: dataset.symbol, timeframe: dataset.timeframe, timezone: dataset.timezone, source: dataset.source, price_adjustment: dataset.priceAdjustment},
                configurations, ai_interpretation: text && review?.report ? {text, report_id: review.report.id, report_hash: 'local-demo-report-' + review.report.id} : null,
                qualification: 'posthoc_descriptive_rule_only_not_general_complementarity_or_admission'};
            emit(`combination-observation:${record.data.id}:${group.attempt_id}`, 'assessment', `${group.attempt_id} · ${names[value.status]}`, `combination_${value.status}`,
                value, review?.report || undefined, review?.run.entryId || center.entryId, record.data.id);
        }
    }
    count = 0;
    for (const entry of entries) for (const report of entry.reports || []) {
        const run = entry.runs.find(row => row.id === report.runId), feedback = run?.result.feedback;
        const source = entry.sources?.find(row => row.id === report.sourceId);
        if (!feedback || source?.payload.factorId !== center.id || source.payload.feedbackVersion === 4) continue;
        for (let index = 0; index < Math.max(feedback.supportingEvidence.length, feedback.counterEvidence.length); index++) {
            for (const [field, rows] of [['counter_evidence', feedback.counterEvidence], ['supporting_evidence', feedback.supportingEvidence]] as const) {
                const claim = rows[index]; if (!claim) continue;
                if (count++ >= 6) {graph.limited = true; continue;}
                const status = field === 'counter_evidence' ? 'reported_counterexample' : 'reported_support';
                const value: GraphResearch = {...base(center, 'feedback_source', source.id, source.contentHash || 'local-demo-source-' + source.id, source.createdAt),
                    kind: 'feedback_assessment', status, field, index, claim: claim.claim, quote: claim.quote,
                    mode: source.payload.mode || 'unknown', platform: source.payload.platform || '',
                    reported_parameters: feedback.reportedParameters.slice(0, 12).map(({name, value, unit}) => ({name, value, unit})),
                    omitted_parameters: Math.max(0, feedback.reportedParameters.length - 12), unknowns_count: feedback.unknowns.length,
                    platform_authenticated: false, qualification: 'ai_interpretation_of_user_report_not_verified_performance'};
                emit(`feedback-claim:${report.id}:${field}:${index}`, 'assessment', field === 'counter_evidence' ? '反馈中的反例主张（未核实）' : '反馈中的支持主张（未核实）',
                    status, value, report, entry.id);
            }
        }
    }
}
