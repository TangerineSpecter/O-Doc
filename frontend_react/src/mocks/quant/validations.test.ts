import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {resolveQuantRoute} from './routes.ts';
import {quantState,resetQuantStateForTests} from './state.ts';
import {readVerification} from '../../utils/quantVerification.ts';
import {readValidation,readPreview,readAudit} from '../../utils/quantValidation.ts';
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

test('local native supplied rows block fresh, including warmup and cancelled or restored requests',async()=>{
    const {plan,candidate}=await setup();const market=await dataset('native-target',151);
    const preview=async()=>readPreview((await call<{previewJson:string}>(`validations/${plan.id}/preview/`,'POST',{datasetId:market.id})).previewJson);
    assert.equal((await preview()).fresh_allowed,true);
    const seed=buildSeed(candidate,initialSeed(candidate),false);
    const input:import('../../types/api/quantNativePython.ts').NativePythonInput={requestKey:'native_used_sample_local01',name:'已供原函数的人工片段',sourceId:candidate.sourceId,datasetId:market.id,
        bindings:seed.bindings,parameters:seed.parameters,entrypoint:'factor',arguments:[{name:'close',kind:'series',column:'close'}],index:'range',outputColumn:'',offset:90,rowCount:50,seconds:10,
        absoluteTolerance:1e-9,relativeTolerance:1e-8,warmupBars:20,analyze:false};
    assert.equal((await call<Response>(`factors/${candidate.id}/native-python/`,'POST',{...input,warmupBars:21})).status,400);
    const native=await call<import('../../types/api/quantNativePython.ts').NativePythonRecord>(`factors/${candidate.id}/native-python/`,'POST',input);
    assert.ok(native.id);
    const used=await preview();assert.equal(used.audit.version,2);assert.equal(used.fresh_allowed,false);
    const conflict=used.audit.conflicts.find(row=>row.key===`native_python:${native.id}`)!;
    assert.deepEqual(conflict.native_sample,{offset:90,row_count:50,scope:'all_supplied_rows_including_warmup'});
    assert.equal((await call<Response>(`validations/${plan.id}/run/`,'POST',{datasetId:market.id,mode:'fresh'})).status,400);
    await call(`native-python/${native.id}/cancel/`,'POST',{});
    resetQuantStateForTests();assert.equal((await preview()).fresh_allowed,false);
    const replicated=await call<QuantValidation>(`validations/${plan.id}/run/`,'POST',{datasetId:market.id,mode:'replication'});
    assert.equal(replicated.evaluation?.mode,'replication');
    scenario('error');assert.equal((await call<Response>(`validations/${plan.id}/preview/`,'POST',{datasetId:market.id})).status,503);
    scenario('empty');assert.equal((await call<{total:number}>(`validations/?sourceRequestId=${plan.sourceRequestId}`)).total,0);
    scenario('slow');assert.equal((await preview()).fresh_allowed,false);
});

test('audit reader binds native sample to v2, rejecting ambiguous or forged native ranges',()=>{
    const old={version:1,scope:'same_owner_private_quant_exact_market_or_identical_rows_v1',complete_scan:true,conflict_count:0,conflicts:[],omitted_conflicts:0,
        range_status:'no_tracked_conflict',external_prior_use:'unattested',global_independent_validation:false,limitations:[]};
    assert.equal(readAudit(old).version,1);
    const current={...old,version:2,scope:'same_owner_private_quant_exact_market_or_identical_rows_with_native_v2',conflict_count:1,range_status:'reused',conflicts:[{
        key:'native_python:one',kind:'native_python',collection_id:'local-quant',start:'2024-01-01T00:00:00Z',end:'2024-01-30T00:00:00Z',reason:'overlapping_exact_market',native_sample:{offset:0,row_count:30,scope:'all_supplied_rows_including_warmup'}}]};
    assert.equal(readAudit(current).conflicts[0].native_sample?.offset,0);
    for (const change of [{row_count:29},{offset:true},{scope:'output_after_warmup_only'},{offset:20000}]) {
        const bad=structuredClone(current);Object.assign(bad.conflicts[0].native_sample,change);assert.throws(()=>readAudit(bad));
    }
    assert.throws(()=>readAudit({...current,version:1}));
    const wrong=structuredClone(current);wrong.conflicts[0].end='2023-01-01';assert.throws(()=>readAudit(wrong));
});
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
    const run=completed.runs[0];assert.equal(run.workflow?.version,16);
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


test('local cross-request accounting keeps cancelled and unpublished attempts, freezes history and rejects damaged counts',async()=>{
    const {source}=await setup(false,undefined,true);
    const first=quantState().experiments.find(row=>row.data.id===source.id)!;
    const create=async(key:string)=>await call<QuantExperiment>('experiments/','POST',{...structuredClone(first.input),requestKey:key});
    const stopped=await create('history_local_cancelled_001');await call(`experiments/${stopped.id}/cancel/`,'POST',{});
    const pending=await create('history_local_pending_0001');
    const next=await create('history_local_current_0001');
    quantState().experiments.find(row=>row.data.id===next.id)!.data.createdAt='2021-01-01T00:00:00Z';
    const complete=await call<QuantExperiment>(`experiments/${next.id}/`);
    const data=readSelectionDiagnostic(complete.selectionDiagnostic!.dataJson,next.id),history=data.search_history!;
    assert.equal(data.version,2);assert.equal(history.request_count,4);assert.equal(history.without_published_result,1);
    assert.equal(history.attempt_count,source.attemptCount+complete.attemptCount);
    assert.equal(history.manifest.find(row=>row.request_id===stopped.id)?.outcome?.status,'cancelled');
    assert.equal(history.manifest.find(row=>row.request_id===pending.id)?.outcome,null);
    await call(`experiments/${pending.id}/cancel/`,'POST',{});resetQuantStateForTests();
    const restored=await call<QuantExperiment>(`experiments/${next.id}/`);
    assert.deepEqual(readSelectionDiagnostic(restored.selectionDiagnostic!.dataJson,next.id).search_history,history);
    for(const mutation of [(v:typeof data)=>{v.search_history!.attempt_count=0;},(v:typeof data)=>{v.search_history!.status_counts.rejected=0;},(v:typeof data)=>{v.search_history!.manifest.pop();},(v:typeof data)=>{v.version=1;},(v:typeof data)=>{v.search_history!.complete_scan=false;}]) {
        const bad=structuredClone(data);mutation(bad);assert.throws(()=>readSelectionDiagnostic(JSON.stringify(bad),next.id));
    }
    const old=structuredClone(data);old.version=1;delete old.search_history;assert.equal(readSelectionDiagnostic(JSON.stringify(old),next.id).version,1);
    const state=quantState(),entry=state.entries.find(row=>row.runs.some(run=>run.experimentResultId===complete.reviewContext?.experimentResultId))!;
    const run=entry.runs.find(row=>row.experimentResultId===complete.reviewContext?.experimentResultId)!;run.createdAt='2020-01-01T00:00:00Z';
    const report=await call<QuantExperiment>(`experiments/${next.id}/`);
    assert.equal(report.reviews![0].run.result.review!.selectionReview!.searchHistoryFacts!.attemptCount,history.attempt_count);
    assert.match(report.reviews![0].report!.markdown,/跨请求尝试记录/);
    scenario('error');assert.equal((await call<Response>(`experiments/${next.id}/`)).status,503);
    scenario('empty');assert.equal((await call<{total:number}>('experiments/')).total,0);
    scenario('slow');assert.equal((await call<QuantExperiment>(`experiments/${next.id}/`)).id,next.id);
});
