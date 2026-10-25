export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export interface QuantSourceFinding {
    title: string;
    severity: FindingSeverity;
    category: 'temporal_leakage' | 'repainting' | 'dependency' | 'implementation' | 'execution' | 'risk' | 'parameter' | 'unsupported_claim' | 'other';
    certainty: 'source_fact' | 'hypothesis';
    impact: string;
    recommendation: string;
    affectedDimensions: string[];
    evidence: {field: 'code' | 'description' | 'web_markdown'; quote: string}[];
}
