import {mockHistoryFacts,mockHistoryMarkdown} from './searchHistory';
/** Typed artificial UI workflow. No formula execution, independence proof or provider calls. */
import {mockNativeUsage} from './validationNativeUsage';
import {HttpResponse} from 'msw';
import type {QuantValidation,QuantValidationInput,QuantValidationAudit,QuantValidationPreview} from '../../types/api/quantValidation';
import type {QuantAIRun,QuantReport} from '../../types/api/quant';
import {quantState,persistQuantState,quantId} from './state';
import {mockDatasetTimestamp,type MockDataset} from './datasets';
import {demoExperimentResult} from './experimentResult';
import {experimentReviewSample} from './experimentReviews';
import {freezeCriteria,assessCriteria,criteriaStatusLabels,criteriaEligibilityLabels} from '../../utils/quantValidationCriteria';
export interface MockValidation {collection: string;resultCreatedAt?: string;input: QuantValidationInput;data: QuantValidation}
const fail=(status: number,msg: string)=>HttpResponse.json({code:status,msg,data:null},{status});
function audit(collection: string,dataset: MockDataset,start: string,end: string,exclude=''): QuantValidationAudit {
    const conflicts: QuantValidationAudit['conflicts']=[];
    for (const other of quantState().datasets.filter(r=>r.collection===collection && r.data.id!==dataset.data.id && r.data.symbol===dataset.data.symbol && r.data.timeframe===dataset.data.timeframe)) {
        if (Date.parse(other.data.start)<=Date.parse(end) && Date.parse(other.data.end)>=Date.parse(start)) conflicts.push({key:`dataset:${other.data.id}`,kind:'dataset',start:other.data.start,end:other.data.end,reason:'overlapping_exact_market',collection_id:collection});
    }
    for (const other of quantState().validations.filter(r=>r.collection===collection && r.data.id!==exclude && r.data.evaluation?.datasetId===dataset.data.id)) conflicts.push({key:`fixed_validation:${other.data.id}`,kind:'fixed_validation',start,end,reason:'overlapping_exact_market',collection_id:collection});
    const native=mockNativeUsage(collection,dataset,start,end);conflicts.unshift(...native.conflicts);
    return {version:2,scope:'same_owner_private_quant_exact_market_or_identical_rows_with_native_v2',complete_scan:native.complete,conflict_count:conflicts.length,conflicts:conflicts.slice(0,100),omitted_conflicts:Math.max(0,conflicts.length-100),range_status:conflicts.length?'reused':native.complete?'no_tracked_conflict':'unknown_incomplete_scan',external_prior_use:'unattested',global_independent_validation:false,
        limitations:['本地人工审计样例，仅用于界面流程；不覆盖真实后端完整审计。','登记后导入不证明外部未使用，当前使用状态可因新增记录变化。','人工样例计入原始Python预约提供的完整片段，包含预热；失败和取消仍保留使用记录。']};
}
function preview(record: MockValidation,dataset: MockDataset): QuantValidationPreview {
    const source=quantState().experiments.find(r=>r.collection===record.collection && r.data.id===record.input.sourceRequestId)!;
    const prior=quantState().datasets.find(r=>r.data.id===source.input.datasetId)!;
    const symbol=record.input.symbol || prior.data.symbol,timeframe=record.input.timeframe || prior.data.timeframe;
    if (dataset.data.symbol!==symbol || dataset.data.timeframe!==timeframe) throw new Error('验证行情标的和周期须与登记精确一致');
    let index=0;
    while (index<dataset.data.rowCount && Date.parse(mockDatasetTimestamp(dataset,index))<=Date.parse(prior.data.end)) index++;
    if (!index || index+record.input.intervals>=dataset.data.rowCount) throw new Error('需提供首个新开盘之前的历史与信号柱，以及完整固定评价区间');
    const start=mockDatasetTimestamp(dataset,index),end=mockDatasetTimestamp(dataset,index+record.input.intervals);
    const report=audit(record.collection,dataset,start,end,record.data.id);
    const after=Date.parse(dataset.data.createdAt)>Date.parse(record.data.createdAt);
    return {bounds:{start_timestamp:start,end_timestamp:end},audit:report,imported_after_registration:after,fresh_allowed:after && report.complete_scan && !report.conflict_count};
}
function report(record: MockValidation) {
    const evaluation=record.data.evaluation!;
    if (evaluation.reviews?.length) return;
    const source=quantState().experiments.find(r=>r.data.id===record.input.sourceRequestId)!;
    const context=source.data.reviewContext;
    const entry=quantState().entries.find(r=>r.id===context?.entryId && r.collId===record.collection);
    if (!entry) return;
    const now=new Date().toISOString(),id=quantId('fixed-review'),review=structuredClone(experimentReviewSample);
    const assessment=JSON.parse(evaluation.resultJson || '{}').criteria_assessment;
    if(source.data.selectionDiagnostic) {
        review.selectionReviewVersion=1;
        review.selectionReview={text:'人工样例：来源搜索的分块诊断与本次固定评价分开，不据此提升独立性。',evidenceRefs:['selection_diagnostic']};
        const diagnostic=JSON.parse(source.data.selectionDiagnostic.dataJson);
        if(diagnostic.search_history)review.selectionReview.searchHistoryFacts=mockHistoryFacts(diagnostic.search_history);
    }
    if (assessment) {
        review.criteriaReviewVersion=1;
        review.criteriaReview={status:assessment.status,eligibility:assessment.eligibility,text:'人工样例仅解释由样例指标算出的登记判定，没有调用模型。',evidenceRefs:['fixed_validation']};
    }
    review.title='固定验证解读 · 本地人工样例';review.summary='人工演示报告，没有实际回测或模型分析。已冻结的参数、数据使用审计与未知项应分别核对。';
    const run: QuantAIRun={id,entryId:entry.id,kind:'experiment_review',sourceId:context!.sourceId,experimentResultId:context!.experimentResultId,validationResultId:evaluation.resultId,
        targetLanguage:'',targetVersion:'',requirements:'',modelId:'local',modelName:'本地人工样例',status:'completed',result:{review},error:'',adoptedImplementationId:null,createdAt:now,updatedAt:now};
    const markdown=`# 固定验证解读 · 本地人工样例\n\n${review.summary}\n\n## 参数与研究评分\n\n本页沿用人工净值和研究评价样例，不据此推荐参数或宣称收益。真实报告将引用固定方案、费用、区间、基线和重用审计，并对五个研究维度评分；证据不足显示未知。\n\n## 证据边界\n\n单次评价不证明参数稳定或最优，外部使用及全局独立性未知。`;
    const criteriaMarkdown=assessment?`\n\n## 登记标准的代码判定\n\n${criteriaStatusLabels[assessment.status as keyof typeof criteriaStatusLabels]}；${criteriaEligibilityLabels[assessment.eligibility as keyof typeof criteriaEligibilityLabels]}。`:'';
    const saved: QuantReport={id:quantId('report'),sourceId:context!.sourceId,runId:id,schemaVersion:3,data:{format:'experiment_review',title:review.title,summary:review.summary},originalMarkdown:markdown+criteriaMarkdown+mockHistoryMarkdown(review.selectionReview?.searchHistoryFacts),markdown:markdown+criteriaMarkdown+mockHistoryMarkdown(review.selectionReview?.searchHistoryFacts),currentRevisionId:'',createdAt:now,revisions:[]};
    entry.runs.unshift(run);entry.reports ||= [];entry.reports.unshift(saved);evaluation.reviews=[{run,report:saved}];
}
export async function resolveValidationRoute(request: Request,collection: string,id?: string,action?: string) {
    const records=quantState().validations.filter(r=>r.collection===collection);
    if (request.method==='GET' && !id) {
        const source=new URL(request.url).searchParams.get('sourceRequestId');const values=records.filter(r=>r.input.sourceRequestId===source);
        return {total:values.length,items:values.slice(Number(new URL(request.url).searchParams.get('offset') || 0),Number(new URL(request.url).searchParams.get('offset') || 0)+20).map(r=>({id:r.data.id,name:r.data.name,sourceRequestId:r.data.sourceRequestId,createdAt:r.data.createdAt,contentHash:r.data.contentHash,evaluation:r.data.evaluation?{id:r.data.evaluation.id,datasetId:r.data.evaluation.datasetId,mode:r.data.evaluation.mode,status:r.data.evaluation.status}:null}))};
    }
    if (request.method==='POST' && !id) {
        const input=await request.json() as QuantValidationInput;
        const source=quantState().experiments.find(r=>r.collection===collection && r.data.id===input.sourceRequestId);
        if (!source || !['completed','partial'].includes(source.data.status)) return fail(400,'只能登记已完成的实际评价尝试');
        const output=JSON.parse(source.data.resultJson || '{}').output;
        const attempt=(output?.attempts || []).find((r:{id: string;status: string})=>r.id===input.attemptId && r.status==='evaluated');
        if (!attempt || !Number.isInteger(input.intervals) || input.intervals<5 || input.intervals>2000 || !Number.isInteger(input.seconds) || input.seconds<1 || input.seconds>60) return fail(400,'尝试或预算无效');
        const existing=records.find(r=>r.input.requestKey===input.requestKey);
        if (existing) return JSON.stringify(existing.input)===JSON.stringify(input)?existing.data:fail(409,'登记标识已用于其他方案');
        let criteria;
        try {criteria=input.criteria===undefined?undefined:freezeCriteria(input.criteria);} catch(cause) {return fail(400,cause instanceof Error?cause.message:'登记标准无效');}
        const dataset=quantState().datasets.find(r=>r.data.id===source.input.datasetId)!;
        const config=JSON.parse(source.data.planJson!).config;
        const plan={version:criteria?2:1,...(criteria?{criteria}:{}),local_demo:true,engine_version:'quant-fixed-validation-1',name:input.name,recipe:{...attempt.recipe,parameters:attempt.requested_parameters || {}},
            config:{threshold:config.threshold,fee_bps:config.fee_bps,slippage_bps:config.slippage_bps,...(config.strategy?{strategy:config.strategy}:{})},required_history:0,
            target:{symbol:input.symbol || dataset.data.symbol,timeframe:input.timeframe || dataset.data.timeframe,after_timestamp:dataset.data.end},source:{attempt_id:input.attemptId},intervals:input.intervals,seconds:input.seconds};
        const data: QuantValidation={id:quantId('validation'),name:input.name,sourceRequestId:input.sourceRequestId,createdAt:new Date().toISOString(),contentHash:'artificial-local-validation',planJson:JSON.stringify(plan),evaluation:null};
        quantState().validations.unshift({collection,input,data});persistQuantState();return data;
    }
    const record=records.find(r=>r.data.id===id);
    if (!record) return fail(404,'固定验证不存在或无权访问');
    if (request.method==='POST' && ['preview','run'].includes(action || '')) {
        try {
            const input=await request.json() as {datasetId: string;mode?: 'fresh'|'replication'};
            const dataset=quantState().datasets.find(r=>r.collection===collection && r.data.id===input.datasetId);
            if (!dataset) return fail(404,'验证行情不存在');
            if (action==='run' && record.data.evaluation) return record.data.evaluation.datasetId===input.datasetId && record.data.evaluation.mode===input.mode?record.data:fail(409,'计划已绑定一次行情');
            const prepared=preview(record,dataset);
            if (action==='preview') return {previewJson:JSON.stringify(prepared)};
            if (!['fresh','replication'].includes(input.mode || '')) return fail(400,'请选择验证模式');
            if (input.mode==='fresh' && !prepared.fresh_allowed) return fail(400,'当前不满足新数据验证资格');
            record.data.evaluation={id:quantId('validation-request'),datasetId:dataset.data.id,mode:input.mode!,status:'pending',error:'',cancelRequested:false,requestJson:JSON.stringify({version:2,...prepared,mode:input.mode}),resultId:null,resultJson:null,reviews:[]};
        } catch(cause) {return fail(400,cause instanceof Error?cause.message:'验证输入无效');}
    } else if (request.method==='POST' && action==='cancel') {
        if (record.data.evaluation?.status==='pending') {
            record.resultCreatedAt=new Date().toISOString();const evaluation=record.data.evaluation;
            evaluation.status='cancelled';evaluation.error='本地模拟停止，预约记录保留';
            const plan=JSON.parse(record.data.planJson);
            if (plan.version===2) {evaluation.resultId=quantId('validation-result');evaluation.resultJson=JSON.stringify({version:2,status:'cancelled',error:evaluation.error,output:null,publication_audit:null,
                criteria_assessment:assessCriteria(plan.criteria,'cancelled',null,JSON.parse(evaluation.requestJson),null)});}
        }
    } else if (request.method==='POST' && action==='review') {
        if (record.data.evaluation?.status!=='completed') return fail(400,'尚无完整固定验证');
        report(record);
    } else if (request.method==='GET') {
        const evaluation=record.data.evaluation;
        if (evaluation) {
            if (['completed','failed','cancelled'].includes(evaluation.status) && !record.resultCreatedAt) record.resultCreatedAt=new Date().toISOString();
            const dataset=quantState().datasets.find(r=>r.data.id===evaluation.datasetId)!;
            const prepared=JSON.parse(evaluation.requestJson) as QuantValidationPreview;
            evaluation.currentAuditJson=JSON.stringify(audit(collection,dataset,prepared.bounds.start_timestamp,prepared.bounds.end_timestamp,record.data.id));
            if (evaluation.status==='pending') {
                const source=quantState().experiments.find(r=>r.data.id===record.input.sourceRequestId)!;
                const engine=JSON.parse(source.data.planJson!).engine_version;
                const sample=demoExperimentResult(source.input,prepared.bounds.start_timestamp,prepared.bounds.end_timestamp,engine).envelope.output;
                record.resultCreatedAt=new Date().toISOString();evaluation.status='completed';evaluation.resultId=quantId('validation-result');
                const plan=JSON.parse(record.data.planJson),output={engine_version:'quant-fixed-validation-1',final:sample.holdout,baseline:sample.buy_hold_baseline,selection:'fixed_registered_recipe_no_search_or_test_based_selection',independent_validation:false};
                const publication=JSON.parse(evaluation.currentAuditJson);
                evaluation.resultJson=JSON.stringify({version:plan.version,status:'completed',error:'',output,publication_audit:publication,
                    ...(plan.version===2?{criteria_assessment:assessCriteria(plan.criteria,'completed',output,JSON.parse(evaluation.requestJson),publication)}:{})});
                report(record);
            }
        }
    } else return fail(405,'不支持此操作');
    persistQuantState();return record.data;
}
