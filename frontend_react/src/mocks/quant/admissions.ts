/** Artificial research layers from explicit local fixtures; no source or price execution. */
import {HttpResponse} from 'msw';
import type {QuantFactorCandidate} from '../../types/api/quant';
import type {AdmissionData,AdmissionPage,AdmissionScope,AdmissionSummary,ResearchStage} from '../../types/api/quantAdmission';
import type {DirectVerification} from '../../types/api/quantVerification';
import {researchStageLabels} from '../../utils/quantAdmission';
import {mockQualification} from './qualification';
import {mockVerificationRecords} from './verification';
import {persistQuantState,quantState} from './state';
export interface MockAdmission {candidateId:string;row:AdmissionPage['items'][number]}
const stages:ResearchStage[]=['unrecorded','candidate','reusable','calculated','historical','fixed_observation','registered_criteria_met'];
let dirty=false;
const failedOnce=new Set<string>();
function scopes(e:DirectVerification):{scopes:AdmissionScope[];outcome:string} {
    const common={scope_key:`local-scope-${e.target_id}`,observed_stage:null} as const;
    if(e.kind==='experiment')return {outcome:e.attempts.some(row=>row.status==='evaluated')?(e.result_status==='completed'?'computed':'partial_computation'):'no_computation',scopes:e.attempts.map(row=>({...common,observation_id:row.id,stage:row.status==='evaluated'?(e.result_status==='completed'?'historical':'calculated'):'reusable',market:e.market,parameters:row.parameters,bindings:row.bindings,config:{...e.config},sample:{...row.metrics},status:row.status,reason:row.reason}))};
    if(e.kind==='fixed_validation'){
        const eligible=e.criteria_assessment?.eligibility,complete=!e.result_status||e.result_status==='completed';
        return {outcome:!complete?(e.criteria_assessment?'criteria_unknown':'no_computation'):eligible==='fresh_scope_criteria_met'?'criteria_met':eligible==='criteria_not_met'?'criteria_not_met':eligible==='criteria_met_reuse_or_audit_unknown'?'reused_criteria_met':e.criteria_assessment?'criteria_unknown':'observed',scopes:[{...common,observation_id:e.target_id,stage:!complete?'reusable':eligible==='fresh_scope_criteria_met'?'registered_criteria_met':'fixed_observation',sample_status:complete?'observed':'planned_not_completed',reason:e.error,status:e.result_status,market:e.market,parameters:e.recipe.parameters,config:{...e.config},recipe:{...e.recipe},sample:{...e.bounds},criteria:e.registered_criteria?{...e.registered_criteria}:null,criteria_status:e.criteria_assessment?.status,checks:e.criteria_assessment?.checks}]};
    }
    if(e.kind==='native_python'||e.kind==='comparison'){
        const counts=e.kind==='native_python'?e.comparison?.counts:e.counts,verdict=e.verdict;
        const stage:ResearchStage=(counts?.common_valid||0)>0?'calculated':'reusable';
        const rows=e.kind==='native_python'?[{side:'original_python_function',parameters:e.parameters,bindings:e.bindings}]:e.sides;
        return {outcome:verdict==='pass'?'output_match':verdict==='fail'?'output_mismatch':stage==='calculated'?'comparison_inconclusive':'no_computation',scopes:rows.map(row=>({...common,observation_id:row.side,stage,market:e.kind==='comparison'?e.market:null,parameters:row.parameters,bindings:row.bindings,sample:e.kind==='native_python'?{...e.dataset}:null,verdict}))};
    }
    return {outcome:'user_reported',scopes:[{...common,observation_id:e.target_id,stage:'reusable'}]};
}
function refresh(candidate:QuantFactorCandidate,collection:string,legacy=false,batch?:{offset:number;limit:number}) {
    const state=quantState();if(legacy&&!state.admissionIndexed[candidate.id]&&!batch)return;
    const q=mockQualification(candidate),ready=q.reuse_status==='reusable';
    const base:ResearchStage=ready?'reusable':'candidate';
    const add=(basis:string,kind:string,target:string,createdAt:string,details:{scopes:AdmissionScope[];outcome:string})=>{
        const id=`local-admission-${candidate.id}-${basis}`;
        if(state.admissionRecords.some(row=>row.row.id===id))return;
        const configured=details.scopes.map(row=>({...row,observed_stage:row.stage,stage:ready?row.stage:base}));
        const stage=[base,...configured.map(row=>row.stage)].sort((a,b)=>stages.indexOf(b)-stages.indexOf(a))[0];
        const data:AdmissionData={local_demo:true,version:1,method:'portable-research-admission-v1',candidate_hash:candidate.contentHash,qualification_hash:`local-qualified-${candidate.id}`,basis:{kind,id:basis,content_hash:`local-evidence-${target}`},stage,outcome:details.outcome,blockers:q.blockers,scopes:configured,independent_validation:false,platform_equivalence:'unverified',economic_effectiveness:'unassessed'};
        state.admissionRecords.push({candidateId:candidate.id,row:{id,stage,outcome:data.outcome,createdAt,contentHash:`local-artificial-${id}`,kind,targetId:target,evidenceId:kind==='qualification'?null:basis,dataJson:JSON.stringify(data)}});dirty=true;
    };
    add('qualification','qualification',`local-qualification-${candidate.id}`,candidate.createdAt,{scopes:[],outcome:ready?'admitted':'blocked'});
    const evidence=mockVerificationRecords(candidate,collection);
    for(const row of batch?evidence.slice(batch.offset,batch.offset+batch.limit):evidence)add(row.id,row.kind,row.targetId,row.createdAt,scopes(JSON.parse(row.dataJson) as DirectVerification));
}
export function flushMockAdmissions(){if(dirty){dirty=false;persistQuantState();}}
export function mockAdmissionSummary(candidate:QuantFactorCandidate,collection:string):AdmissionSummary {
    const source=quantState().entries.find(row=>row.id===candidate.entryId)?.sources?.find(row=>row.id===candidate.sourceId);
    refresh(candidate,collection,!!source?.payload.code?.includes('LOCAL_ADMISSION_UNRECORDED'));
    const rows=quantState().admissionRecords.filter(row=>row.candidateId===candidate.id).map(row=>row.row);
    return {version:1,stage:rows.length?rows.reduce((best,row)=>stages.indexOf(best)>stages.indexOf(row.stage)?best:row.stage,'candidate' as ResearchStage):'unrecorded',recordCount:rows.length,reviewCount:rows.filter(row=>['blocked','output_mismatch','criteria_not_met','no_computation','comparison_inconclusive','partial_computation','criteria_unknown'].includes(row.outcome)).length,criteriaMetCount:rows.filter(row=>row.outcome==='criteria_met').length,criteriaNotMetCount:rows.filter(row=>row.outcome==='criteria_not_met').length,scope:'exact_formula_and_observation_configuration'};
}
export async function resolveAdmissionRoute(request:Request,candidate:QuantFactorCandidate,collection:string) {
    const code=quantState().entries.find(row=>row.id===candidate.entryId)?.sources?.find(row=>row.id===candidate.sourceId)?.payload.code||'';
    if(request.method==='GET'&&code.includes('LOCAL_ADMISSION_SLOW'))await new Promise(resolve=>setTimeout(resolve,1500));
    if(request.method==='GET'&&code.includes('LOCAL_ADMISSION_ERROR_ONCE')&&!failedOnce.has(candidate.id)){
        failedOnce.add(candidate.id);return HttpResponse.json({code:500,msg:'人工分层接口错误样例，重试后恢复',data:null},{status:500});
    }
    const params=new URL(request.url).searchParams;
    const body=request.method==='POST'?await request.json() as {offset?:number;limit?:number}:{};
    const offset=body.offset??Number(params.get('offset')||0),limit=body.limit??Number(params.get('limit')||20);
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>40)return HttpResponse.json({code:400,msg:'分层分页无效',data:null},{status:400});
    if(request.method==='POST'){
        const total=mockVerificationRecords(candidate,collection).length;
        refresh(candidate,collection,false,{offset,limit});
        if(offset+limit>=total)quantState().admissionIndexed[candidate.id]=true;
        dirty=true;flushMockAdmissions();return {scanned:Math.min(limit,Math.max(0,total-offset)),total,nextOffset:Math.min(total,offset+limit),hasMore:offset+limit<total,claim:'legacy_research_layer_index_only_no_execution'};
    }
    if(request.method!=='GET')return HttpResponse.json({code:405,msg:'不支持此操作',data:null},{status:405});
    const summary=mockAdmissionSummary(candidate,collection);flushMockAdmissions();
    const all=quantState().admissionRecords.filter(row=>row.candidateId===candidate.id).map(row=>row.row).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
    return {summary,total:all.length,items:all.slice(offset,offset+limit),independentValidation:false,platformEquivalence:'unverified',economicEffectiveness:'unassessed'} satisfies AdmissionPage;
}
export const validAdmissionStage=(value:string)=>!value||Object.prototype.hasOwnProperty.call(researchStageLabels,value);
