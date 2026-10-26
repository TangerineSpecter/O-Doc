import type {QuantExperimentAnalysis, QuantAIRun, QuantReport} from '../../types/api/quant';
import {quantId} from './state';
import {mockMemoryMarkdown} from './researchMemory';
export const experimentReviewSample: QuantExperimentAnalysis = {
    format: 'experiment_review', title: '参数实验 · 本地解读样例',
    summary: '本地界面样例：默认方案与失败变体不足以证明参数稳定性，需要检查窗口约束并使用新数据验证。未调用真实模型。',
    findings: [{text: '人工样例展示一次可评价尝试和一次失败尝试，不是实际计算结论。', evidenceRefs: ['execution']}],
    parameterAssessment: [{text: '不能从一次成功方案推断最优窗口。', evidenceRefs: ['attempt-1']}],
    risks: [{text: '原平台等价性、成本敏感度和独立数据表现仍未知。', evidenceRefs: ['execution']}],
    unknowns: ['真实行情与模型尚未验证'], priority: 'insufficient_evidence',
    scores: ['参数稳定性', '验证表现', '风险与成本', '证据充分度', '复现价值'].map(dimension => ({dimension, score: null,
        reason: '本地样例不能支持真实评分', evidence: '仅用于界面验收', evidenceRefs: ['execution']})),
    totalScore: null, nextHypotheses: [{text: '检查失败窗口的有效样本数', test: '保持原公式，比较足够历史长度的参数邻域',
        falsification: '新数据中邻域表现不一致', dataRequirement: '未用于本次选择的新行情', evidenceRefs: ['execution']}],
    evidenceHash: 'local-demo-evidence', evidenceStatus: 'local_simulation_unverified_platform', rubricVersion: 'experiment-research-v1',
    independentHoldoutProven: false, nextHypothesesStatus: 'unverified_requires_fresh_validation',
};
export function mockExperimentReport(run: QuantAIRun): QuantReport {
    const data = structuredClone(run.result.review || experimentReviewSample);
    const markdown = `# ${data.title}\n\n${data.summary}\n\n## 参数研究\n\n${data.parameterAssessment[0].text}\n\n证据：${data.parameterAssessment[0].evidenceRefs.join("、")}\n\n## 下一轮待验证假设\n\n${data.nextHypotheses[0].text}\n\n检验：${data.nextHypotheses[0].test}\n\n否证条件：${data.nextHypotheses[0].falsification}\n\n新数据要求：${data.nextHypotheses[0].dataRequirement}\n\n## 研究评价\n\n各维度与总分均未评估；本地样例不代表真实研究成果。`;
    const proposalMarkdown = data.proposal ? `\n\n## 下一轮可执行方案\n\n${data.planningNote}\n\n${data.proposal.hypothesis}\n\n否证条件：${data.proposal.falsification}\n\n行情要求：${data.proposal.dataRequirement}` : '';
    const selection=data.selectionReview?`\n\n## 搜索选择与过拟合风险\n\n${data.selectionReview.text}\n\n证据：selection_diagnostic`:'';
    const temporal=data.temporalParameterReview?`\n\n## 跨窗口参数复核\n\n计划${data.temporalParameterReview.plannedWindows}个内层窗口 · ${{sampled_region:'存在待复核共同离散区域',no_supported_region:'没有共同支持区域',insufficient_comparison:'完整跨窗口对照不足'}[data.temporalParameterReview.status]}\n\n${data.temporalParameterReview.text}\n\n证据：temporal_parameter_stability`:'';
    return {id: quantId('report'), sourceId: run.sourceId || '', runId: run.id, schemaVersion: 4, data,
        markdown: markdown + temporal + selection + proposalMarkdown + mockMemoryMarkdown(run), originalMarkdown: markdown + temporal + selection + proposalMarkdown + mockMemoryMarkdown(run), currentRevisionId: '', revisions: [], createdAt: new Date().toISOString()};
}
