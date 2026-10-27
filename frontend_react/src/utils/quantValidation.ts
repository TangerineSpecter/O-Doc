import type {QuantValidation,QuantValidationAudit,QuantValidationPreview} from '../types/api/quantValidation';
import {readStrategy} from './quantStrategy';
import {readMetric} from './quantExperimentMetric';
import {readCriteria,readCriteriaAssessment} from './quantValidationCriteria';
import {readLabelTarget,readLabelEvaluation} from './quantLabels';
const obj=(v: unknown): Record<string,unknown> => {if (!v || typeof v!=='object' || Array.isArray(v)) throw new Error('固定验证字段无效');return v as Record<string,unknown>;};
const text=(v: unknown): string => {if (typeof v!=='string') throw new Error('固定验证文本无效');return v;};
const num=(v: unknown): number => {if (typeof v!=='number' || !Number.isFinite(v)) throw new Error('固定验证数值无效');return v;};
const bool=(v: unknown): boolean => {if (typeof v!=='boolean') throw new Error('固定验证状态无效');return v;};
export function readAudit(raw: unknown): QuantValidationAudit {
    const v=obj(raw);
    const validScope=v.version===1?v.scope==='same_owner_private_quant_exact_market_or_identical_rows_v1':v.version===2 && v.scope==='same_owner_private_quant_exact_market_or_identical_rows_with_native_v2';
    if (!validScope || v.external_prior_use!=='unattested' || v.global_independent_validation!==false || !['reused','no_tracked_conflict','unknown_incomplete_scan'].includes(String(v.range_status))) throw new Error('固定验证审计版本无效');
    const count=num(v.conflict_count),omitted=num(v.omitted_conflicts);
    if (!Number.isInteger(count) || count<0 || !Number.isInteger(omitted) || omitted<0 || !Array.isArray(v.conflicts) || v.conflicts.length>100 || !Array.isArray(v.limitations) || v.limitations.some(t=>typeof t!=='string')) throw new Error('固定验证审计列表无效');
    const conflicts=v.conflicts.map(f=>{
        const r=obj(f),base={key:text(r.key),kind:text(r.kind),start:text(r.start),end:text(r.end),reason:text(r.reason),collection_id:text(r.collection_id)};
        if (v.version===2 && (!['dataset','experiment','comparison','fixed_validation','native_python'].includes(base.kind) || !base.key.startsWith(base.kind+':') || !Number.isFinite(Date.parse(base.start)) || !Number.isFinite(Date.parse(base.end)) || Date.parse(base.start)>Date.parse(base.end))) throw new Error('数据使用审计引用或区间无效');
        if (base.kind==='native_python') {
            const sample=obj(r.native_sample),offset=num(sample.offset),count=num(sample.row_count);
            if (v.version!==2 || !Number.isInteger(offset) || offset<0 || !Number.isInteger(count) || count<30 || count>20000 || offset+count>20000 || sample.scope!=='all_supplied_rows_including_warmup') throw new Error('原始Python使用片段无效');
            return {...base,native_sample:{offset,row_count:count,scope:'all_supplied_rows_including_warmup' as const}};
        }
        if (r.native_sample!==undefined) throw new Error('其他记录不能携带原始Python片段');
        return base;
    });
    const complete=bool(v.complete_scan);
    if (count!==conflicts.length+omitted || v.range_status!==(count?'reused':complete?'no_tracked_conflict':'unknown_incomplete_scan')) throw new Error('固定验证审计结论不一致');
    return {...v,complete_scan:complete,conflict_count:count,omitted_conflicts:omitted,conflicts} as unknown as QuantValidationAudit;
}
export function readPreview(raw: string): QuantValidationPreview {
    const v=obj(JSON.parse(raw)),audit=readAudit(v.audit),bounds=obj(v.bounds),after=bool(v.imported_after_registration),allowed=bool(v.fresh_allowed);
    if (allowed!==(after && audit.complete_scan && !audit.conflict_count)) throw new Error('新数据验证资格不一致');
    return {bounds:{start_timestamp:text(bounds.start_timestamp),end_timestamp:text(bounds.end_timestamp)},audit,imported_after_registration:after,fresh_allowed:allowed};
}
export function readValidation(value: QuantValidation) {
    const plan=obj(JSON.parse(value.planJson));
    if ((plan.version!==1 && plan.version!==2 && plan.version!==3) || plan.engine_version!==(plan.version===3?'quant-fixed-validation-2':'quant-fixed-validation-1')) throw new Error('固定验证方案版本暂不支持');
    const labelTarget=plan.version===3?readLabelTarget(plan.label_target):undefined;
    if(labelTarget && (typeof plan.intervals!=='number' || !Number.isInteger(plan.intervals) || plan.intervals>2000 || plan.intervals-labelTarget.horizon_bars+1<5))throw new Error('标签期限与登记区间不一致');
    if (plan.version!==3 && plan.label_target!==undefined) throw new Error('旧方案不能追加事后标签目标');
    const criteria=plan.version===2 || plan.version===3 && plan.criteria!==undefined?readCriteria(plan.criteria):undefined;
    if (plan.version===1 && plan.criteria!==undefined) throw new Error('旧方案不能追加事后登记标准');
    const config=obj(plan.config),recipe=obj(plan.recipe),target=obj(plan.target),source=obj(plan.source),parameters=obj(recipe.parameters);
    if (Object.values(parameters).some(v=>!['string','number','boolean'].includes(typeof v))) throw new Error('固定验证参数无效');
    const threshold=num(config.threshold),strategy=config.strategy===undefined?undefined:readStrategy(config.strategy,threshold);
    const envelope=value.evaluation?.resultJson?obj(JSON.parse(value.evaluation.resultJson)):undefined;
    if (envelope && (envelope.version!==plan.version || !['completed','failed','cancelled'].includes(String(envelope.status)))) throw new Error('固定验证成果版本无效');
    const output=envelope?.output?obj(envelope.output):undefined;
    if (output && (output.engine_version!==plan.engine_version || output.selection!=='fixed_registered_recipe_no_search_or_test_based_selection' || output.independent_validation!==false)) throw new Error('固定验证成果含未支持的选择或独立声明');
    if (envelope && (envelope.status==='completed')!==!!output) throw new Error('固定验证状态与成果不一致');
    const labelEvaluation=output && labelTarget?readLabelEvaluation(output.label_evaluation,labelTarget):undefined;
    if(labelEvaluation && labelEvaluation.window.end-labelEvaluation.window.start!==plan.intervals)throw new Error('标签结果与登记区间长度不一致');
    if (!labelTarget && output?.label_evaluation!==undefined) throw new Error('旧成果不能追加标签评价');
    const prepared=value.evaluation?obj(JSON.parse(value.evaluation.requestJson)):undefined;
    const assessment=criteria && envelope?readCriteriaAssessment(envelope.criteria_assessment,criteria,String(envelope.status),output,prepared,envelope.publication_audit):undefined;
    if (!criteria && envelope?.criteria_assessment!==undefined) throw new Error('未登记标准的历史成果不能追加判定');
    return {demo:plan.local_demo===true,intervals:num(plan.intervals),history:num(plan.required_history),seconds:num(plan.seconds),
        symbol:text(target.symbol),timeframe:text(target.timeframe),after:text(target.after_timestamp),attempt:text(source.attempt_id),
        expression:JSON.stringify(obj(recipe.expression),null,2),parameters:Object.entries(parameters).map(([key,v])=>[key,String(v)]),threshold,strategy,feeBps:num(config.fee_bps),slippageBps:num(config.slippage_bps),
        final:readMetric(output?.final,strategy),baseline:readMetric(output?.baseline,strategy,true),error:envelope?text(envelope.error):'',
        publicationAudit:envelope?.publication_audit?readAudit(envelope.publication_audit):undefined,
        currentAudit:value.evaluation?.currentAuditJson?readAudit(JSON.parse(value.evaluation.currentAuditJson)):undefined,criteria,assessment,labelTarget,labelEvaluation};
}
