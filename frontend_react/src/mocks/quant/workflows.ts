import {mockVocabulary} from './vocabulary';
import type {QuantAIRun, QuantEntryDetail, QuantRunInput, QuantSource} from '../../types/api/quant';
import type {QuantStageEvidence, QuantWorkflow, ResearchStage} from '../../types/api/quantWorkflow';
import {structureSample, fileStructureSample} from './sourceStructure';
import {localReadingSample} from './localReading';
import {readLocalReading} from '../../utils/quantLocalReading';
import {mockPlanningCapabilities} from './planningCapabilities';
const stages: [ResearchStage, string][] = [['normalize', '整理来源'], ['identify', '识别资料'], ['parameters', '参数与静态检查'], ['research', '研究分析'], ['extract', '提取因子'], ['compare', '检索比对'], ['review', '评价与审查'], ['plan', '设计实验'], ['publish', '发布报告']];
const emptyUsage = () => ({requestCount: 0, eventIds: [], inputTokens: null, outputTokens: null, totalTokens: null});

export function workflowSample(run: QuantAIRun, entry: QuantEntryDetail, input: QuantRunInput): QuantWorkflow {
    const old = entry.runs.find(row => row.id === input.resumeRunId);
    const crossSource = !!old && old.sourceId !== run.sourceId;
    const version = crossSource ? 28 : old?.workflow?.version || 25;
    const baseOrder: [ResearchStage, string][] = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28].includes(version) ? [...stages.slice(0, 5), ['repair', '修订候选定义'], ...stages.slice(5)] : stages;
    const order: [ResearchStage, string][] = [3, 5, 7, 9, 11, 13, 15, 17, 18, 20, 22, 24, 26, 27, 28].includes(version) ? [baseOrder[0], ['snippets', '片段静态解读'], ...baseOrder.slice(1)] : baseOrder;
    const reusable = old?.sourceId === run.sourceId && old?.modelId === run.modelId && old?.requirements === run.requirements;
    const restartIndex = input.restartStage ? order.findIndex(([stage]) => stage === input.restartStage) : order.length;
    const readingJson = [3, 5, 7, 9, 11, 13, 15, 17, 18, 20, 22, 24, 26, 27, 28].includes(version) ? !crossSource && reusable && old?.workflow?.localReadingEvidenceJson && restartIndex > 1 ? old.workflow.localReadingEvidenceJson : localReadingSample(run, entry, old, restartIndex > 1,version) : '';
    const reading = readingJson ? readLocalReading(readingJson) : undefined;
    const vocabularyReference = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28].includes(version) ? !crossSource && input.restartStage !== 'normalize' && old?.workflow?.vocabularyReference || mockVocabulary(entry.collId).reference : undefined;
    return {version, ...(vocabularyReference && {vocabularyReference}), resumeRunId: input.resumeRunId || '', restartStage: input.restartStage || '', maxModelCalls: ([3, 5, 7, 9, 11, 13, 15, 17, 18, 20, 22, 24, 26, 27, 28].includes(version) ? 7 : 6) + ([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28].includes(version) ? 1 : 0), maxSeconds: ([3, 5, 7, 9, 11, 13, 15, 17, 18, 20, 22, 24, 26, 27, 28].includes(version) ? 840 : 720) + ([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28].includes(version) ? 120 : 0),
        ...(reading && {localReadingEvidenceJson: readingJson, localReading: {selected: reading.units.length, reused: reading.units.filter(unit => unit.reused_from.outcome_id).length, omitted: reading.omitted, baselineRunId: reading.baseline.run_id || ''}}),
        stages: order.map(([stage, name], index) => {
            const previous = old?.workflow?.stages.find(row => row.stage === stage);
            const reuse = !crossSource && stage !== 'publish' && index < restartIndex && (stage === 'normalize' || reusable) && previous && ['completed', 'reused'].includes(previous.status);
            return {stage, name, status: 'waiting', stepId: '', inputHash: '', outcomeId: '',
                reusedFrom: reuse ? previous.outcomeId : '', error: '', modelName: ['normalize', 'compare', 'publish'].includes(stage) ? '' : run.modelName,
                elapsedMs: null, usage: null};
        })};
}

export function advanceWorkflow(run: QuantAIRun, elapsed: number, source?: QuantSource): boolean {
    const workflow = run.workflow;
    if (!workflow) return false;
    const fail = !workflow.resumeRunId && source?.payload.code?.includes('LOCAL_WORKFLOW_FAIL_RESEARCH');
    const failureIndex = workflow.stages.findIndex(row => row.stage === 'research');
    const stop = elapsed >= 3200 ? fail ? failureIndex : workflow.stages.length : Math.min(fail ? failureIndex : workflow.stages.length - 1, Math.max(0, Math.floor((elapsed - 1200) / 200)));
    for (let index = 0; index < workflow.stages.length; index++) {
        const row = workflow.stages[index];
        if (index > stop) continue;
        row.stepId = `local-stage-${run.id}-${row.stage}`;
        row.inputHash = `local-input-${run.sourceId}-${row.stage}`;
        row.status = index < stop ? row.reusedFrom ? 'reused' : 'completed' : fail && elapsed >= 3200 ? 'failed' : 'running';
        if (row.status !== 'running') {
            row.outcomeId = `local-outcome-${run.id}-${row.stage}`;
            row.elapsedMs = 0; row.usage = emptyUsage();
        }
        if (row.status === 'failed') row.error = '本地模拟研究分析失败；成功阶段已保留。';
    }
    if (fail && elapsed >= 3200) {
        run.status = 'failed'; run.error = '本地模拟研究分析失败'; run.preview = '';
        return true;
    }
    return false;
}

export function workflowEvidence(run: QuantAIRun, stage: string, source?: QuantSource): QuantStageEvidence | null {
    const row = run.workflow?.stages.find(item => item.stage === stage && item.stepId);
    if (!row) return null;
    const structure = stage === 'normalize' && (run.workflow?.version || 0) >= 2 && row.outcomeId && ['completed', 'reused'].includes(row.status)
        ? [19, 20, 21, 22, 23, 24, 25, 26, 27, 28].includes(run.workflow?.version || 0) && source?.payload.language === 'python' && source.payload.files?.length
            ? fileStructureSample(source.payload.code || '', 'python', source.payload.files)
            : structureSample(source?.payload.code || '', source?.payload.language || 'text') : null;
    return {stage: row.stage, name: row.name, inputHash: row.inputHash, outcomeHash: row.outcomeId,
        ...((run.workflow?.version===28&&['identify','parameters','research','extract','repair','review','plan'].includes(stage))&&{modelInputJson:JSON.stringify({version:1,status:'ready',prompt_hash:'1'.repeat(64),max_tokens:32000,json_output:true,...(stage==='repair'?{material_scope:{mode:'complete_source',notice:'人工 local 展示样例，不解析真实依赖或判断复用条件。'}}:{})})}),
        structure, sourceCode: structure ? source?.payload.code || '' : '',
        ...(stage === 'snippets' && row.outcomeId && {localReadingJson: run.workflow?.localReadingEvidenceJson}),
        inputJson: JSON.stringify({notice: '人工 local 样例，不代表真实模型记录', source_id: run.resolvedSourceId || run.sourceId,
            source_excerpt: source?.payload.code?.slice(0, 200) || source?.payload.description || '', stage: row.stage, requirements: run.requirements,
            ...(stage === 'plan' && [16,17,18,19,20,21,22,23,24,25,26,27,28].includes(run.workflow?.version || 0) ? {planning_capabilities: mockPlanningCapabilities()} : {}),
            ...(stage === 'normalize' && run.workflow?.vocabularyReference && {vocabulary_ref: run.workflow.vocabularyReference})}, null, 2),
        outcomeJson: row.outcomeId ? JSON.stringify({notice: '人工 local 样例', status: row.status, error: row.error,
            reused_from: row.reusedFrom, usage: row.usage, output: row.status === 'failed' ? {} : stage === 'repair' ? run.result.analysis?.factorRepair || {version: 1, selected: [], omitted: [], items: []} : {summary: `${row.name}阶段示例成果`}}, null, 2) : ''};
}

export function interruptWorkflow(run: QuantAIRun) {
    run.workflow?.stages.forEach(row => {if (row.status === 'running') row.status = 'interrupted';});
}
