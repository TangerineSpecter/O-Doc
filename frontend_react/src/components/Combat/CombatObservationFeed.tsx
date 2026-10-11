import {ArrowRight,Clock3,Flag,Heart,Shield,Sparkles,Swords,Trophy} from 'lucide-react';
import type {CombatAction,CombatEvent} from '../../types/api/combat';
import {elapsed,actionText} from './presentation';
import {observationEventMessage,observationEventGroups,observationKills} from './observationRecords';
import {MonsterPortrait} from './atlas/MonsterPortrait';

function ActionCard({action}:{action:CombatAction}) {
    const kill=action.kind==='kill',heal=action.healing!=null||action.restored!=null,encounter=action.kind==='encounter';
    const Icon=kill?Trophy:encounter?Flag:heal?Heart:action.damage!=null?Swords:Shield;
    const amount=action.hit===false?'闪避':action.damage!=null?`−${action.damage}`:heal?`+${action.healing??action.restored}`:null;
    return <article className={`flex items-start gap-2 rounded-xl px-2.5 py-2 ${kill?'bg-emerald-50':'bg-slate-50'}`}>
        <span className={`mt-0.5 rounded-lg p-1.5 ${kill||heal?'bg-emerald-100 text-emerald-600':'bg-white text-slate-400'}`}><Icon className="h-3 w-3"/></span>
        <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold leading-4 text-slate-700">{kill?`击败 ${action.monster?.name||'怪物'}`:encounter?`遭遇 ${action.name||'怪物'}`:action.action||action.kind}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[10px] leading-4 text-slate-400">{kill?`经验 +${action.experience??0}`:encounter?'新的交战开始':<>{action.actor}{action.target&&<><ArrowRight className="h-2.5 w-2.5"/>{action.target}</>}</>}</p>
            {!action.actor&&!kill&&!encounter&&!amount&&<p className="text-[10px] text-slate-400">{actionText(action)}</p>}
        </div>
        {amount&&<span className={`shrink-0 self-center text-sm font-bold tabular-nums ${heal?'text-emerald-600':action.critical?'text-orange-600':'text-slate-700'}`}>{action.critical&&<span className="mb-0.5 block text-right text-[8px] font-semibold">暴击</span>}{amount}</span>}
    </article>;
}

export function ObservationEvents({events}:{events:CombatEvent[]}) {
    const groups=observationEventGroups(events);
    return <div className="space-y-4">{groups.map(group=><section key={group.key} aria-label={`探索 ${elapsed(group.seconds)} 的战报`}>
        <div className="sticky -top-3 z-10 mb-2 flex items-center gap-2 bg-white py-2">
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-orange-800 shadow-sm shadow-orange-100/40">
                <Clock3 className="h-3 w-3 text-orange-500"/>
                <time dateTime={`PT${group.seconds}S`} title={`有效战斗 ${elapsed(group.seconds)}`} className="text-xs font-bold tabular-nums">{elapsed(group.seconds)}</time>
            </span>
            <span className="h-px flex-1 bg-orange-100"/><span className="shrink-0 text-[9px] font-medium text-slate-400">战斗记录</span>
        </div>
        <div className="ml-1.5 space-y-1.5 border-l-2 border-slate-100 pl-2.5">{group.rows.map(row=><div key={row.id}>
            {row.payload.events?.length?<div className="space-y-1.5">{row.payload.events.map((action,index)=><ActionCard key={index} action={action}/>)}</div>:
                <div className="flex items-start gap-2 rounded-xl border border-slate-100 px-2.5 py-2 text-[11px] leading-5 text-slate-500"><Flag className="mt-1 h-3 w-3 shrink-0 text-slate-400"/>{observationEventMessage(row)}</div>}
        </div>)}</div>
    </section>)}{!events.length&&<ObservationEmpty label="等待第一条战报" description="探索动作会持续播放，确认的记录将显示在这里。"/>}</div>;
}

export function ObservationKills({events,total}:{events:CombatEvent[];total:number}) {
    const records=observationKills(events);
    return <div>
        <div className="mb-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5"><span className="text-[11px] text-emerald-700">已确认击败</span><strong className="text-lg font-bold tabular-nums text-emerald-800">{total}<span className="ml-1 text-[10px] font-normal">只</span></strong></div>
        <div className="space-y-2">{records.map(({key,action,seconds})=><article key={key} className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white p-2.5">
            <MonsterPortrait monsterId={action.monster?.id||''} name={action.monster?.name} rank={action.monster?.rank} decorative className="h-11 w-11 shrink-0 rounded-lg bg-slate-50" fallbackClassName="h-6 w-6"/>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-700">{action.monster?.name||'怪物'}</p><p className="mt-1 text-[10px] text-slate-400">{action.monster&&`Lv.${action.monster.level} · `}{elapsed(seconds)}</p></div>
            <span className="text-[10px] font-semibold text-emerald-600">EXP +{action.experience??0}</span>
        </article>)}</div>
        {!records.length&&<ObservationEmpty label="尚无击败记录" description="击败结果确认后，魔物与所得经验会显示在这里。"/>}
        {total>records.length&&<p className="mt-3 text-[10px] leading-4 text-slate-400">此处显示已加载的击败记录，累计数量以战报为准。</p>}
    </div>;
}

export function ObservationEmpty({label,description}:{label:string;description:string}) {
    return <div className="py-12 text-center"><Sparkles className="mx-auto mb-3 h-6 w-6 text-slate-200"/><p className="text-xs font-medium text-slate-500">{label}</p><p className="mx-auto mt-2 max-w-[210px] text-[10px] leading-5 text-slate-400">{description}</p></div>;
}
