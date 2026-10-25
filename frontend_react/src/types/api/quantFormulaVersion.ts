import type {QuantFactorCandidate} from './quant';
export interface QuantFormulaHistory {
    version: 1; rootCandidateId: string; candidateId: string; currentCandidateId: string; currentSelectionId: string;
    rootName: string; candidateName: string; currentName: string;
    definitionJson: string; versionsTotal: number; selectionsTotal: number;
    versions: {id: string; candidateId: string; candidateHash: string; name: string; origin: 'source' | 'authored' | 'experiment' | 'ai_repair'; parentCandidateIds: string[]; reason: string; createdAt: string; formula: string; expressionHash: string}[];
    selections: {id: string; candidateId: string; parentId: string; reason: string; createdAt: string}[];
    claim: 'working_version_only_not_performance_promotion';
}
export interface QuantFormulaEditInput {requestKey: string; definitionJson: string; reason: string}
export interface QuantFormulaEditResult {candidate: QuantFactorCandidate; history: QuantFormulaHistory}
