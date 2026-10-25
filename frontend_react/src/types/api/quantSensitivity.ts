/** Derived from immutable experiment facts; names inside JSON are case-sensitive. */
export interface SensitivityMetric {total_return: number; max_drawdown: number; turnover: number; entries: number; missing_signals: number; bars: number}
export type SensitivitySpreads = Record<'train' | 'validation', {total_return: number; max_drawdown: number}>;
export interface SensitivityPoint {
    value: number; attempt_id: string; status: string; reason: string; comparable: boolean; eligible: boolean; eligibility_reasons: string[];
    metrics: Record<'train' | 'validation', SensitivityMetric | null>;
    delta: Record<'train' | 'validation', SensitivityMetric | null>;
}
export interface SensitivityAxis {
    parameter: string; baseline_value: number; points: SensitivityPoint[]; compared_points: number;
    spreads: SensitivitySpreads | null; status: 'sampled_region' | 'insufficient_comparison' | 'no_supported_region';
    regions: {sampled_values: number[]; attempt_ids: string[]; includes_baseline: boolean; spreads: SensitivitySpreads}[];
}
export interface QuantSensitivity {
    version: 1;
    rule: {version: 1; minimum_points: number; return_spread_limit: number; drawdown_spread_limit: number; baseline_return_loss_limit: number; baseline_drawdown_increase_limit: number; requires_positive_return: boolean; requires_entries: boolean; minimum_signal_coverage: number; maximum_missing_fraction_spread: number; selection_partitions: string[]; interpolation_allowed: boolean};
    limitations: string[];
    families: {seed_id: string; name: string; baseline_attempt_id: string; baseline_parameters: Record<string, number | boolean | string>; axes: SensitivityAxis[]; excluded_variants: {attempt_id: string; parameters: unknown; reason: string}[]}[];
    excluded_combination_ids: string[];
}
