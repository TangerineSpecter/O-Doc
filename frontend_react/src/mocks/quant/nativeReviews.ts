/** Artificial review records only. No model, Python, Docker or price requests. */
import type {QuantAIRun,QuantEntryDetail,QuantRunInput,QuantSource} from '../../types/api/quant';
import type {QuantFeedbackAnalysis} from '../../types/api/quantFeedback';
import type {NativeReviewEvidence,NativeReviewIssue,NativeReviewOutcome,NativeReviewStage,NativeReviewWorkflow} from '../../types/api/quantNativeReview';
import {mockFeedbackAnalysis} from './feedback';
import {quantState} from './state';
const stages:NativeReviewStage[]=['native_draft','native_audit','native_reaudit'];
const names=['AI解读原稿','事实审查与一次修订','修订复核'];
const policy:NativeReviewWorkflow['policy']={version:1,maxModelCalls:3,maxSeconds:360,perCallSeconds:120,maxRevisions:1,reviewerIndependent:false};
export interface MockNativeReview {runId:string;entryId:string;sourceReportId:string|null;mode:'accept'|'revise'|'reject';original:QuantFeedbackAnalysis;evidence:Partial<Record<NativeReviewStage,NativeReviewEvidence>>}
export function validateMockAudit(entry:QuantEntryDetail,input:QuantRunInput):string {
    if(!input.auditReportId)return '';
    const report=entry.reports?.find(row=>row.id===input.auditReportId&&row.sourceId===input.sourceId&&row.schemaVersion===5&&row.data.nativeReview);
    return input.kind==='feedback_review'&&report?'':'请选择同一来源已有的Python解读报告';
}
export function prepareMockNativeReview(run:QuantAIRun,entry:QuantEntryDetail,input:QuantRunInput) {
    const source=entry.sources?.find(row=>row.id===run.sourceId);
    if(run.kind!=='feedback_review'||!source?.payload.document?.includes('LOCAL_NATIVE_PYTHON'))return;
    const old=entry.reports?.find(row=>row.id===input.auditReportId);
    const original=old?structuredClone(old.data as QuantFeedbackAnalysis):mockFeedbackAnalysis(source);
    const mode=source.payload.notes?.includes('LOCAL_NATIVE_REVIEW_REJECT')?'reject':old?.data.nativeReviewVersion===1||source.payload.notes?.includes('LOCAL_NATIVE_REVIEW_REVISE')?'revise':'accept';
    quantState().nativeReviewRecords.push({runId:run.id,entryId:entry.id,sourceReportId:old?.id||null,mode,original,evidence:{}});
    run.nativeReviewWorkflow={version:1,policy:{...policy},sourceReportId:old?.id||null,gateStatus:null,remainingStages:[...stages],stages:[]};
}
function rawDraft(data:QuantFeedbackAnalysis) {
    return {title:data.title,summary:data.summary,hypotheses:data.hypotheses,next_steps:data.nextSteps,native_review_version:data.nativeReviewVersion};
}
function issue(data:QuantFeedbackAnalysis):NativeReviewIssue {
    return data.nativeReviewVersion===1?{code:'protocol_upgrade',path:'/',quote:'"native_review_version": 1',evidence_refs:['native:review_policy'],explanation:'人工样例：原稿来自旧协议，修订明确左右侧及组合容差确认。'}:
        {code:'unresolved_scope',path:'/summary',quote:data.summary,evidence_refs:['native:scope'],explanation:'人工负例：演示未通过审查，不将输出对照升级为策略效果证明。'};
}
export function advanceMockNativeReview(run:QuantAIRun,elapsed:number,source?:QuantSource):boolean {
    const workflow=run.nativeReviewWorkflow;if(!workflow)return false;
    const record=quantState().nativeReviewRecords.find(row=>row.runId===run.id);if(!record)return false;
    const count=record.mode==='accept'?2:3;
    const final=structuredClone(mockFeedbackAnalysis(source));final.nativeReviewVersion=2;
    final.summary+=' 左侧为受控IR，右侧为原始Python函数；使用组合容差 abs + rel × max(|左|, |右|)。';
    final.nextSteps='保持固定样本判定，使用新样本检验参数假设；本地人工审查不构成独立验证。';
    for(let index=0;index<count;index++) {
        if(elapsed<600+index*900)break;
        const stage=stages[index];if(record.evidence[stage])continue;
        const decision=index===0?null:index===1&&count===3?'revise':record.mode==='reject'?'reject':'accept';
        const output:NativeReviewOutcome['output']=index===0?{origin:record.sourceReportId?'report_snapshot':'model',analysis:rawDraft(record.original)}:
            {decision:decision!,issues:decision==='accept'?[]:[issue(index===2?final:record.original)],analysis:decision==='revise'?rawDraft(final):null};
        const text=index===0&&record.sourceReportId?'':JSON.stringify(output,null,2);
        const outcome:NativeReviewOutcome={version:2,method:'native-report-review-v1',status:'completed',error:'',elapsed_ms:0,
            raw:{text,total_chars:text.length,sha256:'0'.repeat(64),truncated:false},output};
        const evidence:NativeReviewEvidence={stage,name:names[index],inputHash:'local-artificial-input',inputJson:JSON.stringify({method:'native-report-review-v1',artificial:true,policy,source_report_id:record.sourceReportId,draft:index<2?rawDraft(record.original):rawDraft(final)}),outcomeHash:'local-artificial-outcome',outcomeJson:JSON.stringify(outcome)};
        record.evidence[stage]=evidence;
        workflow.stages.push({stage,name:names[index],stepId:run.id+'-'+stage,status:'completed',decision,issueCount:output.issues?.length||0,origin:output.origin||'model',outcomeId:run.id+'-'+stage,contentHash:evidence.outcomeHash,error:'',elapsedMs:0,usage:{requestCount:index===0&&record.sourceReportId?0:1,inputTokens:null,outputTokens:null,totalTokens:null}});
    }
    workflow.remainingStages=stages.filter(stage=>!workflow.stages.some(row=>row.stage===stage));
    run.preview='人工本地流程样例：保留原稿，核对固定事实；不会调用真实模型。';run.status='running';
    if(workflow.stages.length===count){
        if(record.mode==='reject'){run.status='failed';run.error='修订复核仍有问题，本次不发布新报告（人工样例）';}
        else{run.status='completed';run.result={feedback:final};workflow.gateStatus=count===3?'revised_audited':'audited';}
        workflow.remainingStages=[];run.preview='';
    }
    run.updatedAt=new Date().toISOString();return true;
}
export function mockNativeReviewEvidence(run:QuantAIRun,stage:string):NativeReviewEvidence|null {
    const record=quantState().nativeReviewRecords.find(row=>row.runId===run.id);
    return record?.evidence[stage as NativeReviewStage]||null;
}
