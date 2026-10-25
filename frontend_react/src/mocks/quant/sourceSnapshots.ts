import type {QuantCodeVersion, QuantEntryDetail, QuantImplementation, QuantSource} from '../../types/api/quant';
import {quantState} from './state';

/** Local labels are explicit fixtures, never cryptographic integrity claims. */
export const mockSourceHash = (source: QuantSource) => source.contentHash || `local-demo-source-${source.id}`;
export function setMockMaterialCurrent(source: QuantSource) {
    quantState().materialCurrentSources[source.materialId] = source.id;
}
export function captureMockVersion(entry: QuantEntryDetail, implementation: QuantImplementation, version: QuantCodeVersion) {
    entry.sources ||= [];
    let source = entry.sources.find(row => row.codeVersionId === version.id);
    if (!source) {
        source = {id: `source-${version.id}`, materialId: implementation.id, codeVersionId: version.id, createdAt: version.createdAt,
            payload: {code: version.code, language: version.language, languageVersion: version.languageVersion, dependencies: version.dependencies,
                parameters: version.parameters, note: version.note, title: implementation.name, provenance: 'code_version'}};
        entry.sources.unshift(source);
    }
    // Historical backfill can capture a source but cannot replace the actual current version.
    if (implementation.currentVersionId === version.id) setMockMaterialCurrent(source);
    return source;
}
export function ensureMockSourcePointers(entry: QuantEntryDetail) {
    for (const source of entry.sources || []) {
        const unresolvedFetch = entry.sources?.some(row => row.materialId === source.materialId && row.payload.provenance === 'web_fetch');
        // Pre-feature web snapshots have no authoritative saved pointer. Leave it
        // unknown instead of guessing from dates or the order of historical runs.
        if (!quantState().materialCurrentSources[source.materialId] && !unresolvedFetch && source.id === source.materialId && source.payload.provenance !== 'external_feedback') setMockMaterialCurrent(source);
    }
}
export function presentMockSource(source: QuantSource): QuantSource {
    return {...source, contentHash: mockSourceHash(source), materialCurrentSourceId: quantState().materialCurrentSources[source.materialId] || null};
}
export function presentMockEntry(entry: QuantEntryDetail): QuantEntryDetail {
    return {...entry, sources: entry.sources?.map(presentMockSource)};
}
