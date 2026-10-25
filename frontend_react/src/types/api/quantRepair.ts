import type {QuantFactorData} from './quant';
export interface QuantRepairItem {
    factorIndex: number; status: 'revised' | 'unresolved'; summary: string;
    definition: Omit<QuantFactorData, 'evidence' | 'formulaVersion' | 'derivation'> | null;
    evidence: QuantFactorData['evidence']; remainingUnknowns: string[];
    beforeHash: string; afterHash: string; changedFields: string[];
}
export interface QuantRepairResult {version: 1; selected: number[]; omitted: number[]; items: QuantRepairItem[]}
