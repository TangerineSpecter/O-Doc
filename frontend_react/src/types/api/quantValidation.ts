import type {QuantAIRun, QuantReport} from './quant';
import type {QuantRunStatus} from './quant';
export interface QuantValidationInput {
    requestKey: string; sourceRequestId: string; attemptId: string; name: string;
    symbol: string; timeframe: string; intervals: number; seconds: number;
    criteria?:import('./quantValidationCriteria').QuantCriteriaInput;
}
export interface QuantValidationSummary {
    id: string; name: string; sourceRequestId: string; createdAt: string; contentHash: string;
    evaluation: null | {id: string;datasetId: string;mode: 'fresh' | 'replication';status: QuantRunStatus};
}
export interface QuantValidation {
    id: string; name: string; sourceRequestId: string; createdAt: string; contentHash: string; planJson: string;
    evaluation: null | {id: string; datasetId: string; mode: 'fresh' | 'replication'; status: QuantRunStatus;
        error: string; cancelRequested: boolean; requestJson: string; resultId: string | null; resultJson: string | null;
        currentAuditJson?: string; reviews?: {run: QuantAIRun; report: QuantReport | null}[]};
}
export interface QuantValidationAudit {
    version: 1|2; scope: 'same_owner_private_quant_exact_market_or_identical_rows_v1'|'same_owner_private_quant_exact_market_or_identical_rows_with_native_v2'; complete_scan: boolean;
    conflict_count: number; range_status: 'reused' | 'no_tracked_conflict' | 'unknown_incomplete_scan';
    external_prior_use: 'unattested'; global_independent_validation: false; limitations: string[];
    conflicts: {key: string; kind: string; start: string; end: string; reason: string; collection_id: string;
        native_sample?:{offset:number;row_count:number;scope:'all_supplied_rows_including_warmup'}}[];
    omitted_conflicts: number;
}
export interface QuantValidationPreview {
    bounds: {start_timestamp: string; end_timestamp: string}; audit: QuantValidationAudit;
    imported_after_registration: boolean; fresh_allowed: boolean;
}
