import {musicActionText} from './musicPresentation';
import {rewardElementDescription} from './presentation';
import {useEffect,useRef,useState} from 'react';
import {getPartyEvents} from '../../api/combat';
import type {AdventurePartySnapshot} from '../../types/api/combat';

export default function PartyCombatLog({party}:{party:AdventurePartySnapshot}) {
    const [older,setOlder]=useState<AdventurePartySnapshot['events']>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[exhausted,setExhausted]=useState(false);
    const controller=useRef<AbortController|null>(null);
    useEffect(()=>()=>controller.current?.abort(),[]);
    const merged=[...new Map([...older,...party.events].map(e=>[e.id,e])).values()].sort((a,b)=>a.sequence-b.sequence);
    const loadOlder=async()=>{
        if(loading)return;setLoading(true);setError('');controller.current=new AbortController();
        try{const value=await getPartyEvents(party.id,merged[0]?.sequence||1,controller.current.signal);setOlder(v=>[...value.events,...v]);setExhausted(!value.hasMore);}catch(e){if(!controller.current.signal.aborted)setError(e instanceof Error?e.message:'战报加载失败');}finally{setLoading(false);}
    };
    const names=new Map(party.players.map(u=>[u.id,u.name]));
    const events=merged.flatMap(e=>(e.payload.events||[]).map((a,i)=>({key:`${e.id}:${i}`,action:a})));
    return <section className="rounded-2xl border border-slate-200 bg-white p-3 text-xs" aria-label="共同战报">
        <h3 className="mb-2 font-semibold text-slate-700">共同战报 · {party.players.length}/4人</h3>
        <div className="scrollbar-hide max-h-72 space-y-2 overflow-y-auto">
            {!events.length&&<p className="text-slate-500">还没有已确认的战斗行动。</p>}
            {events.slice().reverse().map(({key,action:a})=><div key={key} className="border-b border-slate-100 pb-2 text-slate-600">
                {a.rolls?a.rolls.map(roll=><p key={roll.rewardId}>{String(roll.reward.item.name||'战利品')}{rewardElementDescription(roll.reward)&&`（${rewardElementDescription(roll.reward)}）`} → {names.get(roll.winnerId)||'历史队员'}<span className="ml-1 text-slate-400">{roll.rounds.map(scores=>Object.entries(scores).map(([id,score])=>`${names.get(id)||'历史队员'} ${score}`).join(' / ')).join('；重roll ')}</span></p>):
                <p>{a.actor||''}{a.action?` · ${a.action}`:''}{a.target?` → ${a.target}`:''}{a.damage!=null?` 伤害${a.damage}`:''}{a.healing!=null?` 恢复${a.healing}`:''}{musicActionText(a)&&` · ${musicActionText(a)}`}{a.kind==='encounter'?'下一波遭遇':''}{a.kind==='rescue'?' 清场救援':''}</p>}
            </div>)}
        </div>
        {error&&<p role="alert" className="mt-2 text-rose-700">{error}</p>}
        {!exhausted&&(merged[0]?.sequence||1)>1&&<button type="button" disabled={loading} onClick={()=>{void loadOlder();}} className="mt-2 rounded-lg border border-slate-200 px-2 py-1">{loading?'加载中…':'加载更早共同战报'}</button>}
    </section>;
}
