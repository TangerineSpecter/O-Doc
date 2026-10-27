/** Literal engine JSON; values are fractions, not percentage points. */
export interface CombinationValues {
    total_return: number; max_drawdown: number; turnover: number; entries: number; missing_signals: number;
}
export interface CombinationPart {
    status: 'comparable' | 'unknown'; reason: string;
    ranges: ({start: string; end: string; bars: number} | null)[];
    values: (CombinationValues | null)[];
    deltas: {versus_parents: CombinationValues[]; return_over_best_parent: number; drawdown_over_lower_parent: number} | null;
    labels?: {status: 'comparable' | 'unknown'; target_ref: string;
        values: ({status: string; spearman_ic: number | null; coverage: number; pairs: number; reason: string} | null)[];
        versus_parents: {spearman_ic: number; coverage: number}[] | null};
}
export interface CombinationGroup {
    id: string; attempt_id: string; parent_ids: string[]; operation: string;
    outer_fold: number | null; status: string; reason: string; parent_scope_valid: boolean;
    parents: {id: string; status: string; reason: string}[];
    windows: {inner_fold: number | null; parts: {train: CombinationPart; validation: CombinationPart}}[];
}
export interface CombinationAnalysis {
    version: 1; method: 'immediate-parent-delta-1'; groups: CombinationGroup[];
    scope: 'same_request_same_costs_train_validation_only_immediate_parents';
    claim: 'descriptive_deltas_not_independent_complementarity_or_profit';
    value_order: ['parent_1', 'parent_2', 'combination']; delta_semantics: string;
}
