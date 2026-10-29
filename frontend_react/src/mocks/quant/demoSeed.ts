import type {QuantAIRun, QuantEntryDetail} from '../../types/api/quant';
import {fixtureTime, quantEntries} from './fixtures';
import {ensureSources, publishMockReport} from './research';
import {advanceRun} from './runs';
import {persistQuantState, quantState} from './state';

const examples: Record<string, {code: string; summary: string}> = {
    'local-momentum': {code: '', summary: '比较当前与历史收盘价，窗口不足时保留缺失值。'},
    'local-volatility': {code: 'import pandas as pd\n\ndef volatility(close: pd.Series, lookback: int = 20):\n    return close.pct_change().rolling(lookback).std()\n', summary: '用收益率的滚动标准差观察波动，样本不足时保留缺失值。'},
    'local-trend-strategy': {code: 'import pandas as pd\n\ndef trend(close: pd.Series, lookback: int = 20):\n    return close > close.rolling(lookback).mean()\n', summary: '用收盘价与滚动均线的关系展示趋势信号。'},
};

/** Add missing examples once to built-in entries, preserving saved local edits. */
export function seedDemoEntry(entry: QuantEntryDetail) {
    const example = examples[entry.id], state = quantState();
    if (!example || entry.collId !== 'local-quant' || state.demoSeededEntries?.includes(entry.id)) return;
    (state.demoSeededEntries ||= []).push(entry.id);
    const template = quantEntries[0];
    if (!entry.implementations.length) {
        const impl = structuredClone(template.implementations[0]);
        impl.id = `${entry.id}-implementation`; impl.entryId = entry.id; impl.name = `Python · ${entry.title}`;
        impl.versions = impl.versions.map((version, index) => ({...version, id: `${entry.id}-version-${index + 1}`, implementationId: impl.id, code: example.code, sourceVersionId: null}));
        impl.currentVersionId = impl.versions[0].id; entry.implementations.push(impl);
    }
    const impl = entry.implementations[0];
    const version = impl.versions.find(row => row.id === impl.currentVersionId) || impl.versions[0];
    if (!version) {persistQuantState(); return;}
    if (!entry.backtests.length) entry.backtests.push({...structuredClone(template.backtests[0]), id: `${entry.id}-backtest-demo`, entryId: entry.id, versionId: version.id, name: '历史样本 · 本地演示', conclusion: '仅供界面展示，未执行真实回测。'});
    if (!entry.attachments.length) entry.attachments.push(...template.attachments.map((item, index) => ({...structuredClone(item), id: `${entry.id}-attachment-${index}`, entryId: entry.id, implementationId: null, versionId: null, backtestId: null})));
    ensureSources(entry);
    const source = entry.sources!.find(row => row.codeVersionId === version.id);
    if (!source) {persistQuantState(); return;}
    const makeRun = (kind: 'analyze' | 'feedback_review', sourceId: string): QuantAIRun => ({id: `${entry.id}-demo-${kind}`, entryId: entry.id, kind, sourceId, sourceVersionId: version.id, targetLanguage: '', targetVersion: '', requirements: '', modelId: 'local-model', modelName: '本地样例模型', status: 'pending', result: {}, error: '', adoptedImplementationId: null, createdAt: '2020-01-01T00:00:00Z', updatedAt: fixtureTime});
    if (!entry.reports?.some(report => report.schemaVersion !== 5)) {
        const run = makeRun('analyze', source.id); advanceRun(run, source);
        if (run.result.analysis) {
            const analysis = run.result.analysis;
            analysis.title = `${entry.title} · 本地演示报告`;
            analysis.summary = `人工演示数据：${example.summary} 不是对源码的真实分析。`;
            if (entry.id !== 'local-momentum') {analysis.principle = example.summary; analysis.formula = ''; analysis.factors = [];}
        }
        entry.runs.push(run); publishMockReport(entry);
    }
    if (!entry.sources!.some(row => row.payload.provenance === 'external_feedback')) {
        const feedbackId = `${entry.id}-demo-feedback`;
        const feedback = {id: feedbackId, materialId: feedbackId, codeVersionId: null, createdAt: fixtureTime, payload: {provenance: 'external_feedback', feedbackVersion: 1, title: '样本运行记录 · 本地演示', targetSourceId: source.id, mode: 'backtest' as const, documentFormat: 'text' as const, document: 'N=20\nnet=-2%\ntrades=12\n仅为界面演示，未运行真实行情。', platform: '本地演示平台', notes: '示例数字不代表真实收益。'}};
        entry.sources!.push(feedback);
        const run = makeRun('feedback_review', feedbackId); advanceRun(run, feedback); entry.runs.push(run); publishMockReport(entry);
        const feedbackReport = entry.reports?.find(row => row.runId === run.id);
        if (feedbackReport && entry.reports) {entry.reports = entry.reports.filter(row => row !== feedbackReport); entry.reports.push(feedbackReport);}
    }
    persistQuantState();
}
