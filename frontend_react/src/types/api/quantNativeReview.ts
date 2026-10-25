export type NativeReviewStage='native_draft'|'native_audit'|'native_reaudit';
export interface NativeReviewWorkflow {
    version:1|2;policy:{version:1|2;maxModelCalls:number;maxSeconds:number;perCallSeconds:number;maxRevisions:1;reviewerIndependent:false};alignmentJson?:string|null;
    sourceReportId:string|null;gateStatus:'audited'|'revised_audited'|null;remainingStages:NativeReviewStage[];
    stages:{stage:NativeReviewStage;name:string;stepId:string;status:string;decision:'accept'|'revise'|'reject'|null;issueCount:number;origin:string;
        outcomeId:string|null;contentHash:string|null;error:string;elapsedMs:number|null;usage?:{requestCount:number;inputTokens:number|null;outputTokens:number|null;totalTokens:number|null}|null}[];
}
export interface NativeAlignmentAck {
    method:'fixed-output-missing-alignment-v1';status:'available'|'unavailable';sample_row_count:number;compared_start_index:number;
    left_first_valid_index:number|null;right_first_valid_index:number|null;missing_mismatch_total:number|null;
    missing_mismatch_indices:number[];omitted_missing_mismatches:number|null;
}
export interface NativeReviewEvidence {stage:NativeReviewStage;name:string;inputHash:string;inputJson:string;outcomeHash:string|null;outcomeJson:string|null}
export interface NativeReviewIssue {code:string;path:string;quote:string;evidence_refs:string[];explanation:string;text_ref?:string;quote_origin?:'frozen_text_span';span_start?:number|null;span_end?:number|null}
export interface NativeReviewOutcome {
    version:2;method:'native-report-review-v1';status:'completed'|'failed';error:string;elapsed_ms:number;
    raw:{text:string;total_chars:number;sha256:string;truncated:boolean};
    output:{decision?:'accept'|'revise'|'reject';issues?:NativeReviewIssue[];analysis?:{title?:string;summary?:string}|null;origin?:string;normalizations?:string[]};
}
