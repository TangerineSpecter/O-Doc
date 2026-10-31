import type {QuantFactorCandidate} from '../../types/api/quant';
import {quantState} from './state';

function canonical(value: unknown): string {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
    return JSON.stringify(value);
}

export function extractionKey(row: QuantFactorCandidate): string {
    return row.data.formulaVersion || row.data.derivation ? row.id : canonical([row.entryId, row.sourceId, row.data]);
}

export function canonicalRoots(items: QuantFactorCandidate[]): Map<string, string> {
    const grouped = new Map<string, QuantFactorCandidate[]>();
    for (const row of items) grouped.set(extractionKey(row), [...(grouped.get(extractionKey(row)) || []), row]);
    const aliases = new Map<string, string>();
    for (const rows of grouped.values()) {
        const selected = rows.filter(row => quantState().formulaHeads[row.id]);
        const root = selected[0] || [...rows].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
        for (const row of rows) aliases.set(row.id, selected.length > 1 ? row.id : root.id);
    }
    return aliases;
}

export function shareCuration(items: QuantFactorCandidate[]): void {
    const latest = new Map<string, {revision: QuantFactorCandidate['revisions'][number]; candidateId: string}>();
    for (const row of items) {
        const revision = row.revisions.find(item => item.id === row.currentRevisionId);
        const previous = latest.get(extractionKey(row))?.revision;
        if (revision && (!previous || previous.createdAt < revision.createdAt || previous.createdAt === revision.createdAt && previous.id < revision.id)) latest.set(extractionKey(row), {revision, candidateId: row.id});
    }
    for (const row of items) {
        const shared = latest.get(extractionKey(row));
        row.curationRevisionId = shared?.revision.id || '';
        row.curationInherited = !!shared && shared.candidateId !== row.id;
        if (shared) row.curation = shared.revision.data;
    }
}
