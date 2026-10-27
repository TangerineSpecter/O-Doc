import {mockHistoryFacts} from './searchHistory';
import {readCombinationAnalysis} from '../../utils/quantCombination';
import {readOutputAssociations} from '../../utils/quantOutputAssociations';
import {mockWindowReviews} from './windowReview';
import {readJointSensitivity} from '../../utils/quantJointSensitivity';
import {readTemporalSensitivity} from '../../utils/quantTemporalSensitivity';
import type {QuantAIRun, QuantExperimentAnalysis} from '../../types/api/quant';
import type {QuantExperimentProposal} from '../../types/api/quantExperiment';
import {experimentReviewSample} from './experimentReviews';
import {buildSeed} from '../../components/Quant/experiments/plan';
import {collectMockFactors} from './factors';
import {quantState} from './state';
import {readResearchMemory, researchMemoryReference} from '../../utils/quantResearchMemory';
/** Artificial local fixture: demonstrates proposal provenance, never real model output. */
export function mockExperimentReview(run: QuantAIRun): QuantExperimentAnalysis {
    const review = structuredClone(experimentReviewSample);
    review.planningVersion = 2; review.planningNote = '本地样例：比较原参数与邻近窗口，需要独立新行情。'; review.proposal = null;
    const record = quantState().experiments.find(row => `result-${row.data.id}` === run.experimentResultId);
    if (!record) return review;
    const observations = readOutputAssociations(run.outputAssociationsJson);
    if (observations) review.outputAssociationReviews = observations.items.map(row => ({evidenceRef: `output_association:${row.relation_id}`,
        baselineScope: row.baseline_scope, text: row.baseline_scope === 'historical_configuration_only'
            ? '人工解读样例：至少一侧与当前基线不同，相关系数仅描述原配置，不能移用到变体。未知不补零，仍需新数据上的单独/组合对照。'
            : '人工解读样例：参数与输入映射相同，但原完整对照不是本轮子窗口统计。相关性不能证明互补、等价或收益，后续假设仍须新数据验证。'}));
    const combination = readCombinationAnalysis(record.data.combinationAnalysisJson);
    if (combination) review.combinationReviews = combination.groups.map(row => ({evidenceRef: row.id,
        text: `人工解读样例：${row.parent_ids.join(' + ')} 与 ${row.attempt_id} 的全部窗口保留。收益差与回撤差可能方向不同，失败和缺失不补零；尚未计算真实行情，不证明组合有效。`}));
    const temporal = readTemporalSensitivity(record.data.temporalSensitivityJson);
    if (temporal) {
        review.rubricVersion='experiment-research-v2';
        review.temporalParameterReviewVersion=2;
        review.temporalParameterReview={status:temporal.status,plannedWindows:temporal.planned_windows,
            text:'人工样例：逐窗保留完整对照、缺测及失败，不用最后窗口或均值代替共同支持；本地样例不构成真实参数推荐。',evidenceRefs:['temporal_parameter_stability'],windowReviews:mockWindowReviews(record,temporal)};
    }
    if(record.data.selectionDiagnostic) {
        review.selectionReviewVersion=1;
        review.selectionReview={text:'人工样例：分块排名反转只用于展示选择风险与并列歧义，没有计算真实行情或证明独立验证。',evidenceRefs:['selection_diagnostic']};
        const diagnostic=JSON.parse(record.data.selectionDiagnostic.dataJson);
        if(diagnostic.search_history)review.selectionReview.searchHistoryFacts=mockHistoryFacts(diagnostic.search_history);
    }
    const seed = record.input.seeds[0];
    const candidate = collectMockFactors(quantState().entries.filter(row => row.collId === record.collection && row.isValid)).find(row => row.id === seed.candidateId);
    if (!candidate) return review;
    const jointDemo = candidate.data.name === '周期与阈值 · 联合参数演示';
    const extra = !jointDemo && record.input.config.generations >= 2 && record.input.config.maxCandidates >= 3 ? record.libraryContexts?.[run.id]?.options[0] : undefined;
    const variants = jointDemo ? structuredClone(seed.variants) : buildSeed(candidate, {bindings: Object.fromEntries(seed.bindings.map(row => [row.name, row.column])),
        parameters: Object.fromEntries(seed.parameters.map(row => [row.name, JSON.stringify(row.value)]))}, true).variants.slice(0, Math.max(0, record.input.config.maxCandidates - (extra ? 3 : 1)));
    review.proposal = {name: 'AI 方案样例 · 窗口稳定性复核', hypothesis: '人工样例：邻近窗口在新数据中是否仍有一致表现？',
        falsification: '新行情中窗口邻域表现方向不一致，或成本后优势消失。', dataRequirement: '未参与本轮选择的历史区间；本地模式不校验或计算真实表现。',
        evidenceRefs: ['execution'], seeds: [{candidateId: seed.candidateId, variants}]};
    if (jointDemo) {
        const joint = readJointSensitivity(record.data.jointSensitivityJson);
        const complete = joint?.families.some(family => family.contexts.some(context => context.regions.length > 0));
        review.title = '联合参数 · 本地解读样例';
        review.summary = complete ? '人工样例展示周期与阈值的完整四点联合区域；不能据此推荐真实参数，也不能推断未测中间值。' : '人工样例的联合参数网格尚未齐全，先补充缺失组合再讨论稳定区域。';
        review.findings = [{text: review.summary, evidenceRefs: ['parameter_joint_sensitivity']}];
        review.parameterAssessment = [{text: complete ? '示例周期 20/30 与阈值 0.01/0.02 必须作为完整组合复核；单个参数各两个取值不足以独立归因。当前未计算真实行情。' : '失败、未执行或缺失组合不能用插值填补；不同模式必须各有实际参考。', evidenceRefs: ['parameter_joint_sensitivity']}];
        review.nextHypotheses = [{text: '在独立新数据上复核完整联合组合', test: '固定模式、成本和公式，重复周期与阈值的成组比较', falsification: '组合在训练/验证中出现收益或回撤断层', dataRequirement: '未参与本轮选择的新行情', evidenceRefs: ['parameter_joint_sensitivity']}];
        review.planningNote = '人工样例：保留本轮完整参数组，换独立数据复核；不追逐单个最优点。';
        review.proposal.name = 'AI 方案样例 · 联合参数独立复核';
        review.proposal.hypothesis = review.nextHypotheses[0].text;
        review.proposal.falsification = review.nextHypotheses[0].falsification;
        review.proposal.evidenceRefs = ['parameter_joint_sensitivity'];
    }
    if (extra) {
        review.proposal.seeds.push({candidateId: extra.candidate.id, variants: []});
        review.proposal.evidenceRefs.push(`library:${extra.candidate.id}`);
        review.planningNote = '本地样例：加入不同来源的候选，比较单独表现与组合；检索相关不代表组合有效。';
        review.proposal.hypothesis = '人工样例：两个来源的信号组合是否改善稳定性？需要新的行情检验。';
    }
    review.proposal.evidenceRefs.push(...(readResearchMemory(run.researchMemoryJson)?.items.map(researchMemoryReference) || []).slice(0, Math.max(0, 12 - review.proposal.evidenceRefs.length)));
    const plan = JSON.parse(record.data.planJson!);
    const data = {version: 1, local_demo: true, name: review.proposal.name, hypothesis: review.proposal.hypothesis,
        falsification: review.proposal.falsification, data_requirement: review.proposal.dataRequirement, evidence_refs: review.proposal.evidenceRefs,
        seeds: [{...plan.seeds[0], variants: variants.map(group => Object.fromEntries(group.map(row => [row.name, row.value])))}],
        config: plan.config, evidence_hash: 'local-demo-evidence', status: 'unverified_requires_fresh_validation',
        constraint_status: 'local_demo_not_validated'};
    if (extra) data.seeds.push({id: extra.candidate.id, candidate: extra.candidate.data, bindings: Object.fromEntries(extra.seed.bindings.map(row => [row.name, row.column])), parameters: Object.fromEntries(extra.seed.parameters.map(row => [row.name, row.value])), variants: []});
    record.proposals ??= {};
    record.proposals[run.id] ??= {id: `proposal-${run.id}`.slice(0, 40), createdAt: run.updatedAt, contentHash: 'local-demo-proposal', dataJson: JSON.stringify(data), candidates: [structuredClone(candidate), ...(extra ? [extra.candidate] : [])]};
    return review;
}
export function findMockProposal(id: string | undefined, collection: string) {
    const state = quantState();
    return state.experiments.filter(row => row.collection === collection).flatMap(row => Object.values(row.proposals || {}))
        .concat(state.entries.filter(row => row.collId === collection && row.isValid).flatMap(row => (row.reports || []).flatMap(report => report.proposal ? [report.proposal] : [])))
        .find(row => row.id === id);
}
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export function attachMockProposal(plan: Record<string, unknown>, id: string | undefined, collection: string) {
    if (!id) return;
    const proposal = findMockProposal(id, collection);
    if (!proposal) throw new Error('AI 实验方案不存在或不属于当前文集');
    const proposed = JSON.parse(proposal.dataJson);
    Object.assign(plan, {version: 2, proposal_id: id, proposal_hash: proposal.contentHash,
        proposal_adapted: ['name', 'seeds', 'config'].some(key => canonical(plan[key]) !== canonical(proposed[key]))});
    return proposal;
}
export function presentMockProposal(proposal: QuantExperimentProposal | undefined, collection: string) {
    if (!proposal) return null;
    const available = collectMockFactors(quantState().entries.filter(row => row.collId === collection && row.isValid));
    return {...proposal, candidates: proposal.candidates.flatMap(row => available.filter(candidate => candidate.id === row.id))};
}
