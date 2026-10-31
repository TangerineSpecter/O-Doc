export type AlgorithmStep = {kind: 'assign' | 'initialize'; name: string; value: string} | {kind: 'if'; test: string; then: AlgorithmStep[]; else: AlgorithmStep[]};
export interface AlgorithmProgram {op: 'program'; version: 1; steps: AlgorithmStep[]; output: string; outputType: 'numeric_series' | 'boolean_series'}
export interface AlgorithmProfile {
    method: 'source-algorithm-properties-v1'; family: string; role: string; inputs: string[]; parameters: string[]; operations: string[]; states: string[];
    output: string; timeframe: string; marketScope: string; definitionScore: number; scoreMeaning: string;
}
export interface AlgorithmSimilarity {
    method: 'source-algorithm-attributes-v1'; score: number;
    axes: Record<string, {weight: number; similarity: number}>;
    shared: {operations: string[]; inputs: string[]; parameters: string[]};
}
