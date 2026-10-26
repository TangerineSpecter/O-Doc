/** Artificial review records only. No model, Python, Docker or price requests. */
import type {QuantAIRun,QuantEntryDetail,QuantRunInput,QuantSource} from '../../types/api/quant';
import type {QuantFeedbackAnalysis} from '../../types/api/quantFeedback';
import type {NativeReviewEvidence,NativeReviewIssue,NativeReviewOutcome,NativeReviewStage,NativeReviewWorkflow} from '../../types/api/quantNativeReview';
import {mockFeedbackAnalysis} from './feedback';
import {quantState} from './state';
import {nativeAlignmentFixture} from './nativeAlignment';
import {readNativeAlignment} from '../../utils/quantNativeAlignment';
import {readNativeReview} from '../../utils/quantNativeReview';
const stages:NativeReviewStage[]=['native_draft','native_audit','native_reaudit'];
const names=['AI解读原稿','事实审查与一次修订','修订复核'];
const policy:NativeReviewWorkflow['policy']={version:1,maxModelCalls:3,maxSeconds:360,perCallSeconds:120,maxRevisions:1,reviewerIndependent:false};
const continuationErrors=new Set<string>();
export async function mockNativeContinuationFault(entry:QuantEntryDetail,input:QuantRunInput):Promise<boolean> {
    if(!input.nativeResumeRunId||!entry.sources?.find(row=>row.id===input.sourceId)?.payload.notes?.includes('LOCAL_NATIVE_RESUME_ERROR_ONCE'))return false;
    if(continuationErrors.has(input.sourceId!))return false;
    continuationErrors.add(input.sourceId!);await new Promise(resolve=>setTimeout(resolve,1200));return true;
}
export interface MockNativeReview {runId:string;entryId:string;sourceReportId:string|null;mode:'accept'|'revise'|'reject'|'audit_failure'|'reaudit_failure';original:QuantFeedbackAnalysis;final?:QuantFeedbackAnalysis;resumeRunId?:string;alignmentJson?:string|null;evidence:Partial<Record<NativeReviewStage,NativeReviewEvidence>>}
function retainedStages(run:QuantAIRun,seen=new Set<string>()):{row:NonNullable<QuantAIRun['nativeReviewWorkflow']>['stages'][number];owner:QuantAIRun}[] {
    if(seen.has(run.id)||seen.size>64)return [];seen.add(run.id);
    const record=quantState().nativeReviewRecords.find(row=>row.runId===run.id),result:{row:NonNullable<QuantAIRun['nativeReviewWorkflow']>['stages'][number];owner:QuantAIRun}[]=[];
    for(const stage of stages){
        const row=run.nativeReviewWorkflow?.stages.find(row=>row.stage===stage),evidence=record?.evidence[stage];
        if(!row||!evidence?.outcomeJson||row.status!=='completed')break;
        const output=readNativeReview(evidence.outcomeJson).output;
        if(stage!=='native_draft'&&!['accept',...(stage==='native_audit'?['revise']:[])].includes(output.decision||''))break;
        result.push({row,owner:run});if(output.decision==='accept')break;
    }
    const parent=quantState().entries.find(entry=>entry.id===run.entryId)?.runs.find(row=>row.id===run.nativeReviewWorkflow?.resumeRunId);
    let ancestor=parent?retainedStages(parent,seen):[];
    const merged:typeof result=[];
    for(const stage of stages){
        const own=result.find(item=>item.row.stage===stage),older=ancestor.find(item=>item.row.stage===stage);
        if(own){
            if(older&&JSON.stringify(readNativeReview(mockNativeReviewEvidence(own.owner,stage)!.outcomeJson!).output)!==JSON.stringify(readNativeReview(mockNativeReviewEvidence(older.owner,stage)!.outcomeJson!).output))ancestor=[];
            merged.push(own);
        }else if(older)merged.push(older);else break;
    }
    return merged;
}
export function refreshMockNativeResume(run:QuantAIRun) {
    if(run.nativeReviewWorkflow)run.nativeReviewWorkflow.canResume=run.nativeReviewWorkflow.version===2&&['failed','cancelled','interrupted'].includes(run.status)&&!run.nativeReviewWorkflow.stages.some(row=>row.decision==='reject');
}
function alignment(source:QuantSource):string|null {
    const document=JSON.parse(source.payload.document||'{}') as {alignmentAck?:unknown};
    if(document.alignmentAck)return JSON.stringify(readNativeAlignment(JSON.stringify(document.alignmentAck)));
    const native=quantState().nativePython.find(row=>row.analysisSource===source.id);
    return native?JSON.stringify(nativeAlignmentFixture(native.input.rowCount,native.input.warmupBars,native.data.status==='completed',native.sourceCode.includes('LOCAL_NATIVE_TAIL_MISSING'))):null;
}
export function validateMockAudit(entry:QuantEntryDetail,input:QuantRunInput):string {
    if(input.nativeResumeRunId){
        const parent=entry.runs.find(row=>row.id===input.nativeResumeRunId&&row.sourceId===input.sourceId);
        if(input.kind!=='feedback_review'||input.auditReportId||input.resumeRunId||input.restartStage||!parent||parent.nativeReviewWorkflow?.version!==2
            ||!['failed','cancelled','interrupted'].includes(parent.status)||parent.nativeReviewWorkflow.stages.some(row=>row.decision==='reject')
            ||input.modelId&&input.modelId!==parent.modelId||input.requirements&&input.requirements!==parent.requirements)return '请选择同来源已停止的Python事实审查，保留原模型与研究要求';
    }
    if(!input.auditReportId)return '';
    const report=entry.reports?.find(row=>row.id===input.auditReportId&&row.sourceId===input.sourceId&&row.schemaVersion===5&&row.data.nativeReview);
    return input.kind==='feedback_review'&&report?'':'请选择同一来源已有的Python解读报告';
}
export function prepareMockNativeReview(run:QuantAIRun,entry:QuantEntryDetail,input:QuantRunInput) {
    const source=entry.sources?.find(row=>row.id===run.sourceId);
    if(run.kind!=='feedback_review'||!source?.payload.document?.includes('LOCAL_NATIVE_PYTHON'))return;
    const parent=entry.runs.find(row=>row.id===input.nativeResumeRunId),prior=quantState().nativeReviewRecords.find(row=>row.runId===parent?.id);
    if(parent&&prior&&parent.nativeReviewWorkflow){
        const workflow=parent.nativeReviewWorkflow,prefix=retainedStages(parent),mode=prefix.some(item=>item.row.decision==='revise')?'revise':'accept';
        Object.assign(run,{modelId:parent.modelId,modelName:parent.modelName,requirements:parent.requirements,
            researchMemoryJson:parent.researchMemoryJson,feedbackMemory:structuredClone(parent.feedbackMemory)});
        quantState().nativeReviewRecords.push({runId:run.id,entryId:entry.id,sourceReportId:prior.sourceReportId,mode,
            original:structuredClone(prior.original),final:structuredClone(prior.final||prior.original),resumeRunId:parent.id,alignmentJson:prior.alignmentJson,evidence:{}});
        run.nativeReviewWorkflow={version:2,policy:{...policy,version:2},sourceId:source.id,resumeRunId:parent.id,canResume:false,
            alignmentJson:workflow.alignmentJson,sourceReportId:prior.sourceReportId,gateStatus:null,remainingStages:[...stages],stages:[]};return;
    }
    const old=entry.reports?.find(row=>row.id===input.auditReportId);
    const alignmentJson=alignment(source),version=alignmentJson?2:1,requiredVersion=version===2?3:2;
    const original=old?structuredClone(old.data as QuantFeedbackAnalysis):reviewedSample(source,requiredVersion);
    const mode=source.payload.notes?.includes('LOCAL_NATIVE_REVIEW_AUDIT_FAILURE')?'audit_failure':source.payload.notes?.includes('LOCAL_NATIVE_REVIEW_REAUDIT_FAILURE')?'reaudit_failure':source.payload.notes?.includes('LOCAL_NATIVE_REVIEW_REJECT')?'reject':old&&(old.data.nativeReviewVersion||1)<requiredVersion||source.payload.notes?.includes('LOCAL_NATIVE_REVIEW_REVISE')?'revise':'accept';
    quantState().nativeReviewRecords.push({runId:run.id,entryId:entry.id,sourceReportId:old?.id||null,mode,original,alignmentJson,evidence:{}});
    run.nativeReviewWorkflow={version,policy:{...policy,version},sourceId:source.id,canResume:false,alignmentJson,sourceReportId:old?.id||null,gateStatus:null,remainingStages:[...stages],stages:[]};
}
function rawDraft(data:QuantFeedbackAnalysis,alignmentJson?:string|null) {
    return {title:data.title,summary:data.summary,hypotheses:data.hypotheses,next_steps:data.nextSteps,native_review_version:data.nativeReviewVersion,
        ...(data.nativeReviewVersion===3&&alignmentJson?{native_review:{alignment_ack:JSON.parse(alignmentJson)}}:{})};
}
function issue(data:QuantFeedbackAnalysis,requiredVersion:number):NativeReviewIssue {
    const value:NativeReviewIssue=(data.nativeReviewVersion||1)<requiredVersion?{code:'protocol_upgrade',path:'/',quote:`"native_review_version": ${data.nativeReviewVersion||1}`,evidence_refs:['native:review_policy'],explanation:'人工样例：补齐本次左右侧、容差及可用时的位置确认。'}:
        {code:'unresolved_scope',path:'/summary',quote:data.summary,evidence_refs:['native:scope'],explanation:'人工负例：演示未通过审查，不将输出对照升级为策略效果证明。'};
    if(requiredVersion===3)Object.assign(value,{text_ref:value.path==='/'?'text:protocol_version':'text:/summary#0',quote_origin:'frozen_text_span',span_start:value.path==='/'?null:0,span_end:value.path==='/'?null:data.summary.length});
    return value;
}
function reviewedSample(source:QuantSource|undefined,version:2|3):QuantFeedbackAnalysis {
    const final=structuredClone(mockFeedbackAnalysis(source));final.nativeReviewVersion=version;
    final.summary+=' 左侧为受控IR，右侧为原始Python函数；使用组合容差 abs + rel × max(|左|, |右|)。';
    final.nextSteps='保持固定样本判定，使用新样本检验参数假设；本地人工审查不构成独立验证。';
    return final;
}
export function advanceMockNativeReview(run:QuantAIRun,elapsed:number,source?:QuantSource):boolean {
    const workflow=run.nativeReviewWorkflow;if(!workflow)return false;
    const record=quantState().nativeReviewRecords.find(row=>row.runId===run.id);if(!record)return false;
    const count=['accept','audit_failure'].includes(record.mode)?2:3;
    const final=record.final||(['accept','audit_failure'].includes(record.mode)?structuredClone(record.original):reviewedSample(source,workflow.version===2?3:2));record.final=structuredClone(final);
    const parent=record.resumeRunId?quantState().entries.find(row=>row.id===record.entryId)?.runs.find(row=>row.id===record.resumeRunId):undefined;
    const prefix=parent?retainedStages(parent):[];
    for(let index=0;index<count;index++) {
        if(elapsed<600+index*900)break;
        const stage=stages[index];if(record.evidence[stage])continue;
        const retained=prefix[index]?.row,owner=prefix[index]?.owner,previous=retained&&owner?mockNativeReviewEvidence(owner,stage):null;
        if(previous?.outcomeJson&&owner){
            const reused_from={run_id:owner.id,step_id:retained.stepId,input_hash:previous.inputHash,outcome_id:retained.outcomeId!,content_hash:previous.outcomeHash!};
            const value:NativeReviewOutcome={...readNativeReview(previous.outcomeJson),version:3,reused_from,elapsed_ms:0,raw:{text:'',total_chars:0,sha256:'0'.repeat(64),truncated:false},usage:{request_count:0,event_ids:[],input_tokens:null,output_tokens:null,total_tokens:null}};
            const evidence={...previous,inputJson:JSON.stringify({artificial:true,retained_from:reused_from}),outcomeJson:JSON.stringify(value)};
            record.evidence[stage]=evidence;
            workflow.stages.push({...structuredClone(retained),stepId:run.id+'-'+stage,outcomeId:run.id+'-'+stage,
                reusedFrom:{runId:owner.id,stepId:retained.stepId,inputHash:previous.inputHash,outcomeId:retained.outcomeId!,contentHash:previous.outcomeHash!},usage:{requestCount:0,inputTokens:null,outputTokens:null,totalTokens:null}});continue;
        }
        const decision=index===0?null:index===1&&count===3?'revise':record.mode==='reject'?'reject':'accept';
        const output:NativeReviewOutcome['output']=index===0?{origin:record.sourceReportId?'report_snapshot':'model',analysis:rawDraft(record.original,record.alignmentJson)}:
            {decision:decision!,issues:decision==='accept'?[]:[issue(index===2?final:record.original,workflow.version===2?3:2)],analysis:decision==='revise'?rawDraft(final,record.alignmentJson):null};
        const text=index===0&&record.sourceReportId?'':JSON.stringify(output,null,2);
        const outcome:NativeReviewOutcome={version:2,method:'native-report-review-v1',status:'completed',error:'',elapsed_ms:0,
            raw:{text,total_chars:text.length,sha256:'0'.repeat(64),truncated:false},output};
        const failed=record.mode==='audit_failure'&&index===1||record.mode==='reaudit_failure'&&index===2;
        if(failed){outcome.status='failed';outcome.error='invalid_model_output';outcome.output={};outcome.raw.text='{"incomplete":';outcome.raw.total_chars=outcome.raw.text.length;}
        const evidence:NativeReviewEvidence={stage,name:names[index],inputHash:'local-artificial-input',inputJson:JSON.stringify({method:'native-report-review-v1',artificial:true,policy:workflow.policy,alignment:record.alignmentJson?JSON.parse(record.alignmentJson):null,source_report_id:record.sourceReportId,draft:rawDraft(index<2?record.original:final,record.alignmentJson)}),outcomeHash:'local-artificial-outcome',outcomeJson:JSON.stringify(outcome)};
        record.evidence[stage]=evidence;
        workflow.stages.push({stage,name:names[index],stepId:run.id+'-'+stage,status:outcome.status,decision:failed?null:decision,issueCount:failed?0:output.issues?.length||0,origin:output.origin||'model',outcomeId:run.id+'-'+stage,contentHash:evidence.outcomeHash,error:outcome.error,elapsedMs:0,usage:{requestCount:index===0&&record.sourceReportId?0:1,inputTokens:null,outputTokens:null,totalTokens:null}});
    }
    workflow.remainingStages=stages.filter(stage=>!workflow.stages.some(row=>row.stage===stage));
    run.preview='人工本地流程样例：保留原稿，核对固定事实；不会调用真实模型。';run.status='running';
    if(workflow.stages.length===count){
        if(['reject','audit_failure','reaudit_failure'].includes(record.mode)){run.status='failed';run.error='审查未通过，本次不发布新报告（人工样例）';}
        else{run.status='completed';run.result={feedback:final};workflow.gateStatus=count===3?'revised_audited':'audited';}
        workflow.remainingStages=[];run.preview='';
    }
    refreshMockNativeResume(run);run.updatedAt=new Date().toISOString();return true;
}
export function mockNativeReviewEvidence(run:QuantAIRun,stage:string):NativeReviewEvidence|null {
    const record=quantState().nativeReviewRecords.find(row=>row.runId===run.id);
    return record?.evidence[stage as NativeReviewStage]||null;
}
