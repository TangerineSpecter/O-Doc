/** Artificial label display facts only; never evaluates imported prices or selects by them. */
import type {QuantExperimentInput} from '../../types/api/quantExperiment';
import {experimentEngine} from '../../utils/quantLabelSearch';
import {freezeLabelTarget} from '../../utils/quantLabels';
import {temporalWindows} from '../../utils/quantTemporal';
import {mockLabelEvaluation} from './labelStudies';
type Row=Record<string,unknown>;
const obj=(v:unknown)=>v as Row;
const list=(v:unknown)=>v as Row[];
export function decorateLabelSearch<T>(result:T,input:QuantExperimentInput,start:string,end:string,count:number):T {
    if(!input.config.labelTarget)return result;
    const target=freezeLabelTarget(input.config.labelTarget),root=obj(result),output=obj(obj(root.envelope).output);
    const attempts=list(root.attempts),date=(index:number)=>new Date(Date.parse(start)+(Date.parse(end)-Date.parse(start))*index/(count-1)).toISOString();
    const label=(bounds:number[],origin:number,selection:boolean)=>{
        const value=mockLabelEvaluation(target,bounds[1]-bounds[0],date(bounds[0]),date(bounds[1]),date(bounds[1]-target.horizon_bars));
        value.version=selection?2:1;value.selection_used=selection;
        value.window={...value.window,start:bounds[0]-origin,end:bounds[1]-origin,last_origin:bounds[1]-origin-target.horizon_bars};
        return value;
    };
    const a=Math.floor(count*.6),b=Math.floor(count*.8);
    const schedules=input.config.walkForward?temporalWindows(count,input.config.walkForward,input.config.gap):[
        {calculation_start:0,partitions:{train:[1,a-1],validation:[a+input.config.gap,b-1],holdout:[b+input.config.gap,count-1]},inner_windows:undefined}];
    for(const attempt of attempts){
        const schedule=schedules[Number(attempt.fold || 1)-1],metrics=obj(attempt.metrics);
        let labels:Row={};
        if(attempt.inner_evaluation){const inner=obj(attempt.inner_evaluation);inner.version=2;
            const folds=list(inner.folds);
            for(const fold of folds){const window=schedule.inner_windows![Number(fold.number)-1];const trade=obj(fold.metrics),values:Row={};
                for(const part of ['train','validation'] as const)if(trade[part])values[part]=label(window.partitions[part],window.calculation_start,true);
                fold.label_metrics=values;
            }
            labels=folds.length?obj(folds[folds.length-1].label_metrics):{};
            inner.label_summary=folds.length===Number(inner.planned_folds)?Object.fromEntries(['train','validation'].map(part=>[part,{spearman_ic:0.2,pearson_ic:0.15,coverage:1}])):null;
        }else for(const part of ['train','validation'] as const)if(metrics[part])labels[part]=label(schedule.partitions[part],schedule.calculation_start,true);
        attempt.label_evaluation={version:1,metrics:labels};
    }
    output.engine_version=experimentEngine(input.config);
    output.selection_rule=input.config.walkForward?.version===2?'inner_mean_train_rank_ic_coverage_complexity_pareto_then_mean_validation_rank_ic_coverage_v1':'train_rank_ic_coverage_complexity_pareto_then_validation_rank_ic_coverage_v1';
    if(output.walk_forward){const folds=list(obj(output.walk_forward).folds);
        for(const fold of folds){const schedule=schedules[Number(fold.number)-1];
            fold.search_engine_version=experimentEngine({...input.config,walkForward:undefined});
            fold.label_holdout=label(schedule.partitions.holdout,(schedule.inner_windows && schedule.inner_windows[schedule.inner_windows.length-1]?.calculation_start) ?? schedule.calculation_start,false);
        }
        output.label_holdout=folds[folds.length-1].label_holdout;
    }else output.label_holdout=label(schedules[0].partitions.holdout,0,false);
    return result;
}
