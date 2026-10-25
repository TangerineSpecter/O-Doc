import type {QuantAIRun, QuantFactorCandidate} from '../../types/api/quant';
import type {QuantExperimentSeed} from '../../types/api/quantExperiment';
import type {QuantLibraryRetrieval} from '../../types/api/quantLibraryResearch';
import {buildSeed, initialSeed} from '../../components/Quant/experiments/plan';
import {collectMockFactors} from './factors';
import {quantState} from './state';
export interface MockLibraryContext {summary: QuantLibraryRetrieval; options: {candidate: QuantFactorCandidate; seed: QuantExperimentSeed}[]}
/** Freeze a local synthetic retrieval at queue time; no embeddings or model calls. */
export function freezeMockLibrary(run: QuantAIRun) {
    if (run.kind !== 'experiment_review') return;
    const state = quantState(), record = state.experiments.find(row => `result-${row.data.id}` === run.experimentResultId);
    if (!record) return;
    const all = collectMockFactors(state.entries.filter(row => row.collId === record.collection && row.isValid));
    const parents = all.filter(row => record.input.seeds.some(seed => seed.candidateId === row.id));
    const sources = new Set(parents.map(row => row.sourceId));
    const key = (row: QuantFactorCandidate) => JSON.stringify([row.data.expression, row.data.inputs, row.data.parameters, row.data.units, row.data.outputType]);
    const known = new Set(parents.map(key));
    const records = all.filter(row => !sources.has(row.sourceId)).slice(0, 2000);
    const eligible: MockLibraryContext['options'] = [];
    for (const candidate of records) {
        if (!['factor', 'signal', 'filter'].includes(candidate.data.role) || known.has(key(candidate)) || !parents.some(parent => parent.data.outputType === candidate.data.outputType && (candidate.data.outputType === 'boolean_series' || parent.data.units === candidate.data.units))) continue;
        try {const seed = buildSeed(candidate, initialSeed(candidate), false); eligible.push({candidate: structuredClone(candidate), seed}); known.add(key(candidate));} catch { /* Missing defaults/mappings are ineligible. */ }
    }
    const options = eligible.slice(0, 4);
    const summary: QuantLibraryRetrieval = {method: 'local-demo-related-library', scanned: records.length, eligible: eligible.length, scanLimit: 2000, omittedForSize: 0,
        claim: 'semantic_and_contract_relevance_only_not_performance', candidates: options.map(({candidate}) => ({candidateId: candidate.id, sourceId: candidate.sourceId,
            reportId: candidate.reportId, entryId: candidate.entryId, entryTitle: candidate.entryTitle, name: candidate.curation.name, selection: 'related',
            reason: {sharedTags: candidate.data.tags.filter(tag => parents.some(row => row.data.tags.includes(tag))), sameFamily: parents.some(row => row.data.family === candidate.data.family), rankScore: 0, semantic: null}}))};
    record.libraryContexts ??= {}; record.libraryContexts[run.id] = {summary, options}; run.libraryRetrieval = summary;
}
