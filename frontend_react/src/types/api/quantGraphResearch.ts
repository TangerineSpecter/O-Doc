import type {CombinationAnalysis} from './quantCombination';
type Scalar = number | boolean | string;
interface Base {
    version: 1; method: 'graph-research-evidence-1'; candidate_id: string; candidate_hash: string;
    independent_evidence: false; qualification: string;
    origin: {kind: string; id: string; content_hash: string; created_at: string; report_id?: string; report_hash?: string};
}
export type CombinationOutcome = 'supports' | 'counterexample' | 'unknown' | 'mixed';
export interface GraphCombinationObservation extends Base {
    kind: 'combination_observation'; status: CombinationOutcome;
    rule: {method: 'positive-return-risk-turnover-dominance-1'; epsilon: 1e-12; claim: string; registered_before_experiment: false; uses_holdout: false};
    market: Record<string, string | null>; config: {fee_bps: number; slippage_bps: number; [key: string]: unknown};
    analysis: CombinationAnalysis; outcomes: {inner_fold: number | null; status: Exclude<CombinationOutcome, 'mixed'>; reason: string}[];
    configurations: {attempt_id: string; status: string; parameters: {name: string; original_name: string; value: Scalar}[]; bindings: Record<string, string>; expression_hash: string | null}[];
    ai_interpretation: null | {text: string; report_id: string; report_hash: string};
}
export interface GraphCombinationHypothesis extends Base {
    kind: 'combination_hypothesis'; status: 'hypothesis'; hypothesis: string; falsification: string; data_requirement: string;
    config: Record<string, unknown>; evidence_refs: string[];
    participants: {id: string; name: string; candidate_hash: string; parameters: Record<string, Scalar>; bindings: Record<string, string>; variants: Record<string, Scalar>[]}[];
}
export interface GraphScenarioHypothesis extends Base {
    kind: 'scenario_hypothesis'; status: 'hypothesis'; text: string; scope: 'source_level_context_not_component_applicability';
    assumptions_count: number; unknowns_count: number; condition_availability: 'not_established';
}
export interface GraphFeedbackAssessment extends Base {
    kind: 'feedback_assessment'; status: 'reported_support' | 'reported_counterexample'; claim: string; quote: string;
    field: 'supporting_evidence' | 'counter_evidence'; index: number; mode: string; platform: string;
    reported_parameters: {name: string; value: string; unit: string}[]; omitted_parameters: number;
    unknowns_count: number; platform_authenticated: false;
}
export type GraphResearch = GraphCombinationObservation | GraphCombinationHypothesis | GraphScenarioHypothesis | GraphFeedbackAssessment;
