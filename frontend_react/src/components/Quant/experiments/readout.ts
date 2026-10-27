import {readLabelTarget,readLabelEvaluation} from '../../../utils/quantLabels';
import {labelBaseEngine,readLabelMetrics} from '../../../utils/quantLabelSearch';
import type {QuantLabelTarget,QuantLabelEvaluation,QuantLabelMetrics} from '../../../types/api/quantLabels';
import {readMetric as metric, type Metric} from '../../../utils/quantExperimentMetric';
import type {QuantStrategyPolicy} from '../../../types/api/quantStrategy';
import {readStrategy} from '../../../utils/quantStrategy';
import {readJointSensitivity} from '../../../utils/quantJointSensitivity';
import type {QuantJointSensitivity} from '../../../types/api/quantJointSensitivity';
import {readEvolution, readTransformation} from '../../../utils/quantEvolution';
import {readInnerEvaluation, type InnerEvaluation} from '../../../utils/quantNested';
import {readTemporal} from '../../../utils/quantTemporal';
import type {QuantEvolutionPolicy, QuantFormulaTransform, QuantWalkForwardPolicy} from '../../../types/api/quantExperiment';
import {readSensitivity} from '../../../utils/quantSensitivity';
import {readTemporalSensitivity} from '../../../utils/quantTemporalSensitivity';
import type {QuantTemporalSensitivity} from '../../../types/api/quantTemporalSensitivity';
import type {QuantSensitivity} from '../../../types/api/quantSensitivity';
import type {QuantExperiment} from '../../../types/api/quantExperiment';
export type {Metric} from '../../../utils/quantExperimentMetric';
export interface Attempt {labels?:QuantLabelMetrics;inner?: InnerEvaluation; fold?: number; transformation?: QuantFormulaTransform; id: string; parents: string[]; operation: string; generation: number; status: string; reason: string; parameters: [string, string][]; train?: Metric; validation?: Metric; expression: string}
export interface TemporalReadout {tested: number; mean?: number; worst?: number; drawdown?: number; folds: {number: number; selectedId: string; attempts: number; budget: number; final?: Metric; baseline?: Metric; stopReason: string;labelHoldout?:QuantLabelEvaluation}[]}
export interface Readout {labelTarget?:QuantLabelTarget;labelHoldout?:QuantLabelEvaluation;temporalSensitivity?: QuantTemporalSensitivity; strategy?: QuantStrategyPolicy; threshold: number; jointSensitivity?: QuantJointSensitivity; walkForward?: QuantWalkForwardPolicy; temporal?: TemporalReadout; evolution?: QuantEvolutionPolicy; sensitivity?: QuantSensitivity; engineVersion: string; name: string; proposal?: {id: string; adapted: boolean}; seeds: {id: string; name: string; parameters: [string, string][]}[]; config: [string, string][]; attempts: Attempt[]; selectedId: string; final?: Metric; baseline?: Metric; limitations: string[]; overlapCount?: number; demo: boolean; stopReason: string}
const object = (value: unknown): Record<string, unknown> => {if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('对象字段无效'); return value as Record<string, unknown>;};
const text = (value: unknown): string => {if (typeof value !== 'string') throw new Error('文本字段无效'); return value;};
const number = (value: unknown): number => {if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('数值字段无效'); return value;};
const array = (value: unknown, max: number): unknown[] => {if (!Array.isArray(value) || value.length > max) throw new Error('列表字段无效'); return value;};
const values = (value: unknown): [string, string][] => Object.entries(object(value)).map(([key, item]) => {
    if (!['number', 'boolean', 'string'].includes(typeof item)) throw new Error('参数值无效');
    return [key, String(item)];
});
export function readExperiment(experiment: QuantExperiment): Readout {
    const plan = object(JSON.parse(experiment.planJson || '{}'));
    if (![1, 2].includes(Number(plan.version)) || !/^quant-local-search-([1-9]|1[0-5])$/.test(String(plan.engine_version))) throw new Error('此实验方案版本暂不支持展示');
    const {evolution: rawEvolution, walk_forward: rawTemporal, strategy: rawStrategy, label_target: rawLabel, ...config} = object(plan.config);
    const labelTarget=rawLabel===undefined?undefined:readLabelTarget(rawLabel),baseEngine=labelBaseEngine(String(plan.engine_version),!!labelTarget);
    const evolution = rawEvolution === undefined ? undefined : readEvolution(rawEvolution);
    const walkForward = rawTemporal === undefined ? undefined : readTemporal(rawTemporal);
    const strategy = rawStrategy === undefined ? undefined : readStrategy(rawStrategy, number(config.threshold));
    if (strategy ? baseEngine !== (walkForward ? walkForward.version === 2 ? 'quant-local-search-8' : 'quant-local-search-6' : 'quant-local-search-5') : ['quant-local-search-5', 'quant-local-search-6', 'quant-local-search-8'].includes(baseEngine)) throw new Error('策略规则与引擎版本不一致');
    if (!strategy && ((['quant-local-search-4', 'quant-local-search-7'].includes(baseEngine)) !== !!walkForward || (walkForward && baseEngine !== (walkForward.version === 2 ? 'quant-local-search-7' : 'quant-local-search-4')) || (!walkForward && (baseEngine === 'quant-local-search-3') !== !!evolution))) throw new Error('实验配置与引擎版本不一致');
    const envelope = experiment.resultJson ? object(JSON.parse(experiment.resultJson)) : undefined;
    if (envelope && envelope.version !== 1) throw new Error('此实验结果版本暂不支持展示');
    const output = envelope?.output ? object(envelope.output) : undefined;
    const rawAttempts: unknown = JSON.parse(experiment.attemptsJson || '[]');
    const attempts = array(rawAttempts, 32).map(value => {
        const item = object(value), metrics = object(item.metrics), recipe = item.recipe ? object(item.recipe) : undefined;
        if ((item.operation === 'formula_mutation') !== (item.transformation !== undefined)) throw new Error('公式变换记录缺失或错配');
        if (item.transformation && !evolution) throw new Error('公式变换缺少演化配置');
        if (walkForward ? typeof item.fold !== 'number' || !Number.isInteger(item.fold) || item.fold < 1 || item.fold > walkForward.folds : item.fold !== undefined) throw new Error('尝试折号无效');
        const labels=readLabelMetrics(item.label_evaluation,labelTarget);
        if(labels && item.status==='evaluated' && (!labels.train || !labels.validation || labels.train.status!=='completed' || labels.validation.status!=='completed'))throw new Error('已评价候选缺少完整标签');
        return {labels,inner: readInnerEvaluation(item.inner_evaluation, walkForward, strategy,labelTarget), fold: item.fold as number | undefined, transformation: item.transformation && evolution ? readTransformation(item.transformation, evolution) : undefined, id: text(item.id), parents: array(item.parents, 8).map(text), operation: text(item.operation), generation: number(item.generation), status: text(item.status), reason: text(item.reason),
            parameters: item.requested_parameters ? values(item.requested_parameters) : recipe?.parameters ? values(recipe.parameters) : [],
            train: metric(metrics.train, strategy), validation: metric(metrics.validation, strategy), expression: recipe ? JSON.stringify(recipe.expression, null, 2) : ''};
    });
    const audit = envelope?.overlap_audit ? object(envelope.overlap_audit) : undefined;
    let temporal: TemporalReadout | undefined;
    if (walkForward && output) {
        const raw = object(output.walk_forward), summary = object(raw.summary);
        if (raw.version !== walkForward.version) throw new Error('滚动结果版本无效');
        temporal = {tested: number(summary.tested_folds), mean: summary.mean_test_return === null ? undefined : number(summary.mean_test_return), worst: summary.worst_test_return === null ? undefined : number(summary.worst_test_return), drawdown: summary.worst_test_drawdown === null ? undefined : number(summary.worst_test_drawdown),
            folds: array(raw.folds, walkForward.folds).map((value, index) => {const fold = object(value); if (fold.number !== index + 1) throw new Error('滚动结果折序无效'); return {number: number(fold.number), selectedId: text(fold.selected_id), attempts: array(fold.attempt_ids, 32).length, budget: number(fold.max_candidates), final: metric(fold.holdout, strategy), baseline: metric(fold.buy_hold_baseline, strategy, true), stopReason: text(fold.stop_reason),labelHoldout:labelTarget && fold.label_holdout?readLabelEvaluation(fold.label_holdout,labelTarget):undefined};})};
    }
    if(output && labelTarget && !!output.holdout!==!!output.label_holdout)throw new Error('测试标签与成交评价状态错配');
    if(!labelTarget && output?.label_holdout!==undefined)throw new Error('旧结果不能追加测试标签');
    return {labelTarget,labelHoldout:labelTarget && output?.label_holdout?readLabelEvaluation(output.label_holdout,labelTarget):undefined,temporalSensitivity: readTemporalSensitivity(experiment.temporalSensitivityJson), strategy, threshold: number(config.threshold), walkForward, temporal, evolution, jointSensitivity: readJointSensitivity(experiment.jointSensitivityJson), sensitivity: readSensitivity(experiment.sensitivityJson), engineVersion: text(plan.engine_version), name: text(plan.name), proposal: plan.version === 2 ? {id: text(plan.proposal_id), adapted: plan.proposal_adapted === true} : undefined, seeds: array(plan.seeds, 8).map(seed => {const item = object(seed), candidate = object(item.candidate); return {id: text(item.id), name: text(candidate.name), parameters: values(item.parameters)};}),
        config: values(config), attempts, selectedId: output ? text(output.selected_id) : '', final: metric(output?.holdout, strategy), baseline: metric(output?.buy_hold_baseline, strategy, true),
        limitations: output ? array(output.limitations, 20).map(text) : [], overlapCount: audit ? number(audit.total) : undefined, demo: envelope?.local_demo === true,
        stopReason: output ? text(output.stop_reason) : ''};
}
export const statusNames: Record<QuantExperiment['status'], string> = {pending: '排队中', running: '计算中', completed: '已完成', partial: '部分完成', cancelled: '已停止', interrupted: '执行中断', failed: '执行失败'};
export const operationNames: Record<string, string> = {formula_mutation: '公式变异', source_candidate: '原始候选', parameter_variant: '参数变体', mean: '均值组合', and: '同时满足', or: '任一满足'};
export const attemptNames: Record<string, string> = {evaluated: '已评价', rejected: '未通过', cancelled: '已停止', budget_stopped: '预算停止'};
export const configNames: Record<string, string> = {seed: '随机种子', max_candidates: '尝试上限', generations: '代数上限', threshold: '做多阈值', fee_bps: '单侧费用 bps', slippage_bps: '单侧滑点 bps', gap: '隔离 K 线数', seconds: '秒数上限'};
export const percent = (value?: number) => value === undefined ? '—' : `${(value * 100).toFixed(2)}%`;
