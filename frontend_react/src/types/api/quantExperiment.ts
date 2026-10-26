import type {QuantAIRun, QuantReport, QuantRunStatus, QuantFactorCandidate} from './quant';
export type QuantEvolutionOperator = 'lag' | 'smooth' | 'zscore' | 'mean' | 'weighted_mean' | 'residual' | 'and' | 'or' | 'ts_rank' | 'gate' | 'crossover';
export interface QuantEvolutionPolicy {
    version: 1 | 2 | 3; operators: QuantEvolutionOperator[]; windows: number[]; weights: number[]; maxNodes: number;
}
export interface QuantFormulaTransform {
    version: 1 | 2 | 3; operator: QuantEvolutionOperator; window: number | null; weight: number | null;
    recipientPath?: number[]; donorPath?: number[];
}
export interface QuantWalkForwardPolicy {
    version: 1 | 2; innerFolds?: number; mode: 'expanding' | 'rolling'; folds: number;
    trainBars: number; validationBars: number; testBars: number; warmupBars: number;
}
export interface QuantExperimentConfig {
    strategy?: import('./quantStrategy').QuantStrategyPolicy;
    evolution?: QuantEvolutionPolicy;
    walkForward?: QuantWalkForwardPolicy;
    seed: number; maxCandidates: number; generations: number; threshold: number;
    feeBps: number; slippageBps: number; gap: number; seconds: number;
}
export interface QuantExperimentSeed {
    candidateId: string;
    bindings: {name: string; column: 'open' | 'high' | 'low' | 'close' | 'volume'}[];
    parameters: {name: string; value: number | boolean | string}[];
    variants: {name: string; value: number | boolean | string}[][];
}
export interface QuantExperimentInput {
    proposalId?: string; requestKey: string; name: string; datasetId: string; seeds: QuantExperimentSeed[]; config: QuantExperimentConfig;
}
export type QuantExperimentStatus = 'pending' | 'running' | 'completed' | 'partial' | 'cancelled' | 'interrupted' | 'failed';
export interface QuantExperiment {
    selectionDiagnostic?:import('./quantSelectionDiagnostic').QuantSelectionDiagnosticRecord|null;
    id: string; name: string; datasetId: string; createdAt: string; status: QuantExperimentStatus;
    cancelRequested: boolean; error: string; attemptCount: number; contentHash: string;
    /** Versioned engine JSON preserves literal parameter/input names across HTTP middleware. */
    reviewStatus?: QuantRunStatus | null;
    reviewContext?: {experimentResultId: string; entryId: string; sourceId: string} | null;
    reviews?: {run: QuantAIRun; report: QuantReport | null; proposal?: QuantExperimentProposal | null}[];
    derivedCandidates?: {id: string; name: string; attemptId: string}[];
    originProposal?: QuantExperimentProposal | null;
    temporalSensitivityJson?: string; jointSensitivityJson?: string; sensitivityJson?: string; planJson?: string; resultJson?: string | null; attemptsJson?: string;
}

export interface QuantExperimentProposal {
    id: string; createdAt: string; contentHash: string; dataJson: string; candidates: QuantFactorCandidate[];
}
