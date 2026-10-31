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
    originalName?: string;
    algorithmProfile?: import('./quantAlgorithm').AlgorithmProfile | null;
    id: string;
    kind: 'hypothesis' | 'scenario' | 'assessment' | 'factor' | 'report' | 'source' | 'strategy' | 'experiment' | 'feedback' | 'validation' | 'native' | 'comparison';
    label: string;
    entryId: string;
    reportId: string;
    evidence?: {id: string; kind: string; targetId: string; targetHash: string; candidateHash: string; createdAt: string};
}
export interface QuantGraphEdge {
    attributes?: import('./quantAlgorithm').AlgorithmSimilarity;
    id: string;
    from: string;
    to: string;
    kind: 'attribute_similar' | 'complement_hypothesis' | 'scenario_hypothesis' | 'reported_support' | 'reported_counterexample' | 'combination_supports' | 'combination_counterexample' | 'combination_unknown' | 'combination_mixed' | 'statistical_correlation' | 'direct_observation' | 'generated_strategy' | 'same_expression' | 'same_source' | 'semantic_similar' | 'extracted_from' | 'analyzed_from' | 'derived_from' | 'origin_context' | 'sample_equivalent' | 'merged_group';
    researchJson?: string; requestId?: string;
    comparisonId?: string; mergeId?: string;
    correlationJson?: string;
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
