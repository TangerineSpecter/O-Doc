export type SearchAttemptStatus='evaluated'|'rejected'|'cancelled'|'budget_stopped';
export type SearchStatusCounts=Record<SearchAttemptStatus,number>;
export interface SearchHistoryRequest {
    request_id:string;request_hash:string;collection_id:string;dataset_id:string;dataset_hash:string;created_at:string;
    candidate_budget:number;outcome:{id:string;content_hash:string;status:'completed'|'partial'|'failed'|'cancelled'}|null;
    checkpoints:{id:string;ordinal:number;content_hash:string;status:SearchAttemptStatus}[];
}
export interface QuantSearchHistory {
    version:1;scope:'same_owner_private_quant_exact_symbol_timeframe_requests_v1';market:{symbol:string;timeframe:string};
    current_request_id:string;observed_at:string;scan_limit:200;max_chars:160000;eligible_requests:number;complete_scan:boolean;
    request_count:number;attempt_count:number;status_counts:SearchStatusCounts;reserved_candidate_budget:number;
    without_published_result:number;manifest:SearchHistoryRequest[];external_trials:'unattested';independent_validation:false;limitations:string[];
}
