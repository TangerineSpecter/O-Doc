import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {quantState,resetQuantStateForTests,quantId} from './state.ts';
import {ensureSources,publishMockReport} from './research.ts';
import {collectMockFeedback} from './feedback.ts';
import {advanceRun} from './runs.ts';
import {resolveQuantRoute} from './routes.ts';
import {readNativeReview} from '../../utils/quantNativeReview.ts';
import type {QuantAIRun,QuantEntryDetail} from '../../types/api/quant.ts';
import type {NativeReviewEvidence} from '../../types/api/quantNativeReview.ts';
beforeEach(()=>resetQuantStateForTests());
function prepare(notes=''){
    const entry=quantState().entries[0];ensureSources(entry);
    const saved=collectMockFeedback(entry,{requestKey:quantId('review'),title:'人工审查样例',targetSourceId:entry.sources!.find(row=>row.payload.provenance!=='external_feedback')!.id,factorId:'',experimentResultId:'',mode:'unknown',documentFormat:'json',document:JSON.stringify({kind:'LOCAL_NATIVE_PYTHON',verdict:'fail',parameters:[{name:'lookback',value:25}]}),platform:'local artificial',notes,analyze:true,modelId:''});
    assert.ok(!(saved instanceof Response));return {entry,source:saved.source,run:entry.runs[0]};
}
const finish=(entry:QuantEntryDetail,run:QuantAIRun)=>{run.createdAt='2020-01-01T00:00:00Z';advanceRun(run,entry.sources?.find(row=>row.id===run.sourceId));publishMockReport(entry);};
async function invoke(entry:QuantEntryDetail,path:string,method='GET',body?:unknown){return resolveQuantRoute(new Request(`http://localhost/api/quant/${entry.collId}/entries/${entry.id}/runs/${path}`,{method,headers:{Authorization:'local-test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));}
test('native review local sample has bounded stages, saved original and inspectable outcomes',async()=>{
    const {entry,run}=prepare();assert.equal(run.nativeReviewWorkflow?.policy.maxModelCalls,3);
    const waiting=await invoke(entry,`${run.id}/workflow/native_audit/`) as Response;assert.equal(waiting.status,404);
    finish(entry,run);assert.equal(run.status,'completed');assert.equal(run.nativeReviewWorkflow?.stages.length,2);assert.equal(run.result.feedback?.nativeReviewVersion,2);
    const evidence=await invoke(entry,`${run.id}/workflow/native_audit/`) as NativeReviewEvidence;
    const parsed=readNativeReview(evidence.outcomeJson!);assert.equal(parsed.output.decision,'accept');assert.deepEqual(parsed.output.issues,[]);
    assert.match(evidence.inputJson,/artificial/);assert.equal(quantState().nativeReviewRecords.length,1);
});
test('reviewing saved legacy report retains it and records one revision without source rerun',async()=>{
    const {entry,run}=prepare();finish(entry,run);const old=entry.reports!.find(row=>row.runId===run.id)!;old.data.nativeReviewVersion=1;
    const original=structuredClone(old);
    const next=await invoke(entry,'','POST',{kind:'feedback_review',sourceId:run.sourceId,auditReportId:old.id,requestKey:'native_reaudit_mock_001'}) as QuantAIRun;
    finish(entry,next);assert.equal(next.nativeReviewWorkflow?.gateStatus,'revised_audited');assert.deepEqual(old,original);
    assert.equal(entry.reports!.filter(row=>row.sourceId===run.sourceId).length,2);
    const evidence=await invoke(entry,`${next.id}/workflow/native_audit/`) as NativeReviewEvidence;
    const parsed=readNativeReview(evidence.outcomeJson!);assert.equal(parsed.output.issues![0].quote,'"native_review_version": 1');
    assert.equal(next.nativeReviewWorkflow?.stages[0].usage?.requestCount,0);
    const invalid=await invoke(entry,'','POST',{kind:'feedback_review',sourceId:run.sourceId,auditReportId:'other-report',requestKey:'native_bad_ref_mock_001'}) as Response;assert.equal(invalid.status,400);
});
test('final rejection and cancellation never publish a new mock report',async()=>{
    const {entry,run}=prepare('LOCAL_NATIVE_REVIEW_REJECT');const before=entry.reports!.length;
    finish(entry,run);assert.equal(run.status,'failed');assert.equal(entry.reports!.length,before);assert.equal(run.nativeReviewWorkflow?.stages[2].decision,'reject');
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
