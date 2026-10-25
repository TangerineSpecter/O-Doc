import type {QuantFactorCandidate, QuantFactorQuery} from './quant';
export type QuantSearchQuery = Pick<QuantFactorQuery, 'q' | 'role' | 'family' | 'groupBy' | 'entryId' | 'taxonomyTerm' | 'reuseStatus' | 'admissionStage'>;
export interface QuantSearchMatch {
    keywordFields: string[];
    semanticSimilarity: number | null;
    method: string;
    rankScore: number;
    projectionHash: string;
    modelSignature: string;
}
export interface QuantSearchResult {
    items: QuantFactorCandidate[];
    total: number;
    occurrenceTotal: number;
    search: {
        method: string; query: string; semanticStatus: 'ready' | 'no_model' | 'no_index' | 'unavailable' | 'model_changed' | 'no_compatible_index' | 'local_demo';
        modelName: string; candidateTotal: number; indexedTotal: number; matchedGroups: number; returnedGroups: number;
        limit: number; semanticThreshold: number; claim: 'retrieval_relevance_only';
    };
}
