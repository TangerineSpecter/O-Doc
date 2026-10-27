import type {QuantExperimentConfig} from '../types/api/quantExperiment';
import type {QuantLabelMetrics,QuantLabelTarget} from '../types/api/quantLabels';
import {readLabelEvaluation} from './quantLabels';
import {temporalWindows} from './quantTemporal';
const versions:Record<string,string>={'quant-local-search-2':'quant-local-search-9','quant-local-search-3':'quant-local-search-10',
    'quant-local-search-4':'quant-local-search-11','quant-local-search-5':'quant-local-search-12','quant-local-search-6':'quant-local-search-13',
    'quant-local-search-7':'quant-local-search-14','quant-local-search-8':'quant-local-search-15'};
export function labelBaseEngine(version:string,label:boolean):string {
    const original=Object.entries(versions).find(([,v])=>v===version)?.[0];
    if(label!==!!original)throw new Error('标签目标与引擎版本不一致');
    return original || version;
}
export function experimentEngine(config:QuantExperimentConfig):string {
    const base=config.strategy?config.walkForward?config.walkForward.version===2?'quant-local-search-8':'quant-local-search-6':'quant-local-search-5':
        config.walkForward?config.walkForward.version===2?'quant-local-search-7':'quant-local-search-4':config.evolution?'quant-local-search-3':'quant-local-search-2';
    return config.labelTarget?versions[base]:base;
}
export function readLabelMetrics(raw:unknown,target?:QuantLabelTarget):QuantLabelMetrics|undefined {
    if(!target){if(raw!==undefined)throw new Error('旧尝试不能追加标签选择');return undefined;}
    if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new Error('标签选择记录缺失');
    const value=raw as Record<string,unknown>,metrics=value.metrics;
    if(Object.keys(value).sort().join()!=='metrics,version' || value.version!==1 || !metrics || typeof metrics!=='object' || Array.isArray(metrics))throw new Error('标签选择记录无效');
    const result:QuantLabelMetrics={};
    for(const [key,row] of Object.entries(metrics)){
        if(key!=='train' && key!=='validation')throw new Error('标签选择包含不允许的窗口');
        result[key]=readLabelEvaluation(row,target,true);
    }
    if(result.validation && !result.train)throw new Error('标签验证先于训练');
    return result;
}
export const rankIC=(value?:number|null)=>value===undefined || value===null?'—':value.toFixed(4);
export function validateLabelWindows(target:QuantLabelTarget,rows:number,config:Pick<QuantExperimentConfig,'walkForward'|'gap'>):void {
    const a=Math.floor(rows*.6),b=Math.floor(rows*.8);
    const splits=config.walkForward?temporalWindows(rows,config.walkForward,config.gap).flatMap(window=>[window.partitions,...(window.inner_windows || []).map(row=>row.partitions)]):
        [{train:[1,a-1],validation:[a+config.gap,b-1],holdout:[b+config.gap,rows-1]}];
    for(const split of splits)for(const [start,end] of Object.values(split))if(end-start-target.horizon_bars+1<5)throw new Error('每个训练、验证和测试段剔除跨界标签后至少保留5对');
}
