import type {QuantExportBundle} from './quantExport';
export interface QuantStrategyArtifact {
    id: string; requestId: string; entryId: string; implementationId: string; versionId: string; attemptId: string;
    createdAt: string; verification: 'native_compile_run_and_equivalence_pending'; contentHash: string;
}
export interface QuantStrategyExport extends QuantExportBundle {artifacts: QuantStrategyArtifact[]}
export interface StrategyExportManifest {
    local_demo?: true; version: 1; exporter_version: string; artifact_id: string; artifact_kind: 'mt4_tester_strategy_candidate';
    verification: 'native_compile_run_and_equivalence_pending'; code_sha256: string;
    context: {request_id: string; attempt_id: string; fold: number | null; config: Record<string, unknown>; recipe: {parameters: Record<string, number | boolean | string>}};
    parameter_mapping: Record<string, string>; native_inputs: Record<string, number | boolean | string>; reference_only_config: Record<string, number>;
    limitations: string[]; required_validation: string[]; feedback_adapter: 'standard-execution-json-v1'; native_output: string;
}
