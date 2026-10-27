import type {QuantCorrelationEvidence} from './quantComparison';
export type OutputBaselineScope = 'current_baselines_match' | 'historical_configuration_only';
export interface QuantOutputAssociation {
    relation_id: string; relation_hash: string; created_at: string;
    comparison_id: string; comparison_hash: string; comparison_name: string;
    dataset: {id: string; content_hash: string; symbol: string; timeframe: string; timezone: string; source: string; price_adjustment: string};
    sides: {candidate_id: string; name: string; candidate_hash: string; parameters: Record<string, number | boolean | string>;
        bindings: Record<string, string>; current_baseline_matches: boolean}[];
    policy: {version: 1; absolute_tolerance: number; relative_tolerance: number; warmup_bars: number};
    statistics: QuantCorrelationEvidence['statistics']; baseline_scope: OutputBaselineScope;
    claim: 'historical_full_comparison_sample_not_current_windows_or_independent_complementarity'; selection_used: false;
}
export interface QuantOutputAssociations {
    version: 1; method: 'review-output-associations-1'; scope: 'same_dataset_hash_planning_options_with_original_parent';
    cutoff: string; limit: 8; known_matches: number; complete_scan: boolean; omitted_at_least: number;
    items: QuantOutputAssociation[];
}
