import {useState} from 'react';
import {useQuantValidations} from '../../../hooks/useQuantValidations';
import {QuantButton} from '../ui';
import {ValidationDetail} from './ValidationDetail';
import {RegisterValidation} from './RegisterValidation';
import type {QuantLabelTarget} from '../../../types/api/quantLabels';
export function ValidationPanel({collection,source,attempt,name,canRegister,datasets,openReport,labelTarget}: {labelTarget?:QuantLabelTarget;collection: string;source: string;attempt?: string;name: string;canRegister: boolean;datasets: ()=>void;openReport: (entry: string,report: string)=>void}) {
    const state=useQuantValidations(collection,source),[creating,setCreating]=useState(false);
    return <section className="space-y-4 border-t border-slate-100 pt-6" aria-label="固定方案新数据验证">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-sm font-semibold">固定方案 · 新数据验证</h4><p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500">把已评价的公式与实际参数冻结，用后续行情单独评价。完成后由 AI 解读和打研究分，保留所有数据使用记录。</p></div><div className="flex flex-wrap gap-2"><QuantButton onClick={state.reload}>刷新验证</QuantButton><QuantButton primary disabled={!canRegister || !attempt} onClick={()=>setCreating(true)}>登记当前尝试的验证</QuantButton></div></div>
        {state.actionError && <p role="alert" className="text-sm text-red-600">{state.actionError}</p>}
        {state.loading?<p role="status" className="text-sm text-slate-500">正在加载固定验证…</p>:state.error?<div role="alert" className="space-y-2 text-sm text-red-600"><p>{state.error}</p><QuantButton onClick={state.reload}>重试验证列表</QuantButton></div>:!state.items.length?<p className="rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-500">尚未登记固定验证。选中已评价的尝试后登记，再导入新的行情。</p>:<>
            <div className="flex flex-wrap gap-2">{state.items.map(row=><button key={row.id} aria-pressed={state.detail?.id===row.id} onClick={()=>state.setSelected(row.id)} className={`max-w-full break-words rounded-xl border px-3 py-2 text-left text-xs ${state.detail?.id===row.id?'border-orange-200 bg-orange-50 text-orange-700':'border-slate-200 text-slate-600'}`}>{row.name}</button>)}</div>
            {state.total>20 && <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">共 {state.total} 份登记</span><QuantButton disabled={!state.offset} onClick={()=>state.setOffset(Math.max(0,state.offset-20))}>上一页验证</QuantButton><QuantButton disabled={state.offset+20>=state.total} onClick={()=>state.setOffset(state.offset+20)}>下一页验证</QuantButton></div>}
            {state.detail && <ValidationDetail key={state.detail.id} collection={collection} plan={state.detail} busy={state.busy} act={state.act} datasets={datasets} openReport={openReport}/>}
        </>}
        {creating && attempt && <RegisterValidation labelTarget={labelTarget} collection={collection} source={source} attempt={attempt} name={name} close={()=>setCreating(false)} saved={id=>{setCreating(false);state.setSelected(id);state.reload();}}/>}
    </section>;
}
