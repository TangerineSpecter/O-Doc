type QuantSourceSupplementResult=Omit<WireSupplementResult,'entry'>&{entry:QuantEntryDetail};
import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import type {QuantEntryDetail} from '../../types/api/quant.ts';
import type {QuantStageEvidence} from '../../types/api/quantWorkflow.ts';
import type {QuantSourceSupplementInput,QuantSourceSupplementResult as WireSupplementResult} from '../../types/api/quantSourceSupplement.ts';
import {resolveQuantFixtureRequest as resolveQuantRoute} from './testReadingFixture.ts';
import {quantState,resetQuantStateForTests} from './state.ts';

const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)},configurable:true});
Object.defineProperty(globalThis,'location',{value:new URL('http://localhost/?mockState=sample'),writable:true,configurable:true});
beforeEach(()=>{storage.clear();resetQuantStateForTests();Object.defineProperty(globalThis,'location',{value:new URL('http://localhost/?mockState=sample'),writable:true,configurable:true});});
const base='/api/quant/local-quant/';
async function invoke<T>(path:string,method='GET',body?:unknown):Promise<T> {
    return await resolveQuantRoute(new Request('http://localhost'+path,{method,headers:{Authorization:'Token local-demo-token','Content-Type':'application/json'},...(body ? {body:JSON.stringify(body)} : {})})) as T;
}
async function prepare() {
    const value=await invoke<{entry:QuantEntryDetail}>(base+'intake/','POST',{requestKey:'dependency_local_intake_01',title:'依赖补充人工样例',language:'python',code:'from vendor import helper\nN=20\ndef factor(close): return helper(close)',analyze:false});
    const entry=value.entry,source=entry.sources![0];
    const path=base+`entries/${entry.id}/sources/${source.id}/supplements/`;
    const input:QuantSourceSupplementInput={requestKey:'dependency_local_submit_01',expectedSourceId:source.id,reason:'补交依赖正文；本地流程演示不执行源码',
        files:[{name:'依赖/价格 滤波.py',code:'def helper(x):\r\n    return x + 1\r\n'}],analyze:true,modelId:''};
    return {entry,source,path,input};
}

test('补充创建新快照并只排队一次；原始文件、SHA与全局行号可追溯',async()=>{
    const {entry,source,path,input}=await prepare();
    const result=await invoke<QuantSourceSupplementResult>(path,'POST',input);
    const child=result.entry.sources![0];
    assert.equal(child.payload.parentSourceId,source.id);
    assert.equal(child.payload.files![0].code,source.payload.code);
    assert.equal(child.payload.files![1].code,input.files[0].code);
    assert.match(child.payload.files![1].contentHash,/^[a-f0-9]{64}$/);
    const lines=child.payload.code!.split(/\r\n|\r|\n/);
    assert.equal(lines[child.payload.files![1].startLine-1],'def helper(x):');
    assert.equal(child.materialCurrentSourceId,child.id);
    assert.equal(result.entry.runs.length,1);
    assert.equal(result.entry.runs[0].sourceId,child.id);
    assert.equal(result.entry.runs[0].workflow?.version,25);
    const replay=await invoke<QuantSourceSupplementResult>(path,'POST',input);
    assert.equal(replay.sourceId,child.id);assert.equal(replay.entry.runs.length,1);
    assert.equal(quantState().entries.find(row=>row.id===entry.id)!.sources!.find(row=>row.id===source.id)!.payload.code,source.payload.code);
    result.entry.runs[0].createdAt='2020-01-01T00:00:00Z';
    await invoke(base+`entries/${entry.id}/`);
    assert.equal(result.entry.runs[0].result.analysis?.parameterBindingVersion,2);
    assert.equal(result.entry.runs[0].result.analysis?.parameters[0].sourceBinding?.status,'resolved');
    assert.equal(result.entry.runs[0].result.analysis?.parameters[0].sourceBinding?.status,'resolved');
    assert.match(result.entry.runs[0].result.analysis!.parameters[0].sourceBinding!.status === 'resolved' ? result.entry.runs[0].result.analysis!.parameters[0].sourceBinding!.file : '',/人工流程样例/);
    const evidence=await invoke<QuantStageEvidence>(base+`entries/${entry.id}/runs/${result.entry.runs[0].id}/workflow/normalize/`);
    assert.equal(evidence.structure?.localDemo,true);
    assert.deepEqual(evidence.structure?.nodes.map(row=>row.name),child.payload.files!.map(row=>`${row.name}::<module>`));
    assert.equal(evidence.structure?.references.length,0);
    assert.match(evidence.structure!.diagnostics[0].message,/不运行Python解析器/);
    resetQuantStateForTests();
    const restored=await invoke<QuantEntryDetail>(base+`entries/${entry.id}/`);
    assert.equal(restored.sources![0].payload.files![1].code,input.files[0].code);
});

test('替换依赖保留旧版本；旧来源冲突、路径错误与重复文件不会透传后端',async()=>{
    const {entry,source,path,input}=await prepare();input.analyze=false;
    const first=await invoke<QuantSourceSupplementResult>(path,'POST',input);
    const stale=await invoke<Response>(path,'POST',{...input,requestKey:'dependency_local_stale_01'});assert.equal(stale.status,409);
    const next=base+`entries/${entry.id}/sources/${first.sourceId}/supplements/`;
    const secondInput={...input,requestKey:'dependency_local_replace_01',expectedSourceId:first.sourceId,files:[{name:input.files[0].name,code:'def helper(x):\n    return x - 1'}]};
    const second=await invoke<QuantSourceSupplementResult>(next,'POST',secondInput);
    assert.equal(second.entry.sources![0].payload.files!.length,2);
    assert.equal(second.entry.sources![0].payload.code!.split('SOURCE FILE: __source__.py').length,2);
    assert.equal(second.entry.sources!.find(row=>row.id===first.sourceId)!.payload.files![1].code,input.files[0].code);
    assert.equal(second.entry.sources!.find(row=>row.id===source.id)!.payload.code,source.payload.code);
    const current=base+`entries/${entry.id}/sources/${second.sourceId}/supplements/`;
    for (const name of ['../escape.py','__source__.py']) {
        const error=await invoke<Response>(current,'POST',{...secondInput,requestKey:'dependency_local_invalid_01',expectedSourceId:second.sourceId,files:[{name,code:'x=1'}]});assert.equal(error.status,400);
    }
});

test('无模型仍保留补充，错误态与跨条目引用明确返回失败而非501',async()=>{
    const {entry,source,path,input}=await prepare();input.modelId='missing-model';
    const saved=await invoke<QuantSourceSupplementResult>(path,'POST',input);
    assert.equal(saved.entry.runs.length,0);assert.match(saved.notice,/模型/);
    const foreign=await invoke<Response>(base+`entries/other/sources/${source.id}/supplements/`,'POST',input);assert.equal(foreign.status,404);
    const count=quantState().entries.find(row=>row.id===entry.id)!.sources!.length;
    Object.defineProperty(globalThis,'location',{value:new URL('http://localhost/?mockState=error'),writable:true,configurable:true});
    const failure=await invoke<Response>(path,'POST',input);assert.equal(failure.status,503);
    assert.equal(quantState().entries.find(row=>row.id===entry.id)!.sources!.length,count);
});

test('通达信参数表人工样例展示范围、刷新保留，CSV补充限对应语言',async()=>{
    const {checkParameterDomains} = await import('../../utils/quantParameterDomain.ts');
    const {decodeSourceFile} = await import('../../utils/quantIntake.ts');
    const bytes=new TextEncoder().encode('参数\t最小\t最大\t缺省\nN\t2\t60\t20').buffer;
    assert.equal(decodeSourceFile(bytes,'参数表.tsv','auto',true).code,'参数\t最小\t最大\t缺省\nN\t2\t60\t20');
    assert.throws(()=>decodeSourceFile(bytes,'参数表.tsv'),/源文件/);
    const {entry} = await invoke<{entry:QuantEntryDetail}>(base+'intake/','POST',{
        requestKey:'tdx_parameter_table_local01',title:'通达信参数表人工演示',language:'tongdaxin',
        code:'{ LOCAL_TDX_PARAMETER_TABLE }\nMOM:C/REF(C,N)-1;',description:'参数,最小,最大,缺省\nN,2,60,20'});
    entry.runs[0].createdAt='2020-01-01T00:00:00Z';
    const path=base+`entries/${entry.id}/`;
    const ready=await invoke<QuantEntryDetail>(path),report=ready.reports![0],parameter=report.data.parameters![0];
    assert.equal(report.data.parameterBindingVersion,2);assert.equal(parameter.name,'N');
    assert.equal(parameter.domain!.version,5);assert.equal(parameter.domain!.maximum,60);
    assert.equal(parameter.sourceBinding?.status,'resolved');
    if(parameter.sourceBinding?.status==='resolved') assert.equal(parameter.sourceBinding.kind,'external_parameter');
    assert.doesNotThrow(()=>checkParameterDomains([parameter],{N:20}));
    assert.throws(()=>checkParameterDomains([parameter],{N:61}),/上限/);
    const source=ready.sources![0];
    const supplement=await invoke<QuantSourceSupplementResult>(path+`sources/${source.id}/supplements/`,'POST',{
        requestKey:'tdx_parameter_table_attach01',expectedSourceId:source.id,reason:'补交原始参数表人工样例',
        files:[{name:'参数表.tsv',code:'参数\t最小\t最大\t缺省\nN\t2\t60\t20'}],analyze:false});
    assert.equal(supplement.entry.sources![0].payload.files![1].name,'参数表.tsv');
    resetQuantStateForTests();
    const restored=await invoke<QuantEntryDetail>(path);
    assert.deepEqual(restored.reports!.find(row=>row.id===report.id)!.data.parameters![0],parameter);
    const python=await prepare();
    const refused=await invoke<Response>(python.path,'POST',{...python.input,files:[{name:'参数.csv',code:'参数,最小,最大,缺省\nN,2,60,20'}]});
    assert.equal(refused.status,400);
    Object.defineProperty(globalThis,'location',{value:new URL('http://localhost/?mockState=error'),writable:true,configurable:true});
    assert.equal((await invoke<Response>(path)).status,503);
    Object.defineProperty(globalThis,'location',{value:new URL('http://localhost/?mockState=empty'),writable:true,configurable:true});
    assert.equal((await invoke<Response>(path)).status,404);
    Object.defineProperty(globalThis,'location',{value:new URL('http://localhost/?mockState=slow'),writable:true,configurable:true});
    assert.equal((await invoke<QuantEntryDetail>(path)).reports!.find(row=>row.id===report.id)!.data.parameters![0].domain!.version,5);
});
