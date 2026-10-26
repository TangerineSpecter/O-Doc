import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {quantState,resetQuantStateForTests,quantId} from './state.ts';
import {ensureSources,publishMockReport} from './research.ts';
import {collectMockFeedback} from './feedback.ts';
import {advanceRun} from './runs.ts';
import {resolveQuantRoute} from './routes.ts';
import {readNativeReview} from '../../utils/quantNativeReview.ts';
import {nativeAlignmentFixture} from './nativeAlignment.ts';
import {readNativeAlignment} from '../../utils/quantNativeAlignment.ts';
import type {QuantAIRun,QuantEntryDetail} from '../../types/api/quant.ts';
import type {NativeReviewEvidence} from '../../types/api/quantNativeReview.ts';
beforeEach(()=>resetQuantStateForTests());
function prepare(notes=''){
    const entry=quantState().entries[0];ensureSources(entry);
    const saved=collectMockFeedback(entry,{requestKey:quantId('review'),title:'人工审查样例',targetSourceId:entry.sources!.find(row=>row.payload.provenance!=='external_feedback')!.id,factorId:'',experimentResultId:'',mode:'unknown',documentFormat:'json',document:JSON.stringify({kind:'LOCAL_NATIVE_PYTHON',verdict:'fail',parameters:[{name:'lookback',value:25}],alignmentAck:nativeAlignmentFixture(60,0,true,true)}),platform:'local artificial',notes,analyze:true,modelId:''});
    assert.ok(!(saved instanceof Response));return {entry,source:saved.source,run:entry.runs[0]};
}
const finish=(entry:QuantEntryDetail,run:QuantAIRun)=>{run.createdAt='2020-01-01T00:00:00Z';advanceRun(run,entry.sources?.find(row=>row.id===run.sourceId));publishMockReport(entry);};
async function invoke(entry:QuantEntryDetail,path:string,method='GET',body?:unknown){return resolveQuantRoute(new Request(`http://localhost/api/quant/${entry.collId}/entries/${entry.id}/runs/${path}`,{method,headers:{Authorization:'local-test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));}
test('native review local sample has bounded stages, saved original and inspectable outcomes',async()=>{
    const {entry,run}=prepare();assert.equal(run.nativeReviewWorkflow?.policy.maxModelCalls,3);
    const waiting=await invoke(entry,`${run.id}/workflow/native_audit/`) as Response;assert.equal(waiting.status,404);
    finish(entry,run);assert.equal(run.status,'completed');assert.equal(run.nativeReviewWorkflow?.stages.length,2);assert.equal(run.result.feedback?.nativeReviewVersion,3);
    const positions=readNativeAlignment(run.nativeReviewWorkflow!.alignmentJson!);assert.equal(positions.left_first_valid_index,positions.right_first_valid_index);assert.deepEqual(positions.missing_mismatch_indices,[59]);
    const evidence=await invoke(entry,`${run.id}/workflow/native_audit/`) as NativeReviewEvidence;
    const parsed=readNativeReview(evidence.outcomeJson!);assert.equal(parsed.output.decision,'accept');assert.deepEqual(parsed.output.issues,[]);
    const draft=quantState().nativeReviewRecords[0].evidence.native_draft!;
    const original=readNativeReview(draft.outcomeJson!).output.analysis as {native_review_version:number;summary:string};
    assert.equal(original.native_review_version,3);assert.equal(original.summary,run.result.feedback!.summary);
    assert.match(evidence.inputJson,/artificial/);assert.equal(quantState().nativeReviewRecords.length,1);
    const input=JSON.parse(evidence.inputJson);assert.deepEqual(input.draft.native_review.alignment_ack,input.alignment);
});
test('reviewing saved legacy report retains it and records one revision without source rerun',async()=>{
    const {entry,run}=prepare();finish(entry,run);const old=entry.reports!.find(row=>row.runId===run.id)!;old.data.nativeReviewVersion=1;
    const original=structuredClone(old);
    const next=await invoke(entry,'','POST',{kind:'feedback_review',sourceId:run.sourceId,auditReportId:old.id,requestKey:'native_reaudit_mock_001'}) as QuantAIRun;
    finish(entry,next);assert.equal(next.nativeReviewWorkflow?.gateStatus,'revised_audited');assert.deepEqual(old,original);
    assert.equal(entry.reports!.filter(row=>row.sourceId===run.sourceId).length,2);
    const evidence=await invoke(entry,`${next.id}/workflow/native_audit/`) as NativeReviewEvidence;
    const parsed=readNativeReview(evidence.outcomeJson!);assert.equal(parsed.output.issues![0].quote,'"native_review_version": 1');
    assert.equal(parsed.output.issues![0].quote_origin,'frozen_text_span');assert.equal(parsed.output.issues![0].text_ref,'text:protocol_version');
    assert.equal(next.nativeReviewWorkflow?.stages[0].usage?.requestCount,0);
    const invalid=await invoke(entry,'','POST',{kind:'feedback_review',sourceId:run.sourceId,auditReportId:'other-report',requestKey:'native_bad_ref_mock_001'}) as Response;assert.equal(invalid.status,400);
});
test('final rejection and cancellation never publish a new mock report',async()=>{
    const {entry,run}=prepare('LOCAL_NATIVE_REVIEW_REJECT');const before=entry.reports!.length;
    finish(entry,run);assert.equal(run.status,'failed');assert.equal(entry.reports!.length,before);assert.equal(run.nativeReviewWorkflow?.stages[2].decision,'reject');
    assert.equal(run.nativeReviewWorkflow?.canResume,false);
    const forbidden=await invoke(entry,'','POST',{kind:'feedback_review',sourceId:run.sourceId,nativeResumeRunId:run.id,requestKey:'native_rejected_resume01'}) as Response;
    assert.equal(forbidden.status,400);
    const input={kind:'feedback_review',sourceId:run.sourceId,requestKey:'native_rejected_full_new01'};
    const full=await invoke(entry,'','POST',input) as QuantAIRun;
    assert.equal((await invoke(entry,'','POST',input) as QuantAIRun).id,full.id);
    finish(entry,full);assert.equal(full.nativeReviewWorkflow?.stages[0].reusedFrom,undefined);
    assert.equal(run.status,'failed');assert.equal(entry.reports!.length,before);
    const other=prepare();await invoke(other.entry,`${other.run.id}/cancel/`,'POST');finish(other.entry,other.run);assert.equal(other.run.status,'cancelled');assert.ok(!other.entry.reports!.some(row=>row.runId===other.run.id));
});
test('raw review reader rejects incomplete, forged failed and unsupported records',()=>{
    assert.throws(()=>readNativeReview('{}'),/版本/);
    const {entry,run}=prepare();finish(entry,run);
    const raw=JSON.parse(quantState().nativeReviewRecords[0].evidence.native_audit!.outcomeJson!);
    assert.throws(()=>readNativeReview(JSON.stringify({...raw,status:'failed',error:'x'})),/失败审查/);
    assert.throws(()=>readNativeReview(JSON.stringify({...raw,output:{decision:'unknown'}})),/未知审查/);
    assert.throws(()=>readNativeReview(JSON.stringify({...raw,output:{decision:'revise',issues:[{quote:'x'}]}})),/逐字/);
});
test('missing positions keep zero, no-valid rows and unknown source failures distinct',()=>{
    const valid=nativeAlignmentFixture(60,0);valid.left_first_valid_index=0;valid.right_first_valid_index=null;
    assert.equal(readNativeAlignment(JSON.stringify(valid)).left_first_valid_index,0);
    assert.equal(readNativeAlignment(JSON.stringify(valid)).right_first_valid_index,null);
    const unavailable=nativeAlignmentFixture(60,0,false);assert.equal(readNativeAlignment(JSON.stringify(unavailable)).missing_mismatch_total,null);
    assert.throws(()=>readNativeAlignment(JSON.stringify({...unavailable,left_first_valid_index:0})),/未知/);
    assert.throws(()=>readNativeAlignment(JSON.stringify({...valid,missing_mismatch_total:1})),/数量不一致/);
});
test('failed audit resumes the original draft with one new mock call and retains its history',async()=>{
    const {entry,run}=prepare('LOCAL_NATIVE_REVIEW_AUDIT_FAILURE');finish(entry,run);
    assert.equal(run.status,'failed');assert.equal(run.nativeReviewWorkflow?.canResume,true);
    const original=structuredClone(quantState().nativeReviewRecords[0]);
    const input={kind:'feedback_review',sourceId:run.sourceId,nativeResumeRunId:run.id,requestKey:'native_resume_mock_audit01'};
    const next=await invoke(entry,'','POST',input) as QuantAIRun;
    assert.equal((await invoke(entry,'','POST',input) as QuantAIRun).id,next.id);
    finish(entry,next);assert.equal(next.status,'completed');assert.equal(run.status,'failed');
    assert.equal(next.nativeReviewWorkflow?.stages.reduce((n,row)=>n+(row.usage?.requestCount||0),0),1);
    assert.equal(next.nativeReviewWorkflow?.stages[0].reusedFrom?.runId,run.id);
    const proof=await invoke(entry,`${next.id}/workflow/native_draft/`) as NativeReviewEvidence;
    const parsed=readNativeReview(proof.outcomeJson!);assert.equal(parsed.version,3);assert.equal(parsed.raw.text,'');
    assert.deepEqual(parsed.output,readNativeReview(original.evidence.native_draft!.outcomeJson!).output);
    assert.deepEqual(quantState().nativeReviewRecords.find(row=>row.runId===run.id),original);
    assert.equal(next.researchMemoryJson,run.researchMemoryJson);assert.equal(next.requirements,run.requirements);
});
test('final audit retry reuses the saved revision and cancelled runs keep their draft',async()=>{
    const {entry,run}=prepare('LOCAL_NATIVE_REVIEW_REAUDIT_FAILURE');finish(entry,run);
    const next=await invoke(entry,'','POST',{kind:'feedback_review',sourceId:run.sourceId,nativeResumeRunId:run.id,requestKey:'native_resume_mock_final01'}) as QuantAIRun;
    finish(entry,next);assert.equal(next.status,'completed');assert.equal(next.nativeReviewWorkflow?.gateStatus,'revised_audited');
    assert.equal(next.nativeReviewWorkflow?.stages.filter(row=>row.reusedFrom).length,2);
    assert.equal(next.nativeReviewWorkflow?.stages.reduce((n,row)=>n+(row.usage?.requestCount||0),0),1);
    const other=prepare();other.run.createdAt=new Date(Date.now()-700).toISOString();advanceRun(other.run,other.source);
    assert.equal(other.run.nativeReviewWorkflow?.stages.length,1);await invoke(other.entry,`${other.run.id}/cancel/`,'POST');
    advanceRun(other.run,other.source);assert.equal(other.run.nativeReviewWorkflow?.canResume,true);
    const resumed=await invoke(other.entry,'','POST',{kind:'feedback_review',sourceId:other.run.sourceId,nativeResumeRunId:other.run.id,requestKey:'native_resume_mock_cancel01'}) as QuantAIRun;
    finish(other.entry,resumed);assert.equal(resumed.status,'completed');assert.equal(resumed.nativeReviewWorkflow?.stages[0].usage?.requestCount,0);
});
test('resume cannot change the source, model, requirements or claim copied output as a new execution',async()=>{
    const {entry,run}=prepare('LOCAL_NATIVE_REVIEW_AUDIT_FAILURE');finish(entry,run);
    for(const values of [{modelId:'different'},{requirements:'different'},{auditReportId:'other'},{nativeResumeRunId:'missing'}]){
        const result=await invoke(entry,'','POST',{kind:'feedback_review',sourceId:run.sourceId,nativeResumeRunId:run.id,requestKey:quantId('resume'),...values}) as Response;
        assert.equal(result.status,400);
    }
    const next=await invoke(entry,'','POST',{kind:'feedback_review',sourceId:run.sourceId,nativeResumeRunId:run.id,requestKey:'native_resume_mock_reader01'}) as QuantAIRun;
    finish(entry,next);const proof=await invoke(entry,`${next.id}/workflow/native_draft/`) as NativeReviewEvidence;
    const parsed=readNativeReview(proof.outcomeJson!);
    assert.throws(()=>readNativeReview(JSON.stringify({...parsed,reused_from:{}})),/原记录/);
    assert.throws(()=>readNativeReview(JSON.stringify({...parsed,raw:{...parsed.raw,text:'invented'}})),/新执行/);
    assert.throws(()=>readNativeReview(JSON.stringify({...parsed,usage:{...parsed.usage,request_count:1}})),/新执行/);
});
test('a transient local resume error creates no task and the same request key retries once',async()=>{
    const {entry,run}=prepare('LOCAL_NATIVE_REVIEW_AUDIT_FAILURE LOCAL_NATIVE_RESUME_ERROR_ONCE');finish(entry,run);
    const before=entry.runs.length,input={kind:'feedback_review',sourceId:run.sourceId,nativeResumeRunId:run.id,requestKey:'native_resume_error_once01'};
    const error=await invoke(entry,'','POST',input) as Response;assert.equal(error.status,500);assert.equal(entry.runs.length,before);
    const next=await invoke(entry,'','POST',input) as QuantAIRun;finish(entry,next);assert.equal(next.status,'completed');
    assert.equal((await invoke(entry,'','POST',input) as QuantAIRun).id,next.id);assert.equal(entry.runs.length,before+1);
});
test('cancelling before checkpoint copy still finds the original ancestor revision',async()=>{
    const {entry,run}=prepare('LOCAL_NATIVE_REVIEW_REAUDIT_FAILURE');finish(entry,run);
    const child=await invoke(entry,'','POST',{kind:'feedback_review',sourceId:run.sourceId,nativeResumeRunId:run.id,requestKey:'native_resume_before_copy01'}) as QuantAIRun;
    await invoke(entry,`${child.id}/cancel/`,'POST');assert.equal(child.nativeReviewWorkflow?.stages.length,0);
    const next=await invoke(entry,'','POST',{kind:'feedback_review',sourceId:run.sourceId,nativeResumeRunId:child.id,requestKey:'native_resume_ancestor_copy01'}) as QuantAIRun;
    finish(entry,next);assert.equal(next.status,'completed');assert.equal(next.nativeReviewWorkflow?.stages[1].reusedFrom?.runId,run.id);
    assert.equal(next.nativeReviewWorkflow?.stages.reduce((n,row)=>n+(row.usage?.requestCount||0),0),1);
});
