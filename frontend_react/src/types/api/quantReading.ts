import type {QuantEntry, QuantEntryDetail, QuantReport, QuantSource, QuantAIRun, QuantImplementation, QuantCodeVersion} from './quant';

export interface QuantPage<T> {items: T[]; total: number; hasMore: boolean}
export interface QuantEntrySummary extends Pick<QuantEntry, 'id'|'title'|'kind'|'createdAt'|'updatedAt'|'researchScore'> {preview: string}
export interface QuantDirectory extends QuantPage<QuantEntrySummary> {kindCounts: Record<string, number>}
export interface QuantEntryOverview extends Omit<QuantEntry, 'content'> {
    hasNotes: boolean; currentSourceId: string | null; defaultReportId: string | null; activeRunIds: string[];
    counts: Record<'reports'|'sources'|'implementations'|'backtests'|'attachments'|'runs'|'feedback', number>;
}
export interface QuantReportHeader extends Pick<QuantReport, 'id'|'sourceId'|'runId'|'schemaVersion'|'currentRevisionId'|'createdAt'> {
    title: string; totalScore: number | null; contentHash: string;
}
export interface QuantReportReading extends Omit<QuantReport, 'originalMarkdown'|'revisions'> {revisionCount: number; contentHash: string}
export interface QuantRevisionHeader {id: string; parentId: string; createdAt: string; contentHash: string}
export interface QuantTextBody {id: string; markdown: string; createdAt: string}
export interface QuantSourceHeader extends Pick<QuantSource, 'id'|'materialId'|'codeVersionId'|'createdAt'|'contentHash'|'materialCurrentSourceId'> {
    latestRunId: string | null; latestReportId: string | null; title: string; language: string; hasCode: boolean; provenance: string; targetSourceId?: string | null;
}
export type QuantRunSummary = Omit<QuantAIRun, 'result'|'requirements'|'researchMemoryJson'|'outputAssociationsJson'|'libraryRetrieval'|'feedbackMemory'> & {requirements?: string};
export type QuantImplementationHeader = Pick<QuantImplementation, 'id'|'entryId'|'name'|'language'|'currentVersionId'|'createdAt'|'updatedAt'>;
export type QuantImplementationReading = Omit<QuantImplementation, 'versions'>;
export interface QuantVersionHeader extends Pick<QuantCodeVersion, 'id'|'implementationId'|'note'|'createdAt'> {contentHash: string}
export interface QuantStatus {changeMarker: string; activeRuns: QuantRunSummary[]; defaultReportId: string | null}
/** Loaded bodies and metadata are distinct. Empty collections mean not loaded,
 * not that the server has no history; overview counts and page flags are authoritative. */
export interface QuantWorkspace extends QuantEntryOverview {
    notes: QuantEntry | null; runBodies: QuantAIRun[];
    sources: QuantSource[]; reports: QuantReportReading[]; runs: QuantRunSummary[];
    implementations: QuantImplementation[];
    backtests: QuantEntryDetail['backtests']; attachments: QuantEntryDetail['attachments'];
    reportHeaders: QuantReportHeader[]; sourceHeaders: QuantSourceHeader[]; runHeaders: QuantRunSummary[];
    implementationHeaders: QuantImplementationHeader[]; versionHeaders: Record<string, QuantVersionHeader[]>;
}
