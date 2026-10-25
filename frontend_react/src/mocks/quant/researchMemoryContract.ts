import type {QuantFactorCandidate} from '../../types/api/quant';
import {researchMemoryAmount} from '../../utils/quantResearchMemory';

type Metadata = Pick<QuantFactorCandidate, 'id' | 'data'>;
const intersect = (left: string[], right: string[]) => [...new Set(left.filter(value => right.includes(value)))].sort();
export function mockMemoryRelevance(target: Metadata[], options: Metadata[], sameMarket = false) {
    const shared_candidate_ids = intersect(target.map(row => row.id), options.map(row => row.id));
    const shared_families = intersect(target.map(row => row.data.family), options.map(row => row.data.family).filter(value => value && value !== 'other'));
    const shared_tags = intersect(target.flatMap(row => row.data.tags), options.flatMap(row => row.data.tags));
    return {shared_candidate_ids, shared_families, shared_tags, same_market: sameMarket,
        rank_score: 8 * shared_candidate_ids.length + 2 * shared_families.length + Math.min(4, shared_tags.length) + Number(sameMarket)};
}
export interface MockMemoryItem {
    id: string; kind: 'experiment' | 'feedback' | 'comparison' | 'fixed_validation'; title: string; entry_id: string; created_at: string; content_hash: string;
    reason: ReturnType<typeof mockMemoryRelevance>; evidence: Record<string, unknown>; has_negative_evidence: boolean | null;
}

/** Keep complete items under the same per-kind and whole-context limits as the server. */
export function selectMockResearchMemory(items: MockMemoryItem[], cutoff: string, scanned: {experiments: number; feedback: number; comparisons?: number;fixed_validations?: number}, version: 1 | 2 | 3 = 1) {
    const limits = {experiment: 6, feedback: 4, comparison: 4,fixed_validation:4};
    const kinds: MockMemoryItem['kind'][] = version === 3 ? ['fixed_validation','comparison','experiment','feedback'] : version === 2 ? ['comparison', 'experiment', 'feedback'] : ['experiment', 'feedback'];
    const counter = {experiment: 'experiments', feedback: 'feedback', comparison: 'comparisons',fixed_validation:'fixed_validations'} as const;
    const pools: Record<MockMemoryItem['kind'], MockMemoryItem[]> = {experiment: [], feedback: [], comparison: [],fixed_validation:[]};
    const memory = {version, method: version===3?'library-history-v3':version === 2 ? 'library-history-v2' : 'library-history-v1', scope: 'same_collection', cutoff, scan_limit: 2000,
        scanned: {experiments: scanned.experiments, feedback: scanned.feedback, ...(version >= 2 ? {comparisons: scanned.comparisons || 0} : {}),...(version===3?{fixed_validations:scanned.fixed_validations || 0}:{})},
        ...(version===3?{scan_limits:{seconds:5,max_chars:20000000,chars_read:0,budget_limited:false,size_limited:false}}:{}),eligible: {experiments: 0, feedback: 0, ...(version >= 2 ? {comparisons: 0} : {}),...(version===3?{fixed_validations:0}:{})}, omitted_for_size: 0, items: [] as MockMemoryItem[]};
    for (const item of items) {
        if (!kinds.includes(item.kind) || Date.parse(item.created_at) >= Date.parse(cutoff) || item.reason.rank_score <= 0 || item.kind === 'comparison' && !item.reason.shared_candidate_ids.length) continue;
        memory.eligible[counter[item.kind]] = (memory.eligible[counter[item.kind]] || 0) + 1;
        if (researchMemoryAmount(item) > 32000) memory.omitted_for_size++;
        else pools[item.kind].push(structuredClone(item));
    }
    for (const pool of Object.values(pools)) pool.sort((a, b) => b.reason.rank_score - a.reason.rank_score || Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id));
    const prioritizeNegative = (kind: MockMemoryItem['kind']) => {
        const index = pools[kind].findIndex(row => row.has_negative_evidence);
        if (index > 0) pools[kind].unshift(...pools[kind].splice(index, 1));
    };
    kinds.filter(kind => kind !== 'feedback').forEach(prioritizeNegative);
    const counts = {experiment: 0, feedback: 0, comparison: 0,fixed_validation:0};
    while (kinds.some(kind => pools[kind].length && counts[kind] < limits[kind])) {
        for (const kind of kinds) {
            if (!pools[kind].length || counts[kind] >= limits[kind]) continue;
            memory.items.push(pools[kind].shift()!);
            if (researchMemoryAmount(memory) > 31992) {
                memory.items.pop(); memory.omitted_for_size++;
                if (kind !== 'feedback' && counts[kind] === 0) prioritizeNegative(kind);
            } else counts[kind]++;
        }
    }
    return memory;
}
