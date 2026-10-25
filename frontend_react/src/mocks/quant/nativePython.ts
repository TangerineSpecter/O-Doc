/** Artificial local flow. Never invokes Python, Docker, a model or real prices. */
import {HttpResponse} from 'msw';
import type {NativeOptions,NativePythonInput,NativePythonRecord,NativeEnvironment,NativePlan,NativeResult} from '../../types/api/quantNativePython';
import type {QuantFactorCandidate} from '../../types/api/quant';
import {quantState,persistQuantState,quantId} from './state';
import {collectMockFactors} from './factors';
import {collectMockFeedback} from './feedback';
import {advanceRun} from './runs';
import {publishMockReport} from './research';
export interface MockNativePython {collection:string;input:NativePythonInput;data:NativePythonRecord;sourceCode:string;analysisSource?:string}
const fail=(status:number,msg:string)=>HttpResponse.json({code:status,msg,data:null},{status});
export const nativeMockEnvironment:NativeEnvironment={image_id:'sha256:'+'0'.repeat(64),os:'linux',architecture:'arm64',
    runtime:{protocol:'python-source-process-v1',python:'3.11.17',numpy:'2.3.4',pandas:'2.3.3',machine:'aarch64',supervisor_sha256:'0'.repeat(64),child_sha256:'0'.repeat(64)},
    limits:{network:'none',source_uid:65532,host_mounts:false,memory_mib:256,cpus:1,pids:32,tmp_mib:32,maximum_seconds:30,root_filesystem:'read_only'}};
const candidate=(collection:string,id:string)=>collectMockFactors(quantState().entries.filter(row=>row.collId===collection&&row.isValid)).find(row=>row.id===id);
export function mockNativeOptions(collection:string,factor:QuantFactorCandidate):NativeOptions {
    const source=quantState().entries.find(row=>row.id===factor.entryId&&row.collId===collection)?.sources?.find(row=>row.id===factor.sourceId);
    const code=source?.payload.code||'';
    const signatures=[...code.matchAll(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^\n)]*)\)/gm)].slice(0,40).map(match=>({name:match[1],supported:!match[2].includes('*'),arguments:match[2].split(',').filter(row=>row.trim()).map(row=>{const [name,...defaultText]=row.trim().split('=');return {name:name.trim().split(':')[0].trim(),defaultText:defaultText.join('=')};})}));
    return {source:source&&source.payload.language==='python'?{id:source.id,contentHash:'local-demo-source-hash',files:['__source__.py'],entrypoints:signatures.map(row=>row.name),signatures,textEncoding:'utf-8',note:'人工本地流程样例，没有执行源码'}:null,
        runner:{available:!code.includes('LOCAL_NATIVE_UNAVAILABLE'),environmentJson:JSON.stringify(nativeMockEnvironment),reason:code.includes('LOCAL_NATIVE_UNAVAILABLE')?'runner_image_unavailable':''},supported:'generic_python_function_fixed_sample',otherPlatforms:['pine','mql4','tongdaxin','jqdata'].map(platform=>({platform,available:false,reason:'native_runner_not_configured'}))};
}
function advance(record:MockNativePython) {
    const data=record.data;
    if (['pending','running'].includes(data.status)&&Date.now()-Date.parse(data.createdAt)>900){
        const input=record.input;const mismatch=record.sourceCode.includes('LOCAL_NATIVE_FAIL');const dependency=record.sourceCode.includes('LOCAL_NATIVE_DEPENDENCY');
        const count=input.rowCount;const comparison:NativeResult['comparison']=dependency?null:{status:mismatch?'fail':'pass',
            counts:{total_rows:count,warmup_rows:input.warmupBars,compared_rows:count-input.warmupBars,common_valid:Math.max(0,count-20),left_missing:20,right_missing:20,both_missing:20,missing_mismatches:0,value_mismatches:mismatch?1:0,within_tolerance:Math.max(0,count-20-(mismatch?1:0))},
            start:'2020-01-01T00:00:00Z',end:'2020-04-01T00:00:00Z',max_abs_error:mismatch?'0.1':'0',max_relative_error:mismatch?'0.1':'0',differences:mismatch?[{index:25,timestamp:'2020-01-26T00:00:00Z',left:0.1,right:0.2,kind:'value_mismatch'}]:[],limitations:['人工本地样例，不是原始函数实测']};
        const result:NativeResult={version:1,method:'original-python-fixed-output-v1',status:dependency?'failed':'completed',reason:dependency?'dependency_unavailable':'',native_values:dependency?null:Array.from({length:count},(_,i)=>i<20?null:0),comparison,independent_validation:false,platform_equivalence:'unverified'};
        data.status=result.status;data.verdict=comparison?.status||null;data.resultJson=JSON.stringify(result);
        if (input.analyze&&!record.analysisSource){
            const factor=candidate(record.collection,data.candidateId);const entry=quantState().entries.find(row=>row.id===factor?.entryId);
            if (entry&&factor){
                const saved=collectMockFeedback(entry,{requestKey:`native_review_${data.id}`,title:'原始Python验证 · 人工流程样例',targetSourceId:factor.sourceId,factorId:factor.id,experimentResultId:'',mode:'unknown',documentFormat:'json',
                    document:JSON.stringify({kind:'LOCAL_NATIVE_PYTHON',verdict:data.verdict||'unavailable',parameters:input.parameters}),platform:'generic Python · local demo',notes:'未执行真实源码、模型或行情',analyze:true,modelId:''});
                if (!(saved instanceof HttpResponse))record.analysisSource=saved.source.id;
            }
        }
    }
    if (record.analysisSource){
        const factor=candidate(record.collection,data.candidateId);const entry=quantState().entries.find(row=>row.id===factor?.entryId);
        const source=entry?.sources?.find(row=>row.id===record.analysisSource);const run=entry?.runs.find(row=>row.sourceId===source?.id);
        if (entry&&run){advanceRun(run,source);publishMockReport(entry);data.analysis={sourceId:source!.id,entryId:entry.id,runId:run.id,status:run.status,error:run.error||'',reportId:entry.reports?.find(row=>row.runId===run.id)?.id||null,previousReportId:entry.reports?.find(row=>row.sourceId===source!.id&&row.runId!==run.id)?.id||null,audit:run.nativeReviewWorkflow||null};}
    }
    persistQuantState();return data;
}
export async function resolveNativePython(request:Request,collection:string,identity:string,section?:string,action?:string) {
    const factor=section==='native-python'?candidate(collection,identity):undefined;
    if (section==='native-python'){
        if (!factor)return fail(404,'当前候选不存在');
        if (action==='options'&&request.method==='GET')return mockNativeOptions(collection,factor);
        if (request.method==='GET'){
            const records=quantState().nativePython.filter(row=>row.collection===collection&&row.data.candidateId===identity);
            return {total:records.length,items:records.slice(0,20).map(advance)};
        }
        if (request.method!=='POST'||action)return fail(405,'不支持此操作');
        const input=await request.json() as NativePythonInput;
        if (!/^[A-Za-z0-9_-]{16,64}$/.test(input.requestKey||'')||!input.name?.trim()||!Array.isArray(input.arguments)||!input.arguments.length||!Number.isInteger(input.rowCount)||input.rowCount<30||input.rowCount>20000)return fail(400,'请填写完整的原始函数固定验证方案');
        const old=quantState().nativePython.find(row=>row.collection===collection&&row.input.requestKey===input.requestKey);
        if (old)return JSON.stringify(old.input)===JSON.stringify(input)?advance(old):fail(409,'验证标识已用于其他方案');
        const options=mockNativeOptions(collection,factor);if (!options.source||input.sourceId!==options.source.id)return fail(400,'原始Python来源不一致');
        if (!options.runner.available)return fail(503,'本机运行器尚未就绪（人工样例）');
        const dataset=quantState().datasets.find(row=>row.collection===collection&&row.data.id===input.datasetId);
        if (!dataset||input.offset+input.rowCount>dataset.data.rowCount)return fail(400,'行情未覆盖固定片段');
        const sourceCode=quantState().entries.find(row=>row.id===factor.entryId)?.sources?.find(row=>row.id===factor.sourceId)?.payload.code||'';
        const plan:NativePlan={version:1,method:'original-python-fixed-output-v1',candidate:{id:factor.id,hash:factor.contentHash,parameters:Object.fromEntries(input.parameters.map(row=>[row.name,row.value])),bindings:Object.fromEntries(input.bindings.map(row=>[row.name,row.column]))},
            source:{id:factor.sourceId,hash:'local-demo-source-hash',main:'__source__.py',files:[{path:'__source__.py',sha256:'local-demo-text-hash',role:'primary'}]},dataset:{id:input.datasetId,hash:dataset.data.contentHash,offset:input.offset,row_count:input.rowCount},
            native:{entrypoint:input.entrypoint,arguments:input.arguments,index:input.index,output_column:input.outputColumn,seconds:input.seconds,argument_policy:'all_explicit_no_source_default_substitution'},policy:{absolute_tolerance:input.absoluteTolerance,relative_tolerance:input.relativeTolerance,warmup_bars:input.warmupBars},environment:nativeMockEnvironment,analyze:input.analyze};
        const data:NativePythonRecord={id:quantId('native'),candidateId:factor.id,name:input.name+' · 人工样例',createdAt:new Date().toISOString(),status:'pending',cancelRequested:false,error:'',verdict:null,contentHash:'local-demo-frozen-native',planJson:JSON.stringify(plan),resultJson:null,analysis:null};
        quantState().nativePython.unshift({collection,input:structuredClone(input),data,sourceCode});persistQuantState();return data;
    }
    const record=quantState().nativePython.find(row=>row.collection===collection&&row.data.id===identity);
    if (!record||!candidate(collection,record.data.candidateId))return fail(404,'原始Python验证不存在');
    if (request.method==='POST'&&section==='cancel'){
        if (['pending','running'].includes(record.data.status)){record.data.status='cancelled';record.data.cancelRequested=true;record.data.resultJson=JSON.stringify({version:1,method:'original-python-fixed-output-v1',status:'cancelled',reason:'cancelled',native_values:null,comparison:null,independent_validation:false,platform_equivalence:'unverified'} satisfies NativeResult);}
        persistQuantState();return record.data;
    }
    return request.method==='GET'&&!section?advance(record):fail(405,'不支持此操作');
}
