import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import type {QuantEntryDetail,QuantFactorCandidate} from '../../types/api/quant.ts';
import type {QuantExperiment} from '../../types/api/quantExperiment.ts';
import type {QuantFormulaEditResult,QuantFormulaHistory} from '../../types/api/quantFormulaVersion.ts';
import type {QuantValidation} from '../../types/api/quantValidation.ts';
import type {AdmissionPage} from '../../types/api/quantAdmission.ts';
import type {QuantVerification} from '../../types/api/quantVerification.ts';
import {readAdmission,admissionValues} from '../../utils/quantAdmission.ts';
import {readVerification} from '../../utils/quantVerification.ts';
import {resolveQuantRoute} from './routes.ts';
import {quantState,resetQuantStateForTests} from './state.ts';
beforeEach(()=>resetQuantStateForTests());
const call=async<T>(path:string,method='GET',body?:unknown):Promise<T>=>await resolveQuantRoute(new Request(`http://localhost/api/quant/local-quant/${path}`,{method,headers:{Authorization:'local-test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})) as T;
const dataset=async(count:number)=>await call<{id:string}>('datasets/','POST',{name:'分层人工行情',csvText:'timestamp,open,high,low,close,volume\n'+Array.from({length:count},(_,i)=>`${new Date(Date.UTC(2024,0,i+1)).toISOString()},100,102,99,101,1000`).join('\n'),symbol:'ADMISSION-UI',timeframe:'1d',timezone:'UTC',source:'artificial UI fixture',priceAdjustment:''});
async function seed(marker=''){
    const {entry}=await call<{entry:QuantEntryDetail}>('intake/','POST',{requestKey:'admission_source_fixture01',code:`N=20\nclose.pct_change(N)\n${marker}`,language:'python'});
    entry.runs[0].createdAt='2020-01-01T00:00:00Z';await call(`entries/${entry.id}/`);
    return {entry,candidate:(await call<{items:QuantFactorCandidate[]}>(`factors/?entryId=${entry.id}`)).items[0]};
}
async function source(){
    const value=await seed(),market=await dataset(90);
    const experiment=await call<QuantExperiment>('experiments/','POST',{requestKey:'admission_experiment_001',name:'人工分层样例',datasetId:market.id,seeds:[{candidateId:value.candidate.id,bindings:[{name:'close',column:'close'}],parameters:[{name:'lookback',value:20}],variants:[[{name:'lookback',value:15}]]}],config:{seed:1,maxCandidates:8,generations:1,threshold:0,feeBps:5,slippageBps:5,gap:1,seconds:5}});
    quantState().experiments.find(row=>row.data.id===experiment.id)!.data.createdAt='2020-01-01T00:00:00Z';
    return {...value,experiment:await call<QuantExperiment>(`experiments/${experiment.id}/`)};
}
test('automatic admission is scoped and bad/unknown records cannot self-approve independence',async()=>{
    const {candidate}=await seed();const path=`factors/${candidate.id}/admissions/`;
    const first=await call<AdmissionPage>(path);assert.equal(first.summary.stage,'reusable');assert.equal(first.total,1);
    const raw=readAdmission(first.items[0].dataJson);assert.equal(raw.local_demo,true);assert.equal(raw.scopes.length,0);
    assert.equal((await call<Response>(path+'?limit=0')).status,400);assert.equal((await call<Response>('factors/missing/admissions/')).status,404);
    const before=quantState().admissionRecords.length;await call(path,'POST',{offset:0,limit:20});assert.equal(quantState().admissionRecords.length,before);
    assert.throws(()=>readAdmission(JSON.stringify({...raw,independent_validation:true})));
    assert.throws(()=>readAdmission(JSON.stringify({...raw,stage:'globally_verified'})));
    assert.equal(admissionValues([{name:'N',value:0},{name:'enabled',value:false}]),'N=0；enabled=false');
    assert.equal(admissionValues(undefined),'未知');
    assert.equal(admissionValues({p0:21},{p0:'period'}),'period (p0)=21');
});
test('history raises only its own formula; selecting a new version does not inherit the ancestor filter',async()=>{
    const {candidate,entry}=await source();
    const before=await call<AdmissionPage>(`factors/${candidate.id}/admissions/`);assert.equal(before.summary.stage,'historical');
    const evidence=before.items.map(row=>readAdmission(row.dataJson)).find(row=>row.basis.kind==='experiment')!;
    assert.ok(evidence.scopes.some(row=>row.status==='rejected'));assert.ok(evidence.scopes.some(row=>admissionValues(row.parameters).includes('20')));
    const history=await call<QuantFormulaHistory>(`factors/${candidate.id}/formula-versions/`);const definition=JSON.parse(history.definitionJson);definition.expression={op:'neg',args:[definition.expression]};
    const edited=await call<QuantFormulaEditResult>(`factors/${candidate.id}/formula-versions/`,'POST',{requestKey:'admission_formula_child01',definitionJson:JSON.stringify(definition),reason:'新定义独立积累'});
    assert.equal((await call<AdmissionPage>(`factors/${edited.candidate.id}/admissions/`)).summary.stage,'reusable');
    await call(`factors/${edited.candidate.id}/formula-versions/select/`,'POST',{requestKey:'admission_select_child01',reason:'切换研究版不继承实证',expectedSelectionId:history.currentSelectionId});
    const filtered=await call<{items:QuantFactorCandidate[]}>(`factors/?groupBy=lineage&admissionStage=historical&entryId=${entry.id}`);
    assert.equal(filtered.items.length,0);
    const archived=await call<AdmissionPage>(`factors/${candidate.id}/admissions/`);assert.equal(archived.summary.stage,'historical');
});
test('cancelled fixed evaluation retains unknown rules and planned bounds without promotion',async()=>{
    const {candidate,experiment}=await source();
    const plan=await call<QuantValidation>('validations/','POST',{requestKey:'admission_cancelled_fixed1',sourceRequestId:experiment.id,attemptId:'attempt-1',name:'人工固定范围',symbol:'',timeframe:'',intervals:10,seconds:10,criteria:{minEntries:1}});
    quantState().validations[0].data.createdAt='2020-01-01T00:00:00Z';const newer=await dataset(120);
    await call(`validations/${plan.id}/run/`,'POST',{datasetId:newer.id,mode:'fresh'});
    const cancelled=await call<QuantValidation>(`validations/${plan.id}/cancel/`,'POST',{});assert.equal(cancelled.evaluation?.status,'cancelled');
    const page=await call<AdmissionPage>(`factors/${candidate.id}/admissions/`);
    const row=page.items.find(row=>row.kind==='fixed_validation')!;assert.ok(row);assert.equal(row.stage,'reusable');assert.equal(row.outcome,'criteria_unknown');
    const data=readAdmission(row.dataJson);assert.equal(data.scopes[0].sample_status,'planned_not_completed');assert.equal(page.summary.stage,'historical');
    const proofs=await call<QuantVerification>(`factors/${candidate.id}/verification/`);
    const proof=proofs.items.map(row=>readVerification(row.dataJson)).find(row=>row.kind==='fixed_validation')!;
    assert.equal(proof.kind,'fixed_validation');if(proof.kind==='fixed_validation'){assert.deepEqual(proof.metrics,{});assert.equal(proof.publication_audit,null);assert.deepEqual(proof.levels,[]);}
});
test('legacy layer indexing is explicit and paged; source evidence collection never runs new models',async()=>{
    const {candidate}=await seed('LOCAL_ADMISSION_UNRECORDED');const path=`factors/${candidate.id}/admissions/`;
    assert.equal((await call<AdmissionPage>(path)).summary.stage,'unrecorded');
    await call(path,'POST',{offset:0,limit:1});assert.equal((await call<AdmissionPage>(path)).summary.stage,'reusable');
    const indexed=await call<{claim:string}>(`factors/${candidate.id}/verification/`,'POST',{kind:'fixed_validation',offset:0,limit:1});
    assert.equal(indexed.claim,'legacy_index_only_no_execution');
});
test('local evidence failure is inspectable and retryable, without a missing mock fallback',async()=>{
    const {candidate}=await seed('LOCAL_ADMISSION_ERROR_ONCE');const path=`factors/${candidate.id}/admissions/`;
    const failed=await call<Response>(path);assert.equal(failed.status,500);assert.match(await failed.text(),/重试后恢复/);
    const retried=await call<AdmissionPage>(path);assert.equal(retried.summary.stage,'reusable');assert.equal(readAdmission(retried.items[0].dataJson).local_demo,true);
});
