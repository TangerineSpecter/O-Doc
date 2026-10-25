export type ResearchStage = 'normalize' | 'snippets' | 'identify' | 'parameters' | 'research' | 'extract' | 'repair' | 'compare' | 'review' | 'plan' | 'publish';
export interface ResearchStageState {
    stage: ResearchStage;
    name: string;
    status: 'waiting' | 'running' | 'completed' | 'reused' | 'failed' | 'interrupted';
    stepId: string;
    inputHash: string;
    outcomeId: string;
    reusedFrom: string;
    modelName: string;
    error: string;
    elapsedMs: number | null;
    usage: {requestCount: number; eventIds: string[]; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null} | null;
}
export interface QuantWorkflow {
    vocabularyReference?: import('./quantVocabulary').VocabularyReference;
    version: number;
    resumeRunId: string;
    restartStage?: ResearchStage | '';
    maxModelCalls: number;
    maxSeconds: number;
    stages: ResearchStageState[];
    localReading?: {selected: number; reused: number; omitted: number; baselineRunId: string} | null;
    /** Persisted artificial fixture in pure local mode only. */
    localReadingEvidenceJson?: string;
}
export interface QuantStageEvidence {
    structure?: import('./quantSourceStructure').QuantSourceStructure | null;
    sourceCode?: string;
    localReadingJson?: string;
    stage: ResearchStage;
    name: string;
    inputHash: string;
    inputJson: string;
    outcomeHash: string;
    outcomeJson: string;
}
