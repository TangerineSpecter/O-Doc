import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {resolveQuantRoute} from './routes.ts';
import {quantState,resetQuantStateForTests} from './state.ts';
import type {NativeOptions,NativePythonInput,NativePythonRecord} from '../../types/api/quantNativePython.ts';
import type {QuantEntryDetail,QuantFactorCandidate,QuantAIRun} from '../../types/api/quant.ts';
import {readNativePlan,readNativeResult} from '../../utils/quantNativePython.ts';
import {readVerification} from '../../utils/quantVerification.ts';
import {buildArguments,argumentDraft} from '../../components/Quant/nativePython/form.ts';
import {detectQuantLanguage} from '../../utils/quantLanguage.ts';
const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)},configurable:true});
Object.defineProperty(globalThis,'location',{value:new URL('http://localhost/?mockState=sample'),writable:true,configurable:true});
beforeEach(()=>{storage.clear();resetQuantStateForTests();});
const base='/api/quant/local-quant/';
const invoke=async<T>(path:string,method='GET',body?:unknown):Promise<T>=>await resolveQuantRoute(new Request('http://localhost'+base+path,{method,headers:{Authorization:'local-test',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})) as T;
async function prepare(marker=''){
    const {entry}=await invoke<{entry:QuantEntryDetail}>('intake/','POST',{requestKey:'native_python_local_source',language:'python',code:`# ${marker}\ndef factor(close, lookback=20): return close/close.shift(lookback)-1`});
    entry.runs[0].createdAt='2020-01-01T00:00:00Z';await invoke(`entries/${entry.id}/`);
    const factors=await invoke<{items:QuantFactorCandidate[]}>('factors/');const factor=factors.items.find(row=>row.entryId===entry.id)!;
    const dataset=await invoke<{id:string}>('datasets/','POST',{name:'Synthetic native test',symbol:'SYNTHETIC',timeframe:'1d',timezone:'UTC',source:'isolated synthetic test',priceAdjustment:'none',csvText:'timestamp,open,high,low,close,volume\n'+Array.from({length:100},(_,i)=>`${new Date(Date.UTC(2020,0,1+i)).toISOString()},100,102,99,101,1000`).join('\n')});
    const input:NativePythonInput={requestKey:'native_python_local_request',name:'本地固定函数',sourceId:factor.sourceId,datasetId:dataset.id,
        bindings:[{name:'close',column:'close'}],parameters:[{name:'lookback',value:20}],entrypoint:'factor',arguments:[{name:'close',kind:'series',column:'close'},{name:'lookback',kind:'parameter',parameter:'lookback'}],
        index:'range',outputColumn:'',offset:0,rowCount:60,seconds:3,absoluteTolerance:1e-9,relativeTolerance:1e-8,warmupBars:0,analyze:true};
    return {factor,input};
}
test('local native flow covers source signatures, fixed parameters, AI report and direct evidence without execution',async()=>{
    const {factor,input}=await prepare();const route=`factors/${factor.id}/native-python/`;
    const options=await invoke<NativeOptions>(route+'options/');assert.equal(options.runner.available,true);assert.equal(options.source?.signatures[0].arguments[1].defaultText,'20');
    const empty=await invoke<{total:number}>(route);assert.equal(empty.total,0);
    const record=await invoke<NativePythonRecord>(route,'POST',input);assert.equal(record.status,'pending');
    quantState().nativePython[0].data.createdAt='2020-01-01T00:00:00Z';
    const result=await invoke<NativePythonRecord>(`native-python/${record.id}/`);assert.equal(result.verdict,'pass');
    assert.equal(readNativePlan(result.planJson!).candidate.parameters.lookback,20);assert.equal(readNativeResult(result.resultJson!).independent_validation,false);
    const entry=quantState().entries.find(row=>row.id===factor.entryId)!;const run=entry.runs.find(row=>row.sourceId===result.analysis?.sourceId)!;run.createdAt='2020-01-01T00:00:00Z';
    const analyzed=await invoke<NativePythonRecord>(`native-python/${record.id}/`);assert.equal(analyzed.analysis?.status,'completed');assert.ok(analyzed.analysis?.reportId);
    const report=entry.reports!.find(row=>row.id===analyzed.analysis!.reportId)!;assert.match(report.markdown,/人工样例|人工解读样例/);
    const evidence=await invoke<{items:{dataJson:string}[]}>(`factors/${factor.id}/verification/`);assert.ok(evidence.items.some(row=>readVerification(row.dataJson).kind==='native_python'));
    const duplicate=await invoke<NativePythonRecord>(route,'POST',input);assert.equal(duplicate.id,record.id);
    const conflict=await invoke<Response>(route,'POST',{...input,name:'changed'});assert.equal(conflict.status,409);
});
test('local native flow keeps negative output evidence, dependency failures, unavailable runtime and cancellation',async()=>{
    for(const marker of ['LOCAL_NATIVE_FAIL','LOCAL_NATIVE_DEPENDENCY','LOCAL_NATIVE_UNAVAILABLE']){
        resetQuantStateForTests();storage.clear();const {factor,input}=await prepare(marker);input.analyze=false;
        const record=await invoke<NativePythonRecord|Response>(`factors/${factor.id}/native-python/`,'POST',input);
        if (record instanceof Response){assert.equal(record.status,503);continue;}
        quantState().nativePython[0].data.createdAt='2020-01-01T00:00:00Z';
        const result=await invoke<NativePythonRecord>(`native-python/${record.id}/`);
        assert.equal(result.verdict,marker==='LOCAL_NATIVE_FAIL'?'fail':null);
        const parsed=readNativeResult(result.resultJson!);if(marker==='LOCAL_NATIVE_DEPENDENCY')assert.equal(parsed.native_values,null);
    }
    resetQuantStateForTests();storage.clear();const {factor,input}=await prepare();
    const record=await invoke<NativePythonRecord>(`factors/${factor.id}/native-python/`,'POST',input);
    const cancelled=await invoke<NativePythonRecord>(`native-python/${record.id}/cancel/`,'POST');assert.equal(cancelled.status,'cancelled');assert.equal(readNativeResult(cancelled.resultJson!).comparison,null);
});
test('argument editor requires explicit values and readers reject promoted or fabricated failed outputs',()=>{
    assert.throws(()=>buildArguments([argumentDraft('unknown')]),/尚未指定/);
    assert.throws(()=>buildArguments([{...argumentDraft('x'),kind:'literal',literalType:'number',literal:''}]),/明确填写/);
    assert.deepEqual(buildArguments([{...argumentDraft('enabled'),kind:'literal',literalType:'boolean',literal:'false'}]),[{name:'enabled',kind:'literal',value:false}]);
    const bad={version:1,method:'original-python-fixed-output-v1',status:'failed',reason:'dependency_unavailable',native_values:[0],comparison:null,independent_validation:false,platform_equivalence:'unverified'};
    assert.throws(()=>readNativeResult(JSON.stringify(bad)),/失败或取消/);
    assert.throws(()=>readNativeResult(JSON.stringify({...bad,native_values:null,independent_validation:true})),/证据边界/);
});
test('Python indicator/strategy function definitions are not Pine declarations',()=>{
    for(const name of ['indicator','strategy','study'])assert.equal(detectQuantLanguage(`def ${name}(close):\n    return close`),'python');
    assert.equal(detectQuantLanguage('//@version=2\nstrategy("sample")'),'pine');
    assert.equal(detectQuantLanguage('indicator("sample")'),'pine');
});
test('explicit rejection requires a fresh draft and stays visible after full regeneration',async()=>{
    const {factor,input}=await prepare('LOCAL_NATIVE_REVIEW_REJECT');
    const record=await invoke<NativePythonRecord>(`factors/${factor.id}/native-python/`,'POST',input);
    quantState().nativePython[0].data.createdAt='2020-01-01T00:00:00Z';
    const path=`native-python/${record.id}/`,entry=quantState().entries.find(row=>row.id===factor.entryId)!;
    const first=await invoke<NativePythonRecord>(path),old=entry.runs.find(row=>row.id===first.analysis?.runId)!;
    old.createdAt='2020-01-01T00:00:00Z';const rejected=await invoke<NativePythonRecord>(path);
    assert.equal(rejected.analysis?.status,'failed');assert.equal(rejected.analysis?.audit?.canResume,false);
    const route=`entries/${entry.id}/runs/`;
    const denied=await invoke<Response>(route,'POST',{kind:'feedback_review',sourceId:old.sourceId,nativeResumeRunId:old.id,requestKey:'native_reject_shortcut01'});assert.equal(denied.status,400);
    const values={kind:'feedback_review',sourceId:old.sourceId,requestKey:'native_reject_regenerate01'};
    const next=await invoke<QuantAIRun>(route,'POST',values);assert.notEqual(next.id,old.id);
    assert.equal((await invoke<QuantAIRun>(route,'POST',values)).id,next.id);
    next.createdAt='2020-01-02T00:00:00Z';const after=await invoke<NativePythonRecord>(path);
    assert.equal(after.analysis?.historyTotal,1);assert.equal(after.analysis?.history?.[0].runId,old.id);
    assert.equal(after.analysis?.history?.[0].audit?.stages[2].decision,'reject');assert.equal(after.analysis?.history?.[0].reportId,null);
    assert.equal(after.analysis?.audit?.stages[0].reusedFrom,undefined);assert.equal(after.analysis?.status,'failed');
});
