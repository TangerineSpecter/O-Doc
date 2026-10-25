export type FeedbackMode = 'backtest' | 'paper' | 'live' | 'unknown' | 'configuration';
export type FeedbackFormat = 'text' | 'json' | 'csv' | 'html' | 'mql_set';
export interface QuantFeedbackInput {
    executionAdapter?: import('./quantPlatformEvidence').QuantExecutionAdapter;
    executionOptionsJson?: string;
    requestKey: string; title: string; targetSourceId: string; factorId: string; experimentResultId: string;
    mode: FeedbackMode; documentFormat: FeedbackFormat; document: string; platform: string; notes: string;
    analyze: boolean; modelId: string;
}
export interface QuantFeedbackAnalysis {
    computedNativeJson?:string;nativeReviewVersion?:1|2;nativeReview?:{verdict:'pass'|'fail'|'inconclusive'|'unavailable';actualParameters:{name:string;value:number|boolean|string}[];interpretation:string;parameterAssessment:string;limitations:string[]};
    executionAssessment?: import('./quantPlatformEvidence').QuantExecutionAssessment;
    computedExecutionJson?: string;
    memoryNote?: string;
    memoryAssessment?: import('./quantResearchMemory').QuantMemoryAssessment[];
    parameterConfiguration?: import('./quantParameters').QuantParameterConfiguration;
    parameterComparison?: import('./quantParameters').QuantParameterComparison;
    feedbackPlanningVersion?: 1; feedbackPlanningNote?: string;
    title: string; summary: string; feedbackVersion: 1; evidenceStatus: 'external_report_unverified'; evidenceHash?: string;
    reportedParameters: {name: string; value: string; unit: string; quote: string}[];
    reportedMetrics: {name: string; value: string; unit: string; quote: string}[];
    supportingEvidence: {claim: string; quote: string}[]; counterEvidence: {claim: string; quote: string}[];
    comparison: string; hypotheses: string[]; unknowns: string[]; nextSteps: string;
}
export const feedbackModes = {unknown: '类型未说明', backtest: '历史回测', paper: '模拟运行', live: '实盘记录', configuration: '参数配置（运行未验证）'};
