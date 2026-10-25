export interface QuantSourceLineRange {start_line: number; end_line: number}
export interface QuantSourceChangeHunk {
    kind: 'insert' | 'delete' | 'replace';
    old_start: number | null; old_end: number | null; new_start: number | null; new_end: number | null;
    old_text: string; new_text: string; old_truncated: boolean; new_truncated: boolean;
}
export interface QuantSourceQuoteImpact {
    field: string; quote: string; status: 'missing' | 'moved' | 'present' | 'ambiguous' | 'unknown';
    old_lines: QuantSourceLineRange[]; new_lines: QuantSourceLineRange[];
    old_occurrences: number; new_occurrences: number; truncated: boolean;
}
export interface QuantSourceEvidenceImpact {
    index: number; name: string; status: 'direct' | 'potential' | 'unknown' | 'quote_present';
    quotes: QuantSourceQuoteImpact[]; node_ids: string[]; limitations: string[];
}
export interface QuantSourceStructureImpact {
    id: string; name: string; kind: string;
    change: 'added' | 'removed' | 'changed' | 'moved' | 'identical';
    impact: 'direct' | 'potential' | 'unknown' | 'not_observed';
    old_range: QuantSourceLineRange | null; new_range: QuantSourceLineRange | null; reasons: string[];
}
export interface QuantSourceImpact {
    version: 1; method: 'conservative-source-impact-v1'; status: 'identical' | 'changed' | 'limited';
    changed_fields: string[]; source_context_changed: boolean;
    code: {old_line_count: number; new_line_count: number; status: 'identical' | 'exact' | 'limited';
        total_hunks: number; omitted_hunks: number; hunks: QuantSourceChangeHunk[]; limitations: string[]};
    structure: {old_status: string; new_status: string; old_parser: string; new_parser: string; total_nodes: number; omitted_nodes: number;
        counts: {added: number; removed: number; changed: number; moved: number; identical: number; direct: number; potential: number; unknown: number};
        nodes: QuantSourceStructureImpact[]; limitations: string[]};
    parameters: QuantSourceEvidenceImpact[]; factors: QuantSourceEvidenceImpact[];
    omitted: {parameters: number; factors: number};
    recommendation: {action: 'full_reanalysis'; start_stage: 'normalize'; can_reuse_stages: false; reasons: string[]};
    limitations: string[];
}
export interface QuantSourceImpactPreview {
    version: 1;
    local_demo?: boolean;
    baseline: {report_id: string; report_hash: string; source_id: string; source_hash: string; material_id: string; language: string; created_at: string};
    target: {source_id: string; source_hash: string; material_id: string; language: string; created_at: string};
    relationship: 'same_source' | 'same_material' | 'different_material';
    impact: QuantSourceImpact;
}
