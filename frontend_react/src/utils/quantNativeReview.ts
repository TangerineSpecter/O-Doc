import type {NativeReviewOutcome} from '../types/api/quantNativeReview';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export const nativeReviewDecisions={accept:'本次审查未列出遗留问题',revise:'发现问题并生成修订',reject:'仍有问题，本次不发布'};
export const nativeReviewErrors:Record<string,string>={invalid_model_output:'模型输出或事实确认未通过校验',model_request_failed:'模型请求失败',budget_exhausted:'达到本次预算'};
export const nativeReviewIssues:Record<string,string>={side_inversion:'左右侧颠倒',tolerance_rule:'容差规则不符',actual_parameter:'实际参数不符',fact_contradiction:'与固定事实矛盾',unsupported_inference:'推断缺少依据',unresolved_scope:'范围仍不明确',protocol_upgrade:'补齐本次事实确认'};
export function readNativeReview(text:string):NativeReviewOutcome {
    if(text.length>2500000)throw new Error('审查记录超过读取上限');
    const value:unknown=JSON.parse(text);
    if(!object(value)||![2,3].includes(Number(value.version))||typeof value.version!=='number'||value.method!=='native-report-review-v1'||!['completed','failed'].includes(String(value.status))||typeof value.error!=='string'
        ||typeof value.elapsed_ms!=='number'||!object(value.raw)||typeof value.raw.text!=='string'||typeof value.raw.total_chars!=='number'||typeof value.raw.truncated!=='boolean'
        ||typeof value.raw.sha256!=='string'||!object(value.output))throw new Error('审查记录版本或原始返回不完整');
    if(value.version===3&&(!object(value.reused_from)||Object.keys(value.reused_from).sort().join(',')!=='content_hash,input_hash,outcome_id,run_id,step_id'
        ||!Object.values(value.reused_from).every(item=>typeof item==='string'&&item.length>0&&item.length<=100)
        ||value.status!=='completed'||value.error||value.elapsed_ms!==0||value.raw.text||value.raw.total_chars!==0||value.raw.truncated
        ||!object(value.usage)||value.usage.request_count!==0||!Array.isArray(value.usage.event_ids)||value.usage.event_ids.length
        ||value.usage.input_tokens!==null||value.usage.output_tokens!==null||value.usage.total_tokens!==null))throw new Error('复用阶段缺少完整原记录或伪装成新执行');
    if(value.status==='failed'&&(Object.keys(value.output).length||!value.error))throw new Error('失败审查不能携带正式成果');
    if(value.output.decision!==undefined&&!Object.prototype.hasOwnProperty.call(nativeReviewDecisions,String(value.output.decision)))throw new Error('未知审查判断');
    const issues=value.output.issues;
    if(issues!==undefined&&(!Array.isArray(issues)||issues.length>24||!issues.every(row=>object(row)&&['code','path','quote','explanation'].every(key=>typeof row[key]==='string')&&Array.isArray(row.evidence_refs)&&row.evidence_refs.every(item=>typeof item==='string'))))throw new Error('审查问题缺少逐字定位或事实引用');
    return value as unknown as NativeReviewOutcome;
}
