import type {QuantAIRun, QuantEntryDetail, QuantImplementation, QuantRunInput, QuantCodeVersion, QuantVersionInput, QuantImplementationInput, QuantLanguage} from '../../types/api/quant';
import {mql4Sample, pineSample, pythonSample, quantModels} from './fixtures';
import {persistQuantState, quantId} from './state';

export function newVersion(implementation: QuantImplementation, input: Partial<QuantVersionInput>): QuantCodeVersion {
    const version: QuantCodeVersion = {id: quantId('version'), implementationId: implementation.id, code: input.code || '', note: input.note || '', language: input.language || implementation.language, languageVersion: input.languageVersion ?? implementation.languageVersion, dependencies: input.dependencies ?? implementation.dependencies, parameters: input.parameters ?? implementation.parameters, compileCheck: 'pending', runCheck: 'pending', resultCheck: 'pending', verificationNotes: '', sourceVersionId: input.sourceVersionId || null, createdAt: new Date().toISOString()};
    implementation.versions.unshift(version);
    Object.assign(implementation, {currentVersionId: version.id, language: version.language, languageVersion: version.languageVersion, dependencies: version.dependencies, parameters: version.parameters, updatedAt: version.createdAt});
    return version;
}
export function newImplementation(entry: QuantEntryDetail, input: QuantImplementationInput): QuantImplementation {
    const now = new Date().toISOString();
    const implementation: QuantImplementation = {id: quantId('implementation'), entryId: entry.id, name: input.name || '代码实现', language: input.language || 'python', languageVersion: input.languageVersion || '', dependencies: input.dependencies || '', parameters: input.parameters || '', currentVersionId: '', versions: [], createdAt: now, updatedAt: now};
    newVersion(implementation, input); entry.implementations.push(implementation); return implementation;
}
export function createRun(entry: QuantEntryDetail, input: QuantRunInput): QuantAIRun {
    const now = new Date().toISOString();
    const model = quantModels.models.find(row => row.id === input.modelId) || quantModels.models[0];
    const row: QuantAIRun = {id: quantId('run'), entryId: entry.id, kind: input.kind, sourceVersionId: input.sourceVersionId, targetLanguage: input.targetLanguage || '', targetVersion: input.targetVersion || '', requirements: input.requirements || '', modelId: model.id, modelName: model.name, status: 'pending', result: {}, error: '', preview: '本地任务已排队，不会发送真实模型请求。', adoptedImplementationId: null, createdAt: now, updatedAt: now};
    entry.runs.unshift(row); return row;
}
export function advanceRun(run: QuantAIRun) {
    if (run.status !== 'pending' && run.status !== 'running') return;
    const elapsed = Date.now() - new Date(run.createdAt).getTime();
    if (elapsed < 1200) return;
    run.status = 'running'; run.preview = '正在整理来源版本及平台差异…';
    if (elapsed >= 3200) {
        run.status = 'completed';
        const explanation = '这是本地模拟结果，用于验证工作流。示例按历史收盘价窗口计算变化率；初始缺失数据、复权口径、信号时点和目标平台的序列索引需要分别核对。';
        run.result = run.kind === 'explain' ? {explanation} : {code: run.targetLanguage === 'pine' ? pineSample : run.targetLanguage === 'mql4' ? mql4Sample : pythonSample, explanation, differences: 'Python 使用序列计算；Pine 和 MQL4 使用平台价格序列。此候选固定取本地演示脚本，不代表真实转换。', assumptions: '使用收盘价；默认窗口 20。请在真实研究中逐项核对。', dependencies: run.targetLanguage === 'python' ? 'pandas' : '目标平台内置价格序列', limitations: '尚未编译、运行或核对结果；不包含回测和交易执行。'};
        run.preview = '';
    }
    run.updatedAt = new Date().toISOString(); persistQuantState();
}
export function adoptRun(entry: QuantEntryDetail, run: QuantAIRun) {
    if (run.kind === 'explain') return {explanation: run.result.explanation || ''};
    const existing = entry.implementations.find(row => row.id === run.adoptedImplementationId);
    if (existing) return {implementation: existing};
    const implementation = newImplementation(entry, {name: `${(run.targetLanguage || 'python').toUpperCase()} · AI 转换`, language: (run.targetLanguage || 'python') as QuantLanguage, languageVersion: run.targetVersion, dependencies: run.result.dependencies || '', parameters: '', code: run.result.code || '', note: '采用 AI 候选，待人工验证', sourceVersionId: run.sourceVersionId});
    run.adoptedImplementationId = implementation.id; persistQuantState(); return {implementation};
}
