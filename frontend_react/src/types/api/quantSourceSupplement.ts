import type {QuantEntryOverview} from './quantReading';

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
    entry: QuantEntryOverview;
    sourceId: string;
    notice: string;
}
