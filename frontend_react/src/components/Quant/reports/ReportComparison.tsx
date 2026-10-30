import {useEffect,useState} from 'react';
import type {QuantController} from '../../../hooks/useQuant';
import type {QuantReportReading,QuantReportHeader,QuantRunSummary} from '../../../types/api/quantReading';
import {compareReportRecords,isStaticReport} from '../../../utils/quantReportDiff';
import {quantDate,quantError} from '../../../utils/quant';
import {Select} from '../../common/Select';
import {cardClass,QuantButton} from '../ui';
import {ReportRecordDiff} from './ReportRecordDiff';
import {ReportTextDiff} from './ReportTextDiff';

function ComparisonBody({baseline,report,runs,controller}:{baseline:QuantReportHeader;report:QuantReportReading;runs:QuantRunSummary[];controller:QuantController}) {
    const [mode,setMode]=useState<'original'|'saved'>('original');
    const [value,setValue]=useState<{baseline:QuantReportReading;before:string;after:string}|null>(null);
    const [error,setError]=useState(''),[retry,setRetry]=useState(0);
    const readOriginal=controller.readOriginal,readReport=controller.readReport;
    useEffect(()=>{
        const abort=new AbortController();
        void (async()=>{
            const body=await readReport(baseline.id,abort.signal);
            const text=mode==='original'?await Promise.all([readOriginal(baseline.id,abort.signal),readOriginal(report.id,abort.signal)]):[{markdown:body.markdown},{markdown:report.markdown}];
            if(!abort.signal.aborted){setValue({baseline:body,before:text[0].markdown,after:text[1].markdown});setError('');}
        })().catch(cause=>{if(!abort.signal.aborted)setError(quantError(cause));});return()=>abort.abort();
    },[baseline.id,baseline.currentRevisionId,report.id,report.currentRevisionId,report.markdown,mode,readReport,readOriginal,retry]);
    if(error)return <p role="alert" className="mt-4 text-sm text-red-600">{error}<QuantButton onClick={()=>setRetry(n=>n+1)}>重试</QuantButton></p>;
    if(!value)return <p role="status" className="mt-4 text-sm text-slate-500">正在读取两份对照报告…</p>;
    const diff=compareReportRecords(value.baseline,report);
    return <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">
        <div className="grid gap-3 text-xs leading-6 text-slate-500 sm:grid-cols-2">{[value.baseline,report].map((row,i)=><div key={row.id}><h4 className="font-semibold text-slate-700">{i?'当前所选报告':'基准报告'}</h4><p>{row.data.title||'历史报告'} · {quantDate(row.createdAt)}</p><p>模型：{runs.find(run=>run.id===row.runId)?.modelName||'未提供'}</p></div>)}</div>
        <p className="text-xs text-slate-500">两份报告分别保留原稿事实与修订，不调用模型、不自动改变评分或证据等级。</p>
        <ReportRecordDiff diff={diff}/>
        <div role="group" aria-label="正文对照口径" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{(['original','saved'] as const).map(option=><button type="button" key={option} aria-pressed={mode===option} onClick={()=>{setValue(null);setMode(option);}} className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs ${mode===option?'bg-white text-slate-900':'text-slate-500'}`}>{option==='original'?'AI 原稿正文':'已保存的修订正文'}</button>)}</div>
        <ReportTextDiff before={value.before} after={value.after}/>
    </div>;
}

export function ReportComparison({headers,report,runs=[],inModal=false,controller}:{headers:QuantReportHeader[];report:QuantReportReading;runs?:QuantRunSummary[];inModal?:boolean;controller:QuantController}) {
    const [open,setOpen]=useState(false),[baselineId,setBaselineId]=useState('');
    const options=headers.filter(row=>row.id!==report.id&&isStaticReport(row));
    const baseline=options.find(row=>row.id===baselineId)||options.find(row=>row.createdAt<=report.createdAt)||options[options.length-1];
    if(!isStaticReport(report))return null;
    return <details className={cardClass} onToggle={event=>setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">报告对照 · 查看判断、参数和正文变化</summary>
        {open&&<div className="mt-4 space-y-3">
            {baseline?<><Select menuPortal={inModal} value={baseline.id} onChange={setBaselineId} options={options.map(row=>({value:row.id,label:`${row.title||'历史报告'} · ${quantDate(row.createdAt)}`}))}/><ComparisonBody key={baseline.id} baseline={baseline} report={report} runs={runs} controller={controller}/></>:<p className="text-sm text-slate-500">尚无另一份可对照报告。</p>}
            {controller.pages.reports?.hasMore&&<QuantButton onClick={()=>void controller.safe(()=>controller.loadPage('reports',true),false)}>更多历史报告</QuantButton>}
        </div>}
    </details>;
}
