export type CriteriaKey='min_total_return'|'max_drawdown'|'min_excess_return'|'min_signal_coverage'|'min_entries';
export interface QuantCriteriaInput {
    minTotalReturn?:number|null; maxDrawdown?:number|null; minExcessReturn?:number|null;
    minSignalCoverage?:number|null; minEntries?:number|null;
}
export type QuantRegisteredCriteria=Record<CriteriaKey,number|null> & {
    version:1; logic:'all'; fraction_tolerance:number; scope:'registered_recipe_parameters_and_interval_only';
};
export interface QuantCriteriaRule {
    criterion:CriteriaKey; metric:string; relation:'gte'|'lte'; unit:'fraction'|'count';
    threshold:number; observed:number|null; tolerance:number; status:'met'|'not_met'|'unknown';
}
export type CriteriaEligibility='fresh_scope_criteria_met'|'criteria_met_reuse_or_audit_unknown'|'criteria_not_met'|'insufficient_evidence';
export interface QuantCriteriaAssessment {
    version:1; status:'met'|'not_met'|'insufficient'; rules:QuantCriteriaRule[]; eligibility:CriteriaEligibility;
    checks:Record<string,boolean>; scope:'registered_recipe_parameters_and_interval_only'; independent_validation:false;
    unknown_requirements:string[]; claim:'registered_thresholds_and_publication_time_tracked_scope_not_financial_certification';
}
export interface QuantCriteriaReview {
    status:QuantCriteriaAssessment['status']; eligibility:CriteriaEligibility; text:string; evidenceRefs:string[];
}
