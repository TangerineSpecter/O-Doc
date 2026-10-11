import {useEffect,useMemo,useRef,useState} from 'react';
import {ScrollText,Package,Trophy} from 'lucide-react';
import type {CombatEvent,CombatSnapshot} from '../../types/api/combat';
import {observationLoot} from './observationRecords';
import {ObservationEvents,ObservationKills} from './CombatObservationFeed';
import {ObservationLootGrid,ObservationLootDetails} from './CombatObservationLoot';

const tabs=[{id:'events',name:'战斗动态',icon:ScrollText},{id:'drops',name:'掉落',icon:Package},{id:'kills',name:'击败记录',icon:Trophy}] as const;
export default function CombatObservationSidebar({snapshot,events}:{snapshot:CombatSnapshot;events:CombatEvent[]}) {
    const [tab,setTab]=useState<'events'|'drops'|'kills'>('events'),[selected,setSelected]=useState<string|null>(null);
    const list=useRef<HTMLDivElement>(null),following=useRef(true);
    const slots=useMemo(()=>observationLoot(snapshot.result.rewards||[]),[snapshot.result.rewards]);
    const details=slots.find(slot=>slot.key===selected);
    useEffect(()=>{if(tab==='events'&&following.current&&list.current)list.current.scrollTop=list.current.scrollHeight;},[events,tab]);
    return <aside aria-label="探索记录" className="flex h-[390px] min-h-0 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:h-full">
        <div className="flex shrink-0 gap-1 border-b border-slate-100 p-2">{tabs.map(({id,name,icon:Icon})=><button key={id} type="button" aria-pressed={tab===id}
            onClick={()=>{setTab(id);following.current=true;if(list.current)list.current.scrollTop=0;}}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[10px] transition ${tab===id?'bg-orange-50 font-semibold text-orange-700':'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}><Icon className="h-3.5 w-3.5"/>{name}</button>)}</div>
        <div ref={list} role={tab==='events'?'log':undefined} aria-label={tabs.find(item=>item.id===tab)?.name} aria-live="off"
            onScroll={()=>{if(tab==='events'&&list.current)following.current=list.current.scrollHeight-list.current.scrollTop-list.current.clientHeight<40;}}
            className="scrollbar-hide min-h-0 flex-1 overflow-y-auto p-3">
            {tab==='events'&&<ObservationEvents events={events}/>}
            {tab==='drops'&&<ObservationLootGrid slots={slots} onSelect={setSelected}/>}
            {tab==='kills'&&<ObservationKills events={events} total={snapshot.result.kills??0}/>}
        </div>
        {snapshot.result.report&&<details className="shrink-0 border-t border-slate-100 bg-orange-50/60 px-3 py-2 text-[11px] text-orange-800"><summary className="cursor-pointer font-semibold">探索结算摘要</summary><p className="scrollbar-hide mt-2 max-h-24 overflow-y-auto leading-5">{snapshot.result.report}</p></details>}
        {details&&<ObservationLootDetails slot={details} onClose={()=>setSelected(null)}/>}
    </aside>;
}
