import {Clock3,FlaskConical,Sparkles,Swords,Zap} from 'lucide-react';
import type {CombatSnapshot} from '../../types/api/combat';
import {statusLabels} from './presentation';

const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;

export default function CombatObservationSummary({snapshot,busy,onCommand}:{snapshot:CombatSnapshot;busy?:boolean;onCommand?:(operation:'recall'|'resume')=>void}) {
    const result=snapshot.result;
    const used=Object.values(result.potionsUsed||{}).reduce((sum,value)=>sum+value,0);
    const carried=Object.values(snapshot.potions).reduce((sum,value)=>sum+value,0);
    const active=['preparing','active','paused'].includes(snapshot.status);
    const metrics=[{icon:Clock3,label:'',value:`${clock(snapshot.elapsedSeconds)} / ${clock(snapshot.durationSeconds)}`,title:'有效战斗时长 / 计划时长'},
        {icon:Zap,label:'体力',value:result.energy??0},{icon:Sparkles,label:'经验',value:`+${result.experience??0}`},
        {icon:Swords,label:'击败',value:result.kills??0},{icon:FlaskConical,label:'药剂',value:`${used} / ${carried}`,title:'已消耗 / 携带剩余'}];
    return <div aria-label="探索摘要" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 font-semibold ${active?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${active?'bg-emerald-500':'bg-slate-400'}`}/>{statusLabels[snapshot.status]||snapshot.status} · {statusLabels[snapshot.stage]||snapshot.stage}</span>
            {metrics.map(({icon:Icon,label,value,title})=><span key={label||'时长'} title={title} className="inline-flex items-center gap-1 whitespace-nowrap text-slate-500"><Icon className="h-3 w-3 text-slate-400"/>{label}<strong className="font-semibold tabular-nums text-slate-700">{value}</strong></span>)}
            {snapshot.canControl&&active&&onCommand&&<div className="ml-auto flex gap-2 text-orange-700">
                {snapshot.status==='paused'&&<button disabled={busy} onClick={()=>onCommand('resume')} className="font-semibold disabled:opacity-40">恢复</button>}
                <button disabled={busy} onClick={()=>onCommand('recall')} className="font-semibold disabled:opacity-40">提前召回</button>
            </div>}
    </div>;
}
