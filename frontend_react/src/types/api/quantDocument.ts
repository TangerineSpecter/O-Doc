import type {QuantReportReading} from './quantReading';
export type ResearchSection = 'reading'|'parameters'|'factors'|'review'|'plan';
export interface DocumentPointer {reportId:string; revisionId:string}
export interface DocumentHistory {id:string;createdAt:string;label:string;sections:Record<ResearchSection,DocumentPointer>}
export interface DocumentComparison {section:ResearchSection;label:string;changed:boolean;before:Record<string,unknown>;after:Record<string,unknown>}
export interface QuantDocument {
    revision:number;sections:Partial<Record<ResearchSection,DocumentPointer>>;report:QuantReportReading|null;
    pending:{id:string;createdAt:string;changedSections:ResearchSection[]}[];
    history:DocumentHistory[];historyLimit:number;comparison?:DocumentComparison[];
}
export interface DocumentOperation {expectedRevision:number;action:'adopt'|'restore'|'discard'|'delete_history'|'clear_history';identity?:string;sections?:ResearchSection[]}
