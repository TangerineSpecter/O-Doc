import {strategySnapshot} from '../../utils/quantStrategy';
import {mockRepairDetail} from './repairs';
/** Artificial direct evidence projection from immutable local fixture records. */
import {HttpResponse} from 'msw';
import type {QuantFactorCandidate} from '../../types/api/quant';
import type {DirectVerification, ExperimentVerification, QuantVerification, VerificationKind, VerificationMetrics} from '../../types/api/quantVerification';
import type {QuantComparisonResult, QuantComparisonPlan} from '../../types/api/quantComparison';
import {quantState, persistQuantState} from './state';
import {mockQualification, mockQualificationSummary} from './qualification';
import {readNativePlan,readNativeResult} from '../../utils/quantNativePython';
type Row = QuantVerification['items'][number];
const base = (candidate: QuantFactorCandidate, kind: VerificationKind, target: string) => ({version: 1 as const, candidate_hash: candidate.contentHash, kind, target_id: target, target_hash: 'local-demo-' + target, scope: 'local_fixture_only', levels: [] as string[], claim: 'artificial_local_fixture_not_runtime_verification', local_demo: true as const});
const packed = (value: DirectVerification, createdAt: string): Row => ({id: 'local-verification-' + value.kind + '-' + value.target_id, kind: value.kind, targetId: value.target_id, createdAt, contentHash: 'local-demo-' + value.target_id, dataJson: JSON.stringify(value)});
function metricSummary(raw: Record<string, unknown>): VerificationMetrics {
    const value = Object.fromEntries(Object.entries(raw).filter(([key]) => !['curve', 'returns'].includes(key)));
    if (raw.execution) {const {trades: _trades, ...summary} = raw.execution as Record<string, unknown>; value.execution = {...summary, ledger_scope: 'summary_only'};}
    return value as VerificationMetrics;
}
function records(candidate: QuantFactorCandidate, collection: string): Row[] {
    const state = quantState(), result: Row[] = [];
    for (const record of state.experiments.filter(row => row.collection === collection && !!row.data.resultJson)) {
        const seed = record.input.seeds.find(row => row.candidateId === candidate.id), derived = candidate.data.derivation;
        const isDerived = derived?.requestId === record.data.id;
        if (!seed && !isDerived) continue;
        const envelope = JSON.parse(record.data.resultJson!);
        const direct = new Set<string>();
        const attempts: ExperimentVerification['attempts'] = [];
        for (const attempt of envelope.output?.attempts || []) {
            const match = seed ? attempt.operation === 'source_candidate' && attempt.parents[0] === candidate.id || attempt.operation === 'parameter_variant' && direct.has(attempt.parents[0]) : attempt.id === derived?.attemptId;
            if (!match) continue;
            direct.add(attempt.id);
            const values = attempt.requested_parameters || (seed ? Object.fromEntries(seed.parameters.map(row => [row.name, row.value])) : attempt.recipe?.parameters || {});
            attempts.push({id: attempt.id, status: attempt.status, reason: attempt.reason || '', operation: attempt.operation, fold: attempt.fold ?? null,
                parameters: Object.entries(values).map(([name, value]) => ({name, original_name: name, value: value as number | boolean | string})),
                bindings: seed?.bindings || candidate.data.inputs.map(row => ({name: row.name, column: row.name})), metrics: Object.fromEntries(Object.entries(attempt.metrics || {}).map(([key, value]) => [key, metricSummary(value as Record<string, unknown>)]))});
        }
        const evaluated = new Set(attempts.filter(row => row.status === 'evaluated').map(row => row.id));
        const output = envelope.output || {}, levels = evaluated.size ? ['calculation', 'historical_experiment'] : [];
        const heldout: ExperimentVerification['heldout'] = [];
        if (evaluated.has(output.selected_id) && output.holdout) {
            levels.push('heldout_observation'); heldout.push({number: null, attempt_id: output.selected_id, partitions: {}, metrics: metricSummary(output.holdout), status: 'prior_usage_unattested', prior_usage: 'unattested'});
        }
        const dataset = state.datasets.find(row => row.data.id === record.input.datasetId)?.data;
        result.push(packed({...base(candidate, 'experiment', 'result-' + record.data.id), kind: 'experiment', levels, request_id: record.data.id,
            dataset_hash: dataset?.contentHash || 'local-demo', market: {symbol: dataset?.symbol || '', timeframe: dataset?.timeframe || ''}, engine_version: JSON.parse(record.data.planJson!).engine_version,
            config: {...(record.input.config.strategy ? {strategy: strategySnapshot(record.input.config.strategy)} : {}), threshold: record.input.config.threshold, fee_bps: record.input.config.feeBps, slippage_bps: record.input.config.slippageBps, gap: record.input.config.gap},
            result_status: record.data.status, error: '', checkpoint_count: attempts.length, attempts, heldout, independent_validation: false}, record.data.createdAt));
        for (const fixed of state.validations.filter(row=>row.collection===collection && row.input.sourceRequestId===record.data.id && evaluated.has(row.input.attemptId) && !!row.data.evaluation?.resultJson && ['completed','failed','cancelled'].includes(row.data.evaluation.status))) {
            const evaluation=fixed.data.evaluation!,plan=JSON.parse(fixed.data.planJson),prepared=JSON.parse(evaluation.requestJson),saved=JSON.parse(evaluation.resultJson!);
            const market=state.datasets.find(row=>row.data.id===evaluation.datasetId)!.data;
            result.push(packed({...base(candidate,'fixed_validation',evaluation.resultId!),kind:'fixed_validation',
                source_request_id:record.data.id,source_attempt_id:fixed.input.attemptId,dataset_hash:market.contentHash,
                market:{symbol:market.symbol,timeframe:market.timeframe},mode:evaluation.mode,config:plan.config,recipe:plan.recipe,bounds:prepared.bounds,
                ...(saved.status!=='completed'?{result_status:saved.status,error:saved.error}:{}),metrics:metricSummary(saved.output?.final||{}),baseline:metricSummary(saved.output?.baseline||{}),publication_audit:saved.publication_audit,independent_validation:false,
                levels:saved.status==='completed'?['fixed_observation',...(saved.criteria_assessment?.eligibility==='fresh_scope_criteria_met'?['registered_criteria_met']:[])]:[],
                ...(plan.version===2?{registered_criteria:plan.criteria,criteria_assessment:saved.criteria_assessment,criteria_context:{mode:evaluation.mode,imported_after_registration:prepared.imported_after_registration,audit:prepared.audit}}:{})},fixed.resultCreatedAt || fixed.data.createdAt));
        }
    }
    for (const record of state.comparisons.filter(row => row.collection === collection && [row.data.leftId, row.data.rightId].includes(candidate.id))) {
        const plan = JSON.parse(record.data.planJson!) as QuantComparisonPlan, compared = JSON.parse(record.data.resultJson!) as QuantComparisonResult;
        const dataset = state.datasets.find(row => row.data.id === record.input.datasetId)?.data;
        result.push(packed({...base(candidate, 'comparison', record.data.id), kind: 'comparison', levels: ['sample_comparison'],
            market: {symbol: dataset?.symbol || '', timeframe: dataset?.timeframe || ''}, dataset_hash: plan.dataset_hash, policy: plan.policy,
            engine_version: plan.engine_version, sides: (['left', 'right'] as const).filter(key => plan[key].id === candidate.id).map(side => ({side,
                parameters: Object.entries(plan[side].parameters).map(([name, value]) => ({name, value})), bindings: Object.entries(plan[side].bindings).map(([name, column]) => ({name, column}))})),
            verdict: compared.status, evaluation_status: compared.evaluation_status, counts: compared.counts}, record.data.createdAt));
    }
    const entry = state.entries.find(row => row.id === candidate.entryId);
    for (const source of entry?.sources?.filter(row => row.payload.factorId === candidate.id && row.payload.provenance === 'external_feedback') || []) {
        const payload = source.payload;
        result.push(packed({...base(candidate, 'feedback', source.id), kind: 'feedback', ...(payload.feedbackVersion===4?{scope:'native_python_analysis_document'}:{}), levels: payload.feedbackVersion===4?[]:['user_reported_' + (['backtest', 'paper', 'live'].includes(payload.mode || '') ? payload.mode : 'other')],
            mode: payload.mode || 'unknown', platform: payload.platform || '', title: payload.title || '用户记录', target_source_id: payload.targetSourceId || '', document_format: payload.documentFormat || 'text',
            parser_status: payload.executionPreviewJson ? 'parsed' : 'not_structured', accounting_status: 'unavailable', counts: {}, structured: !!payload.executionPreviewJson, platform_authenticated: false}, source.createdAt));
    }
    for (const {data} of quantState().nativePython.filter(row=>row.collection===collection&&row.data.candidateId===candidate.id&&row.data.resultJson)){
        const plan=readNativePlan(data.planJson!);const computed=readNativeResult(data.resultJson!);
        result.push(packed({...base(candidate,'native_python',data.id),kind:'native_python',status:computed.status,reason:computed.reason,verdict:computed.comparison?.status||null,
            comparison:computed.comparison,parameters:plan.candidate.parameters,bindings:plan.candidate.bindings,
            dataset:{...plan.dataset,start:computed.comparison?.start||'2020-01-01T00:00:00Z',end:computed.comparison?.end||'2020-04-01T00:00:00Z'},native:{entrypoint:plan.native.entrypoint},environment:plan.environment,
            independent_validation:false,platform_equivalence:'unverified',economic_effectiveness:'unassessed',
            levels:computed.status==='completed'?['native_python_fixed_observation',...(computed.comparison?.status==='pass'?['native_python_fixed_match']:[])]:[]},data.createdAt));
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function resolveVerificationRoute(request: Request, candidate: QuantFactorCandidate, collection: string) {
    const values = new URL(request.url).searchParams;
    if (request.method === 'POST') {
        const body = await request.json() as {kind?: VerificationKind; offset?: number; limit?: number};
        const kind = body.kind ?? 'experiment', offset = body.offset ?? 0, limit = body.limit ?? 20;
        if (!['experiment', 'comparison', 'feedback','fixed_validation','native_python'].includes(kind) || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) return HttpResponse.json({code: 400, msg: '归集范围与分页无效', data: null}, {status: 400});
        quantState().verificationIndexed[candidate.id] = true; persistQuantState();
        const total = kind === 'experiment' ? quantState().experiments.filter(row => row.collection === collection).length : records(candidate, collection).filter(row => row.kind === kind).length;
        return {kind, scanned: Math.min(limit, Math.max(0, total - offset)), nextOffset: Math.min(total, offset + limit), total, hasMore: offset + limit < total, claim: 'legacy_index_only_no_execution'};
    }
    if (request.method !== 'GET') return HttpResponse.json({code: 405, msg: '不支持此操作', data: null}, {status: 405});
    const offset = Number(values.get('offset') || 0), limit = Number(values.get('limit') || 20);
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 40) return HttpResponse.json({code: 400, msg: '验证分页无效', data: null}, {status: 400});
    const all = records(candidate, collection), summary = candidate.verification || mockQualificationSummary(candidate);
    return {...summary, ...mockRepairDetail(candidate.id, candidate.reportId), qualificationJson: summary.qualificationId ? JSON.stringify(mockQualification(candidate)) : '', levels: [...new Set(all.flatMap(row => (JSON.parse(row.dataJson) as DirectVerification).levels))].sort(), total: all.length, items: all.slice(offset, offset + limit), independentValidation: false, platformEquivalence: 'unverified', economicEffectiveness: 'unassessed'} satisfies QuantVerification;
}

export {records as mockVerificationRecords};
