import {parameterLabel} from '../../utils/quantParameterSource';
import {mockMemoryMarkdown} from './researchMemory';
import {mockSourceChangeMarkdown} from './sourceChangeReview';
import {mockFindingsMarkdown} from './findings';
import {publishMockRepairs} from './repairs';
import {mockFeedbackReport} from './feedback';
import {mockFeedbackPlan} from './feedbackPlanning';
import {mockInitialPlan} from './initialPlanning';
import {mockExperimentReport} from './experimentReviews';
import type { QuantAnalysis, QuantEntryDetail, QuantReport } from '../../types/api/quant';
import { quantId, quantState } from './state';
import {presentMockProposal} from './experimentProposals';
import {describeParameterDomain} from '../../utils/quantParameterDomain';
import {captureMockVersion, ensureMockSourcePointers, setMockMaterialCurrent} from './sourceSnapshots';

export const analysisSample: QuantAnalysis = {
    title: '动量计算 · 本地演示报告', kind: 'factor', summary: '本地样例用于演示收集、分析与修订，不是对输入代码的真实分析。',
    principle: '示例比较当前与历史收盘价；真实研究需检查价格数据口径及当时可得性。',
    formula: '$$M_t=P_t/P_{t-N}-1$$', usage: '用于观察区间变化，适用条件待数据验证。',
    risks: '尚未检查真实材料；不包含回测或收益结论。', validationPlan: '检查输入数据、窗口边界和不同参数邻域，再使用独立样本验证。',
    sourceFacts: ['示例使用历史价格窗口。'], assumptions: ['假定数据口径一致；这是本地演示。'], unknowns: ['真实市场与交易周期', '实际运行参数'],
    tags: ['动量', '演示'], parameters: [{ name: 'lookback', type: 'int', defaultValue: '20', category: 'signal', meaning: '历史窗口，单位为 bar', constraints: '正整数；示例值', effect: '窗口改变比较的时间跨度', suggestion: '在固定数据上比较邻近窗口，尚无推荐最优值', evidence: '本地 momentum 示例函数' }],
    scores: ['逻辑清晰度', '实现质量', '数据与时序可靠性', '参数可解释性', '复现与复用价值'].map(dimension => ({ dimension, score: 3, reason: '本地演示分值，仅用于界面校验。', evidence: '本地模拟样例，无真实评价含义。' })),
    totalScore: 60, evidenceStatus: 'static_unverified', rubricVersion: 'research-quality-v1',
};
export function ensureSources(entry: QuantEntryDetail) {
    entry.sources ||= [];
    entry.reports ||= [];
    for (const impl of entry.implementations) for (const version of impl.versions) captureMockVersion(entry, impl, version);
    ensureMockSourcePointers(entry);
}
export function acquireMockSources(entry: QuantEntryDetail) {
    ensureSources(entry);
    for (const run of entry.runs) {
        if (run.kind !== 'analyze' || !['pending', 'running'].includes(run.status) || run.resolvedSourceId || Date.now() - new Date(run.createdAt).getTime() < 1200) continue;
        const source = entry.sources!.find(row => row.id === run.sourceId);
        if (!source?.payload.url || source.payload.fetchStatus === 'fetched' || source.payload.provenance==='source_supplement') continue;
        const failed = source.payload.url.includes('fetch-error');
        const snippet = 'def momentum(close, lookback=20):\n    return close.pct_change(lookback)';
        const snapshot = {id: quantId('source'), materialId: source.materialId, codeVersionId: null, createdAt: new Date().toISOString(),
            payload: {...source.payload, provenance: 'web_fetch', originSourceId: source.id,
                fetchedAt: new Date().toISOString(), fetchStatus: failed ? 'failed' : 'fetched',
                fetchError: failed ? '本地模拟：网页限制访问，请补充代码与说明' : '', finalUrl: failed ? '' : source.payload.url,
                webMarkdown: failed ? '' : `# 本地网页快照演示\n\n这只是流程样例，没有访问真实网址。\n\n\`\`\`python\n${snippet}\n\`\`\``,
                code: source.payload.code || (failed ? '' : snippet), language: source.payload.code || failed ? source.payload.language || 'text' : 'python',
                codeOrigin: source.payload.code ? 'submitted' : failed ? 'none' : 'web_extracted'}};
        entry.sources!.unshift(snapshot);
        setMockMaterialCurrent(snapshot);
        run.resolvedSourceId = snapshot.id;
        if (failed && !snapshot.payload.code && !snapshot.payload.description) {
            run.status = 'failed'; run.error = snapshot.payload.fetchError; run.preview = '';
        }
    }
}
export function publishMockReport(entry: QuantEntryDetail) {
    ensureSources(entry);
    for (const run of entry.runs) {
        if (run.kind === 'feedback_review' && run.status === 'completed' && !entry.reports!.some(row => row.runId === run.id)) {
            const report = mockFeedbackReport(run);
            const source = entry.sources?.find(row => row.id === run.sourceId);
            if (source) mockFeedbackPlan(entry, source, report, run);
            entry.reports!.unshift(report);
        }
        if (run.kind === 'experiment_review' && run.status === 'completed') {
            let report = entry.reports!.find(row => row.runId === run.id);
            if (!report) {report = mockExperimentReport(run); entry.reports!.unshift(report);}
            const record = quantState().experiments.find(row => row.collection === entry.collId && `result-${row.data.id}` === run.experimentResultId);
            report.proposal = presentMockProposal(record?.proposals?.[run.id], entry.collId);
        }
        if (run.kind !== 'analyze' || run.status !== 'completed' || entry.reports!.some(row => row.runId === run.id)) continue;
        const data = structuredClone(run.result.analysis || analysisSample);
        if (data.factors?.[0]?.parameters.some(row => row.domain)) data.parameters = structuredClone(data.factors[0].parameters);
        const cell = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
        const parameterRows = data.parameters.map(row => `| ${cell(parameterLabel(row))} | ${cell(row.defaultValue || '未知')} | ${cell(row.meaning)} | ${cell(row.suggestion)} |`).join('\n');
        const markdown = `# ${data.title}\n\n${data.summary}\n\n## 计算原理\n\n${data.principle}\n\n${data.formula}\n\n## 参数分析\n\n| 参数 | 默认值 | 含义 | 建议 |\n| --- | --- | --- | --- |\n${parameterRows}\n\n## 限制与验证\n\n${data.risks}\n\n${data.validationPlan}`;
        const report: QuantReport = { id: quantId('report'), sourceId: run.resolvedSourceId || run.sourceId || '', runId: run.id, schemaVersion: data.extractionVersion === 1 ? 3 : 2,
            data, originalMarkdown: markdown+mockFindingsMarkdown(data)+mockMemoryMarkdown(run)+mockSourceChangeMarkdown(data), markdown:markdown+mockFindingsMarkdown(data)+mockMemoryMarkdown(run)+mockSourceChangeMarkdown(data), currentRevisionId: '', createdAt: new Date().toISOString(), revisions: [] };
        entry.reports!.unshift(report);
        for (const parameter of data.parameters) if (parameter.domain) {
            report.markdown += `\n\n本机实验将检查：${describeParameterDomain(parameter.name, parameter.domain)}\n\n本地约束展示样例，未调用模型。原文：\n\n${parameter.domain.evidence.map(row => row.quote).join('\n\n')}`;
        }
        if (data.parameterBindingVersion) report.markdown += '\n\n参数身份为人工 local 展示，文件与参数表来自预制语料，与本次粘贴源码不保证对应；没有运行真实解析器或模型。未定位参数不进入可执行候选。';
        publishMockRepairs(entry, report);
        if (report.data.factorRepair?.selected.length) report.markdown += '\n\n## AI 定义修订\n\n原始候选保留，修订是独立假设，不继承评分或实验结果。\n\n' + report.data.factorRepair.items.map(row => row.summary + (row.definition ? '\n\n修订公式：' + row.definition.formula : '') + '\n\n仍待核对：' + row.remainingUnknowns.join('、')).join('\n\n');
        mockInitialPlan(entry, report);
        report.markdown += `\n\n## 首轮实验规划\n\n${report.data.initialPlanningNote}`;
        report.originalMarkdown = report.markdown;
        if (entry.title === '待分析资料') { entry.title = data.title; entry.tags = data.tags; entry.kind = data.kind; }
    }
}
