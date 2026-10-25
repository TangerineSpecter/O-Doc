import type {QuantSensitivity, SensitivityPoint, SensitivitySpreads} from './quantSensitivity';
export type JointParameters = Record<string, number | boolean | string>;
export interface JointPoint extends Omit<SensitivityPoint, 'value'> {parameters: JointParameters}
export interface JointRegion {sampled_values: Record<string, number[]>; attempt_ids: string[]; spreads: SensitivitySpreads; includes_baseline: boolean}
export interface JointContext {
    context_id: string; fixed_parameters: JointParameters; axes: string[]; baseline_parameters: JointParameters;
    baseline_attempt_id: string; points: JointPoint[]; compared_points: number; comparison_cells: JointRegion[]; regions: JointRegion[];
    status: 'sampled_region' | 'no_supported_region' | 'incomplete_grid';
}
export interface QuantJointSensitivity {
    version: 1; rule: QuantSensitivity['rule'] & {minimum_dimensions: number; complete_cartesian_grid: true; categorical_mode: 'fixed_context'};
    limitations: string[]; excluded_combination_ids: string[];
    families: {seed_id: string; name: string; contexts: JointContext[]; excluded_variants: {attempt_id: string; parameters: unknown; reason: string}[]}[];
}
