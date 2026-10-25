/** Decoded, frozen historical evidence supplied to one research run. */
export interface QuantMemoryAssessment {
    action: 'apply' | 'reject' | 'investigate';
    rationale: string;
    evidenceRefs: string[];
}
export interface QuantResearchMemory {
    version: 1 | 2 | 3;
    method: 'library-history-v1' | 'library-history-v2' | 'library-history-v3';
    scope: 'same_collection';
    cutoff: string;
    scanLimit: number;
    scanLimits?: {seconds: number;maxChars: number;charsRead: number;budgetLimited: boolean;sizeLimited: boolean};
    scanned: {experiments: number; feedback: number; comparisons?: number; fixed_validations?: number};
    eligible: {experiments: number; feedback: number; comparisons?: number; fixed_validations?: number};
    omittedForSize: number;
    items: QuantResearchMemoryItem[];
}
export interface QuantResearchMemoryItem {
    id: string;
    kind: 'experiment' | 'feedback' | 'comparison' | 'fixed_validation';
    title: string;
    entryId: string;
    createdAt: string;
    contentHash: string;
    reason: {sharedCandidateIds: string[]; sharedFamilies: string[]; sharedTags: string[]; sameMarket: boolean; rankScore: number};
    evidence: Record<string, unknown>;
    hasNegativeEvidence: boolean | null;
}
