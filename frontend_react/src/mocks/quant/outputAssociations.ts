import type {QuantAIRun, QuantExperimentAnalysis} from '../../types/api/quant';
import type {QuantComparisonPlan, QuantCorrelationEvidence} from '../../types/api/quantComparison';
import type {QuantOutputAssociations} from '../../types/api/quantOutputAssociations';
import {readOutputAssociations} from '../../utils/quantOutputAssociations';
import {quantState} from './state';

const same = (a: Record<string, unknown>, b: Record<string, unknown>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
/** Freeze existing artificial observations at queue time, never evaluate the CSV. */
export function freezeMockOutputAssociations(run: QuantAIRun) {
    if (run.kind !== 'experiment_review') return;
    const state = quantState(), record = state.experiments.find(row => `result-${row.data.id}` === run.experimentResultId);
    if (!record) return;
    const options = [...record.input.seeds, ...(record.libraryContexts?.[run.id]?.options.map(row => row.seed) || [])];
    const ids = new Set(options.map(row => row.candidateId)), seeds = new Set(record.input.seeds.map(row => row.candidateId));
    const hash = (JSON.parse(record.data.planJson!) as {dataset_hash: string}).dataset_hash;
    const matches = state.comparisons.filter(row => row.collection === record.collection && row.data.correlation
        && row.data.correlation.createdAt < run.createdAt && ids.has(row.data.leftId) && ids.has(row.data.rightId)
        && (seeds.has(row.data.leftId) || seeds.has(row.data.rightId))
        && (JSON.parse(row.data.planJson!) as QuantComparisonPlan).dataset_hash === hash)
        .sort((a, b) => b.data.correlation!.createdAt.localeCompare(a.data.correlation!.createdAt) || a.data.correlation!.id.localeCompare(b.data.correlation!.id)).slice(0, 9);
    const value: QuantOutputAssociations = {version: 1, method: 'review-output-associations-1',
        scope: 'same_dataset_hash_planning_options_with_original_parent', cutoff: run.createdAt, limit: 8,
        known_matches: matches.length, complete_scan: matches.length <= 8, omitted_at_least: Math.max(0, matches.length - 8),
        items: matches.slice(0, 8).map(row => {
            const original = JSON.parse(row.data.planJson!) as QuantComparisonPlan;
            const saved = row.data.correlation!, raw = JSON.parse(saved.evidenceJson) as QuantCorrelationEvidence;
            const dataset = state.datasets.find(item => item.data.id === row.data.datasetId)!.data;
            const sides = [original.left, original.right].map(side => {
                const current = options.find(option => option.candidateId === side.id)!;
                return {candidate_id: side.id, name: String(side.candidate.name), candidate_hash: side.candidate_hash,
                    parameters: structuredClone(side.parameters), bindings: structuredClone(side.bindings),
                    current_baseline_matches: same(side.parameters, Object.fromEntries(current.parameters.map(row => [row.name, row.value])))
                        && same(side.bindings, Object.fromEntries(current.bindings.map(row => [row.name, row.column])))};
            });
            return {relation_id: saved.id, relation_hash: saved.contentHash, created_at: saved.createdAt,
                comparison_id: row.data.id, comparison_hash: row.data.contentHash, comparison_name: row.data.name,
                dataset: {id: dataset.id, content_hash: hash, symbol: dataset.symbol, timeframe: dataset.timeframe,
                    timezone: dataset.timezone, source: dataset.source, price_adjustment: dataset.priceAdjustment},
                sides, policy: structuredClone(original.policy), statistics: structuredClone(raw.statistics),
                baseline_scope: sides.every(side => side.current_baseline_matches) ? 'current_baselines_match' : 'historical_configuration_only',
                claim: 'historical_full_comparison_sample_not_current_windows_or_independent_complementarity', selection_used: false};
        })};
    run.outputAssociationsJson = JSON.stringify(value);
}

export function mockAssociationMarkdown(run: QuantAIRun, review: QuantExperimentAnalysis): string {
    const context = readOutputAssociations(run.outputAssociationsJson);
    if (!context || !review.outputAssociationReviews) return '';
    return '\n\n## 历史固定样本输出统计\n\n人工本地样例，不代表真实模型或本轮各窗口统计。\n\n' + (review.outputAssociationReviews.length ? review.outputAssociationReviews.map(row => {
        const fact = context.items.find(item => `output_association:${item.relation_id}` === row.evidenceRef)!;
        return `### ${fact.comparison_name}\n\nPearson ${fact.statistics.pearson ?? '未知'}；Spearman ${fact.statistics.spearman ?? '未知'}；共同有效 ${fact.statistics.counts.common_valid} 行。\n\n${row.text}\n\n${fact.sides.map(side => `${side.name}：参数 ${JSON.stringify(side.parameters)}，输入 ${JSON.stringify(side.bindings)}`).join('\n\n')}\n\n证据：${row.evidenceRef}`;
    }).join('\n\n') : '本次没有提供符合候选与行情范围的统计，相关性仍未知。');
}
