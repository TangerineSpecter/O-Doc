import {useEffect,useRef,useState} from 'react';
import type {AdventurePartySnapshot} from '../../types/api/combat';
import CombatFighterStatus from './CombatFighterStatus';
import type {PartyBattleScene} from './animation/observation/PartyBattleScene';

export default function PartyBattleStage({party,personalKills}:{party:AdventurePartySnapshot;personalKills:number}) {
    const host=useRef<HTMLDivElement>(null),scene=useRef<PartyBattleScene|null>(null),latest=useRef(party);
    const [error,setError]=useState(false),[paused,setPaused]=useState(false);
    useEffect(()=>{latest.current=party;void scene.current?.update(party).catch(()=>setError(true));},[party]);
    useEffect(()=>{
        let active=true;
        void import('./animation/observation/PartyBattleScene').then(async ({PartyBattleScene})=>{
            if(!active||!host.current)return;
            const instance=new PartyBattleScene(host.current,latest.current,()=>setError(true));scene.current=instance;
            try{await instance.init();}catch{if(active)setError(true);}
        });
        return ()=>{active=false;scene.current?.dispose();scene.current=null;};
    },[]);
    useEffect(()=>scene.current?.setPaused(paused),[paused]);
    const names=new Map([...party.players,...party.enemies].map(u=>[u.id,u.name]));
    return <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="组队冒险">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-slate-600">
            <span>第{party.wave}波 · 第{party.round}回合 · {party.roundSeconds}秒/回合</span>
            <button type="button" aria-pressed={paused} onClick={()=>setPaused(v=>!v)} className="rounded-lg border border-slate-200 px-2 py-1">{paused?'继续画面':'暂停画面'}</button>
        </div>
        <div className="relative aspect-[720/423] w-full bg-[#304642]"><div ref={host} className="absolute inset-0"/></div>
        {error&&<p role="status" className="p-3 text-xs text-amber-800">场景加载失败，战斗状态与记录仍可查看。</p>}
        <p className="px-3 py-2 text-xs text-slate-600">{party.phase==='searching'?'寻敌中，等待下一波；准备完成的居民将在波次边界加入。':`行动顺序：${party.actionOrder.map(id=>names.get(id)||'已离场').join(' → ')||'等待下一回合'}`}</p>
        <p className="px-3 pb-2 text-xs text-slate-500">队伍累计击败 {party.teamKills} 只 · 本人参与击败 {personalKills} 只</p>
        <div className="grid grid-cols-2 gap-2 px-2 pb-2">
            <div className="grid items-start gap-2" style={{gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 10rem), 1fr))'}}>{party.players.map(u=><div key={u.id}><CombatFighterStatus entity={u} label={u.jobName||'居民'}/>{u.hp<=0&&<p className="px-1 pt-1 text-xs text-rose-700">倒地 · 等待队友救援</p>}</div>)}</div>
            <div className="grid items-start gap-2" style={{gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 10rem), 1fr))'}}>{party.enemies.map(u=><div key={u.id}><CombatFighterStatus entity={u} label={u.rank==='boss'?'首领':u.rank==='elite'?'精英':'普通'} enemy/>{u.taunt&&u.taunt.expires>party.round&&<p className="px-1 pt-1 text-xs text-orange-700">嘲讽目标：{names.get(u.taunt.actorId)}</p>}</div>)}</div>
        </div>
    </section>;
}
