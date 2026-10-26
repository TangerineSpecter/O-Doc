/** Literal field/parameter names and Decimal text stay inside opaque JSON. */
export type QuantExecutionAdapter = 'standard-execution-json-v1' | 'standard-execution-csv-v1' | 'mt4-tester-html-v1';
export interface QuantExecutionOptions {
    version: 1; timezone: string; currency: string; initial_balance: string; balance_tolerance: string;
    profit_basis: 'net' | 'gross' | 'unknown'; cash_flow_coverage: 'complete' | 'unknown';
}
export interface QuantExecutionPreviewInput {document: string; executionAdapter: QuantExecutionAdapter; executionOptionsJson: string}
export interface QuantExecutionProvenance {
    format: 'json' | 'csv' | 'html'; path: string; line: number | null; table: number | null; row: number | null; quote: string; content_hash: string;
}
export interface QuantExecutionValue {name: string; value: string; unit: string; ref: string; provenance: QuantExecutionProvenance}
export interface QuantExecutionCounts {records: number; trades: number; cash_flows: number; equity: number; operations: number}
export interface QuantExecutionRecordBase {id: string; sequence: number; timestamp: string | null; raw_timestamp: string; ref: string; provenance: QuantExecutionProvenance}
export type QuantExecutionRecord = QuantExecutionRecordBase & (
    {kind: 'trade'; profit: string; profit_basis: 'net' | 'gross' | 'unknown'; commission: string | null; swap: string | null; fees: string | null; balance: string | null; symbol: string; side: string; volume: string | null; order_id: string; operation: string}
    | {kind: 'cash_flow'; amount: string; balance: string | null}
    | {kind: 'equity'; equity: string; balance: string | null}
    | {kind: 'operation'; operation: string; order_id: string; volume: string | null; price: string | null; profit: string | null; balance: string | null}
);
export interface QuantExecutionEvidence {
    version: 1; method: 'execution-evidence-v1'; adapter: QuantExecutionAdapter; document_hash: string; options: QuantExecutionOptions;
    metadata: Omit<QuantExecutionOptions, 'version' | 'initial_balance'> & {initial_balance: string | null};
    parser_status: 'parsed' | 'partial' | 'unsupported'; parameters: QuantExecutionValue[]; reported_metrics: QuantExecutionValue[];
    records: QuantExecutionRecord[]; warnings: {code: string; message: string; ref: string}[]; counts: QuantExecutionCounts; limitations: string[]; content_hash: string;
}
export type QuantExecutionMetricKey = 'closed_trades' | 'wins' | 'losses' | 'breakeven' | 'reported_profit_sum' | 'net_profit' | 'gross_profit' | 'gross_loss' | 'win_rate' | 'profit_factor' | 'expectancy' | 'net_cash_flow' | 'final_reconstructed_balance' | 'balance_drawdown_amount' | 'balance_drawdown_fraction' | 'equity_drawdown_amount' | 'equity_drawdown_fraction';
export interface QuantExecutionMetric {value: string | null; unit: string; status: 'computed' | 'unavailable'; reason: string; ref: string}
export interface QuantExecutionReportedComparison {name: string; reported: string; computed: string | null; difference: string | null; status: 'matched' | 'mismatch' | 'unmapped' | 'unavailable' | 'not_numeric'; ref: string}
export interface QuantExecutionAccounting {
    version: 1; method: 'execution-accounting-v1'; evidence_hash: string; status: 'reconciled' | 'mismatch' | 'insufficient'; counts: QuantExecutionCounts & {known_net_trades: number; negative_net_trades: number};
    metrics: Record<QuantExecutionMetricKey, QuantExecutionMetric>;
    reconciliation: {checked_rows: number; unknown_rows: number; mismatches: {id: string; expected: string; reported: string; difference: string; ref: string}[]};
    reported_comparison: QuantExecutionReportedComparison[]; anomalies: {code: string; record_id: string; message: string; ref: string}[];
    balance_path: {id: string; timestamp: string | null; value: string; ref: string}[]; limitations: string[]; content_hash: string;
}
/** Bounded deterministic model input; full records remain in the original frozen evidence. */
export interface QuantExecutionSummary {
    version: 1; method: 'execution-evidence-summary-v1'; evidence_hash: string; accounting_hash: string;
    status: QuantExecutionAccounting['status']; metadata: QuantExecutionEvidence['metadata']; counts: QuantExecutionAccounting['counts'];
    metrics: QuantExecutionAccounting['metrics']; parameters: Omit<QuantExecutionValue, 'provenance'>[];
    reported_comparison: QuantExecutionReportedComparison[];
    reconciliation: {checked_rows: number; unknown_rows: number; mismatch_count: number; examples: QuantExecutionAccounting['reconciliation']['mismatches']; omitted: number};
    anomalies: {total: number; by_code: Record<string, number>; examples: QuantExecutionAccounting['anomalies']; omitted: number};
    sample_records: Omit<QuantExecutionRecord, 'provenance'>[]; omitted_records: number; limitations: string[]; refs: string[];
}
export interface QuantSourceParameterDeclaration {
    name:string;type:string;declaration?:string;default_raw:string;line:number;quote:string;
    binding_kind?:'exposed_input'|'function_default'|'module_literal'|'transformed_input'|'unresolved_write';
    ref?:string;scope?:string;default_value?:import('./quantParameters').QuantParameterValue;
    type_basis?:'input_declaration'|'annotation_hint'|'literal_syntax';
    declared_constraints?:Partial<Record<'minval'|'maxval'|'step',{raw:string;literal:import('./quantParameters').QuantParameterValue}>> & {
        options?:{raw:string;literals:import('./quantParameters').QuantParameterValue[]|null};
    };
}
export interface QuantExecutionParameterComparison {
    version: 1|2; source_id: string; source_hash: string;
    parser?:'source-parameters-2';source_language?:string;parser_status?:'partial'|'limited'|'unparsed'|'unsupported';
    ref?:string;refs?:string[];
    rows: {name: string; ref?:string; configured: import('./quantParameters').QuantParameterValue;
        declaration: QuantSourceParameterDeclaration | null;
        default: import('./quantParameters').QuantParameterValue | null;
        status: 'same' | 'different' | 'type_mismatch' | 'default_unknown' | 'unknown_type' | 'unmatched' | 'ambiguous' | 'unresolved' | 'constraint_mismatch' | 'literal_same' | 'literal_differs'}[];
    missing: QuantSourceParameterDeclaration[]; limitations: string[];
}
export interface QuantExecutionPreview {
    local_demo?: boolean; execution_evidence: QuantExecutionEvidence; execution_accounting: QuantExecutionAccounting;
    execution_summary: QuantExecutionSummary; execution_parameter_comparison?: QuantExecutionParameterComparison;
}
export interface QuantExecutionAssessment {
    summary: string; findings: {kind: 'supports' | 'counters' | 'limitation'; claim: string; refs: string[]}[]; unknowns: string[];
}
export interface QuantComputedExecution {execution_summary: QuantExecutionSummary; execution_parameter_comparison: QuantExecutionParameterComparison}
