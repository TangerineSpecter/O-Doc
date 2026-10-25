export interface QuantSourceStructure {
    version: number;
    language: string;
    parser: string;
    status: 'parsed' | 'partial' | 'unparsed' | 'unsupported' | 'limited' | 'no_code';
    codeHash: string;
    lineCount: number;
    localDemo?: boolean;
    nodes: {id: string; name: string; kind: string; parentId: string; startLine: number; endLine: number; contentHash: string; basis: string}[];
    references: {fromId: string; name: string; line: number; kind: 'call' | 'read'; candidateIds: string[]}[];
    imports: {name: string; alias: string; line: number; status: string}[];
    slices: {id: string; startLine: number; endLine: number; contentHash: string}[];
    diagnostics: {message: string; line: number | null}[];
    referenceSemantics: string;
}
