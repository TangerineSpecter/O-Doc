import {HttpResponse} from 'msw';
import type {QuantStudy,QuantStudyInput,StudyDefinition,StudyCandidate,StudyGenerationData} from '../../types/api/quantStudy';
import type {QuantFactorCandidate,QuantFactorData} from '../../types/api/quant';
import {quantState,quantId,persistQuantState,mockScenario} from './state';
import {collectMockFactors} from './factors';
export interface MockStudy{collection:string;input:QuantStudyInput;data:QuantStudy}
const dimensions=['逻辑清晰度','实现质量','数据与时序可靠性','参数可解释性','复现与复用价值'];
const fail=(code:number,msg:string)=>HttpResponse.json({code,msg,data:null},{status:code});
function rawDefinition(value:QuantFactorData):StudyDefinition{
    return{name:value.name,role:value.role,family:value.family,summary:value.summary,formula:value.formula,inputs:value.inputs.map(({missingPolicy,...row})=>({...row,missing_policy:missingPolicy})),
        output_type:value.outputType,units:value.units,timeframe:value.timeframe,parameters:value.parameters.map(({defaultValue,sourceBinding:_source,domain:_domain,...p})=>({...p,default_value:defaultValue})),
        dependencies:value.dependencies,limitations:value.limitations,tags:value.tags,expression:value.expression};
}
function advance(record:MockStudy){
    if(!['pending','running'].includes(record.data.status)||mockScenario()==='slow')return;
    const target=Math.min(record.input.maxGenerations,Math.floor((Date.now()-Date.parse(record.data.createdAt))/1600));
    const state=quantState();
    while(record.data.generations.length<target){
        const number=record.data.generations.length+1;
        const previous=record.data.generations[record.data.generations.length-1];const last=previous?JSON.parse(previous.dataJson) as StudyGenerationData:null;
        const ids=last?.result?.candidates.filter(c=>c.selected).map(c=>c.candidate_id!)||record.input.candidateIds;
        const all=collectMockFactors(state.entries.filter(e=>e.collId===record.collection&&e.isValid));
        const parents=ids.flatMap(id=>all.filter(c=>c.id===id));if(!parents.length){record.data.status='failed';record.data.error='人工样例的父代不存在';break;}
        const generationId=quantId('study-generation'),candidates:StudyCandidate[]=[];
        for(let index=0;index<record.input.population;index++){
            const parent=parents[index%parents.length],definition=rawDefinition(parent.data);
            definition.name=`第${number}代 · ${index===0?'保留候选':'备选'} · 人工样例`;
            definition.summary='人工构造的研究流程样例，未调用模型或验证源码，不代表真实价值判断。';
            definition.formula=`(${definition.formula}) · 第${number}代人工变换${index+1}`;
            if(definition.expression&&definition.output_type==='numeric_series')definition.expression={op:'mul',args:[definition.expression,{op:'constant',value:number+index+1}]};
            const childId=index<record.input.keep?quantId('study-factor'):null;
            candidates.push({index,parents:parents.map(p=>p.id),operation:parents.length>1?'combination':'mutation',definition,rationale:index<record.input.keep?'人工样例：保留一个可比较的变体，继续研究。':'人工样例：与保留项近似，暂不进入下一代。',decision:index<record.input.keep?'keep':'reject',selected:index<record.input.keep,
                total_score:60,scores:dimensions.map(dimension=>({dimension,score:3,reason:'人工演示研究评分，未调用模型',evidence:'预制样例，不是源码或行情实证'})),risks:['实际价值、参数和运行效果尚未验证'],validation_error:'',candidate_id:childId,empirical_status:'unassessed',formula_checks:parents.map(p=>({parent_id:p.id,claim:'uncertain',status:'unknown',reason:'人工local样例，未执行程序核对',parameter_scope:'相同输入和参数下比较',default_parameters_differ:false,counterexample:null}))});
            if(childId){const versionId=quantId('study-version'),root=parent.data.formulaVersion?.rootId||parent.id;
                const data:QuantFactorData={...structuredClone(parent.data),name:definition.name,summary:definition.summary,formula:definition.formula,expression:definition.expression,evidence:[],
                    formulaVersion:{version:1,versionId,rootId:root,origin:'ai_study',parentCandidateIds:parents.map(p=>p.id),claim:'ai_research_hypothesis_not_empirical_validation'}};
                delete data.derivation;
                const child:QuantFactorCandidate={...structuredClone(parent),id:childId,data,createdAt:new Date().toISOString(),contentHash:'local-study-'+childId,expressionHash:'local-study-expression-'+childId,evidenceStatus:'ai_revised_unverified',modelName:'AI研究人工样例',curation:{...parent.curation,name:data.name},revisions:[],currentRevisionId:'',formulaLineage:undefined,admission:undefined};
                state.derivedFactors.unshift(child);state.formulaRoots[childId]=root;
                state.formulaEdits.push({id:versionId,rootId:root,parentId:parent.id,candidateId:childId,requestKey:'local-study-'+childId,definitionJson:JSON.stringify(definition),reason:'AI研究人工样例，未执行模型或行情'});
            }
        }
        const data:StudyGenerationData={version:1,status:'completed',input:{parents:parents.map(p=>({id:p.id,hash:p.contentHash,definition:rawDefinition(p.data)}))},result:{summary:`第${number}代人工流程样例：比较候选、保留差异并继续。没有调用真实模型或行情。`,continue:number<record.input.maxGenerations,stop_reason:number===record.input.maxGenerations?'达到设定代数预算':'',candidates,empirical_status:'unassessed'},raw_output:'人工local输出，不是真实模型回答',review:{summary:'人工样例：核对状态未知，未调用真实模型。',candidates:candidates.map(row=>({index:row.index,explanation:'人工演示复核，结论尚未验证。',checks:(row.formula_checks||[]).map(check=>({parent_id:check.parent_id,status:check.status}))}))},review_error:'',review_raw:'人工local复核样例',format_repair:'',error:''};
        record.data.generations.push({id:generationId,number,dataJson:JSON.stringify(data),createdAt:new Date().toISOString()});
    }
    if(record.data.generations.length>=record.input.maxGenerations){record.data.status='completed';record.data.error='已达到设定代数预算（人工样例）';}else if(record.data.status!=='failed')record.data.status='running';
}
export async function resolveStudyRoute(request:Request,collection:string,id?:string,action?:string){
    const state=quantState(),records=state.aiStudies.filter(r=>r.collection===collection);
    const record=records.find(r=>r.data.id===id);
    if(request.method==='GET'){records.forEach(advance);persistQuantState();return id?record?.data||fail(404,'研究不存在'):{items:records.map(r=>r.data),total:records.length};}
    if(request.method!=='POST')return fail(405,'不支持此操作');
    const text=await request.text();const body=(text?JSON.parse(text):{}) as QuantStudyInput&{markdown?:string};
    if(id){if(!record)return fail(404,'研究不存在');if(action==='cancel'){record.data.status='cancelled';record.data.error='用户停止了人工研究样例';}else if(action==='resume'){if(record.data.generations.length>=record.input.maxGenerations)return fail(400,'已达到研究代数');record.data.status='running';record.data.createdAt=new Date(Date.now()-record.data.generations.length*1600).toISOString();}else if(action==='report'){record.data.userReport=body.markdown||'';}else return fail(405,'不支持此操作');persistQuantState();return record.data;}
    const existing=records.find(r=>r.input.requestKey===body.requestKey);if(existing)return existing.data;
    if(!body.candidateIds?.length||!body.direction?.trim()||body.maxGenerations<1||body.maxGenerations>8||body.population<1||body.population>6||body.keep<1||body.keep>body.population)return fail(400,'研究设置无效');
    const all=collectMockFactors(state.entries.filter(e=>e.collId===collection&&e.isValid));
    if(body.candidateIds.some(key=>!all.some(c=>c.id===key)))return fail(400,'研究父代不存在');
    const data:QuantStudy={id:quantId('ai-study'),name:body.name,userReport:'',planJson:JSON.stringify({...body,version:5,local_demo:true}),status:'pending',error:'人工local研究流程，不调用模型或运行行情',createdAt:new Date().toISOString(),generations:[]};
    state.aiStudies.unshift({collection,input:body,data});persistQuantState();return data;
}
