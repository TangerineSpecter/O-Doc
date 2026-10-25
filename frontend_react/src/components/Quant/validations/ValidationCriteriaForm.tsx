import type {CriteriaForm} from '../../../hooks/useQuantValidationRegistration';
import {QuantField} from '../ui';

export function ValidationCriteriaForm({enabled,value,toggle,change}: {enabled:boolean;value:CriteriaForm;toggle:(value:boolean)=>void;change:(key:keyof CriteriaForm,value:string)=>void}) {
    return <section className="space-y-4 border-t border-slate-100 pt-4">
        <label className="flex items-center gap-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={enabled} onChange={event=>toggle(event.target.checked)}/>预先登记数值判定标准</label>
        <p className="text-xs leading-6 text-slate-500">可选；留空的维度保持未要求。启用后至少填写一项，计算时逐项判定，不在看到结果后修改标准。</p>
        {enabled && <><div className="grid gap-4 sm:grid-cols-2">{([
            ['minTotalReturn','最低成本后收益（%）'],['maxDrawdown','最大回撤上限（0–100%）'],
            ['minExcessReturn','相对同成本基线最低超额收益（百分点）'],['minSignalCoverage','最低信号覆盖率（0–100%）'],
            ['minEntries','最少入场次数'],
        ] as const).map(([key,label])=><QuantField key={key} label={label} value={value[key]} onChange={text=>change(key,text)}/>)}</div>
            <p className="text-xs leading-6 text-slate-500">所有填写项均须满足。百分比类比较的固定绝对容差为1e-12（小数口径），次数精确比较。达标仅限本公式、参数和区间，不证明盈利、参数最优或全局独立性。</p></>}
    </section>;
}
