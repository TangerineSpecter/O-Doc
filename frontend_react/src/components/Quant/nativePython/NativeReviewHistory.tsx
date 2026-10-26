import type {NativeReviewHistoryItem} from '../../../types/api/quantNativePython';
import {quantDate} from '../../../utils/quant';
import {nativeStatusLabels} from '../../../utils/quantNativePython';
import {NativeAudit} from './NativeAudit';
import {QuantButton} from '../ui';
export function NativeReviewHistory({collection,entry,items,total,openReport}:{collection:string;entry:string;items:NativeReviewHistoryItem[];total:number;openReport:(id:string)=>void}) {
    if(!items.length)return null;
    return <details className="space-y-3 border-t border-slate-100 pt-3"><summary className="cursor-pointer">前次AI解读与拒绝记录 · 最近{items.length}/{total}条</summary><p>保留旧原稿、拒绝与失败；这里只展示最近10条，全部原件仍保存。</p>
        <div className="max-h-[32rem] space-y-4 overflow-auto scrollbar-hide">{items.map(row=><article key={row.runId} className="space-y-3 rounded-xl border border-slate-200 p-3"><p>{quantDate(row.createdAt)} · {row.modelName} · {nativeStatusLabels[row.status]||row.status}</p>{row.error&&<p className="text-orange-700">{row.error}</p>}{row.reportId&&<QuantButton onClick={()=>openReport(row.reportId!)}>打开前次已归档报告</QuantButton>}{row.audit&&<NativeAudit key={row.runId} collection={collection} entryId={entry} runId={row.runId} workflow={row.audit} allowResume={false}/>}</article>)}</div>
    </details>;
}
