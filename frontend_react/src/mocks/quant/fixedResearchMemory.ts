/** Artificial, non-executing historical display facts; no independence or returns are calculated. */
import type {QuantAIRun,QuantFactorCandidate} from '../../types/api/quant';
import {quantState} from './state';
import {mockMemoryRelevance,type MockMemoryItem} from './researchMemoryContract';
type Metadata=Pick<QuantFactorCandidate,'id'|'data'>;
export function mockFixedResearchMemory(collection: string,run: QuantAIRun,factors: QuantFactorCandidate[],target: Metadata[],currentMarket?: {symbol: string;timeframe: string}) {
    const state=quantState(),items: MockMemoryItem[]=[];
    const records=state.validations.filter(r=>r.collection===collection && r.resultCreatedAt && Date.parse(r.resultCreatedAt)<Date.parse(run.createdAt) && r.data.evaluation?.resultId!==run.validationResultId && ['completed','cancelled','failed'].includes(r.data.evaluation?.status || '')).slice(0,2000);
    for (const r of records) {
        const evaluation=r.data.evaluation!,source=state.experiments.find(e=>e.data.id===r.input.sourceRequestId);
        const dataset=state.datasets.find(d=>d.data.id===evaluation.datasetId)?.data;
        if (!source || !dataset) continue;
        const attempts=JSON.parse(source.data.attemptsJson || '[]') as {id: string;parents: string[]}[];
        const roots=new Set<string>(),seen=new Set<string>();
        const visit=(id: string)=>{if (seen.has(id)) return;seen.add(id);const a=attempts.find(a=>a.id===id);if (a) a.parents.forEach(visit);else roots.add(id);};visit(r.input.attemptId);
        const parents=factors.filter(p=>roots.has(p.id));if (!parents.length) continue;
        const reason=mockMemoryRelevance(target,parents,!!currentMarket && currentMarket.symbol===dataset.symbol && currentMarket.timeframe===dataset.timeframe);
        if (!reason.rank_score) continue;
        const plan=JSON.parse(r.data.planJson),prepared=JSON.parse(evaluation.requestJson),result=JSON.parse(evaluation.resultJson || 'null');
        const metric=(value: Record<string,unknown> | undefined)=>{if (!value) return null;const copy=structuredClone(value);delete copy.curve;delete copy.returns;if (copy.execution) {const e=copy.execution as Record<string,unknown>;delete e.trades;e.ledger_scope='summary_only';}return copy;};
        const final=metric(result?.output?.final),baseline=metric(result?.output?.baseline);
        const negative=evaluation.status!=='completed' || plan.version===2 && result?.criteria_assessment?.status!=='met' || !!final && (Number(final.total_return)<=0 || Number(final.total_return)<=Number(baseline?.total_return) || Number(final.missing_signals)>0);
        items.push({id:evaluation.resultId || `cancelled-${r.data.id}`,kind:'fixed_validation',title:r.data.name,entry_id:parents[0].entryId,created_at:r.resultCreatedAt!,content_hash:'artificial-fixed-history',reason,has_negative_evidence:negative,
            evidence:{local_demo:true,result_id:evaluation.resultId,request_id:evaluation.id,plan_id:r.data.id,status:evaluation.status,error:evaluation.error,mode:evaluation.mode,
                source:{...plan.source,request_id:r.input.sourceRequestId},recipe:plan.recipe,config:plan.config,bounds:prepared.bounds,dataset:{symbol:dataset.symbol,timeframe:dataset.timeframe,content_hash:dataset.contentHash},
                final,baseline,authorization_audit:prepared.audit,publication_audit:result?.publication_audit || null,
                ...(plan.version===2?{registered_criteria:plan.criteria,criteria_assessment:result?.criteria_assessment,imported_after_registration:prepared.imported_after_registration}:{}),
                historical_evaluation_exposed:true,independent_validation:false,
                scope:'historical_fixed_outcome_for_new_hypotheses_not_unseen_evidence',claim:'artificial_local_ui_fixture_no_calculation_or_model'}});
    }
    return {items,scanned:records.length};
}
