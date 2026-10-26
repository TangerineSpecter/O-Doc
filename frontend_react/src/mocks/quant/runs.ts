import {mockRepair} from './repairs';
import {prepareMockNativeReview,advanceMockNativeReview,refreshMockNativeResume} from './nativeReviews';
import {mockSourceFindings} from './findings';
import {workflowSample, advanceWorkflow} from './workflows';
import {mockFeedbackAnalysis} from './feedback';
import {freezeMockLibrary} from './libraryResearch';
import {mockExperimentReview} from './experimentProposals';
import type {QuantAIRun, QuantEntryDetail, QuantImplementation, QuantRunInput, QuantCodeVersion, QuantVersionInput, QuantImplementationInput, QuantLanguage, QuantSource} from '../../types/api/quant';
import {mql4Sample, pineSample, pythonSample, quantModels} from './fixtures';
import {persistQuantState, quantId, quantState} from './state';
import {analysisSample} from './research';
import {collectMockFactors, mockFactors} from './factors';
import {freezeMockResearchMemory, mockMemoryAssessment} from './researchMemory';
import {captureMockVersion} from './sourceSnapshots';

export function newVersion(implementation: QuantImplementation, input: Partial<QuantVersionInput>): QuantCodeVersion {
    const version: QuantCodeVersion = {id: quantId('version'), implementationId: implementation.id, code: input.code || '', note: input.note || '', language: input.language || implementation.language, languageVersion: input.languageVersion ?? implementation.languageVersion, dependencies: input.dependencies ?? implementation.dependencies, parameters: input.parameters ?? implementation.parameters, compileCheck: 'pending', runCheck: 'pending', resultCheck: 'pending', verificationNotes: '', sourceVersionId: input.sourceVersionId || null, createdAt: new Date().toISOString()};
    implementation.versions.unshift(version);
    Object.assign(implementation, {currentVersionId: version.id, language: version.language, languageVersion: version.languageVersion, dependencies: version.dependencies, parameters: version.parameters, updatedAt: version.createdAt});
    return version;
}
export function newImplementation(entry: QuantEntryDetail, input: QuantImplementationInput): QuantImplementation {
    const now = new Date().toISOString();
    const implementation: QuantImplementation = {id: quantId('implementation'), entryId: entry.id, name: input.name || '代码实现', language: input.language || 'python', languageVersion: input.languageVersion || '', dependencies: input.dependencies || '', parameters: input.parameters || '', currentVersionId: '', versions: [], createdAt: now, updatedAt: now};
    const version = newVersion(implementation, input); entry.implementations.push(implementation); captureMockVersion(entry, implementation, version); return implementation;
}
export function createRun(entry: QuantEntryDetail, input: QuantRunInput): QuantAIRun {
    const now = new Date().toISOString();
    const model = quantModels.models.find(row => row.id === input.modelId) || quantModels.models[0];
    const row: QuantAIRun = {id: quantId('run'), entryId: entry.id, kind: input.kind, sourceVersionId: input.sourceVersionId, sourceId: input.sourceId, experimentResultId: input.experimentResultId, targetLanguage: input.targetLanguage || '', targetVersion: input.targetVersion || '', requirements: input.requirements || '', modelId: model.id, modelName: model.name, status: 'pending', result: {}, error: '', preview: '本地任务已排队，不会发送真实模型请求。', adoptedImplementationId: null, createdAt: now, updatedAt: now};
    if (row.kind === 'analyze') row.workflow = workflowSample(row, entry, input);
    freezeMockLibrary(row);
    if (row.kind === 'feedback_review') {
        const source = entry.sources?.find(item => item.id === row.sourceId);
        row.feedbackMemory = {candidateIds: source?.payload.factorId || source?.payload.experimentResultId ? [] : collectMockFactors([entry]).filter(item => item.sourceId === source?.payload.targetSourceId).slice(0, 8).map(item => item.id),
            historyIds: (entry.sources || []).filter(item => item.id !== source?.id && item.payload.provenance === 'external_feedback' && item.payload.targetSourceId === source?.payload.targetSourceId && item.createdAt < (source?.createdAt || '')).slice(0, 4).map(item => item.id)};
    }
    if (row.kind!=='analyze') freezeMockResearchMemory(row, entry);
    prepareMockNativeReview(row,entry,input);
    entry.runs.unshift(row); return row;
}
export function advanceRun(run: QuantAIRun, source?: QuantSource) {
    refreshMockNativeResume(run);
    if (run.status !== 'pending' && run.status !== 'running') return;
    const elapsed = Date.now() - new Date(run.createdAt).getTime();
    if(advanceMockNativeReview(run,elapsed,source)){persistQuantState();return;}
    if (elapsed < 1200) return;
    run.status = 'running'; run.preview = '正在整理来源版本及平台差异…';
    if (advanceWorkflow(run, elapsed, source)) {persistQuantState(); return;}
    if (elapsed >= 3200) {
        run.status = 'completed';
        const explanation = '这是本地模拟结果，用于验证工作流。示例按历史收盘价窗口计算变化率；初始缺失数据、复权口径、信号时点和目标平台的序列索引需要分别核对。';
        run.result = run.kind === 'feedback_review' ? {feedback: mockFeedbackAnalysis(source)} : run.kind === 'experiment_review' ? {review: mockExperimentReview(run)} : run.kind === 'analyze' ? {analysis: structuredClone(analysisSample)} : run.kind === 'explain' ? {explanation} : {code: run.targetLanguage === 'pine' ? pineSample : run.targetLanguage === 'mql4' ? mql4Sample : pythonSample, explanation, differences: 'Python 使用序列计算；Pine 和 MQL4 使用平台价格序列。此候选固定取本地演示脚本，不代表真实转换。', assumptions: '使用收盘价；默认窗口 20。请在真实研究中逐项核对。', dependencies: run.targetLanguage === 'python' ? 'pandas' : '目标平台内置价格序列', limitations: '尚未编译、运行或核对结果；不包含回测和交易执行。'};
        const memoryAssessment = mockMemoryAssessment(run);
        if (run.result.feedback) Object.assign(run.result.feedback, memoryAssessment);
        if (run.result.review) Object.assign(run.result.review, memoryAssessment);
        if (run.kind === 'analyze' && !source?.payload.code && run.result.analysis) {
            for (const score of run.result.analysis.scores) if (!source?.payload.description && !source?.payload.webMarkdown || ['实现质量', '数据与时序可靠性'].includes(score.dimension)) score.score = null;
            run.result.analysis.totalScore = null;
        }
        if (run.result.analysis) {
            if ([14, 15, 16, 17].includes(run.workflow?.version || 0)) Object.assign(run.result.analysis, mockSourceFindings(source));
            Object.assign(run.result.analysis, {extractionVersion: 1, extractionNote: '本地演示提取；真实来源需要实际模型分析。', factors: mockFactors(source)});
            if ([8, 9, 10, 11, 12, 13, 14, 15, 16, 17].includes(run.workflow?.version || 0)) run.result.analysis.factorRepair = mockRepair(source, run.result.analysis.factors || []);
            if ((run.workflow?.version || 0)>=12) {const owner=quantState().entries.find(e=>e.id===run.entryId);if (owner) {freezeMockResearchMemory(run,owner);Object.assign(run.result.analysis,{sourceMemoryVersion:1,...mockMemoryAssessment(run)});}}
            if ((source?.payload.code?.includes('LOCAL_LIBRARY_WINDOW_10') || source?.payload.code?.includes('LOCAL_ARITHMETIC_PARAMETERS')) && run.result.analysis.factors?.[0]) run.result.analysis.parameters = structuredClone(run.result.analysis.factors[0].parameters);
        }
        run.preview = '';
    }
    run.updatedAt = new Date().toISOString(); persistQuantState();
}
export function adoptRun(entry: QuantEntryDetail, run: QuantAIRun) {
    if (run.kind === 'explain') return {explanation: run.result.explanation || ''};
    const existing = entry.implementations.find(row => row.id === run.adoptedImplementationId);
    if (existing) return {implementation: existing};
    const implementation = newImplementation(entry, {name: `${(run.targetLanguage || 'python').toUpperCase()} · AI 转换`, language: (run.targetLanguage || 'python') as QuantLanguage, languageVersion: run.targetVersion, dependencies: run.result.dependencies || '', parameters: '', code: run.result.code || '', note: '采用 AI 候选，待人工验证', sourceVersionId: run.sourceVersionId || undefined});
    run.adoptedImplementationId = implementation.id; persistQuantState(); return {implementation};
}
