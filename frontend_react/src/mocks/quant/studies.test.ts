import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {resolveQuantRoute} from './routes.ts';
import {quantState,resetQuantStateForTests} from './state.ts';
import type {QuantEntryDetail,QuantFactorCandidate} from '../../types/api/quant.ts';
import type {QuantStudy,QuantConnector,QuantConnectorPreview,QuantExternalResponse,StudyGenerationData} from '../../types/api/quantStudy.ts';
import {hasStudyDefinition,readStudyGeneration,studyMarkdown} from '../../utils/quantStudy.ts';
import {connectorExample} from '../../utils/quantConnector.ts';
const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key),key:(n:number)=>[...storage.keys()][n]||null,get length(){return storage.size;}}});
const scenario=(name:string)=>Object.defineProperty(globalThis,'location',{configurable:true,value:new URL('http://localhost/?mockState='+name)});
beforeEach(()=>{storage.clear();resetQuantStateForTests();scenario('sample');});
const base='/api/quant/local-quant/';
async function call<T>(path:string,method='GET',data?:unknown):Promise<T>{return await resolveQuantRoute(new Request('http://localhost'+base+path,{method,headers:{Authorization:'Token local-demo',...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})})) as T;}
test('local data-free research runs two generations, keeps lineage and editable reports across refresh',async()=>{
    const {entry}=await call<{entry:QuantEntryDetail}>('intake/','POST',{requestKey:'study_normal_flow_source',code:'N=20\nclose/close.shift(N)-1'});
    entry.runs[0].createdAt='2020-01-01T00:00:00Z';await call(`entries/${entry.id}/`);
    const factor=(await call<{items:QuantFactorCandidate[]}>(`factors/?entryId=${entry.id}`)).items[0];
    const created=await call<QuantStudy>('ai-studies/','POST',{requestKey:'study_normal_flow_rounds',name:'无行情研究',direction:'改进定义与复用价值',market:'',candidateIds:[factor.id],maxGenerations:2,population:2,keep:1,modelId:'',evidenceIds:[]});
    quantState().aiStudies.find(r=>r.data.id===created.id)!.data.createdAt='2020-01-01T00:00:00Z';
    const result=await call<QuantStudy>(`ai-studies/${created.id}/`);
    assert.equal(result.status,'completed');assert.equal(result.generations.length,2);
    const first=readStudyGeneration(result.generations[0]).result!.candidates[0];
    const second=readStudyGeneration(result.generations[1]).result!.candidates[0];
    assert.equal(first.total_score,60);assert.deepEqual(second.parents,[first.candidate_id]);
    assert.equal(second.empirical_status,'unassessed');assert.equal(quantState().experiments.length,0);
    assert.match(studyMarkdown(result),/实证表现未评估/);
    assert.match(studyMarkdown(result),/程序公式核对/);
    const disputed = JSON.parse(result.generations[0].dataJson);
    disputed.format_repair = '已对唯一可验证的格式缺失进行修复，保留原稿。';
    disputed.result.candidates[0].formula_checks = [{parent_id:'parent',claim:'equivalent',status:'different',reason:'发现反例',parameter_scope:'同输入及参数',default_parameters_differ:false,counterexample:{inputs:{close:'100'},parameters:{N:'20'},parent:'-1',candidate:'0'}}];
    disputed.result.candidates[0].selected = false;
    const report = studyMarkdown({...result, generations:[{...result.generations[0],dataJson:JSON.stringify(disputed)}]});
    assert.match(report,/AI原评分（公式核对未通过）/);
    assert.match(report,/父代=-1，候选=0/);
    assert.match(report,/唯一可验证的格式缺失/);
    await call(`ai-studies/${created.id}/report/`,'POST',{markdown:'人工删减后的研究报告'});
    resetQuantStateForTests();assert.equal((await call<QuantStudy>(`ai-studies/${created.id}/`)).userReport,'人工删减后的研究报告');
    const all=(await call<{items:QuantFactorCandidate[]}>('factors/?groupBy=none')).items;
    assert.ok(all.some(f=>f.id===second.candidate_id&&f.data.formulaVersion?.origin==='ai_study'));
    scenario('empty');assert.equal((await call<{items:QuantStudy[]}>('ai-studies/')).items.length,0);
    scenario('error');assert.equal((await call<Response>('ai-studies/')).status,503);
});
test('dynamic connector previews arbitrary nested JSON and saves synthetic evidence without credentials',async()=>{
    const config={...connectorExample,mappings:[{target:'metrics.total_return',source:'$.custom.percent',type:'number',scale:.01},{target:'orders',source:'$.custom.rows',type:'array',fields:[{target:'price',source:'$.Px',type:'number'}]},{target:'metrics.sharpe',source:'$.custom.sharpe',type:'number'}]};
    const preview=await call<QuantConnectorPreview>('connector-preview/','POST',{configJson:JSON.stringify(config),responseJson:JSON.stringify({custom:{percent:'12.5',rows:[{Px:'2.5'}]}}),contextJson:'{}'});
    assert.deepEqual(JSON.parse(preview.normalizedJson),{metrics:{total_return:.125,sharpe:null},orders:[{price:2.5}]});
    const connector=await call<QuantConnector>('connectors/','POST',{name:'自定义结构',configJson:JSON.stringify(config),secretsJson:'{"api_key":"do-not-persist-test"}'});
    assert.equal(connector.hasSecrets,true);assert.ok(![...storage.values()].some(v=>v.includes('do-not-persist-test')));
    const response=await call<QuantExternalResponse>(`connectors/${connector.id}/execute/`,'POST',{contextJson:'{}'});
    assert.equal(JSON.parse(response.dataJson).local_demo,true);assert.equal(JSON.parse(response.dataJson).normalized.metrics.total_return,.125);
    resetQuantStateForTests();assert.equal((await call<{items:QuantExternalResponse[]}>('connector-responses/')).items.length,1);
});

test('an invalid candidate and a damaged generation remain readable in the report',()=>{
    const score=['逻辑清晰度','实现质量','数据与时序可靠性','参数可解释性','复现与复用价值'].map(dimension=>({dimension,score:3,reason:'说明',evidence:'依据'}));
    const data: StudyGenerationData={version:1,status:'completed',input:{parents:[]},result:{summary:'研究摘要',continue:false,stop_reason:'',empirical_status:'unassessed',candidates:[{
        index:0,parents:['seed'],operation:'mutation',definition:{name:'原始名称',formula:'x'},rationale:'失败理由',decision:'reject',selected:false,
        total_score:60,scores:score,risks:['未知'],validation_error:'缺少 parameters',candidate_id:null,empirical_status:'unassessed'}]},raw_output:'原稿',error:''};
    data.result!.candidates.push({...data.result!.candidates[0],index:1,validation_error:'',definition:{name:'有效候选',role:'signal',family:'momentum',summary:'可继续研究',formula:'x',inputs:[],output_type:'numeric_series',units:'ratio',timeframe:'daily',parameters:[],dependencies:[],limitations:'未回测',tags:[],expression:null}});
    const generation={id:'bad',number:1,dataJson:JSON.stringify(data),createdAt:''};
    const parsed=readStudyGeneration(generation);
    assert.equal(hasStudyDefinition(parsed.result!.candidates[0]),false);
    assert.equal(hasStudyDefinition(parsed.result!.candidates[1]),true);
    const study:QuantStudy={id:'s',name:'研究',userReport:'',planJson:'{}',status:'completed',error:'',createdAt:'',generations:[generation,{...generation,id:'broken',number:2,dataJson:'not-json'}]};
    const report=studyMarkdown(study);
    for(const value of ['研究摘要','缺少 parameters','原始名称','"formula": "x"','有效候选','可继续研究','第2代','not-json']) assert.ok(report.includes(value),value);
});
