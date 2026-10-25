export type VocabularyDimension = 'mechanism' | 'structure' | 'asset' | 'frequency' | 'data' | 'usage' | 'platform' | 'tunability' | 'evidence';
export interface VocabularyReference {version: 1; builtinVersion: 1; revisionId: string; contentHash: string}
export interface VocabularyTerm {id: string; dimension: VocabularyDimension; label: string; aliases: string[]; definition: string; active: boolean}
export interface QuantVocabulary {
    catalog: {version: 1; builtinVersion: 1; reason: string; terms: VocabularyTerm[]};
    reference: VocabularyReference; currentReference: VocabularyReference;
    dimensions: Record<VocabularyDimension, string>;
    ambiguities: {label: string; codes: string[]; labels: string[]}[];
    archivedConcepts: Pick<VocabularyTerm, 'id' | 'dimension' | 'definition'>[];
    historyTotal: number; history: {id: string; parentId: string; contentHash: string; reason: string; createdAt: string}[];
}
export interface VocabularyEdit {term: VocabularyTerm; requestKey: string; expectedRevisionId: string; reason: string}
export interface FactorClassification {
    reference: VocabularyReference;
    terms: (VocabularyTerm & {basis: {kind: string; raw: string}[]})[];
    originalTags: string[]; rawLabels: {value: string; basis: string}[];
    unresolved: {raw: string; basis: string; status: 'protected' | 'ambiguous' | 'unmapped'; codes: string[]}[];
    claim: 'classification_proposals_not_validated_suitability';
}
