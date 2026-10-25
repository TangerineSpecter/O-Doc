import type {QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {useState} from 'react';
import {useQuantNativePython} from '../../../hooks/useQuantNativePython';
import type {QuantFactorCandidate} from '../../../types/api/quant';
import {nativeReasonLabels,nativeStatusLabels,nativeVerdictLabels} from '../../../utils/quantNativePython';
import {quantDate} from '../../../utils/quant';
import {QuantButton} from '../ui';
import {NativeForm} from './NativeForm';
import {NativeResult} from './NativeResult';
function NativeContent({collection,candidate,openSource,register,request}:{collection:string;candidate:QuantFactorCandidate;openSource:(entryId?:string,reportId?:string)=>void;register:QuantRegisterDraft;request:(action:()=>void)=>void}) {
    const state=useQuantNativePython(collection,candidate.id);const [form,setForm]=useState(false);
    if (state.loading&&!state.data)return <p role="status" className="text-xs text-slate-500">正在读取原始源码、运行环境与验证记录…</p>;
    if (state.error)return <div role="alert" className="space-y-2 text-xs text-red-600"><p>{state.error}</p><QuantButton onClick={state.reload}>重试读取</QuantButton></div>;
    const data=state.data;if (!data)return null;
    return <div className="space-y-4">
        <QuantButton disabled={state.loading} onClick={state.reload}>刷新验证记录</QuantButton>
        {data.options.source&&<p className="text-xs leading-6 text-slate-500">{data.options.source.note}</p>}
        {!data.options.source?<p className="rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">此候选固定来源没有可运行的Python原文。Pine、MQ4、通达信和聚宽平台环境尚未接入本机原生运行器。</p>:!data.options.runner.available?<div className="space-y-2 rounded-lg bg-orange-50 p-3 text-xs leading-6 text-slate-600"><p>{nativeReasonLabels[data.options.runner.reason]||'本机固定运行器尚未就绪'}。需在本机完成运行器安装后重试，页面不会自动下载或执行源码。</p><QuantButton onClick={state.reload}>重新检查环境</QuantButton></div>:<div className="flex flex-wrap items-center gap-3"><QuantButton primary disabled={!candidate.data.expression||!data.datasets.some(row=>row.rowCount>=30)} onClick={()=>setForm(true)}>验证原始Python并生成AI解读</QuantButton><p className="text-xs text-slate-500">{!candidate.data.expression?'当前候选尚无可比较的受控表达式':!data.datasets.some(row=>row.rowCount>=30)?'请先在实验室导入至少30行历史行情':'固定参数与样本，保留差异和失败'}</p></div>}
        {data.items.length?<div className="space-y-2">{data.items.map(row=><button key={row.id} onClick={()=>state.select(row.id)} className={`w-full rounded-lg border p-3 text-left text-xs leading-6 ${state.selected===row.id?'border-orange-300 bg-orange-50':'border-slate-200 bg-white'}`}><span className="font-medium">{row.name}</span><span className="ml-2 text-slate-500">{row.verdict?nativeVerdictLabels[row.verdict]:nativeStatusLabels[row.status]||row.status} · {quantDate(row.createdAt)}</span></button>)}{data.total>20&&<p className="text-xs text-slate-400">显示最近20次验证，共{data.total}次。</p>}</div>:<p className="text-xs text-slate-500">当前公式版本还没有原始Python验证记录。</p>}
        {state.selected&&(state.detailError?<p role="alert" className="text-xs text-red-600">{state.detailError}<QuantButton onClick={state.reload}>重试</QuantButton></p>:state.detail?<NativeResult collection={collection} record={state.detail} reload={state.reload} openSource={openSource}/>:<p role="status" className="text-xs text-slate-500">正在读取固定方案与输出差异…</p>)}
        {form&&<NativeForm collection={collection} candidate={candidate} options={data.options} datasets={data.datasets} register={register} close={()=>request(()=>setForm(false))} saved={record=>{setForm(false);state.select(record.id);state.reload();}}/>}
    </div>;
}
export function NativePanel(props:{collection:string;candidate:QuantFactorCandidate;openSource:(entryId?:string,reportId?:string)=>void;register:QuantRegisterDraft;request:(action:()=>void)=>void}) {
    const [expanded,setExpanded]=useState(false);
    return <section className="space-y-4 rounded-xl border border-slate-200 p-4" aria-label="原始Python验证与AI解读"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-semibold">原始Python验证与AI解读</h4><p className="mt-1 text-xs leading-6 text-slate-500">运行原始文本函数，核对实际参数及输出，让AI解释反例和后续检验。</p></div><QuantButton onClick={()=>props.request(()=>setExpanded(value=>!value))}>{expanded?'收起验证记录':'查看验证与运行环境'}</QuantButton></div>{expanded&&<NativeContent key={props.candidate.id} {...props}/>}</section>;
}
