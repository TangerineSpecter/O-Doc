import {useEffect, useRef, useState} from 'react';
import {FileClock} from 'lucide-react';
import {quantReadingApi} from '../../../api/quantReading';
import type {QuantController} from '../../../hooks/useQuant';
import type {QuantReportReading, QuantRevisionHeader, QuantTextBody} from '../../../types/api/quantReading';
import {quantDate, quantError} from '../../../utils/quant';
import {ReportMarkdown} from '../ReportMarkdown';
import {QuantButton} from '../ui';

function Revision({row, reportId, readRevision}: {row:QuantRevisionHeader;reportId:string;readRevision:QuantController['readRevision']}) {
    const [open,setOpen]=useState(false),[body,setBody]=useState<QuantTextBody|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
    useEffect(()=>{if(!open)return;const abort=new AbortController();void readRevision(reportId,row.id,abort.signal).then(value=>{if(!abort.signal.aborted)setBody(value);}).catch(cause=>{if(!abort.signal.aborted)setError(quantError(cause));});return()=>abort.abort();},[open,reportId,row.id,readRevision,retry]);
    return <details className="rounded-xl border border-slate-200 bg-white p-3.5" onToggle={event=>{setOpen(event.currentTarget.open);if(!event.currentTarget.open)setBody(null);}}>
        <summary className="cursor-pointer text-xs font-semibold text-slate-600">修订 · {quantDate(row.createdAt)}</summary>
        {open && <div className="mt-3 border-t border-slate-100 pt-3">{error?<p role="alert">{error}<QuantButton onClick={()=>{setError('');setRetry(n=>n+1);}}>重试</QuantButton></p>:body?<ReportMarkdown text={body.markdown}/>:<p role="status">正在读取修订…</p>}</div>}
    </details>;
}

export function ReportHistory({report,collection,entryId,controller}:{report:QuantReportReading;collection:string;entryId:string;controller:QuantController}) {
    const [open,setOpen]=useState(false),[original,setOriginal]=useState<QuantTextBody|null>(null);
    const [rows,setRows]=useState<QuantRevisionHeader[]>([]),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
    const abortRef=useRef<AbortController|null>(null);
    const readOriginal=controller.readOriginal;
    useEffect(()=>{
        if(!open)return;
        const abort=new AbortController();abortRef.current=abort;
        void Promise.all([readOriginal(report.id,abort.signal),quantReadingApi.revisions(collection,entryId,report.id,0,abort.signal)]).then(([body,page])=>{
            if(!abort.signal.aborted){setOriginal(body);setRows(page.items);setHasMore(page.hasMore);setError('');}
        }).catch(cause=>{if(!abort.signal.aborted)setError(quantError(cause));});
        return()=>abort.abort();
    },[open,report.id,report.currentRevisionId,collection,entryId,readOriginal,retry]);
    const more=async()=>{
        const signal=abortRef.current?.signal;if(!signal||signal.aborted)return;
        setLoading(true);setError('');
        try{const page=await quantReadingApi.revisions(collection,entryId,report.id,rows.length,signal);if(!signal.aborted){setRows(old=>[...old,...page.items]);setHasMore(page.hasMore);}}
        catch(cause){if(!signal.aborted)setError(quantError(cause));}finally{setLoading(false);}
    };
    return <details className="mt-6 rounded-xl border border-slate-100 bg-slate-50/50 p-4" onToggle={event=>{setOpen(event.currentTarget.open);if(!event.currentTarget.open){setOriginal(null);setRows([]);}}}>
        <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 sm:text-sm"><FileClock size={15}/><span>查看 AI 原稿与历史修订</span><span className="ml-auto">{report.revisionCount} 次修订</span></summary>
        {open && <div className="mt-4 space-y-4 border-t border-slate-200/60 pt-4">
            {error&&<p role="alert" className="text-sm text-red-600">{error}<QuantButton onClick={()=>setRetry(n=>n+1)}>重试</QuantButton></p>}
            {original?<section className="rounded-xl border border-slate-200 bg-white p-4"><h4 className="mb-3 text-xs font-bold text-slate-700">AI 不可变原稿</h4><ReportMarkdown text={original.markdown}/></section>:!error&&<p role="status">正在读取原稿…</p>}
            {rows.map(row=><Revision key={row.id} row={row} reportId={report.id} readRevision={controller.readRevision}/>)}
            {hasMore&&<QuantButton disabled={loading} onClick={()=>void more()}>{loading?'正在加载…':'更多修订'}</QuantButton>}
        </div>}
    </details>;
}
