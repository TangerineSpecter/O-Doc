import type {QuantCampaign, QuantCampaignInput} from '../types/api/quantCampaign';
import type {QuantBatch, QuantBatchInput, QuantBatchRetry} from '../types/api/quantIntake';
import type {QuantExperiment, QuantExperimentInput} from '../types/api/quantExperiment';
import type {QuantComparison, QuantComparisonInput, QuantFactorMerge, QuantFactorMergeInput, QuantFactorMergeList} from '../types/api/quantComparison';
import request from '../utils/request';
import type {QuantDataset, QuantDatasetInput} from '../types/api/quantDataset';
import type {QuantGraph, QuantIndexStatus, QuantIndexJob} from '../types/api/quantGraph';
import type {
    QuantFactorCandidate,
    QuantFactorQuery,
    QuantFactorCuration,
    QuantFactorGrouping,
    QuantAIRun,
    QuantIntakeInput,
    QuantReport,
    QuantAttachment,
    QuantBacktest,
    QuantBacktestInput,
    QuantEntry,
    QuantEntryDetail,
    QuantEntryInput,
    QuantImplementation,
    QuantImplementationInput,
    QuantModels,
    QuantRunInput,
    QuantVerificationInput,
    QuantVersionInput,
    QuantCodeVersion,
    QuantLanguage,
} from '../types/api/quant';
const base = (collection: string) => `/quant/${encodeURIComponent(collection)}/`;
const entry = (collection: string, id: string) => `${base(collection)}entries/${encodeURIComponent(id)}/`;
export const quantApi = {
    supplementSource: (collection: string, id: string, sourceId: string, data: import('../types/api/quantSourceSupplement').QuantSourceSupplementInput) =>
        request.post<never, import('../types/api/quantSourceSupplement').QuantSourceSupplementResult>(`${entry(collection,id)}sources/${encodeURIComponent(sourceId)}/supplements/`,data),
    sourceImpact: (collection: string, id: string, sourceId: string, reportId: string, signal?: AbortSignal) =>
        request.get<never, {impactJson: string}>(`${entry(collection, id)}source-impact/`, {params: {sourceId, reportId}, signal}),
    comparisons: (collection: string, factorId: string, offset: number, signal?: AbortSignal) =>
        request.get<never, {total: number; items: QuantComparison[]}>(`${base(collection)}comparisons/`, {params: {factorId, offset, limit: 20}, signal}),
    comparison: (collection: string, id: string, signal?: AbortSignal) =>
        request.get<never, QuantComparison>(`${base(collection)}comparisons/${encodeURIComponent(id)}/`, {signal}),
    compareFactors: (collection: string, data: QuantComparisonInput) =>
        request.post<never, QuantComparison>(`${base(collection)}comparisons/`, data, {timeout: 25000}),
    factorMerges: (collection: string, factorId: string, offset: number, signal?: AbortSignal) =>
        request.get<never, QuantFactorMergeList>(`${base(collection)}factor-merges/`, {params: {factorId, offset, limit: 20}, signal}),
    mergeFactors: (collection: string, data: QuantFactorMergeInput) =>
        request.post<never, QuantFactorMerge>(`${base(collection)}factor-merges/`, data),
    withdrawFactorMerge: (collection: string, id: string, data: {requestKey: string; reason: string}) =>
        request.post<never, QuantFactorMerge>(`${base(collection)}factor-merges/${encodeURIComponent(id)}/withdraw/`, data),
    batches: (collection: string, offset: number, signal?: AbortSignal) => request.get<never, {total: number; items: QuantBatch[]}>(`${base(collection)}intake-batches/`, {params: {offset, limit: 10}, signal}),
    startBatch: (collection: string, data: QuantBatchInput) => request.post<never, QuantBatch>(`${base(collection)}intake-batches/`, data),
    cancelBatch: (collection: string, id: string) => request.post<never, QuantBatch>(`${base(collection)}intake-batches/${encodeURIComponent(id)}/cancel/`),
    retryBatch: (collection: string, id: string, data: QuantBatchRetry) => request.post<never, QuantBatch>(`${base(collection)}intake-batches/${encodeURIComponent(id)}/retry/`, data),
    exportFactor: (collection: string, id: string, target: import('../types/api/quantExport').QuantExportTarget, signal?: AbortSignal) =>
        request.get<never, import('../types/api/quantExport').QuantExportBundle>(`${base(collection)}factors/${encodeURIComponent(id)}/export/`, {params: {target}, signal}),
    previewConfiguration: (collection: string, id: string, data: {targetSourceId: string; document: string}, signal?: AbortSignal) =>
        request.post<never, import('../types/api/quantParameters').QuantConfigurationPreview>(`${entry(collection, id)}parameters/preview/`, data, {signal}),
    previewExecution: (collection: string, id: string, data: import('../types/api/quantPlatformEvidence').QuantExecutionPreviewInput, signal?: AbortSignal) =>
        request.post<never, {previewJson: string}>(`${entry(collection, id)}feedback/preview/`, data, {signal}),
    collectFeedback: (collection: string, id: string, data: import('../types/api/quantFeedback').QuantFeedbackInput) =>
        request.post<never, {source: import('../types/api/quant').QuantSource; notice: string}>(`${entry(collection, id)}feedback/`, data),
    campaigns: (collection: string, offset: number, signal?: AbortSignal) => request.get<never, {total: number; items: QuantCampaign[]}>(`${base(collection)}campaigns/`, {params: {offset, limit: 10}, signal}),
    startCampaign: (collection: string, data: QuantCampaignInput) => request.post<never, QuantCampaign>(`${base(collection)}campaigns/`, data),
    cancelCampaign: (collection: string, id: string) => request.post<never, QuantCampaign>(`${base(collection)}campaigns/${encodeURIComponent(id)}/cancel/`),
    experiments: (collection: string, offset: number, signal?: AbortSignal) =>
        request.get<never, {total: number; items: QuantExperiment[]}>(`${base(collection)}experiments/`, {params: {offset, limit: 20}, signal}),
    experiment: (collection: string, id: string, signal?: AbortSignal) =>
        request.get<never, QuantExperiment>(`${base(collection)}experiments/${encodeURIComponent(id)}/`, {signal}),
    exportStrategy: (collection: string, id: string, attemptId: string, signal?: AbortSignal) => request.get<never, import('../types/api/quantStrategyExport').QuantStrategyExport>(`/quant/${encodeURIComponent(collection)}/experiments/${encodeURIComponent(id)}/strategy-export/`, {params: {attemptId}, signal}),
    archiveStrategy: (collection: string, id: string, attemptId: string) => request.post<never, import('../types/api/quantStrategyExport').QuantStrategyArtifact>(`/quant/${encodeURIComponent(collection)}/experiments/${encodeURIComponent(id)}/strategy-export/`, {attemptId}),
    startExperiment: (collection: string, data: QuantExperimentInput) =>
        request.post<never, QuantExperiment>(`${base(collection)}experiments/`, data),
    cancelExperiment: (collection: string, id: string) =>
        request.post<never, QuantExperiment>(`${base(collection)}experiments/${encodeURIComponent(id)}/cancel/`),
    datasets: (collection: string, offset: number, signal?: AbortSignal) =>
        request.get<never, {total: number; items: QuantDataset[]}>(`${base(collection)}datasets/`, {params: {offset, limit: 20}, signal}),
    dataset: (collection: string, id: string, signal?: AbortSignal) =>
        request.get<never, QuantDataset>(`${base(collection)}datasets/${encodeURIComponent(id)}/`, {signal}),
    importDataset: (collection: string, data: QuantDatasetInput) =>
        request.post<never, QuantDataset>(`${base(collection)}datasets/`, data),
    graph: (collection: string, candidateId: string, signal?: AbortSignal) =>
        request.get<never, QuantGraph>(`${base(collection)}graph/`, {params: {candidateId}, signal}),
    indexStatus: (collection: string, signal?: AbortSignal) =>
        request.get<never, QuantIndexStatus>(`${base(collection)}graph/index/`, {signal}),
    buildIndex: (collection: string) =>
        request.post<never, {job: QuantIndexJob | null; index: QuantIndexStatus}>(`${base(collection)}graph/index/`),
    cancelIndex: (collection: string, job: string) =>
        request.post<never, QuantIndexJob>(`${base(collection)}graph/index/${encodeURIComponent(job)}/cancel/`),
    searchFactors: (collection: string, query: import('../types/api/quantRetrieval').QuantSearchQuery, signal?: AbortSignal) =>
        request.post<never, import('../types/api/quantRetrieval').QuantSearchResult>(`${base(collection)}factors/search/`, query, {signal, timeout: 40000}),
    vocabulary: (collection: string, selectedRevisionId = '', offset = 0, signal?: AbortSignal) =>
        request.get<never, import('../types/api/quantVocabulary').QuantVocabulary>(`${base(collection)}vocabulary/`, {params: {selectedRevisionId, offset, limit: 20}, signal}),
    factorVerification: (collection: string, candidate: string, offset: number, signal?: AbortSignal) =>
        request.get<never, import('../types/api/quantVerification').QuantVerification>(`${base(collection)}factors/${encodeURIComponent(candidate)}/verification/`, {params: {offset, limit: 20}, signal}),
    indexVerification: (collection: string, candidate: string, kind: import('../types/api/quantVerification').VerificationKind, offset: number, signal?: AbortSignal) =>
        request.post<never, import('../types/api/quantVerification').VerificationIndexProgress>(`${base(collection)}factors/${encodeURIComponent(candidate)}/verification/`, {kind, offset, limit: 20}, {signal}),
    reviseVocabulary: (collection: string, data: import('../types/api/quantVocabulary').VocabularyEdit) =>
        request.post<never, import('../types/api/quantVocabulary').QuantVocabulary>(`${base(collection)}vocabulary/`, data),
    factors: (collection: string, query: QuantFactorQuery, signal?: AbortSignal) =>
        request.get<never, {total: number; items: QuantFactorCandidate[]}>(`${base(collection)}factors/`, {params: query, signal}),
    factor: (collection: string, id: string, signal?: AbortSignal) =>
        request.get<never, QuantFactorCandidate>(`${base(collection)}factors/${encodeURIComponent(id)}/`, {signal}),
    reviseFactor: (collection: string, id: string, data: QuantFactorCuration, expectedRevisionId: string) =>
        request.patch<never, QuantFactorCandidate>(`${base(collection)}factors/${encodeURIComponent(id)}/`, {data, expectedRevisionId}),
    formulaHistory: (collection: string, id: string, offset: number, signal?: AbortSignal) =>
        request.get<never, import('../types/api/quantFormulaVersion').QuantFormulaHistory>(`${base(collection)}factors/${encodeURIComponent(id)}/formula-versions/`, {params: {offset, limit: 20}, signal}),
    editFormula: (collection: string, id: string, data: import('../types/api/quantFormulaVersion').QuantFormulaEditInput) =>
        request.post<never, import('../types/api/quantFormulaVersion').QuantFormulaEditResult>(`${base(collection)}factors/${encodeURIComponent(id)}/formula-versions/`, data),
    selectFormula: (collection: string, id: string, requestKey: string, expectedSelectionId: string, reason: string) =>
        request.post<never, import('../types/api/quantFormulaVersion').QuantFormulaHistory>(`${base(collection)}factors/${encodeURIComponent(id)}/formula-versions/select/`, {requestKey, expectedSelectionId, reason}),
    factorOccurrences: (collection: string, id: string, groupBy: QuantFactorGrouping, offset: number, signal?: AbortSignal) =>
        request.get<never, {total: number; items: QuantFactorCandidate[]}>(`${base(collection)}factors/${encodeURIComponent(id)}/occurrences/`, {params: {groupBy, offset, limit: 20}, signal}),
    collect: (collection: string, data: QuantIntakeInput) =>
        request.post<never, { entry: QuantEntryDetail; notice: string }>(`${base(collection)}intake/`, data),
    reviseReport: (collection: string, id: string, report: string, markdown: string, expectedRevisionId: string) =>
        request.patch<never, QuantReport>(`${entry(collection, id)}reports/${encodeURIComponent(report)}/`, { markdown, expectedRevisionId }),
    entries: (collection: string, signal?: AbortSignal, language = '') =>
        request.get<never, QuantEntry[]>(`${base(collection)}entries/`, {
            signal,
            params: language ? { language } : undefined,
        }),
    detail: (collection: string, id: string, signal?: AbortSignal) =>
        request.get<never, QuantEntryDetail>(entry(collection, id), { signal }),
    create: (collection: string, data: QuantEntryInput) =>
        request.post<never, QuantEntry>(`${base(collection)}entries/`, data),
    update: (collection: string, id: string, data: QuantEntryInput) =>
        request.patch<never, QuantEntry>(entry(collection, id), data),
    remove: (collection: string, id: string) => request.delete<never, void>(entry(collection, id)),
    implementation: (collection: string, id: string, data: QuantImplementationInput) =>
        request.post<never, QuantImplementation>(`${entry(collection, id)}implementations/`, data),
    rename: (collection: string, id: string, implementation: string, name: string) =>
        request.patch(`${entry(collection, id)}implementations/${encodeURIComponent(implementation)}/`, { name }),
    version: (collection: string, id: string, implementation: string, data: QuantVersionInput) =>
        request.post<never, QuantCodeVersion>(
            `${entry(collection, id)}implementations/${encodeURIComponent(implementation)}/versions/`,
            data,
        ),
    verification: (collection: string, id: string, version: string, data: QuantVerificationInput) =>
        request.patch<never, QuantCodeVersion>(
            `${entry(collection, id)}versions/${encodeURIComponent(version)}/verification/`,
            data,
        ),
    backtest: (collection: string, id: string, data: QuantBacktestInput, backtest?: string) =>
        backtest
            ? request.patch<never, QuantBacktest>(
                  `${entry(collection, id)}backtests/${encodeURIComponent(backtest)}/`,
                  data,
              )
            : request.post<never, QuantBacktest>(`${entry(collection, id)}backtests/`, data),
    removeBacktest: (collection: string, id: string, backtest: string) =>
        request.delete(`${entry(collection, id)}backtests/${encodeURIComponent(backtest)}/`),
    attach: (
        collection: string,
        id: string,
        data: { assetId: string; implementationId?: string; versionId?: string; backtestId?: string },
    ) => request.post<never, QuantAttachment>(`${entry(collection, id)}attachments/`, data),
    detach: (collection: string, id: string, attachment: string) =>
        request.delete(`${entry(collection, id)}attachments/${encodeURIComponent(attachment)}/`),
    text: (collection: string, id: string, attachment: string) =>
        request.get<never, { code: string; language: QuantLanguage; name: string }>(
            `${entry(collection, id)}attachments/${encodeURIComponent(attachment)}/text/`,
        ),
    models: (signal?: AbortSignal) =>
        request.get<never, QuantModels>('/quant/models/', { signal }),
    run: (collection: string, id: string, data: QuantRunInput) =>
        request.post<never, QuantAIRun>(`${entry(collection, id)}runs/`, data),
    runs: (collection: string, id: string, signal?: AbortSignal) =>
        request.get<never, QuantAIRun[]>(`${entry(collection, id)}runs/`, { signal }),
    poll: (collection: string, id: string, run: string, signal?: AbortSignal) =>
        request.get<never, QuantAIRun>(`${entry(collection, id)}runs/${encodeURIComponent(run)}/`, { signal }),
    workflowEvidence: (collection: string, id: string, run: string, stage: string, signal?: AbortSignal) =>
        request.get<never, import('../types/api/quantWorkflow').QuantStageEvidence>(`${entry(collection, id)}runs/${encodeURIComponent(run)}/workflow/${encodeURIComponent(stage)}/`, {signal}),
    cancel: (collection: string, id: string, run: string) =>
        request.post<never, QuantAIRun>(`${entry(collection, id)}runs/${encodeURIComponent(run)}/cancel/`),
    adopt: (collection: string, id: string, run: string) =>
        request.post<never, { implementation?: QuantImplementation; explanation?: string }>(
            `${entry(collection, id)}runs/${encodeURIComponent(run)}/adopt/`,
        ),
};
