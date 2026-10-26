import type {QuantAIRun, QuantEntryDetail, QuantReport, QuantSource} from '../../types/api/quant';
import {collectMockFactors} from './factors';
import {buildSeed, initialSeed} from '../../components/Quant/experiments/plan';
import {quantState} from './state';
import {readResearchMemory, researchMemoryReference} from '../../utils/quantResearchMemory';
import type {QuantComputedExecution,QuantExecutionPreview} from '../../types/api/quantPlatformEvidence';
import {applyNestedMockPlan} from './planningCapabilities';

/** Synthetic plans exercise the same UI without interpreting arbitrary external code. */
export function mockFeedbackPlan(entry: QuantEntryDetail, source: QuantSource, report: QuantReport, run: QuantAIRun) {
    report.data.feedbackPlanningVersion = 1;
    report.data.feedbackPlanningNote = '本地人工样例：反馈尚未复算，以默认参数及邻近窗口演示重新检验；费用、滑点与阈值仅为假设。';
    report.proposal = null;
    const experiment = source.payload.experimentResultId ? quantState().experiments.find(row => row.collection === entry.collId && row.data.reviewContext?.experimentResultId === source.payload.experimentResultId) : undefined;
    const recorded = experiment?.input.seeds[0];
    const candidate = collectMockFactors(quantState().entries.filter(row => row.collId === entry.collId)).find(row => recorded ? row.id === recorded.candidateId : source.payload.factorId ? row.id === source.payload.factorId : run.feedbackMemory?.candidateIds.includes(row.id));
    if (!candidate) {
        report.data.feedbackPlanningNote = '目标来源尚无可计算因子。本地样例保留报告，补充来源分析后可再次研究。';
        return;
    }
    const seed = buildSeed(candidate, recorded ? {bindings: Object.fromEntries(recorded.bindings.map(row => [row.name, row.column])),
        parameters: Object.fromEntries(recorded.parameters.map(row => [row.name, JSON.stringify(row.value)]))} : initialSeed(candidate), true);
    const execution = source.payload.executionPreviewJson ? JSON.parse(source.payload.executionPreviewJson) as QuantExecutionPreview : null;
    const accountingRef = execution?.execution_accounting.status === 'mismatch' ? execution.execution_accounting.reconciliation.mismatches[0]?.ref : execution ? 'accounting:net_profit' : null;
    const compared=source.payload.feedbackVersion===5 && run.result.feedback?.computedExecutionJson?(JSON.parse(run.result.feedback.computedExecutionJson) as QuantComputedExecution).execution_parameter_comparison:undefined;
    const parameterRef=compared?.version===2?compared.ref:undefined;
    const data = {version: 1, local_demo: true, origin: 'external_feedback', name: '反馈复核 · 邻近窗口实验',
        hypothesis: '人工样例：检验外部反馈的差异是否对邻近窗口敏感。', falsification: '新行情中方向反复改变或成本后优势消失。',
        data_requirement: '新的同口径 OHLC 行情，覆盖窗口和三段分区；样例不计算真实表现。', evidence_refs: ['feedback', ...(accountingRef ? [accountingRef] : []), ...(parameterRef?[parameterRef]:[]), ...(readResearchMemory(run.researchMemoryJson)?.items.map(researchMemoryReference) || []).slice(0, 11-(accountingRef?1:0)-(parameterRef?1:0))],
        seeds: [{id: candidate.id, candidate: candidate.data, bindings: Object.fromEntries(seed.bindings.map(row => [row.name, row.column])),
            parameters: Object.fromEntries(seed.parameters.map(row => [row.name, row.value])),
            variants: seed.variants.map(group => Object.fromEntries(group.map(row => [row.name, row.value])))}],
        config: {seed: 42, max_candidates: 16, generations: 2, threshold: 0, fee_bps: 5, slippage_bps: 5, gap: 2, seconds: 30},
        evidence_hash: execution ? run.result.feedback?.evidenceHash || 'local-demo-feedback' : 'local-demo-feedback',
        feedback_evidence_hash: execution ? run.result.feedback?.evidenceHash || 'local-demo-feedback' : 'local-demo-feedback', status: 'unverified_requires_fresh_validation',
        constraint_status: 'local_demo_not_validated', baseline_status: recorded ? 'recorded_experiment_inputs' : candidate.data.formulaVersion?.origin === 'ai_repair' ? 'ai_revised_definition_defaults_not_native_or_live_settings' : candidate.data.formulaVersion ? 'authored_definition_defaults_not_actual_live_settings' : 'source_declared_defaults_not_actual_live_settings'};
    if ((source.payload.document || '').includes('LOCAL_NESTED_PLANNING')) {
        applyNestedMockPlan(data);
        report.data.feedbackPlanningNote = '本地人工反馈样例：多内层方案和预热仍是假设，反馈不构成收益验证，不自动执行。';
    }
    report.proposal = {id: `feedback-plan-${report.id}`.slice(0, 40), createdAt: report.createdAt,
        contentHash: 'local-demo-feedback-plan', dataJson: JSON.stringify(data), candidates: [structuredClone(candidate)]};
}
