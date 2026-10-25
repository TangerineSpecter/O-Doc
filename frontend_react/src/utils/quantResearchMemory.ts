import {readFixedHistory} from './quantFixedHistory';
import type {QuantResearchMemory, QuantResearchMemoryItem} from '../types/api/quantResearchMemory';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const coverage = (value: unknown, comparisons: boolean): value is {experiments: number; feedback: number; comparisons?: number;fixed_validations?: number} => object(value) && count(value.experiments) && count(value.feedback) && (!comparisons || count(value.comparisons));
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 2000 && value.every(string);
const date = (value: unknown): value is string => string(value) && !!value && Number.isFinite(Date.parse(value));
const fields = ['version', 'method', 'scope', 'cutoff', 'scan_limit', 'scanned', 'eligible', 'omitted_for_size', 'items'];
const unique = (values: string[]) => new Set(values).size === values.length;

/** Match Python json.dumps(ensure_ascii=False): code points and spaced separators. */
export function researchMemoryAmount(value: unknown): number {
    const json = JSON.stringify(value, (_key, item: unknown) => {
        if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('历史研究依据包含无效数值');
        return item;
    });
    let quoted = false, escaped = false, separators = 0;
    for (const character of json) {
        if (quoted) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '"') quoted = false;
        } else if (character === '"') quoted = true;
        else if (character === ':' || character === ',') separators++;
    }
    return [...json].length + separators;
}

/** The JSON string deliberately preserves literal evidence keys through HTTP casing. */
export function readResearchMemory(json?: string | null): QuantResearchMemory | null {
    if (!json) return null;
    const fail = (): never => {throw new Error('历史研究依据版本或内容结构无法读取');};
    if ([...json].length > 32000) return fail();
    let value: unknown;
    try {value = JSON.parse(json);} catch {return fail();}
    if (!object(value) || ![1, 2, 3].includes(Number(value.version)) || typeof value.version !== 'number') return fail();
    const comparisons = Number(value.version) >= 2;
    const fixed=value.version===3;
    const expectedFields=fixed?[...fields,'scan_limits']:fields;
    const budget=object(value.scan_limits)?value.scan_limits:undefined;
    if (fixed && (!budget || Object.keys(budget).length!==5 || budget.seconds!==5 || budget.max_chars!==20000000 || !count(budget.chars_read) || budget.chars_read>20000000 || typeof budget.budget_limited!=='boolean' || typeof budget.size_limited!=='boolean')) return fail();
    if (value.method !== (fixed?'library-history-v3':comparisons?'library-history-v2':'library-history-v1') || value.scope !== 'same_collection' ||
        Object.keys(value).length !== expectedFields.length || !expectedFields.every(key => key in value) ||
        !date(value.cutoff) || value.scan_limit !== 2000 || !coverage(value.scanned, comparisons) || !coverage(value.eligible, comparisons) || !count(value.omitted_for_size) ||
        !Array.isArray(value.items) || value.items.length > (fixed?18:comparisons?14:10)) return fail();
    for (const counters of [value.scanned, value.eligible]) if (Object.keys(counters).length !== (fixed?4:comparisons?3:2)) return fail();
    try {if (researchMemoryAmount(value) > 32000) return fail();} catch {return fail();}
    if (value.scanned.experiments > value.scan_limit || value.scanned.feedback > value.scan_limit || value.eligible.experiments > value.scanned.experiments || value.eligible.feedback > value.scanned.feedback) return fail();
    if (comparisons && (Number(value.scanned.comparisons) > value.scan_limit || Number(value.eligible.comparisons) > Number(value.scanned.comparisons))) return fail();
    if (fixed && (!count(value.scanned.fixed_validations) || !count(value.eligible.fixed_validations) || value.scanned.fixed_validations>value.scan_limit || value.eligible.fixed_validations>value.scanned.fixed_validations)) return fail();
    if (value.items.length + value.omitted_for_size > value.eligible.experiments + value.eligible.feedback + (value.eligible.comparisons || 0)+(value.eligible.fixed_validations || 0)) return fail();
    const items: QuantResearchMemoryItem[] = [], seen = new Set<string>();
    for (const row of value.items) {
        if (!object(row) || !string(row.id) || !row.id || !(fixed?['experiment','feedback','comparison','fixed_validation']:comparisons?['experiment','feedback','comparison']:['experiment','feedback']).includes(String(row.kind)) || !string(row.title) ||
            !string(row.entry_id) || !row.entry_id || !date(row.created_at) || Date.parse(row.created_at) >= Date.parse(value.cutoff) || !string(row.content_hash) ||
            !object(row.reason) || !object(row.evidence) || ![true, false, null].includes(row.has_negative_evidence as boolean | null)) return fail();
        if (row.kind === 'feedback' && row.has_negative_evidence !== null) return fail();
        if (row.kind === 'fixed_validation') {if (typeof row.has_negative_evidence!=='boolean') return fail();try {readFixedHistory(row.evidence);} catch {return fail();}}
        if (row.kind === 'comparison' && typeof row.has_negative_evidence !== 'boolean') return fail();
        const reason = row.reason;
        if (!strings(reason.shared_candidate_ids) || !strings(reason.shared_families) || !strings(reason.shared_tags) || typeof reason.same_market !== 'boolean' || typeof reason.rank_score !== 'number' || !Number.isFinite(reason.rank_score)) return fail();
        if (![reason.shared_candidate_ids, reason.shared_families, reason.shared_tags].every(unique) || reason.shared_families.some(row => !row || row === 'other')) return fail();
        const score = 8 * reason.shared_candidate_ids.length + 2 * reason.shared_families.length + Math.min(4, reason.shared_tags.length) + Number(reason.same_market);
        if (reason.rank_score !== score || score <= 0) return fail();
        if (row.kind === 'comparison' && !reason.shared_candidate_ids.length) return fail();
        const key = `memory:${row.kind}:${row.id}`;
        if (seen.has(key)) return fail();
        seen.add(key);
        items.push({id: row.id, kind: row.kind as QuantResearchMemoryItem['kind'], title: row.title, entryId: row.entry_id,
            createdAt: row.created_at, contentHash: row.content_hash, evidence: row.evidence, hasNegativeEvidence: row.has_negative_evidence as boolean | null,
            reason: {sharedCandidateIds: reason.shared_candidate_ids, sharedFamilies: reason.shared_families, sharedTags: reason.shared_tags, sameMarket: reason.same_market, rankScore: reason.rank_score}});
    }
    if (items.filter(row => row.kind === 'experiment').length > Math.min(6, value.eligible.experiments) || items.filter(row => row.kind === 'feedback').length > Math.min(4, value.eligible.feedback) || items.filter(row => row.kind === 'comparison').length > Math.min(4, value.eligible.comparisons || 0)) return fail();
    if (items.filter(r=>r.kind==='fixed_validation').length>Math.min(4,value.eligible.fixed_validations || 0)) return fail();
    return {version: value.version as 1 | 2 | 3, method: fixed?'library-history-v3':comparisons ? 'library-history-v2' : 'library-history-v1', scope: 'same_collection', cutoff: value.cutoff, scanLimit: value.scan_limit,
        ...(fixed && budget?{scanLimits:{seconds:5,maxChars:20000000,charsRead:Number(budget.chars_read),budgetLimited:!!budget.budget_limited,sizeLimited:!!budget.size_limited}}:{}),scanned: value.scanned, eligible: value.eligible, omittedForSize: value.omitted_for_size, items};
}

export const researchMemoryReference = (item: Pick<QuantResearchMemoryItem, 'kind' | 'id'>) => `memory:${item.kind}:${item.id}`;
export const researchMemoryNegativeLabel = (item: Pick<QuantResearchMemoryItem, 'hasNegativeEvidence'>) => item.hasNegativeEvidence === true
    ? '含失败或反面证据' : item.hasNegativeEvidence === false ? '摘要未标记反面证据，仍需核对' : '反面证据状态未知';
