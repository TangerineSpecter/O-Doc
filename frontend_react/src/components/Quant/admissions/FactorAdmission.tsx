import {useEffect,useRef,useState} from 'react';
import type {AdmissionData,AdmissionSummary} from '../../../types/api/quantAdmission';
import {useQuantAdmissions} from '../../../hooks/useQuantAdmissions';
import {readAdmission,researchStageLabels,admissionOutcomeLabels,admissionKindLabels} from '../../../utils/quantAdmission';
import {quantDate} from '../../../utils/quant';
import {QuantButton} from '../ui';
import {AdmissionScope} from './AdmissionScope';
function Record({json}:{json:string}) {
    let value:AdmissionData|null=null,error='';
    try{value=readAdmission(json);}catch(cause){error=cause instanceof Error?cause.message:'分层依据读取失败';}
    if(!value)return <p role="alert" className="text-xs text-red-600">{error}</p>;
    return <div className="space-y-3 text-xs leading-6 text-slate-600">{value.local_demo&&<p>人工本地分层样例，未执行模型、源码或真实行情。</p>}{!!value.blockers.length&&<p className="text-orange-700">结构阻断：{value.blockers.join('、')}</p>}
            {value.scopes.length?<div className="max-h-96 space-y-3 overflow-auto pr-1 scrollbar-hide">{value.scopes.map((scope,index)=><AdmissionScope key={index} value={scope}/>)}</div>:<p>本条只记录受控定义的结构准入；实际参数与实证范围由后续直接证据分别确定。</p>}
            <p className="break-all text-slate-500">公式指纹：{value.candidate_hash}<br/>依据指纹：{value.basis.content_hash}</p>
        </div>;
}
export function FactorAdmission({collection,candidate,initial,changed}:{collection:string;candidate:string;initial?:AdmissionSummary;changed?:(value:AdmissionSummary)=>void}) {
    const [expanded,setExpanded]=useState(false);
    const state=useQuantAdmissions(collection,candidate,expanded),summary=state.data?.summary||initial;
    const notified=useRef('');
    useEffect(()=>{if(summary){const signature=JSON.stringify(summary);if(signature!==notified.current){notified.current=signature;changed?.(summary);}}},[summary,changed]);
    return <section className="space-y-3 border-t border-slate-100 pt-4" aria-label="因子研究分层"><h4 className="text-sm font-semibold">研究分层与准入</h4>
        <p className="text-sm font-medium text-slate-800">{summary?researchStageLabels[summary.stage]:'尚未读取研究分层'}</p>
        <p className="text-xs leading-6 text-slate-600">依据固定公式及直接计算自动归集。每条限定参数、市场、数据与成本；父代和旧版本的记录保留在各自版本。达标范围不代表跨市场有效或独立认证。</p>
        {summary&&<p className="text-xs leading-6 text-slate-600">{summary.recordCount}条准入与观察记录 · {summary.reviewCount}条需复核。{summary.criteriaMetCount + summary.criteriaNotMetCount > 0 ? `登记标准满足 ${summary.criteriaMetCount} 条、未满足 ${summary.criteriaNotMetCount} 条。` : '尚无登记标准判定。'}</p>}
        <QuantButton onClick={()=>setExpanded(x=>!x)}>{expanded?'收起分层依据':'查看分层依据'}</QuantButton>
        {expanded&&<div className="space-y-4">
            <div className="flex flex-wrap gap-2"><QuantButton disabled={state.busy} onClick={()=>void state.index()}>归集已有分层记录</QuantButton>{state.busy?<QuantButton onClick={state.stop}>停止归集</QuantButton>:<QuantButton onClick={state.reload}>刷新分层</QuantButton>}</div>
            {state.notice&&<p role="status" className="text-xs leading-6 text-slate-600">{state.notice}</p>}
            {state.loading?<p role="status" className="text-xs text-slate-500">正在读取版本、范围与准入依据…</p>:state.error?<div role="alert" className="space-y-2 text-xs text-red-600"><p>{state.error}</p><QuantButton onClick={state.reload}>重试</QuantButton></div>:state.data&&<>
                {!state.data.items.length&&<p className="text-xs leading-6 text-slate-500">旧记录尚未归集分层依据，可归集已有证据；不会启动模型、实验或源码执行。</p>}
                {state.data.items.map(row=><details key={row.id} className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-xs leading-6 text-slate-700">{researchStageLabels[row.stage]} · {admissionOutcomeLabels[row.outcome]||row.outcome}<br/>{quantDate(row.createdAt)}</summary><div className="mt-3"><Record json={row.dataJson}/><p className="mt-2 break-all text-xs text-slate-500">直接依据：{admissionKindLabels[row.kind]||row.kind} · {row.targetId}</p></div></details>)}
                {state.data.total>20&&<div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500"><span>{state.offset+1}–{state.offset+state.data.items.length} / {state.data.total}</span><QuantButton disabled={state.offset===0} onClick={()=>state.setOffset(x=>Math.max(0,x-20))}>上一页</QuantButton><QuantButton disabled={state.offset+20>=state.data.total} onClick={()=>state.setOffset(x=>x+20)}>下一页</QuantButton></div>}
            </>}
        </div>}
    </section>;
}
