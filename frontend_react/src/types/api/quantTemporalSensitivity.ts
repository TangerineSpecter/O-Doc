import type {QuantSensitivity} from './quantSensitivity';
import type {QuantJointSensitivity} from './quantJointSensitivity';
export type TemporalParameterStatus = 'sampled_region' | 'no_supported_region' | 'insufficient_comparison';
export type TemporalParameters = Record<string, number | string | boolean>;
export type TemporalRegion = Record<string, number[]>;
export interface TemporalParameterPoint {
    value: number | TemporalParameters; attempt_id: string; status: string; reason: string;
    comparable: boolean; eligible: boolean; eligibility_reasons: string[];
    metrics: Record<'train' | 'validation', {total_return: number; max_drawdown: number} | null>;
}
export interface TemporalParameterWindow {
    ranges: Record<'train' | 'validation', {start: string; end: string} | null>;
    outer_fold: number; inner_fold: number; baseline_attempt_id: string;
    points: TemporalParameterPoint[]; supported_values: TemporalRegion[];
}
export interface TemporalParameterGroup {
    windows: TemporalParameterWindow[]; comparison_regions: TemporalRegion[];
    regions: TemporalRegion[]; status: TemporalParameterStatus;
}
export interface TemporalParameterAxis extends TemporalParameterGroup {parameter: string; baseline_value: number}
export interface TemporalParameterContext extends TemporalParameterGroup {
    context_id: string; fixed_parameters: TemporalParameters; axes: string[]; baseline_parameters: TemporalParameters;
}
export interface QuantTemporalSensitivity {
    version: 1; method: 'all-planned-inner-sampled-regions-1'; outer_folds: number; inner_folds: number; planned_windows: number;
    status: TemporalParameterStatus; axis_rule: QuantSensitivity['rule']; joint_rule: QuantJointSensitivity['rule'];
    maximum_score_without_common_region: 2; limitations: string[]; excluded_combination_ids: string[];
    families: {seed_id: string; name: string; baseline_parameters: TemporalParameters;
        axes: TemporalParameterAxis[]; contexts: TemporalParameterContext[]; excluded_variants: unknown[]}[];
}
