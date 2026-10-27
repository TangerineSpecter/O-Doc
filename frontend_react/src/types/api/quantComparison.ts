import type {QuantExperimentSeed} from './quantExperiment';

export type QuantComparisonVerdict = 'pass' | 'fail' | 'inconclusive';
export type QuantComparisonSide = Pick<QuantExperimentSeed, 'candidateId' | 'bindings' | 'parameters'>;
export interface QuantComparisonPolicy {absoluteTolerance: number; relativeTolerance: number; warmupBars: number}
export interface QuantComparisonInput {
    requestKey: string; name: string; datasetId: string;
    left: QuantComparisonSide; right: QuantComparisonSide; policy: QuantComparisonPolicy;
}
export interface QuantComparison {
    id: string; name: string; leftId: string; rightId: string; datasetId: string; createdAt: string;
    contentHash: string; verdict: QuantComparisonVerdict;
    /** Frozen snake-case JSON preserves literal parameter and input names. */
    planJson?: string; resultJson?: string; datasetJson?: string; merges?: QuantFactorMerge[];
    correlation?: QuantCorrelation | null;
}
export interface QuantCorrelation {id:string;createdAt:string;contentHash:string;evidenceJson:string}
export interface QuantCorrelationEvidence {
    version:1;method:'fixed-output-association-1';comparison_id:string;comparison_hash:string;dataset_id:string;dataset_hash:string;
    claim:'descriptive_aligned_outputs_not_equivalence_complementarity_or_profit';
    statistics:{version:1;method:'fixed-output-association-1';claim:string;status:'completed'|'insufficient'|'undefined';reason:string;
        counts:{total_rows:number;warmup_rows:number;compared_rows:number;common_valid:number;left_missing:number;right_missing:number;both_missing:number};
        coverage:number;pearson:number|null;spearman:number|null;output_types:('numeric_series'|'boolean_series')[];
        start:string;end:string;paired_start:string|null;paired_end:string|null;paired_indices_hash:string;output_hashes:{left:string;right:string};
        minimum_common_rows:30;inference:'no_p_value_or_independent_sample_size';alignment:string;local_demo?:boolean};
}
export interface QuantFactorMergeInput {requestKey: string; comparisonId: string; name: string; reason: string}
export interface QuantFactorMerge {
    id: string; comparisonId: string; leftId: string; rightId: string; name: string; reason: string;
    createdAt: string; contentHash: string; active: boolean; curationJson: string;
    withdrawal: null | {id: string; reason: string; createdAt: string};
}
export interface QuantMergedGroup {id: string; memberIds: string[]; names: string[]; aliases: string[]; activeMergeIds: string[]}
export interface QuantFactorMergeList {total: number; items: QuantFactorMerge[]; group?: QuantMergedGroup | null}

/** Engine JSON fields stay snake_case; parameter names are literal keys. */
export interface QuantFrozenComparisonSide {
    id: string; candidate: Record<string, unknown>; candidate_hash: string; source_id: string; report_id: string; source_hash: string; report_hash: string;
    bindings: Record<string, string>; parameters: Record<string, number | boolean | string>;
}
export interface QuantComparisonDataset {
    id: string; name: string; content_hash: string; row_count: number; start: string; end: string;
    symbol: string; timeframe: string; timezone: string; price_adjustment: string; source: string;
}
export interface QuantComparisonPlan {
    version: 1; method: 'controlled-output-comparison-v1'; name: string;
    left: QuantFrozenComparisonSide; right: QuantFrozenComparisonSide; dataset_id: string; dataset_hash: string;
    policy: {version: 1; absolute_tolerance: number; relative_tolerance: number; warmup_bars: number};
    engine_version: 'quant-controlled-expression-1'; runtime: {python: string; numpy: string; pandas: string};
}
export interface QuantComparisonDifference {
    index: number; timestamp: string; left: number | boolean | null; right: number | boolean | null;
    kind: 'left_missing' | 'right_missing' | 'value_mismatch';
}
export interface QuantComparisonResult {
    version: 1; method: 'controlled-output-comparison-v1';
    claim: 'fixed_sample_controlled_outputs_not_platform_or_global_equivalence';
    status: QuantComparisonVerdict; evaluation_status: 'completed' | 'timed_out';
    counts: {total_rows: number; warmup_rows: number; compared_rows: number; common_valid: number | null;
        left_missing: number | null; right_missing: number | null; both_missing: number | null;
        missing_mismatches: number | null; value_mismatches: number | null; within_tolerance: number | null};
    start: string; end: string; comparison_start: string;
    output_hashes: {left: string; right: string}; classification_hash: string;
    max_abs_error: string | null; max_relative_error: string | null;
    first_difference: QuantComparisonDifference | null; differences: QuantComparisonDifference[]; limitations: string[];
    local_demo?: boolean;
}
