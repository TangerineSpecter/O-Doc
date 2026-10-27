/** AI interpretation is separate from immutable opaque source-change facts. */
export interface QuantSourceChangeAssessment {
    summary: string;
    nodes: {nodeId: string; analysis: string; verificationNeeded: string}[];
    limitations: string[];
}
