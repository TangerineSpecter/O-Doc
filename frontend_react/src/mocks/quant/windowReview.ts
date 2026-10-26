/** Artificial local protocol coverage; never a real model or market evaluation. */
import type {QuantExperimentAnalysis} from '../../types/api/quant';
import type {QuantTemporalSensitivity} from '../../types/api/quantTemporalSensitivity';
import type {MockExperiment} from './experiments';

type Windows = NonNullable<NonNullable<QuantExperimentAnalysis['temporalParameterReview']>['windowReviews']>;
type Attempt = {id:string;fold?:number;operation:string;parents:string[];status:string;requested_parameters:Record<string,unknown>|null;
    inner_evaluation?:{folds:{number:number;metrics:Record<string,unknown>}[]}};

export function mockWindowReviews(record:MockExperiment, temporal:QuantTemporalSensitivity):Windows {
    const attempts=JSON.parse(record.data.attemptsJson || '[]') as Attempt[];
    const groups=temporal.families.flatMap(family=>[...family.axes,...family.contexts]);
    return Array.from({length:temporal.planned_windows},(_,index)=>{
        const outerFold=Math.floor(index/temporal.inner_folds)+1,innerFold=index%temporal.inner_folds+1;
        const scoped=attempts.filter(row=>row.fold===outerFold);
        const metrics=(row:Attempt)=>row.inner_evaluation?.folds.find(fold=>fold.number===innerFold)?.metrics || {};
        const complete=(row:Attempt)=>['train','validation'].every(key=>key in metrics(row));
        const completeInnerAttempts=scoped.filter(complete).length;
        const partialInnerAttempts=scoped.filter(row=>Object.keys(metrics(row)).length && !complete(row)).length;
        const ranges=groups.flatMap(group=>group.windows).find(row=>row.outer_fold===outerFold && row.inner_fold===innerFold)?.ranges;
        return {outerFold,innerFold,text:'人工逐窗样例：核对本窗参数、失败和缺测；没有运行真实模型或行情，不构成真实研究结论。',
            evidenceRefs:[`temporal_window:${outerFold}:${innerFold}`],facts:{
                ranges:ranges || {train:null,validation:null},startedAttempts:scoped.length,completeInnerAttempts,partialInnerAttempts,
                missingInnerAttempts:scoped.length-completeInnerAttempts-partialInnerAttempts,
                failedAttempts:scoped.filter(row=>['failed','rejected'].includes(row.status)).length,
                baselines:record.input.seeds.map(seed=>{
                    const row=scoped.find(attempt=>attempt.operation==='source_candidate' && attempt.parents.length===1 && attempt.parents[0]===seed.candidateId);
                    return {seedId:seed.candidateId,plannedParameters:structuredClone(seed.parameters),attemptId:row?.id || null,
                        attemptStatus:row?.status || 'not_run',effectiveParameters:row?.requested_parameters ? Object.entries(row.requested_parameters).map(([name,value])=>({name,value})) : null,
                        completeMetrics:!!row && complete(row)};
                })}};
    });
}

export function mockWindowMarkdown(review:QuantExperimentAnalysis):string {
    return (review.temporalParameterReview?.windowReviews || []).map(row=>{
        const facts=row.facts,range=facts.ranges.validation;
        const parameters=(values:{name:string;value:unknown}[]|null):string=>values===null?'未知':values.map(item=>`${item.name}=${JSON.stringify(item.value)}`).join('、') || '无参数';
        const statuses:Record<string,string>={evaluated:'已评价',failed:'失败',rejected:'未通过',not_run:'未执行'};
        const baselines=facts.baselines.map((baseline,index)=>`父代${index+1}（按原方案顺序）：计划基线${parameters(baseline.plannedParameters)}；实际配方${parameters(baseline.effectiveParameters)}；${statuses[baseline.attemptStatus] || '未知状态'}。`).join('\n\n');
        return `\n\n### 外折${row.outerFold} · 内层${row.innerFold}\n\n验证区间：${range?`${range.start} — ${range.end}`:'本地样例未提供'}\n\n已启动尝试${facts.startedAttempts}；本窗完整指标${facts.completeInnerAttempts}，部分指标${facts.partialInnerAttempts}，缺失指标${facts.missingInnerAttempts}；失败/拒绝${facts.failedAttempts}（可与保留指标重叠）。\n\n${baselines}\n\n${row.text}\n\n证据：${row.evidenceRefs.join('、')}`;
    }).join('');
}
