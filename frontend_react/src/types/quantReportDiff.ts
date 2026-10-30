import type {QuantAnalysis, QuantFactorData, QuantReport} from './api/quant';
import type {QuantSourceFinding} from './api/quantFindings';

export interface NamedReportChange<T> {
    name: string;
    status: 'added' | 'removed' | 'changed' | 'unchanged' | 'ambiguous';
    before?: T;
    after?: T;
    beforeCount: number;
    afterCount: number;
    changedFields: string[];
}
export interface ReportRecordDiff {
    sameSource: boolean;
    scoresComparable: boolean;
    rubricBefore?: string;
    rubricAfter?: string;
    scores: {dimension: string; before?: QuantAnalysis['scores'][number]; after?: QuantAnalysis['scores'][number]; delta: number | null}[];
    total: {before: number | null; after: number | null; delta: number | null};
    parametersAvailable: boolean;
    parameters: NamedReportChange<QuantAnalysis['parameters'][number]>[];
    factorsAvailable: boolean;
    factors: NamedReportChange<QuantFactorData>[];
    findingsAvailable: boolean;
    findings: NamedReportChange<QuantSourceFinding>[];
    baseline: Omit<QuantReport,'originalMarkdown'|'revisions'>;
    current: Omit<QuantReport,'originalMarkdown'|'revisions'>;
}
export interface ReportDiffLine {
    kind: 'context' | 'added' | 'removed';
    text: string;
    beforeLine: number | null;
    afterLine: number | null;
}
export interface ReportTextDiff {
    status: 'identical' | 'compared' | 'limited';
    beforeLines: number;
    afterLines: number;
    additions: number | null;
    deletions: number | null;
    hunks: ReportDiffLine[][];
    totalHunks: number | null;
    omittedHunks: number;
}
