import type {AdmissionData,ResearchStage} from '../types/api/quantAdmission';
export const researchStageLabels:Record<ResearchStage,string>={unrecorded:'尚未归集分层',candidate:'候选 · 结构待补齐',reusable:'可复用受控定义',calculated:'有直接计算记录',historical:'有历史实验记录',fixed_observation:'有固定区间评价',registered_criteria_met:'有预登记达标范围'};
export const admissionOutcomeLabels:Record<string,string>={admitted:'结构准入通过',blocked:'结构仍有阻断',computed:'计算已完成',partial_computation:'仅部分计算完成',comparison_inconclusive:'对照结论仍不充分',no_computation:'未取得完整计算',observed:'已记录固定评价',criteria_met:'登记标准满足',reused_criteria_met:'标准满足 · 数据复用或核对不全',criteria_not_met:'登记标准未满足',criteria_unknown:'登记标准仍未知',output_match:'本次输出一致',output_mismatch:'本次输出不一致',user_reported:'用户报告 · 尚未验证'};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function readAdmission(text:string):AdmissionData {
    if(text.length>2500000)throw new Error('分层记录超过读取上限');
    const value:unknown=JSON.parse(text);
    const basis=object(value)?value.basis:null;
    if(!object(value)||value.version!==1||value.method!=='portable-research-admission-v1'||!Object.prototype.hasOwnProperty.call(researchStageLabels,String(value.stage))||value.stage==='unrecorded'
        ||!Object.prototype.hasOwnProperty.call(admissionOutcomeLabels,String(value.outcome))||!object(basis)||!['kind','id','content_hash'].every(key=>typeof basis[key]==='string')
        ||typeof value.candidate_hash!=='string'||typeof value.qualification_hash!=='string'||!Array.isArray(value.blockers)||!value.blockers.every(x=>typeof x==='string')
        ||!Array.isArray(value.scopes)||!value.scopes.every(row=>object(row)&&typeof row.observation_id==='string'&&typeof row.scope_key==='string'&&Object.prototype.hasOwnProperty.call(researchStageLabels,String(row.stage)))
        ||value.independent_validation!==false||value.platform_equivalence!=='unverified'||value.economic_effectiveness!=='unassessed')throw new Error('分层记录缺少固定范围或规则版本');
    return value as unknown as AdmissionData;
}
export function admissionValues(value:unknown):string {
    if(Array.isArray(value))return value.map(row=>object(row)?`${row.original_name||row.name||'未知'}=${JSON.stringify(row.value??row.column??null)}`:'未知').join('；')||'无';
    if(object(value))return Object.entries(value).map(([key,item])=>`${key}=${JSON.stringify(item)}`).join('；')||'无';
    return '未知';
}
export function admissionRange(value:unknown):string {
    if(!object(value))return '范围见原始证据';
    if(typeof value.start_timestamp==='string')return `${value.start_timestamp} → ${value.end_timestamp||'未知'}`;
    if(typeof value.start==='string')return `${value.start} → ${value.end||'未知'}`;
    const phases=['train','validation'].filter(key=>object(value[key]));
    return phases.map(key=>`${key==='train'?'训练':'验证'}：${admissionRange(value[key])}`).join('；')||'范围见原始证据';
}

export const admissionKindLabels:Record<string,string>={qualification:'结构与依赖检查',experiment:'本机历史实验',fixed_validation:'固定区间评价',comparison:'固定样本对照',native_python:'原始Python函数对照',feedback:'用户使用反馈'};
