export interface QuantLabelInput {version: 1; horizonBars: number}
export interface QuantLabelTarget {
    version: 1; horizon_bars: number; kind: 'close_to_future_close_simple_return';
    formula: 'close[t+horizon_bars]/close[t]-1'; predictor: 'closed_bar_factor_at_t';
    boundary: 'purge_origins_whose_label_end_exceeds_segment_end'; time_unit: 'supplied_bars_not_calendar_duration';
    inference: 'descriptive_no_p_value_or_independence_claim';
}
export interface QuantLabelEvaluation {
    version: 1 | 2; target: QuantLabelTarget;
    window: {start: number; end: number; last_origin: number; possible_pairs: number; purged_origins: number; rule: string};
    start_timestamp: string; end_timestamp: string; last_origin_timestamp: string;
    pairs: number; missing_predictors: number; coverage: number; pearson_ic: number | null; spearman_ic: number | null;
    status: 'completed' | 'insufficient'; reason: '' | 'too_few_valid_pairs' | 'constant_or_near_constant_input';
    pairs_hash: string; independent_observations: null; p_value: null; selection_used: boolean; limitations: string[];
}
export type QuantLabelMetrics = Partial<Record<'train'|'validation', QuantLabelEvaluation>>;
export interface QuantLabelMean {spearman_ic:number;pearson_ic:number;coverage:number}
