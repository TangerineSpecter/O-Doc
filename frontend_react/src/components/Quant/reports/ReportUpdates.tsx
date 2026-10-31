import {useState} from 'react';
import {createPortal} from 'react-dom';
import {FileClock,FileSpreadsheet,Trash2} from 'lucide-react';
import type {QuantWorkspace} from '../../../types/api/quantReading';
import type {QuantDocumentController} from '../../../hooks/useQuantDocument';
import {quantDate} from '../../../utils/quant';
import {QuantButton,QuantModal} from '../ui';
import {DocumentChanges} from './DocumentChanges';

export function ReportUpdates({entry,targetId,select,request,state,collection}: {
    entry:QuantWorkspace;targetId:string;select:(id:string)=>void;request:(action:()=>void)=>void;
    state:QuantDocumentController;collection:string;
}) {
    const [open,setOpen]=useState(false);
    const [compare,setCompare]=useState<string|null>(null);
    const [confirmDelete,setConfirmDelete]=useState<string|null>(null);
    const currentId=state.document?.report?.id||entry.defaultReportId||'';
    const historical=!!targetId&&targetId!==currentId;
    const pending=state.document?.pending[0];
    const finish=()=>{select('');setCompare(null);};
    const remove=async()=>{
        try{await state.change({action:confirmDelete==='all'?'clear_history':'delete_history',identity:confirmDelete||''});setConfirmDelete(null);}catch{/* Error is displayed below. */}
    };
    return <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-xs text-slate-600">
        <FileSpreadsheet size={14} className="text-orange-500"/><span className="font-bold text-slate-800">{historical?'正在查看原分析记录':'当前研究'}</span>
        {historical&&<QuantButton size="sm" onClick={()=>request(()=>select(''))}>返回当前研究</QuantButton>}
        {pending&&<QuantButton size="sm" primary onClick={()=>request(()=>setCompare(''))}>查看待采用变更 · {pending.changedSections.length} 项</QuantButton>}
        <QuantButton size="sm" onClick={()=>request(()=>setOpen(true))}><FileClock size={13}/>更新记录</QuantButton>
        {state.error&&<><span role="alert" className="text-red-600">{state.error}</span><QuantButton size="sm" onClick={state.retry}>重新加载</QuantButton></>}
        {open&&createPortal(<QuantModal title="更新记录" subtitle="当前研究只有一份。最近 5 次内容状态可按部分恢复，也可删除恢复记录。" wide fixedHeight close={()=>setOpen(false)}>
            <div className="space-y-3">
                {!!state.document?.history.length&&<div className="flex justify-end"><QuantButton size="sm" onClick={()=>setConfirmDelete('all')}>清空恢复记录</QuantButton></div>}
                {state.document?.history.map(row=><div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div><p className="text-sm font-bold text-slate-800">{row.label}</p><p className="mt-1 text-xs text-slate-400">{quantDate(row.createdAt)}</p></div>
                    <div className="flex gap-2"><QuantButton size="sm" onClick={()=>{setOpen(false);setCompare(row.id);}}>比对与恢复</QuantButton><QuantButton size="sm" onClick={()=>setConfirmDelete(row.id)}><Trash2 size={12}/>删除</QuantButton></div>
                </div>)}
                {!state.document?.history.length&&<p className="py-8 text-center text-sm text-slate-500">暂无更新记录</p>}
                {confirmDelete&&<div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900"><p>删除后不能通过这条记录恢复。当前内容和已被实验引用的算法来源会保留。</p><div className="mt-3 flex gap-2"><QuantButton disabled={state.busy} onClick={()=>setConfirmDelete(null)}>取消</QuantButton><QuantButton disabled={state.busy} primary onClick={()=>void remove()}>删除恢复记录</QuantButton></div></div>}
                {state.error&&<p role="alert" className="text-sm text-red-600">{state.error}</p>}
                {entry.reportHeaders.some(row=>row.schemaVersion>=4)&&<details className="text-sm text-slate-500"><summary>实验复盘与反馈</summary>{entry.reportHeaders.filter(row=>row.schemaVersion>=4).map(row=><button key={row.id} className="block py-2 text-left" onClick={()=>{select(row.id);setOpen(false);}}>{row.title} · {quantDate(row.createdAt)}</button>)}</details>}
            </div>
        </QuantModal>,document.body)}
        {compare!==null&&createPortal(<QuantModal title={compare?'按部分恢复':'比对待采用变更'} wide fixedHeight close={()=>setCompare(null)}><DocumentChanges key={`${compare}:${state.document?.revision}`} collection={collection} entry={entry.id} state={state} historyId={compare||undefined} close={finish}/></QuantModal>,document.body)}
    </div>;
}
