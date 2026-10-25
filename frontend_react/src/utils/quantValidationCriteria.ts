import type {CriteriaKey,QuantCriteriaInput,QuantRegisteredCriteria,QuantCriteriaAssessment,QuantCriteriaRule} from '../types/api/quantValidationCriteria';

export const criteriaKeys:CriteriaKey[]=['min_total_return','max_drawdown','min_excess_return','min_signal_coverage','min_entries'];
const inputNames:Record<CriteriaKey,keyof QuantCriteriaInput>={min_total_return:'minTotalReturn',max_drawdown:'maxDrawdown',min_excess_return:'minExcessReturn',min_signal_coverage:'minSignalCoverage',min_entries:'minEntries'};
const definitions:Record<CriteriaKey,[string,'gte'|'lte','fraction'|'count']>={min_total_return:['total_return','gte','fraction'],max_drawdown:['max_drawdown','lte','fraction'],min_excess_return:['excess_return','gte','fraction'],min_signal_coverage:['signal_coverage','gte','fraction'],min_entries:['entries','gte','count']};
const tolerance=1e-12;
const scope='registered_recipe_parameters_and_interval_only' as const;
const record=(value:unknown):Record<string,unknown>=>value && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:{};
const finite=(value:unknown):value is number=>typeof value==='number' && Number.isFinite(value);
const count=(value:unknown):value is number=>finite(value) && Number.isSafeInteger(value) && value>=0;

export function freezeCriteria(input:QuantCriteriaInput):QuantRegisteredCriteria {
    if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error('登记标准需为数值字段对象');
    if (Object.keys(input).some(key=>!Object.values(inputNames).includes(key as keyof QuantCriteriaInput))) throw new Error('登记标准包含未知字段');
    const values={} as Record<CriteriaKey,number|null>;
    for (const key of criteriaKeys) {
        const value=input[inputNames[key]] ?? null;
        const min=key==='min_total_return'?-1:key==='min_excess_return'?-1000:0;
        const max=['max_drawdown','min_signal_coverage'].includes(key)?1:key==='min_entries'?100000:1000;
        if (value!==null && (!finite(value) || value<min || value>max || key==='min_entries' && !Number.isInteger(value))) throw new Error('登记标准数值、范围或次数无效');
        values[key]=value;
    }
    if (Object.values(values).every(value=>value===null)) throw new Error('启用登记标准时至少填写一项');
    return {version:1,...values,logic:'all',fraction_tolerance:tolerance,scope};
}

function sorted(value:unknown):unknown {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,sorted(item)]));
    return value;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));

export function readCriteria(raw:unknown):QuantRegisteredCriteria {
    const value=record(raw),input:QuantCriteriaInput={};
    for (const key of criteriaKeys) input[inputNames[key]]=value[key] as number|null;
    const expected=freezeCriteria(input);
    if (!same(value,expected)) throw new Error('登记标准版本、逻辑或固定容差不一致');
    return expected;
}

function observed(metric:string,output:unknown):number|null {
    const packet=record(output),final=record(packet.final),baseline=record(packet.baseline);
    if (metric==='excess_return') {
        const comparable=['bars','start','end'].every(key=>final[key]!==undefined && final[key]!==null && final[key]===baseline[key]);
        return comparable && finite(final.total_return) && finite(baseline.total_return)?final.total_return-baseline.total_return:null;
    }
    if (metric==='signal_coverage') return count(final.bars) && final.bars>0 && count(final.missing_signals) && final.missing_signals<=final.bars?1-final.missing_signals/final.bars:null;
    const value=final[metric];
    if (metric==='entries') return count(value)?value:null;
    return finite(value) && (metric!=='max_drawdown' || value>=0 && value<=1)?value:null;
}

/** Arithmetic over supplied metrics only, also used by honest local fixtures. */
export function assessCriteria(criteria:QuantRegisteredCriteria,status:string,output:unknown,request:unknown,publication:unknown):QuantCriteriaAssessment {
    readCriteria(criteria);
    const rows:QuantCriteriaRule[]=criteriaKeys.filter(key=>criteria[key]!==null).map(key=>{
        const [metric,relation,unit]=definitions[key],threshold=criteria[key]!;
        const value=status==='completed'?observed(metric,output):null,epsilon=unit==='count'?0:tolerance;
        const met=value!==null && (relation==='gte'?value+epsilon>=threshold:value-epsilon<=threshold);
        return {criterion:key,metric,relation,unit,threshold,observed:value,tolerance:epsilon,status:value===null?'unknown':met?'met':'not_met'};
    });
    const verdict=rows.some(row=>row.status==='not_met')?'not_met':rows.some(row=>row.status==='unknown')?'insufficient':'met';
    const prepared=record(request),authorization=record(prepared.audit),published=record(publication);
    const checks={calculation_completed:status==='completed',all_registered_rules_met:verdict==='met',
        fresh_mode:prepared.mode==='fresh',imported_after_registration:prepared.imported_after_registration===true,
        authorization_audit_complete:authorization.complete_scan===true,
        authorization_no_known_reuse:count(authorization.conflict_count) && authorization.conflict_count===0,
        publication_audit_complete:published.complete_scan===true,
        publication_no_known_reuse:count(published.conflict_count) && published.conflict_count===0};
    const eligibility=verdict==='met'?(Object.values(checks).every(Boolean)?'fresh_scope_criteria_met':'criteria_met_reuse_or_audit_unknown'):verdict==='not_met'?'criteria_not_met':'insufficient_evidence';
    return {version:1,status:verdict,rules:rows,eligibility,checks,scope,independent_validation:false,
        unknown_requirements:['external_prior_data_use','native_platform_equivalence','cross_market_robustness'],
        claim:'registered_thresholds_and_publication_time_tracked_scope_not_financial_certification'};
}

export function readCriteriaAssessment(raw:unknown,criteria:QuantRegisteredCriteria,status:string,output:unknown,request:unknown,publication:unknown):QuantCriteriaAssessment {
    const expected=assessCriteria(criteria,status,output,request,publication);
    if (!same(raw,expected)) throw new Error('登记标准判定、实测值或限定资格不一致');
    return expected;
}
export const criteriaLabels:Record<CriteriaKey,string>={min_total_return:'最低成本后收益',max_drawdown:'最大回撤上限',min_excess_return:'相对同成本基线最低超额收益',min_signal_coverage:'最低信号覆盖率',min_entries:'最少入场次数'};
export const criteriaStatusLabels={met:'满足本次登记标准',not_met:'未满足本次登记标准',insufficient:'判定证据不足'};
export const criteriaEligibilityLabels={fresh_scope_criteria_met:'发布时满足登记标准及已知新数据条件',criteria_met_reuse_or_audit_unknown:'数值标准已满足；普通复核或审计条件不足',criteria_not_met:'本次登记标准未满足',insufficient_evidence:'尚无足够计算证据判定'};
