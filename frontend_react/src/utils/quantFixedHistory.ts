import {readMetric} from './quantExperimentMetric';
import {readStrategy} from './quantStrategy';
import {readCriteria,readCriteriaAssessment} from './quantValidationCriteria';
const object=(v: unknown): Record<string,unknown>=>{if (!v || typeof v!=='object' || Array.isArray(v)) throw new Error('历史固定验证对象无效');return v as Record<string,unknown>;};
const text=(v: unknown): string=>{if (typeof v!=='string') throw new Error('历史固定验证文本无效');return v;};
const number=(v: unknown): number=>{if (typeof v!=='number' || !Number.isFinite(v)) throw new Error('历史固定验证数值无效');return v;};
export function readFixedHistory(raw: unknown) {
    const v=object(raw),recipe=object(v.recipe),config=object(v.config),bounds=object(v.bounds),market=object(v.dataset),source=object(v.source),params=object(recipe.parameters);
    if (!['completed','failed','cancelled'].includes(String(v.status)) || !['fresh','replication'].includes(String(v.mode)) || v.historical_evaluation_exposed!==true || v.independent_validation!==false || v.scope!=='historical_fixed_outcome_for_new_hypotheses_not_unseen_evidence') throw new Error('历史固定验证不能作为本次独立证据');
    if (Object.values(params).some(p=>!['string','boolean','number'].includes(typeof p) || typeof p==='number' && !Number.isFinite(p))) throw new Error('历史实际参数无效');
    const mapping=recipe.parameter_names===undefined?{}:object(recipe.parameter_names);
    const threshold=number(config.threshold),strategy=config.strategy===undefined?undefined:readStrategy(config.strategy,threshold);
    const final=readMetric(v.final,strategy),baseline=readMetric(v.baseline,strategy,true);
    if ((v.status==='completed')!==!!final || !!final!==!!baseline) throw new Error('历史固定验证状态与成果不一致');
    const audit=(raw: unknown)=>{const value=object(raw);if (typeof value.complete_scan!=='boolean' || value.global_independent_validation!==false || value.external_prior_use!=='unattested' || !Number.isSafeInteger(value.conflict_count) || number(value.conflict_count)<0) throw new Error('历史固定验证审计范围无效');return {complete:value.complete_scan,conflicts:number(value.conflict_count)};};
    const authorization=audit(v.authorization_audit),publication=v.publication_audit===null?undefined:audit(v.publication_audit);
    if ((v.status==='completed')!==!!publication) throw new Error('历史固定验证缺少发布审计');
    const criteria=v.registered_criteria===undefined?undefined:readCriteria(v.registered_criteria);
    if (criteria && typeof v.imported_after_registration!=='boolean') throw new Error('历史登记标准缺少授权范围');
    const assessment=criteria?readCriteriaAssessment(v.criteria_assessment,criteria,String(v.status),{final:v.final,baseline:v.baseline},
        {mode:v.mode,imported_after_registration:v.imported_after_registration,audit:v.authorization_audit},v.publication_audit):undefined;
    if (!criteria && (v.criteria_assessment!==undefined || v.imported_after_registration!==undefined)) throw new Error('旧历史记录不能追加登记判定');
    return {status:text(v.status),mode:text(v.mode),symbol:text(market.symbol),timeframe:text(market.timeframe),start:text(bounds.start_timestamp),end:text(bounds.end_timestamp),
        sourceRequest:text(source.request_id),attempt:text(source.attempt_id),strategy,threshold,parameters:Object.entries(params).map(([key,value])=>[typeof mapping[key]==='string'?`${mapping[key]} (${key})`:key,String(value)]),
        feeBps:number(config.fee_bps),slippageBps:number(config.slippage_bps),error:text(v.error),final,baseline,authorization,publication,criteria,assessment};
}
