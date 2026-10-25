import type {QuantEntryDetail} from './quant';

export interface QuantSourceFile {
    name: string;
    code: string;
    role: 'primary' | 'dependency';
    contentHash: string;
    startLine: number;
    endLine: number;
}
export interface QuantSourceSupplementInput {
    requestKey: string;
    expectedSourceId: string;
    reason: string;
    files: {name: string; code: string}[];
    analyze: boolean;
    modelId: string;
}
export interface QuantSourceSupplementResult {
    entry: QuantEntryDetail;
    sourceId: string;
    notice: string;
}
