import {initDocument,offerDocument} from './documents';
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
import {preserveMockReading} from './reportContinuity';

export const analysisSample: QuantAnalysis = {
    title: '动量计算 · 本地演示报告', kind: 'factor', summary: '比较当前收盘价与历史收盘价，计算区间涨跌幅，帮助观察价格动量。这是本地演示样例。',
    principle: '### 1. 输入价格\n\n使用按时间排列的收盘价和回看窗口。\n\n### 2. 比较历史价格\n\n当前收盘价除以窗口前的收盘价，再减去1，得到这段区间的价格变化比例。\n\n### 3. 理解输出\n\n- 大于0：相对窗口起点上涨。\n- 小于0：相对窗口起点下跌。',
    formula: '$$M_t=P_t/P_{t-N}-1$$', usage: '## 输出怎么看\n\n用正负判断区间涨跌，用绝对值比较变化幅度。\n\n## 主要参数\n\n回看窗口默认20根K线；调大比较更长区间，调小更关注近期变化。\n\n## 怎么使用\n\n随输入K线周期计算，20表示20根K线。计算开始处需先积累足够历史价格。',
    risks: '尚未检查真实材料；不包含回测或收益结论。', validationPlan: '检查输入数据、窗口边界和不同参数邻域，再使用独立样本验证。',
    sourceFacts: ['示例使用历史价格窗口。'], assumptions: ['假定数据口径一致；这是本地演示。'], unknowns: ['真实市场与交易周期', '实际运行参数'],
    tags: ['动量', '演示'], parameters: [{ name: 'lookback', type: 'int', defaultValue: '20', category: 'signal', meaning: '历史窗口，单位为 bar', constraints: '正整数；示例值', effect: '窗口改变比较的时间跨度', suggestion: '在固定数据上比较邻近窗口，尚无推荐最优值', evidence: '本地 momentum 示例函数' }],
    scores: ['逻辑清晰度', '实现质量', '数据与时序可靠性', '参数可解释性', '复现与复用价值'].map(dimension => ({ dimension, score: 3, reason: '优点：演示输入和计算关系的说明。\n问题与影响：这里演示具体局限及其影响。\n扣分说明：3分为本地界面测试分值，不是真实源码评价。', evidence: '源码依据：本地 momentum 示例函数。\n验证情况：预制界面样例，没有调用模型或执行行情验证。' })),
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
        initDocument(entry);
        const data = structuredClone(run.result.analysis || analysisSample);
        if (data.factors?.[0]?.parameters.some(row => row.domain)) data.parameters = structuredClone(data.factors[0].parameters);
        const cell = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
        const parameterRows = data.parameters.map(row => `| ${cell(parameterLabel(row))} | ${cell(row.defaultValue || '未知')} | ${cell(row.meaning)} | ${cell(row.suggestion)} |`).join('\n');
        const subject = {indicator: '指标', strategy: '策略', factor: '因子'}[data.kind];
        const markdown = `# ${data.title}\n\n${data.summary}\n\n## 这个${subject}做什么\n\n${data.summary}\n\n## 它是怎么计算的\n\n${data.principle}\n\n## 关键公式与解读\n\n${data.formula}\n\n${data.usage}\n\n## 参数分析\n\n| 参数 | 默认值 | 含义 | 建议 |\n| --- | --- | --- | --- |\n${parameterRows}\n\n## 限制与验证\n\n${data.risks}\n\n${data.validationPlan}`;
        const report: QuantReport = { id: quantId('report'), sourceId: run.resolvedSourceId || run.sourceId || '', runId: run.id, schemaVersion: data.extractionVersion === 1 ? 3 : 2,
            data, originalMarkdown: markdown+mockFindingsMarkdown(data)+mockMemoryMarkdown(run)+mockSourceChangeMarkdown(data), markdown:markdown+mockFindingsMarkdown(data)+mockMemoryMarkdown(run)+mockSourceChangeMarkdown(data), currentRevisionId: '', createdAt: new Date().toISOString(), revisions: [] };
        entry.reports!.unshift(report);
        for (const parameter of data.parameters) if (parameter.domain) {
            report.markdown += `\n\n本机实验将检查：${describeParameterDomain(parameter.name, parameter.domain)}\n\n本地约束展示样例，未调用模型。原文：\n\n${parameter.domain.evidence.map(row => row.quote).join('\n\n')}`;
        }
        if (data.parameterBindingVersion) report.markdown += '\n\n参数身份为人工 local 展示，文件与参数表来自预制语料，与本次粘贴源码不保证对应；没有运行真实解析器或模型。未定位参数不进入可执行候选。';

        if (report.data.factorRepair?.selected.length) report.markdown += '\n\n## AI 定义修订\n\n原始候选保留，修订是独立假设，不继承评分或实验结果。\n\n' + report.data.factorRepair.items.map(row => row.summary + (row.definition ? '\n\n修订公式：' + row.definition.formula : '') + '\n\n仍待核对：' + row.remainingUnknowns.join('、')).join('\n\n');
        if(!initDocument(entry).sections.reading)publishMockRepairs(entry,report);
        if (run.workflow?.stages.some(row => row.stage === 'plan' && row.status === 'partial')) {
            report.data.initialPlanningNote = '本地模拟：实验规划未生成，算法已保留。';
        } else mockInitialPlan(entry, report);
        report.markdown += `\n\n## 首轮实验规划\n\n${report.data.initialPlanningNote}`;
        report.originalMarkdown = report.markdown;
        preserveMockReading(entry, run, report);
        offerDocument(entry,report);
        if(report.publicationMode==='adopted')publishMockRepairs(entry,report);
        if (entry.title === '待分析资料') { entry.title = data.title; entry.tags = data.tags; entry.kind = data.kind; }
    }
}
