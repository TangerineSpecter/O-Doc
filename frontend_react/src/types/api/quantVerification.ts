import type {QuantRegisteredCriteria,QuantCriteriaAssessment} from './quantValidationCriteria';
export type ReuseStatus = 'reusable' | 'candidate' | 'unchecked';
export type VerificationKind = 'experiment' | 'comparison' | 'feedback' | 'fixed_validation' | 'native_python';
export interface QuantVerificationSummary {
    policyVersion: 1; qualificationId: string; reuseStatus: ReuseStatus;
    automaticExperimentReady: boolean; blockers: string[]; scope: 'portable_expression_declared_contract_only';
}
export interface QuantVerification extends QuantVerificationSummary {
    aiRevisions?: {candidateId: string; name: string; summary: string}[];
    aiRevision?: {summary: string; changedFields: string[]; evidence: {field: string; quote: string}[]; remainingUnknowns: string[]; parentCandidateId: string} | null;
    qualificationJson: string; levels: string[]; total: number;
    items: {id: string; kind: VerificationKind; targetId: string; createdAt: string; contentHash: string; dataJson: string}[];
    independentValidation: false; platformEquivalence: 'unverified'; economicEffectiveness: 'unassessed';
}
export interface VerificationIndexProgress {kind: VerificationKind; scanned: number; nextOffset: number; total: number; hasMore: boolean; claim: 'legacy_index_only_no_execution'}

export interface PortableQualification {
    version: 1; candidate_hash: string; scope: string; reuse_status: 'reusable' | 'candidate';
    checks: {code: string; status: 'passed' | 'blocked' | 'missing'; message: string}[]; blockers: string[];
    nodes: {id: string; op: string; name: string; kind: string; dependencies: string[]}[];
    configuration: {status: 'needs_values' | 'declared_defaults_valid' | 'invalid_declared_defaults'; missing: string[]};
    automatic_ohlcv_mapping: boolean; inputs_requiring_mapping: string[]; automatic_experiment_ready: boolean;
    inputs: {name: string; used: boolean; availability: string; missing_policy: string}[];
    parameters: {name: string; used: boolean; kind: string}[];
    external_dependencies: {name: string; status: string}[];
    platform_equivalence: 'unverified'; economic_effectiveness: 'unassessed';
}
export type VerificationMetrics = Partial<Record<'total_return' | 'max_drawdown' | 'entries' | 'turnover' | 'exposure_fraction' | 'missing_signals' | 'bars', number>> & {execution?: Record<string, unknown>; start?: number | string; end?: number | string};
interface EvidenceBase {local_demo?: true; version: 1; candidate_hash: string; kind: VerificationKind; target_id: string; target_hash: string; scope: string; levels: string[]; claim: string}
export interface ExperimentVerification extends EvidenceBase {
    kind: 'experiment'; request_id: string; dataset_hash: string; market: {symbol: string; timeframe: string; timezone?: string};
    engine_version: string; config: {strategy?: Record<string, unknown>; threshold: number; fee_bps: number; slippage_bps: number; gap: number};
    result_status: string; error: string; checkpoint_count: number;
    attempts: {id: string; status: string; reason: string; operation: string; fold: number | null;
        parameters: {name: string; original_name: string; value: number | boolean | string}[];
        bindings: {name: string; column: string}[]; metrics: {train?: VerificationMetrics; validation?: VerificationMetrics}}[];
    heldout: {number: number | null; attempt_id: string; partitions: Record<string, [number, number]>; metrics: VerificationMetrics; status: string; prior_usage: 'unattested'}[];
    independent_validation: false;
    overlap_audit?: {scope: string; total: number; request_ids: string[]; independent_holdout_proven: false};
}
export interface ComparisonVerification extends EvidenceBase {
    kind: 'comparison'; market: {symbol: string; timeframe: string}; dataset_hash: string; policy: {absolute_tolerance: number; relative_tolerance: number; warmup_bars: number};
    engine_version: string; sides: {side: string; parameters: {name: string; value: number | boolean | string}[]; bindings: {name: string; column: string}[]}[];
    verdict: 'pass' | 'fail' | 'inconclusive'; evaluation_status: 'completed' | 'timed_out'; counts: Record<string, number | null>;
}
export interface FeedbackVerification extends EvidenceBase {
    kind: 'feedback'; mode: string; platform: string; title: string; target_source_id: string; document_format: string;
    parser_status: string; accounting_status: string; counts: Record<string, number>; structured: boolean; platform_authenticated: false;
}
export interface FixedValidationVerification extends EvidenceBase {
    kind: 'fixed_validation'; result_status?:'completed'|'failed'|'cancelled';error?:string;source_request_id: string; source_attempt_id: string; dataset_hash: string;
    market: {symbol: string;timeframe: string}; mode: 'fresh' | 'replication'; independent_validation: false;
    config: {threshold: number;fee_bps: number;slippage_bps: number;strategy?: Record<string,unknown>};
    recipe: {parameters: Record<string,number|boolean|string>}; bounds: {start_timestamp: string;end_timestamp: string};
    metrics: VerificationMetrics; baseline: VerificationMetrics;
    publication_audit: {complete_scan: boolean;conflict_count: number;global_independent_validation: false;range_status: string}|null;
    registered_criteria?:QuantRegisteredCriteria; criteria_assessment?:QuantCriteriaAssessment;
    criteria_context?:{mode:'fresh'|'replication';imported_after_registration:boolean;audit:{complete_scan:boolean;conflict_count:number}};
}
export interface NativePythonVerification extends EvidenceBase {
    kind:'native_python';status:string;reason:string;verdict:'pass'|'fail'|'inconclusive'|null;
    comparison:import('./quantNativePython').NativeComparison|null;
    parameters:Record<string,import('./quantNativePython').NativeScalar>;bindings:Record<string,string>;
    dataset:{offset:number;row_count:number;start:string;end:string};
    native:{entrypoint:string};environment:import('./quantNativePython').NativeEnvironment;
    independent_validation:false;platform_equivalence:'unverified';economic_effectiveness:'unassessed';
}
export type DirectVerification = NativePythonVerification | FixedValidationVerification | ExperimentVerification | ComparisonVerification | FeedbackVerification;
