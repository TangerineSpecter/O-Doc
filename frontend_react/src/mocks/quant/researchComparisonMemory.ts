import type {QuantFactorCandidate} from '../../types/api/quant';
import type {QuantComparisonPlan, QuantComparisonResult} from '../../types/api/quantComparison';
import {quantState} from './state';
import {mockMemoryRelevance, type MockMemoryItem} from './researchMemoryContract';

/** Frozen artificial facts; never perform a platform comparison in local UI. */
export function mockComparisonMemory(collection: string, cutoff: string, factors: QuantFactorCandidate[], target: Pick<QuantFactorCandidate,'id'|'data'>[], currentMarket?: {symbol: string; timeframe: string}) {
    const state = quantState();
    const records = state.comparisons.filter(row => row.collection === collection && Date.parse(row.data.createdAt) < Date.parse(cutoff))
        .sort((a, b) => Date.parse(b.data.createdAt) - Date.parse(a.data.createdAt) || a.data.id.localeCompare(b.data.id)).slice(0, 2000);
    const items: MockMemoryItem[] = [];
    for (const {data} of records) {
        const parents = [factors.find(row => row.id === data.leftId), factors.find(row => row.id === data.rightId)];
        if (parents.some(row => !row) || !data.planJson || !data.resultJson || !data.datasetJson) continue;
        const plan = JSON.parse(data.planJson) as QuantComparisonPlan, result = JSON.parse(data.resultJson) as QuantComparisonResult;
        const dataset = JSON.parse(data.datasetJson) as {symbol: string; timeframe: string};
        const reason = mockMemoryRelevance(target, parents as QuantFactorCandidate[], !!currentMarket && !!currentMarket.symbol && !!currentMarket.timeframe && currentMarket.symbol === dataset.symbol && currentMarket.timeframe === dataset.timeframe);
        if (!reason.shared_candidate_ids.length) continue;
        const history = state.factorMerges.filter(row => row.collection === collection && row.data.comparisonId === data.id && Date.parse(row.data.createdAt) < Date.parse(cutoff))
            .sort((a, b) => Date.parse(b.data.createdAt) - Date.parse(a.data.createdAt) || b.data.id.localeCompare(a.data.id));
        const merges = history.slice(0, 8).map(({data: merge}) => {
            const withdrawal = merge.withdrawal && Date.parse(merge.withdrawal.createdAt) < Date.parse(cutoff) ? merge.withdrawal : null;
            return {id: merge.id, name: merge.name, reason: merge.reason, created_at: merge.createdAt, content_hash: merge.contentHash,
                curation: JSON.parse(merge.curationJson) as unknown, active_at_cutoff: !withdrawal,
                withdrawal: withdrawal ? {id: withdrawal.id, reason: withdrawal.reason, created_at: withdrawal.createdAt, content_hash: `local-demo-${withdrawal.id}`} : null};
        });
        const sides = Object.fromEntries((['left', 'right'] as const).map(side => {
            const original = plan[side], candidate = original.candidate;
            return [side, {id: original.id, candidate_hash: original.candidate_hash, source_id: original.source_id, source_hash: original.source_hash,
                report_id: original.report_id, report_hash: original.report_hash, bindings: structuredClone(original.bindings), parameters: structuredClone(original.parameters),
                definition: {name: candidate.name, formula: candidate.formula, expression: candidate.expression, inputs: candidate.inputs,
                    output_type: candidate.output_type || candidate.outputType, units: candidate.units}}];
        }));
        items.push({id: data.id, kind: 'comparison', title: data.name, entry_id: parents[0]!.entryId, created_at: data.createdAt,
            content_hash: `local-demo-comparison-memory-${data.id}`, reason, has_negative_evidence: result.status === 'fail',
            evidence: {local_demo: true, comparison_id: data.id, comparison_hash: data.contentHash, engine_version: plan.engine_version,
                runtime: structuredClone(plan.runtime), sides, dataset: structuredClone(dataset), policy: structuredClone(plan.policy), result: structuredClone(result),
                logical_merges: {cutoff, total: history.length, included: merges.length, omitted: history.length - merges.length, limit: 8, items: merges},
                evidence_status: 'fixed_sample_controlled_outputs_only', independent_holdout_proven: false,
                limitations: ['本地人工样例未运行真实计算；仅演示直接对照如何影响后续研究，不推导平台等价、传递关系或盈利。']}});
    }
    return {items, scanned: records.length};
}
