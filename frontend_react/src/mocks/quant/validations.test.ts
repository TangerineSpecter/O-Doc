import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {resolveQuantRoute} from './routes.ts';
import {quantState,resetQuantStateForTests} from './state.ts';
import {readVerification} from '../../utils/quantVerification.ts';
import {readValidation,readPreview} from '../../utils/quantValidation.ts';
import {readSelectionDiagnostic} from '../../utils/quantSelectionDiagnostic.ts';
import {buildSeed,initialSeed} from '../../components/Quant/experiments/plan.ts';
import {strategyDraft,buildStrategy} from '../../utils/quantStrategy.ts';
import type {QuantEntryDetail,QuantFactorCandidate} from '../../types/api/quant.ts';
import type {QuantExperiment} from '../../types/api/quantExperiment.ts';
import type {QuantValidation,QuantValidationInput} from '../../types/api/quantValidation.ts';
const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k),key:(i:number)=>[...storage.keys()][i]||null,get length(){return storage.size;}}});
const scenario=(v:string)=>Object.defineProperty(globalThis,'location',{configurable:true,value:new URL(`http://localhost/?mockState=${v}`)});
beforeEach(()=>{storage.clear();resetQuantStateForTests();scenario('sample');});
const base='/api/quant/local-quant/';
const call=async<T>(path:string,method='GET',body?:unknown)=>await resolveQuantRoute(new Request('http://localhost'+base+path,{method,headers:{Authorization:'Token local-demo-token','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})) as T;
const dataset=async(name:string,count:number)=>await call<{id:string}>('datasets/','POST',{name,csvText:'timestamp,open,high,low,close,volume\n'+Array.from({length:count},(_,i)=>`${new Date(Date.UTC(2024,0,i+1)).toISOString()},100,102,99,101,1000`).join('\n'),symbol:'VALIDATION-UI',timeframe:'1d',timezone:'UTC',source:'artificial UI fixture',priceAdjustment:''});
async function setup(strategy=false,criteria?:QuantValidationInput['criteria'],variants=false) {
    const {entry}=await call<{entry:QuantEntryDetail}>('intake/','POST',{requestKey:'fixed_validation_source_001',code:'N=20\nclose.pct_change(N)',language:'python'});
    entry.runs[0].createdAt='2020-01-01T00:00:00Z';await call(`entries/${entry.id}/`);
    const candidate=(await call<{items:QuantFactorCandidate[]}>(`factors/?entryId=${entry.id}`)).items[0];
    const market=await dataset('source',90),draft=strategyDraft();draft.enabled=strategy;
    const created=await call<QuantExperiment>('experiments/','POST',{requestKey:'fixed_validation_experiment_001',name:'UI source',datasetId:market.id,seeds:[buildSeed(candidate,initialSeed(candidate),variants)],config:{seed:1,maxCandidates:8,generations:1,threshold:0,feeBps:5,slippageBps:5,gap:1,seconds:5,...(strategy?{strategy:buildStrategy(draft,0)}:{})}});
    quantState().experiments.find(r=>r.data.id===created.id)!.data.createdAt='2020-01-01T00:00:00Z';
    const source=await call<QuantExperiment>(`experiments/${created.id}/`);
    const input:QuantValidationInput={requestKey:'registered_fixed_validation_01',sourceRequestId:source.id,attemptId:'attempt-1',name:'New fixed data',symbol:'',timeframe:'',intervals:10,seconds:10,...(criteria?{criteria}:{})};
    const plan=await call<QuantValidation>('validations/','POST',input);
    return {source,plan,input,entry,candidate};
}
test('local registration, fresh data, artificial result and automatic report use isolated typed routes',async()=>{
    const {plan,input}=await setup(true);
    assert.equal(readValidation(plan).demo,true);assert.equal(plan.evaluation,null);
    assert.equal((await call<QuantValidation>('validations/','POST',input)).id,plan.id);
    // Advance only this typed artificial fixture timestamp, avoiding millisecond ordering flakiness.
    quantState().validations[0].data.createdAt='2020-01-01T00:00:00Z';
    const newer=await dataset('later',120);
    const before=JSON.stringify(quantState());
    const p=await call<{previewJson:string}>(`validations/${plan.id}/preview/`,'POST',{datasetId:newer.id});
    assert.equal(JSON.stringify(quantState()),before);assert.equal(readPreview(p.previewJson).fresh_allowed,true);
    const started=await call<QuantValidation>(`validations/${plan.id}/run/`,'POST',{datasetId:newer.id,mode:'fresh'});
    assert.equal(started.evaluation?.status,'pending');
    const finished=await call<QuantValidation>(`validations/${plan.id}/`),value=readValidation(finished);
    assert.equal(finished.evaluation?.status,'completed');assert.ok(value.final?.execution?.trades?.length);
    assert.equal(value.publicationAudit?.global_independent_validation,false);assert.ok(finished.evaluation?.reviews?.[0].report);
    assert.match(finished.evaluation!.reviews![0].report!.markdown,/人工/);
    const envelope=JSON.parse(finished.evaluation!.resultJson!),frozen=JSON.parse(finished.planJson);
    const metric=(value: Record<string,unknown>)=>{const {curve: _curve,returns: _returns,...summary}=structuredClone(value);const execution=summary.execution as Record<string,unknown>;delete execution.trades;execution.ledger_scope='summary_only';return summary;};
    const direct={version:1,candidate_hash:'candidate',kind:'fixed_validation',target_id:'result',target_hash:'hash',scope:'direct_fixed_formula_and_actual_parameters_new_interval',claim:'registered_fixed_observation_not_global_independence_or_profitability',levels:['fixed_observation'],source_request_id:'source',source_attempt_id:'attempt-1',dataset_hash:'dataset',market:{symbol:'VALIDATION-UI',timeframe:'1d'},config:frozen.config,recipe:frozen.recipe,bounds:JSON.parse(finished.evaluation!.requestJson).bounds,mode:'fresh',independent_validation:false,metrics:metric(envelope.output.final),baseline:metric(envelope.output.baseline),publication_audit:envelope.publication_audit};
    assert.equal(readVerification(JSON.stringify(direct)).kind,'fixed_validation');
    direct.independent_validation=true;assert.throws(()=>readVerification(JSON.stringify(direct)));

});
test('local prior import blocks fresh, replication and cancelled reservation remain visible',async()=>{
    const {plan}=await setup();const newer=await dataset('later',120);
    quantState().validations[0].data.createdAt='2099-01-01T00:00:00Z';
    const input={datasetId:newer.id,mode:'fresh'};
    assert.equal((await call<Response>(`validations/${plan.id}/run/`,'POST',input)).status,400);
    await call(`validations/${plan.id}/run/`,'POST',{...input,mode:'replication'});
    const cancelled=await call<QuantValidation>(`validations/${plan.id}/cancel/`,'POST',{});
    assert.equal(cancelled.evaluation?.status,'cancelled');
    const other=await dataset('another',125);
    assert.equal((await call<Response>(`validations/${plan.id}/run/`,'POST',{datasetId:other.id,mode:'replication'})).status,409);
    assert.equal((await call<QuantValidation>(`validations/${plan.id}/`)).evaluation?.status,'cancelled');
});
test('decoder rejects inflated independence and inconsistent audit, local empty and errors never return 501',async()=>{
    const {plan}=await setup();const broken=structuredClone(plan),raw=JSON.parse(broken.planJson);raw.engine_version='unreviewed';broken.planJson=JSON.stringify(raw);
    assert.throws(()=>readValidation(broken));
    quantState().validations[0].data.createdAt='2020-01-01T00:00:00Z';const newer=await dataset('later',120);
    const p=JSON.parse((await call<{previewJson:string}>(`validations/${plan.id}/preview/`,'POST',{datasetId:newer.id})).previewJson);
    p.audit.global_independent_validation=true;assert.throws(()=>readPreview(JSON.stringify(p)));
    p.audit.global_independent_validation=false;p.fresh_allowed=false;assert.throws(()=>readPreview(JSON.stringify(p)));
    scenario('empty');assert.equal((await call<{items:QuantValidation[]}>('validations/?sourceRequestId=none')).items.length,0);
    scenario('error');assert.equal((await call<Response>('validations/?sourceRequestId=none')).status,503);
    scenario('slow');assert.equal((await call<{items:QuantValidation[]}>('validations/?sourceRequestId=none')).items.length,0);
});

test('new source analysis consumes fixed outcome history, explains its use and preserves frozen literal parameters',async()=>{
    const {plan}=await setup(true);quantState().validations[0].data.createdAt='2020-01-01T00:00:00Z';
    const newer=await dataset('later',120);
    await call(`validations/${plan.id}/run/`,'POST',{datasetId:newer.id,mode:'fresh'});
    await call(`validations/${plan.id}/`);
    quantState().validations[0].resultCreatedAt=new Date(Date.now()-1000).toISOString();
    const {entry}=await call<{entry:QuantEntryDetail}>('intake/','POST',{requestKey:'new_source_reads_fixed_001',code:'N=20\nclose.pct_change(N) # historical comparison',language:'python'});
    const originalNow=Date.now;Date.now=()=>originalNow()+5000;
    let completed:QuantEntryDetail;
    try {completed=await call<QuantEntryDetail>(`entries/${entry.id}/`);} finally {Date.now=originalNow;}
    const run=completed.runs[0];assert.equal(run.workflow?.version,14);
    const {readResearchMemory}=await import('../../utils/quantResearchMemory.ts');
    const memory=readResearchMemory(run.researchMemoryJson);assert.equal(memory?.version,3);
    const historical=memory!.items.find(r=>r.kind==='fixed_validation');assert.ok(historical);
    assert.ok(run.result.analysis?.memoryAssessment?.some(r=>r.evidenceRefs.includes(`memory:fixed_validation:${historical.id}`)));
    assert.match(completed.reports![0].markdown,/历史研究依据/);
    const changed=JSON.parse(run.researchMemoryJson!);changed.items.find((r:{kind:string})=>r.kind==='fixed_validation').evidence.independent_validation=true;
    assert.throws(()=>readResearchMemory(JSON.stringify(changed)));
});

test('registered criteria are computed from local sample metrics, linked directly and cannot be inflated',async()=>{
    const {plan,input,candidate}=await setup(false,{minTotalReturn:1000,maxDrawdown:1});
    assert.ok(readValidation(plan).criteria);assert.equal(readValidation(plan).assessment,undefined);
    assert.equal((await call<Response>('validations/','POST',{...input,criteria:{minTotalReturn:0}})).status,409);
    quantState().validations[0].data.createdAt='2020-01-01T00:00:00Z';const newer=await dataset('later',120);
    await call(`validations/${plan.id}/run/`,'POST',{datasetId:newer.id,mode:'fresh'});
    const finished=await call<QuantValidation>(`validations/${plan.id}/`),parsed=readValidation(finished);
    assert.equal(parsed.assessment?.status,'not_met');assert.equal(parsed.assessment?.rules[0].observed,parsed.final?.totalReturn);
    assert.match(finished.evaluation!.reviews![0].report!.markdown,/未满足本次登记标准/);
    const {items}=await call<{items:{kind:string;dataJson:string}[]}>(`factors/${candidate.id}/verification/`);
    const link=items.find(row=>row.kind==='fixed_validation');assert.ok(link);
    const evidence=readVerification(link.dataJson);assert.equal(evidence.kind,'fixed_validation');
    assert.ok(!evidence.levels.includes('registered_criteria_met'));
    const inflated=JSON.parse(link.dataJson);inflated.levels.push('registered_criteria_met');assert.throws(()=>readVerification(JSON.stringify(inflated)));
    const forged=structuredClone(finished),envelope=JSON.parse(forged.evaluation!.resultJson!);envelope.criteria_assessment.status='met';forged.evaluation!.resultJson=JSON.stringify(envelope);assert.throws(()=>readValidation(forged));
});

test('registered success keeps historical scope while cancelled observations remain unknown',async()=>{
    const {plan,candidate}=await setup(false,{maxDrawdown:1});
    quantState().validations[0].data.createdAt='2020-01-01T00:00:00Z';const newer=await dataset('later',120);
    await call(`validations/${plan.id}/run/`,'POST',{datasetId:newer.id,mode:'fresh'});
    const finished=await call<QuantValidation>(`validations/${plan.id}/`);assert.equal(readValidation(finished).assessment?.eligibility,'fresh_scope_criteria_met');
    const {items}=await call<{items:{kind:string;dataJson:string}[]}>(`factors/${candidate.id}/verification/`);
    assert.ok(readVerification(items.find(row=>row.kind==='fixed_validation')!.dataJson).levels.includes('registered_criteria_met'));
    // A separate registration binds overlapping data in explicit replication mode.
    const record=quantState().validations[0],secondInput={...record.input,requestKey:'registered_cancelled_criteria_01',criteria:{minEntries:1}};
    const second=await call<QuantValidation>('validations/','POST',secondInput);
    await call(`validations/${second.id}/run/`,'POST',{datasetId:newer.id,mode:'replication'});
    const cancelled=await call<QuantValidation>(`validations/${second.id}/cancel/`,'POST',{});
    assert.equal(readValidation(cancelled).assessment?.status,'insufficient');assert.equal(readValidation(cancelled).assessment?.rules[0].observed,null);
});

test('new artificial experiments archive typed selection diagnostics and explain them in the mock report',async()=>{
    const {source}=await setup(false,undefined,true);assert.ok(source.selectionDiagnostic);
    const value=readSelectionDiagnostic(source.selectionDiagnostic.dataJson,source.id);
    assert.equal(value.local_demo,true);assert.equal(value.final_holdout_used,false);
    assert.equal(value.families[0].attempted,source.attemptCount);
    assert.equal(value.families[0].status_counts.rejected,1);
    const state=quantState(),entry=state.entries.find(row=>row.runs.some(run=>run.experimentResultId===source.reviewContext?.experimentResultId))!;
    const run=entry.runs.find(row=>row.experimentResultId===source.reviewContext?.experimentResultId)!;run.createdAt='2020-01-01T00:00:00Z';
    const complete=await call<QuantExperiment>(`experiments/${source.id}/`);
    assert.ok(complete.reviews?.[0].run.result.review?.selectionReview);
    assert.match(complete.reviews![0].report!.markdown,/搜索选择与过拟合风险/);
    const legacy=structuredClone(complete);delete legacy.selectionDiagnostic;
    assert.equal(readValidation(quantState().validations[0].data).criteria,undefined);
    assert.equal(legacy.selectionDiagnostic,undefined);
});
