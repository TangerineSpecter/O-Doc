import type {QuantWalkForwardPolicy} from '../types/api/quantExperiment';
import type {QuantStrategyPolicy} from '../types/api/quantStrategy';
import {readMetric, type Metric} from './quantExperimentMetric';
import type {QuantLabelTarget,QuantLabelMetrics,QuantLabelMean} from '../types/api/quantLabels';
import {readLabelMetrics} from './quantLabelSearch';

export interface InnerMean {totalReturn: number; maxDrawdown: number; turnover: number}
export interface InnerEvaluation {planned: number;labelSummary?:Record<'train'|'validation',QuantLabelMean>; folds: {number: number; train?: Metric; validation?: Metric;labels?:QuantLabelMetrics}[]; summary?: {train: InnerMean; validation: InnerMean}}
const object = (value: unknown): Record<string, unknown> => {if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('内层评价对象无效'); return value as Record<string, unknown>;};
const numeric = (value: unknown) => {if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('内层均值无效'); return value;};
function mean(value: unknown): InnerMean {
    const row = object(value);
    if (Object.keys(row).sort().join() !== 'max_drawdown,total_return,turnover') throw new Error('内层均值字段无效');
    return {totalReturn: numeric(row.total_return), maxDrawdown: numeric(row.max_drawdown), turnover: numeric(row.turnover)};
}
export function readInnerEvaluation(raw: unknown, policy?: QuantWalkForwardPolicy, strategy?: QuantStrategyPolicy,labelTarget?:QuantLabelTarget): InnerEvaluation | undefined {
    if (policy?.version !== 2) {if (raw !== undefined) throw new Error('旧实验不能携带内层评价'); return undefined;}
    const value = object(raw);
    if (Object.keys(value).sort().join() !== (labelTarget?'folds,label_summary,planned_folds,summary,version':'folds,planned_folds,summary,version') || value.version !== (labelTarget?2:1) || value.planned_folds !== policy.innerFolds || !Array.isArray(value.folds) || value.folds.length > policy.innerFolds!) throw new Error('内层评价配置错配');
    const folds = value.folds.map((raw, index) => {const row = object(raw), metrics = object(row.metrics);
        if (row.number !== index+1 || Object.keys(row).sort().join() !== (labelTarget?'label_metrics,metrics,number':'metrics,number') || Object.keys(metrics).some(key => !['train', 'validation'].includes(key)) || (metrics.validation && !metrics.train)) throw new Error('内层折顺序或指标无效');
        return {number: index+1, train: readMetric(metrics.train, strategy), validation: readMetric(metrics.validation, strategy),labels:labelTarget?readLabelMetrics({version:1,metrics:row.label_metrics},labelTarget):undefined};
    });
    if (folds.slice(0, -1).some(row => !row.train || !row.validation)) throw new Error('内层未完成便继续');
    const complete = folds.length === policy.innerFolds && folds.every(row => row.train && row.validation);
    if ((value.summary !== null) !== complete) throw new Error('内层均值缺失或提前发布');
    const summary = value.summary === null ? undefined : object(value.summary);
    const result = summary ? {train: mean(summary.train), validation: mean(summary.validation)} : undefined;
    if (summary && Object.keys(summary).sort().join() !== 'train,validation') throw new Error('内层汇总字段无效');
    if (result) for (const part of ['train', 'validation'] as const) for (const key of ['totalReturn', 'maxDrawdown', 'turnover'] as const) {
        const actual = folds.reduce((sum, fold) => sum + fold[part]![key], 0)/folds.length;
        if (Math.abs(actual-result[part][key]) > 1e-10*Math.max(1, Math.abs(actual))) throw new Error('内层均值与每折结果不一致');
    }
    let labelSummary:InnerEvaluation['labelSummary'];
    if(labelTarget){
        const ready=folds.length===policy.innerFolds && folds.every(row=>row.labels?.train?.status==='completed' && row.labels?.validation?.status==='completed');
        if((value.label_summary!==null)!==ready)throw new Error('标签内层均值缺失或提前发布');
        if(ready){const raw=object(value.label_summary);labelSummary={} as NonNullable<InnerEvaluation['labelSummary']>;
            for(const part of ['train','validation'] as const){const row=object(raw[part]);
                const item={spearman_ic:numeric(row.spearman_ic),pearson_ic:numeric(row.pearson_ic),coverage:numeric(row.coverage)};
                for(const key of ['spearman_ic','pearson_ic','coverage'] as const)if(Math.abs(item[key]-folds.reduce((sum,fold)=>sum+fold.labels![part]![key]!,0)/folds.length)>1e-12)throw new Error('标签均值与各内层不一致');
                labelSummary[part]=item;
            }
        }
    }
    return {planned: policy.innerFolds!, folds, summary: result,labelSummary};
}
