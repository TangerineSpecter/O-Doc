export interface QuantIndexJob {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
    total: number;
    processed: number;
    modelName: string;
    error: string;
    createdAt: string;
}
export interface QuantIndexStatus {
    configured: boolean;
    modelName: string;
    modelSignature: string;
    total: number;
    ready: number;
    missing: number;
    oversized: number;
    batchLimit: number;
    jobs: QuantIndexJob[];
}
export interface QuantGraphNode {
    id: string;
    kind: 'factor' | 'report' | 'source' | 'strategy';
    label: string;
    entryId: string;
    reportId: string;
}
export interface QuantGraphEdge {
    id: string;
    from: string;
    to: string;
    kind: 'generated_strategy' | 'same_expression' | 'same_source' | 'semantic_similar' | 'extracted_from' | 'analyzed_from' | 'derived_from' | 'origin_context' | 'sample_equivalent' | 'merged_group';
    comparisonId?: string; mergeId?: string;
    label: string;
    historical: boolean;
    similarity: number | null;
    detail: string;
}
export interface QuantGraph {
    focusId: string;
    nodes: QuantGraphNode[];
    edges: QuantGraphEdge[];
    index: QuantIndexStatus;
    limited: boolean;
}
