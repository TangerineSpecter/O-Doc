export interface QuantLibraryRetrieval {
    method: string; scanned: number; eligible: number; scanLimit: number; omittedForSize: number;
    claim: 'semantic_and_contract_relevance_only_not_performance';
    candidates: {candidateId: string; sourceId: string; reportId: string; entryId: string; entryTitle: string; name: string;
        selection: 'related' | 'diversity'; reason: {sharedTags: string[]; sameFamily: boolean; rankScore: number;
            semantic: {relationId: string; parentId: string; similarity: number} | null}}[];
}
