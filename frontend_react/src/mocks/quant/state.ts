import type {MockStudy} from './studies';
import type {MockConnector,MockConnectorResponse} from './connectors';
import type {MockAdmission} from './admissions';
import type {MockNativeReview} from './nativeReviews';
import type {MockNativePython} from './nativePython';
import type {MockValidation} from './validations';
import type {MockVocabularyBook} from './vocabulary';
import type {MockBatch} from './intake';
import type {MockFormulaEdit, MockFormulaSelection} from './formulaVersions';
import type {MockCampaign} from './campaigns';
import type {MockComparison, MockFactorMerge} from './comparisons';
import type {MockExperiment} from './experiments';
import {sampleDataset, type MockDataset} from './datasets';
import type {MockGraphState} from './graph';
import type {Anthology} from '../../types/api/anthology';
import type {QuantEntryDetail, QuantRunInput, QuantFactorCandidate} from '../../types/api/quant';
import {quantAssets, quantCollection, quantEntries, type MockQuantAsset} from './fixtures';

export interface QuantMockState {aiStudies:MockStudy[];connectors:MockConnector[];connectorResponses:MockConnectorResponse[];connectorSamples:Record<string,unknown>;admissionRecords:MockAdmission[];admissionIndexed:Record<string,boolean>;nativeReviewRecords:MockNativeReview[];nativePython:MockNativePython[];validations: MockValidation[];verificationIndexed: Record<string, boolean>; vocabularies: Record<string, MockVocabularyBook>; formulaEdits: MockFormulaEdit[]; formulaSelections: MockFormulaSelection[]; formulaRoots: Record<string, string>; formulaHeads: Record<string, string>; materialCurrentSources: Record<string, string>; comparisons: MockComparison[]; factorMerges: MockFactorMerge[]; batches: MockBatch[]; campaigns: MockCampaign[]; derivedFactors: QuantFactorCandidate[]; experiments: MockExperiment[]; datasets: MockDataset[]; graph: MockGraphState; factorRevisions: Record<string, QuantFactorCandidate['revisions']>; collections: Anthology[]; entries: QuantEntryDetail[]; assets: MockQuantAsset[]; requestKeys: Record<string, {input: QuantRunInput; runId: string}>; removedCollectionIds: string[]}
export const quantMockStoragePrefix = 'odoc:local:quant:v1:';
const memoryStates = new Map<string, QuantMockState>();
export const mockScenario = () => typeof location === 'undefined' ? 'sample' : new URLSearchParams(location.search).get('mockState') || 'sample';
const stateKey = () => `${quantMockStoragePrefix}${mockScenario() === 'empty' ? 'empty' : 'sample'}`;
const clone = <T>(value: T): T => structuredClone(value);
export function quantState(): QuantMockState {
    const key = stateKey();
    const cached = memoryStates.get(key);
    if (cached) return cached;
    if (typeof localStorage !== 'undefined') {
        try {
            const saved = localStorage.getItem(key);
            if (saved) {
                const parsed: unknown = JSON.parse(saved);
                if (typeof parsed === 'object' && parsed && 'collections' in parsed && 'entries' in parsed && 'assets' in parsed && 'requestKeys' in parsed) {
                    const state = parsed as QuantMockState;
                    state.aiStudies ||= []; state.connectors ||= []; state.connectorResponses ||= []; state.connectorSamples ||= {};
                    state.admissionRecords ||= []; state.admissionIndexed ||= {};
                    state.nativePython ||= [];
                    state.nativeReviewRecords ||= [];
                    state.validations ||= [];
                    state.verificationIndexed ||= {};
                    state.vocabularies ||= {};
                    state.removedCollectionIds ||= [];
                    state.factorRevisions ||= {};
                    state.graph ||= {cache: {}, jobs: []};
                    state.experiments ||= [];
                    state.campaigns ||= [];
                    state.batches ||= [];
                    state.derivedFactors ||= [];
                    state.comparisons ||= [];
                    state.factorMerges ||= [];
                    state.materialCurrentSources ||= {};
                    state.formulaEdits ||= []; state.formulaSelections ||= []; state.formulaRoots ||= {}; state.formulaHeads ||= {};
                    state.datasets ||= mockScenario() === 'empty' ? [] : [sampleDataset()];
                    // The mock simulates a separate worker; resuming polling may finish persisted jobs.
                    memoryStates.set(key, state);
                    return state;
                }
            }
        } catch { /* An unavailable browser storage must not make local mode call the backend. */ }
    }
    const empty = mockScenario() === 'empty';
    const state: QuantMockState = {aiStudies:[],connectors:[],connectorResponses:[],connectorSamples:{},admissionRecords:[],admissionIndexed:{},nativeReviewRecords:[],nativePython:[],validations: [], verificationIndexed: {}, vocabularies: {}, formulaEdits: [], formulaSelections: [], formulaRoots: {}, formulaHeads: {}, materialCurrentSources: {}, comparisons: [], factorMerges: [], batches: [], campaigns: [], derivedFactors: [], experiments: [], datasets: empty ? [] : [sampleDataset()], graph: {cache: {}, jobs: []}, factorRevisions: {}, collections: [{...clone(quantCollection), count: empty ? 0 : quantCollection.count}], entries: empty ? [] : clone(quantEntries), assets: empty ? [] : clone(quantAssets), requestKeys: {}, removedCollectionIds: []};
    memoryStates.set(key, state);
    return state;
}
export function persistQuantState() {
    const state = quantState();
    for (const collection of state.collections) {
        if (collection.type !== 'quant') continue;
        const entries = state.entries.filter(row => row.collId === collection.collId && row.isValid);
        collection.count = entries.length;
        collection.articles = entries.slice(0, 3).map(row => ({entryId: row.id, title: row.title, date: row.updatedAt.slice(0, 10)}));
        collection.updatedAt = entries.reduce((latest, row) => row.updatedAt > latest ? row.updatedAt : latest, collection.updatedAt || '');
    }
    if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem(stateKey(), JSON.stringify(state)); } catch { /* Keep the in-memory state if browser quota is exhausted. */ }
    }
}
export const quantId = (kind: string) => `local-quant-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export function resetQuantStateForTests() {memoryStates.clear();}

/** Reset only this domain's demo records; real auth and content use different keys. */
export function clearQuantMockData() {
    memoryStates.clear();
    if (typeof localStorage === 'undefined') return;
    try {
        const keys = Array.from({length: localStorage.length}, (_, index) => localStorage.key(index));
        for (const key of keys) if (key?.startsWith(quantMockStoragePrefix)) localStorage.removeItem(key);
    } catch { /* The in-memory reset still works when browser storage is unavailable. */ }
}
