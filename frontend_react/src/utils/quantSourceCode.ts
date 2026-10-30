import type { QuantSource } from '../types/api/quant';

/** One current code snapshot per collected material; implementation snapshots have their own editor. */
export function collectedCodeSources(sources: QuantSource[]): QuantSource[] {
    const candidates = sources.filter((source) => !source.codeVersionId && source.payload.provenance !== 'external_feedback' && !!source.payload.code);
    const groups = new Map<string, QuantSource[]>();
    for (const source of candidates) groups.set(source.materialId, [...(groups.get(source.materialId) || []), source]);
    return [...groups.values()].map((rows) => rows.find((source) => source.id === source.materialCurrentSourceId) || rows[0]);
}
