import {useState} from 'react';
import {ChevronLeft, ChevronRight, Network} from 'lucide-react';
import type {BlacksmithActivity, BlacksmithHistory as History} from '../../types/api/blacksmith';
import EquipmentCard from '../Combat/EquipmentCard';
import ExecutionObservatoryDialog from '../TokenUsage/ExecutionObservatoryDialog';
import {blacksmithSceneLabels, blacksmithStatus, craftedEquipment, stageText} from './blacksmithPresentation';

export function BlacksmithActivityDetails({activity}: {activity: BlacksmithActivity}) {
    const [recordOpen, setRecordOpen] = useState(false);
    return <>
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600">{new Date(activity.createdAt).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', hour12: false})} · {blacksmithStatus(activity)} · {activity.operations.length}件</p>
            {activity.recordId && <button type="button" onClick={() => setRecordOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium text-orange-700"><Network className="h-3.5 w-3.5"/>执行流程与Token</button>}
        </div>
        {!!activity.operations.length && <div className="mt-3 grid gap-3 sm:grid-cols-2">{activity.operations.map(operation => <div key={operation.id}>
            <EquipmentCard item={craftedEquipment(operation)}/>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">第{operation.pieceIndex + 1}件 · 消耗{operation.result.energyCost}点体力{operation.reason ? ` · ${operation.reason}` : ''}</p>
        </div>)}</div>}
        {!activity.operations.length && <p className="mt-3 text-xs text-slate-500">本次尚未产出装备，未完成的打造不会扣除材料。</p>}
        {typeof activity.result.reason === 'string' && <p className="mt-3 text-xs leading-relaxed text-slate-600">{activity.result.reason}</p>}
        {!!activity.stages.length && <details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-medium">查看逐步选择</summary>
            <ol className="mt-2 space-y-2">{activity.stages.map((stage, index) => <li key={index} className="rounded-lg bg-slate-50 px-3 py-2">
                <span className="font-medium text-slate-800">{blacksmithSceneLabels[String(stage.scene || stage.phase || '')] || String(stage.title || stage.scene || stage.phase || '打造选择')}</span>
                <p className="mt-1 break-words leading-relaxed">{stageText(stage) || '系统已沿用合法候选'}</p>
                {typeof stage.reason === 'string' && stage.reason !== stageText(stage) && <p className="mt-1 leading-relaxed text-slate-500">{stage.reason}</p>}
            </li>)}</ol>
        </details>}
        {recordOpen && <ExecutionObservatoryDialog recordId={activity.recordId} taskName="铁匠铺打造" startedAt={activity.createdAt} onClose={() => setRecordOpen(false)}/>}
    </>;
}

export function BlacksmithHistory({history, page, onPage}: {history: History | null; page: number; onPage: (page: number) => void}) {
    return <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">
        {!history?.list.length ? <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">还没有打造记录。启用铁匠铺能力并安排居民行动后，成品与选择过程会保存在这里。</p>
            : <div className="space-y-3">{history.list.map(activity => <article key={activity.id} className="rounded-2xl border border-slate-200 bg-white p-4"><BlacksmithActivityDetails activity={activity}/></article>)}</div>}
        {!!history?.total && <div className="flex items-center justify-between gap-3 py-4 text-xs text-slate-600"><span>共{history.total}次活动 · 第{page}页</span>
            <div className="flex gap-2"><button type="button" aria-label="上一页打造记录" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5"/></button>
                <button type="button" aria-label="下一页打造记录" disabled={page * history.pageSize >= history.total} onClick={() => onPage(page + 1)} className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5"/></button></div>
        </div>}
    </div>;
}
