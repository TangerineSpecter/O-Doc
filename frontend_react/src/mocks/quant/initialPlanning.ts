import {strategySnapshot, strategyDraft, buildStrategy} from '../../utils/quantStrategy';
import type {QuantEntryDetail, QuantReport} from '../../types/api/quant';
import {collectMockFactors} from './factors';
import {buildSeed, initialSeed} from '../../components/Quant/experiments/plan';
import {applyNestedMockPlan} from './planningCapabilities';
import {blockedPlanningNoteSample} from './planningNote';

/** Explicit synthetic fixture, never claims to interpret arbitrary pasted source. */
export function mockInitialPlan(entry: QuantEntryDetail, report: QuantReport) {
    report.data.initialPlanningVersion = 1;
    report.data.initialPlanningNote = '本地流程样例：使用示例默认窗口 20 比较 15、25；费用与滑点各 5 bps、阈值 0、隔离 2 根为演示假设，不对应实际账户。';
    report.proposal = null;
    const candidates = collectMockFactors([entry]);
    const candidate = candidates.find(row => row.reportId === report.id && row.data.formulaVersion?.origin === 'ai_repair') || candidates.find(row => row.reportId === report.id);
    if (!candidate || !candidate.data.expression) {
        report.data.initialPlanningNote = blockedPlanningNoteSample;
        return;
    }
    const seed = buildSeed(candidate, initialSeed(candidate), true);
    report.data.initialPlanningNote = `本地流程样例：使用示例默认参数 ${seed.parameters.map(row => `${row.name}=${row.value}`).join('、')}，比较邻近窗口；费用与滑点各 5 bps、阈值 0、隔离 2 根为演示假设。`;
    const data = {version: 1, local_demo: true, origin: 'source_analysis', name: 'AI 首轮样例 · 窗口比较',
        hypothesis: '人工样例：比较默认窗口和邻近窗口的方向一致性。', falsification: '邻域方向反复变化，或成本后优势消失。',
        data_requirement: '至少 60 根且足够覆盖窗口的同口径 OHLC 历史行情；本地模式不计算真实表现。', evidence_refs: candidate.data.formulaVersion?.origin === 'ai_repair' ? ['factor:0', 'repair:0'] : ['factor:0'],
        seeds: [{id: candidate.id, candidate: candidate.data, bindings: Object.fromEntries(seed.bindings.map(row => [row.name, row.column])),
            parameters: Object.fromEntries(seed.parameters.map(row => [row.name, row.value])),
            variants: seed.variants.map(group => Object.fromEntries(group.map(row => [row.name, row.value])))}],
        config: {seed: 42, max_candidates: 16, generations: 2, threshold: 0, fee_bps: 5, slippage_bps: 5, gap: 2, seconds: 30},
        evidence_hash: 'local-demo-source-evidence', status: 'unverified_requires_fresh_validation',
        constraint_status: 'local_demo_not_validated', baseline_status: candidate.data.formulaVersion?.origin === 'ai_repair' ? 'ai_revised_definition_defaults_not_native_or_live_settings' : 'source_declared_defaults_not_actual_live_settings'};
    if ((entry.sources?.find(row => row.id === report.sourceId)?.payload.code || '').includes('LOCAL_STRATEGY')) {
        const draft = strategyDraft(); draft.enabled = true; draft.values.positionPercent = '50';
        draft.stopEnabled = true; draft.values.stopPercent = '5'; draft.profitEnabled = true; draft.values.profitPercent = '10';
        Object.assign(data.config, {strategy: strategySnapshot(buildStrategy(draft, 0)!)});
        data.name = 'AI 首轮样例 · 显式策略执行';
        report.data.initialPlanningNote = '人工策略样例：固定50%仓位、5%价格止损、10%止盈，仅演示配置继承与账本显示，未计算行情或验证平台。';
    }
    if (candidate.data.name === '算术参数 · 本地演示候选') {
        data.name = 'AI 首轮样例 · 算术参数约束比较';
        data.hypothesis = '人工样例：在 enabled=true、slow=30 下比较合规 lookback=15/20/25；每组满足 lookback × 2 + slow ≤ 80，尚未计算表现。';
        report.data.initialPlanningNote = '本地人工样例：默认 lookback=20、slow=30、enabled=true，比较合法窗口15/25；lookback=30 会违反声明约束，仅用于手工非法变体验证。费用、滑点与实验表现均待核对。';
    }
    if (candidate.data.name === '周期与阈值 · 联合参数演示') {
        data.name = 'AI 首轮样例 · 周期与阈值联合比较';
        data.hypothesis = '人工样例：固定模式，比较周期与阈值的完整四点组合，保留失败和未执行点。';
        data.seeds[0].variants = [{lookback: 20, threshold: .02}, {lookback: 30, threshold: .01}, {lookback: 30, threshold: .02}];
        report.data.initialPlanningNote = '人工联合参数样例：周期 20/30、阈值 0.01/0.02，基线加三组变体组成完整网格，未计算真实行情。';
    }
    if ((entry.sources?.find(row => row.id === report.sourceId)?.payload.code || '').includes('LOCAL_NESTED_PLANNING')) {
        applyNestedMockPlan(data);
        report.data.initialPlanningNote = '人工样例演示AI直接给出多内层验证方案；窗口20及邻近15/25、预热25根与成本均为待核对假设，不代表实证最优或已运行。';
    }
    report.proposal = {id: `initial-${report.id}`.slice(0, 40), createdAt: report.createdAt,
        contentHash: 'local-demo-initial-proposal', dataJson: JSON.stringify(data), candidates: [structuredClone(candidate)]};
}
