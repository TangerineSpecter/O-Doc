import type {QuantSearchHistory} from './quantSearchHistory';
export interface SelectionSplit {
    in_blocks:number[];winner_ids:string[];relative_oos_rank:number|null;logit:number|null;
    status:'ambiguous_is_tie'|'ambiguous_oos_median'|'reversal'|'retained';
}
export interface SelectionAnalysis {
    status:'completed'|'insufficient';available_intervals:number;used_intervals:number;dropped_oldest_intervals:number;block_intervals:number;
    combinations:number;reversal_count:number;retained_count:number;ambiguous_count:number;
    reversal_fraction_resolved:number|null;ambiguity_lower:number;ambiguity_upper:number;
    bounds_kind:'unresolved_combinations_not_confidence_interval';block_means:Record<string,number[]>;splits:SelectionSplit[];
}
export interface SelectionFamily {
    fold:number|null;attempt_ids:string[];attempted:number;status_counts:Record<'evaluated'|'rejected'|'cancelled'|'budget_stopped',number>;
    distinct_evaluated:number;evaluated_duplicates:number;evaluated_ids:string[];
    partitions:Record<'train'|'validation',[number,number]>;status:'completed'|'insufficient';reason:string;matrix_hash:string|null;analysis:SelectionAnalysis|null;
}
export interface QuantSelectionDiagnostic {
    local_demo?:true;version:1|2;method:'cscv-fixed-family-mean-net-v1';policy:Record<string,string|number>;
    search_history?:QuantSearchHistory;
    scope:'one_recorded_request_per_fold_fixed_development_family';status:'completed'|'partial'|'insufficient';
    families:SelectionFamily[];final_holdout_used:false;independent_validation:false;limitations:string[];
    binding:{request_id:string;request_hash:string;result_id:string;result_hash:string;dataset_hash:string};
}
export interface QuantSelectionDiagnosticRecord {id:string;createdAt:string;contentHash:string;dataJson:string}
