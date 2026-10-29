import type {QuantAnalysis} from './quant';
export interface QuantStudyInput {requestKey: string; name: string; direction: string; market: string; candidateIds: string[]; maxGenerations: number; population: number; keep: number; modelId: string; evidenceIds: string[]}
export interface StudyDefinition {name:string;role:string;family:string;summary:string;formula:string;inputs:{name:string;meaning:string;availability:string;missing_policy:string}[];output_type:string;units:string;timeframe:string;parameters:{name:string;type:string;default_value:string;meaning:string;constraints:string;effect:string;suggestion:string;evidence:string;category:string}[];dependencies:string[];limitations:string;tags:string[];expression:Record<string,unknown>|null}
export interface StudyFormulaCheck {parent_id:string;claim:'equivalent'|'different'|'uncertain';status:'equivalent'|'different'|'unknown';reason:string;parameter_scope:string;default_parameters_differ:boolean;counterexample:{inputs:Record<string,string>;parameters:Record<string,string>;parent:string;candidate:string;index?:number}|null}
export interface StudyCandidate {index: number; parents: string[]; operation: string; definition: unknown; rationale: string; decision: 'keep'|'reject'; selected: boolean; total_score: number|null; scores: QuantAnalysis['scores']; risks: string[]; validation_error: string; candidate_id: string|null; empirical_status: 'unassessed';formula_checks?:StudyFormulaCheck[]}
export type ValidStudyCandidate = StudyCandidate & {definition: StudyDefinition};
/** Literal parameter and expression names remain in the versioned JSON. */
export interface StudyGeneration {id: string; number: number; dataJson: string; createdAt: string}
export interface QuantStudy {id: string; name: string; userReport: string; planJson: string; status: string; error: string; createdAt: string; generations: StudyGeneration[]}
export interface StudyResult {summary: string; continue: boolean; stop_reason: string; candidates: StudyCandidate[]; empirical_status: 'unassessed'}
export interface StudyReview {summary:string;candidates:{index:number;explanation:string;checks:{parent_id:string;status:'equivalent'|'different'|'unknown'}[]}[]}
export interface StudyGenerationData {version: 1; status: 'completed'|'failed'; input: {parents: {id: string; hash: string; definition: StudyDefinition}[]}; result: StudyResult|null; raw_output: string; error: string;review?:StudyReview|null;review_error?:string;review_raw?:string;format_repair?:string}
export interface QuantConnector {id: string; name: string; configJson: string; hasSecrets: boolean; updatedAt: string}
export interface QuantConnectorInput {name: string; configJson: string; secretsJson?: string}
export interface QuantConnectorPreview {normalizedJson: string; warnings: string[]; evidenceStatus: string; requestTemplateJson: string}
export interface QuantExternalResponse {id: string; connectorId: string; dataJson: string; createdAt: string}
export interface ConnectorMapping {target: string; source: string; type: 'json'|'string'|'number'|'boolean'|'array'; required?: boolean; scale?: number; fields?: ConnectorMapping[]}
export interface ConnectorConfig {version: 1; method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE'; url: string; timeout: number; headers: Record<string, unknown>; query: Record<string, unknown>; body: unknown; mappings: ConnectorMapping[]}
