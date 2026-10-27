import type {QuantLibraryRetrieval} from './quantLibraryResearch';
import type {QuantExperimentProposal} from './quantExperiment';
export type QuantKind = 'factor' | 'indicator' | 'strategy';
export type QuantLanguage = 'python' | 'pine' | 'mql4';
export type QuantCheck = 'pending' | 'passed' | 'failed';
export interface QuantEntry {
    id: string;
    collId: string;
    title: string;
    kind: QuantKind;
    content: string;
    sourceUrl: string;
    tags: string[];
    isValid: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface QuantCodeVersion {
    strategyArtifactId?: string;
    id: string;
    implementationId: string;
    code: string;
    note: string;
    language: QuantLanguage;
    languageVersion: string;
    dependencies: string;
    parameters: string;
    compileCheck: QuantCheck;
    runCheck: QuantCheck;
    resultCheck: QuantCheck;
    verificationNotes: string;
    sourceVersionId: string | null;
    createdAt: string;
}
export interface QuantImplementation {
    id: string;
    entryId: string;
    name: string;
    language: QuantLanguage;
    languageVersion: string;
    dependencies: string;
    parameters: string;
    currentVersionId: string;
    versions: QuantCodeVersion[];
    createdAt: string;
    updatedAt: string;
}
export interface QuantBacktest {
    id: string;
    entryId: string;
    name: string;
    versionId: string | null;
    symbol: string;
    timeframe: string;
    startDate: string;
    endDate: string;
    parameters: string;
    fees: string;
    metrics: { name: string; value: string }[];
    conclusion: string;
    createdAt: string;
    updatedAt: string;
}
export interface QuantAttachment {
    id: string;
    entryId: string;
    assetId: string;
    name: string;
    fileType: string;
    fileExtension: string;
    mimeType: string;
    fileSize: number;
    url: string;
    downloadUrl: string;
    implementationId: string | null;
    versionId: string | null;
    backtestId: string | null;
    createdAt: string;
}
export type QuantRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export interface QuantAIRun {
    nativeReviewWorkflow?: import('./quantNativeReview').NativeReviewWorkflow | null;
    /** Immutable history JSON retains literal evidence keys across response casing. */
    researchMemoryJson?: string | null;
    workflow?: import('./quantWorkflow').QuantWorkflow | null;
    feedbackMemory?: {candidateIds: string[]; historyIds: string[]} | null;
    libraryRetrieval?: QuantLibraryRetrieval | null;
    id: string;
    entryId: string;
    kind: 'explain' | 'convert' | 'analyze' | 'experiment_review' | 'feedback_review';
    sourceVersionId?: string | null;
    sourceId?: string | null;
    experimentResultId?: string | null;
    validationResultId?: string | null;
    resolvedSourceId?: string | null;
    targetLanguage: QuantLanguage | '';
    targetVersion: string;
    requirements: string;
    modelId: string;
    modelName: string;
    status: QuantRunStatus;
    result: {
        analysis?: QuantAnalysis;
        review?: QuantExperimentAnalysis;
        feedback?: import('./quantFeedback').QuantFeedbackAnalysis;
        code?: string;
        explanation?: string;
        differences?: string;
        assumptions?: string;
        dependencies?: string;
        limitations?: string;
    };
    error: string;
    preview?: string;
    adoptedImplementationId: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface QuantEntryDetail extends QuantEntry {
    sources?: QuantSource[];
    reports?: QuantReport[];
    implementations: QuantImplementation[];
    backtests: QuantBacktest[];
    attachments: QuantAttachment[];
    runs: QuantAIRun[];
}
export type QuantEntryInput = Pick<QuantEntry, 'title' | 'kind' | 'content' | 'sourceUrl' | 'tags'>;
export type QuantVersionInput = Pick<
    QuantCodeVersion,
    'code' | 'note' | 'language' | 'languageVersion' | 'dependencies' | 'parameters'
> & { sourceVersionId?: string };
export type QuantImplementationInput = QuantVersionInput & { name: string };
export type QuantVerificationInput = Pick<
    QuantCodeVersion,
    'compileCheck' | 'runCheck' | 'resultCheck' | 'verificationNotes'
>;
export type QuantBacktestInput = Omit<QuantBacktest, 'id' | 'entryId' | 'createdAt' | 'updatedAt'>;
export interface QuantRunInput {
    auditReportId?:string;
    nativeResumeRunId?:string;
    resumeRunId?: string;
    restartStage?: import('./quantWorkflow').ResearchStage | '';
    kind: 'explain' | 'convert' | 'analyze' | 'experiment_review' | 'feedback_review';
    sourceVersionId?: string | null;
    sourceId?: string | null;
    experimentResultId?: string | null;
    validationResultId?: string | null;
    targetLanguage?: QuantLanguage;
    targetVersion?: string;
    requirements?: string;
    modelId?: string;
    requestKey: string;
}
export interface QuantModels {
    models: { id: string; name: string }[];
    defaultModelId: string;
}

export interface QuantSource {
    /** Server-owned immutable hash and current revision within this exact material. */
    contentHash?: string;
    materialCurrentSourceId?: string | null;
    id: string;
    materialId: string;
    codeVersionId: string | null;
    payload: { executionAdapter?: import('./quantPlatformEvidence').QuantExecutionAdapter; executionPreviewJson?: string; languageVersion?: string; dependencies?: string; parameters?: string; note?: string; parameterConfiguration?: import('./quantParameters').QuantParameterConfiguration; parameterComparison?: import('./quantParameters').QuantParameterComparison; code?: string; description?: string; url?: string; language?: string; platform?: string; title?: string;
        fetchStatus?: string; requestFingerprint?: string; provenance?: string; originSourceId?: string;
        bundleVersion?: 1; bundleDepth?: number; parentSourceId?: string; parentSourceHash?: string; files?: import('./quantSourceSupplement').QuantSourceFile[];
        fetchedAt?: string; fetchError?: string; finalUrl?: string; webMarkdown?: string;
        extractionMethod?: string; extractionConfidence?: string; codeOrigin?: string; feedbackVersion?: number; targetSourceId?: string; factorId?: string; experimentResultId?: string; mode?: import('./quantFeedback').FeedbackMode; documentFormat?: import('./quantFeedback').FeedbackFormat; document?: string; notes?: string };
    createdAt: string;
}
export interface QuantAnalysis {
    sourceChangeReviewVersion?: 1 | 2;
    sourceChangeFactsJson?: string;
    sourceChangeAssessment?: import('./quantSourceChangeReview').QuantSourceChangeAssessment;
    sourceFindingsVersion?: 1;
    sourceFindings?: import('./quantFindings').QuantSourceFinding[];
    sourceFindingsNote?: string;
    sourceMemoryVersion?: 1;
    memoryNote?: string;
    memoryAssessment?: import('./quantResearchMemory').QuantMemoryAssessment[];
    factorRepair?: import('./quantRepair').QuantRepairResult;
    initialPlanningVersion?: number;
    initialPlanningNote?: string;
    extractionVersion?: number;
    extractionNote?: string;
    factors?: QuantFactorData[];
    title: string;
    kind: QuantKind;
    summary: string;
    principle: string;
    formula: string;
    usage: string;
    risks: string;
    validationPlan: string;
    sourceFacts: string[];
    assumptions: string[];
    unknowns: string[];
    tags: string[];
    parameterBindingVersion?: 1 | 2;
    parameterInventoryJson?: string;
    parameters: { name: string; type: string; defaultValue: string; category: string; meaning: string; constraints: string; effect: string; suggestion: string; evidence: string; sourceBinding?: import('./quantParameters').QuantParameterSourceBinding; domain?: import('./quantParameters').QuantParameterDomain }[];
    scores: { dimension: string; score: number | null; reason: string; evidence: string }[];
    totalScore: number | null;
    evidenceStatus: string;
    rubricVersion: string;
}
export interface QuantReport {
    researchMemoryJson?: string | null;
    proposal?: QuantExperimentProposal | null;
    id: string;
    sourceId: string;
    runId: string;
    schemaVersion: number;
    data: Partial<Pick<QuantAnalysis, 'parameters' | 'parameterBindingVersion' | 'parameterInventoryJson' | 'sourceChangeReviewVersion' | 'sourceChangeFactsJson' | 'sourceChangeAssessment' | 'sourceFindingsVersion' | 'sourceFindings' | 'sourceFindingsNote' | 'sourceMemoryVersion' | 'initialPlanningVersion' | 'initialPlanningNote' | 'factorRepair' | 'title' | 'summary' | 'scores' | 'totalScore' | 'extractionVersion' | 'extractionNote' | 'factors' | 'evidenceStatus' | 'rubricVersion'>> & Partial<Pick<import('./quantFeedback').QuantFeedbackAnalysis, 'nativeReview' | 'nativeReviewVersion' | 'computedNativeJson'>> & {executionAssessment?: import('./quantPlatformEvidence').QuantExecutionAssessment; computedExecutionJson?: string; memoryNote?: string; memoryAssessment?: import('./quantResearchMemory').QuantMemoryAssessment[]; parameterConfiguration?: import('./quantParameters').QuantParameterConfiguration; parameterComparison?: import('./quantParameters').QuantParameterComparison; format?: string; planningNote?: string; feedbackPlanningVersion?: number; feedbackPlanningNote?: string};
    originalMarkdown: string;
    markdown: string;
    currentRevisionId: string;
    createdAt: string;
    revisions: { id: string; markdown: string; createdAt: string }[];
}
export interface QuantIntakeInput {
    requestKey: string;
    code: string;
    description: string;
    url: string;
    title: string;
    language: 'auto' | 'text' | 'tongdaxin' | QuantLanguage;
    platform: string;
    analyze: boolean;
    modelId: string;
}

export type QuantFactorRole = 'factor' | 'signal' | 'filter' | 'risk' | 'execution' | 'display';
export type QuantFactorFamily = 'momentum' | 'trend' | 'volatility' | 'mean_reversion' | 'volume' | 'price_structure' | 'fundamental' | 'other';
export interface QuantFactorData {
    name: string;
    role: QuantFactorRole;
    family: QuantFactorFamily;
    summary: string;
    formula: string;
    inputs: {name: string; meaning: string; availability: string; missingPolicy: string}[];
    outputType: 'numeric_series' | 'boolean_series' | 'scalar' | 'platform_specific';
    units: string;
    timeframe: string;
    parameters: QuantAnalysis['parameters'];
    dependencies: string[];
    limitations: string;
    tags: string[];
    expression: Record<string, unknown> | null;
    evidence: {field: 'code' | 'description' | 'web_markdown'; quote: string}[];
    formulaVersion?: {version: 1; versionId: string; rootId: string; origin: 'authored' | 'ai_repair'; parentCandidateIds: string[]; claim: 'authored_definition_not_source_extraction' | 'ai_revised_definition_not_source_extraction_or_platform_equivalence'};
    derivation?: {transformation?: import('./quantExperiment').QuantFormulaTransform; localDemo?: boolean; version: string; requestId: string; checkpointId: string; attemptId: string; parentCandidateIds: string[]; parentAttemptIds: string[]; operation: string; engineVersion: string; datasetHash: string; selectionRule: string};
}
export interface QuantFactorCandidate {
    admission?: import('./quantAdmission').AdmissionSummary;
    verification?: import('./quantVerification').QuantVerificationSummary;
    classification?: import('./quantVocabulary').FactorClassification;
    formulaLineage?: {id: string; rootCandidateId: string; currentCandidateId: string; currentSelectionId: string; currentAvailable: boolean; versionsTotal: number};
    mergedGroup?: import('./quantComparison').QuantMergedGroup;
    searchMatch?: import('./quantRetrieval').QuantSearchMatch;
    id: string;
    reportId: string;
    sourceId: string;
    entryId: string;
    entryTitle: string;
    data: QuantFactorData;
    expressionHash: string;
    contentHash: string;
    modelName: string;
    evidenceStatus: 'static_unverified' | 'local_simulation_unverified_platform' | 'authored_unverified' | 'ai_revised_unverified';
    createdAt: string;
    fingerprints: {raw: string; expression: string};
    occurrenceCount: number;
    currentRevisionId: string;
    curation: QuantFactorCuration;
    revisions: {id: string; parentId: string; data: QuantFactorCuration; createdAt: string}[];
}
export interface QuantFactorCuration {
    name: string;
    family: QuantFactorFamily;
    aliases: string[];
    tags: string[];
    note: string;
}
export type QuantFactorGrouping = 'none' | 'raw' | 'expression' | 'merged' | 'lineage';
export interface QuantFactorQuery {
    admissionStage?: import('./quantAdmission').ResearchStage | '';
    reuseStatus?: import('./quantVerification').ReuseStatus | '';
    taxonomyTerm?: string;
    groupBy?: QuantFactorGrouping;
    q?: string;
    role?: QuantFactorRole | '';
    family?: QuantFactorFamily | '';
    entryId?: string;
    offset?: number;
    limit?: number;
}

export interface QuantReviewFinding {text: string; evidenceRefs: string[]}
export interface QuantExperimentAnalysis {
    temporalParameterReviewVersion?:1|2;
    temporalParameterReview?:{status:import('./quantTemporalSensitivity').TemporalParameterStatus;plannedWindows:number;text:string;evidenceRefs:string[];
        windowReviews?:{outerFold:number;innerFold:number;text:string;evidenceRefs:string[];facts:{
            ranges:Record<'train'|'validation',{start:string;end:string}|null>;startedAttempts:number;completeInnerAttempts:number;
            partialInnerAttempts:number;missingInnerAttempts:number;failedAttempts:number;
            baselines:{seedId:string;plannedParameters:{name:string;value:unknown}[];attemptId:string|null;attemptStatus:string;effectiveParameters:{name:string;value:unknown}[]|null;completeMetrics:boolean}[];
        }}[]};
    criteriaReviewVersion?:1;
    selectionReviewVersion?:1;
    selectionReview?:{text:string;evidenceRefs:string[];searchHistoryFacts?:{
        version:1;scope:import('./quantSearchHistory').QuantSearchHistory['scope'];market:{symbol:string;timeframe:string};observedAt:string;completeScan:boolean;
        eligibleRequests:number;requestCount:number;attemptCount:number;
        statusCounts:{evaluated:number;rejected:number;cancelled:number;budgetStopped:number};reservedCandidateBudget:number;
        withoutPublishedResult:number;externalTrials:'unattested';independentValidation:false;
    }};
    criteriaReview?:import('./quantValidationCriteria').QuantCriteriaReview;
    memoryNote?: string;
    memoryAssessment?: import('./quantResearchMemory').QuantMemoryAssessment[];
    planningVersion?: 2; planningNote?: string;
    proposal?: null | {name: string; hypothesis: string; falsification: string; dataRequirement: string; evidenceRefs: string[]; seeds: {candidateId: string; variants: {name: string; value: number | boolean | string}[][]}[]};
    format: 'experiment_review'; title: string; summary: string;
    findings: QuantReviewFinding[]; parameterAssessment: QuantReviewFinding[]; risks: QuantReviewFinding[]; unknowns: string[];
    scores: (QuantAnalysis['scores'][number] & {evidenceRefs: string[]})[]; totalScore: number | null;
    priority: 'investigate' | 'repair' | 'insufficient_evidence' | 'deprioritize';
    nextHypotheses: (QuantReviewFinding & {test: string; falsification: string; dataRequirement: string})[];
    evidenceHash: string; evidenceStatus: string; rubricVersion: string; independentHoldoutProven: false;
    nextHypothesesStatus: 'unverified_requires_fresh_validation';
}
