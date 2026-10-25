import type {Combatant} from '../../types/api/combat';

function Meter({value,max,label,color}:{value:number;max:number;label:string;color:string}) {
    const ratio=max>0?Math.max(0,Math.min(100,value/max*100)):0;
    return <div className="flex items-center gap-1.5">
        <span className="w-4 text-[8px] font-semibold text-white/60">{label}</span>
        <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemax={max} aria-valuemin={0}
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/30"><div className={`h-full rounded-full ${color}`} style={{width:`${ratio}%`}}/></div>
        <span className="w-[54px] shrink-0 text-right text-[9px] tabular-nums text-white/85">{value}/{max}</span>
    </div>;
}

/** HUD reads confirmed snapshot values; demonstration hits never mutate these bars. */
export default function CombatFighterStatus({entity,label,enemy=false,round}:{entity:Combatant|null;label:string;enemy?:boolean;round?:number}) {
    return <section aria-label={enemy?'怪物状态':'居民状态'} className="min-w-0 rounded-xl border border-white/15 bg-slate-950/65 px-2.5 py-2 text-white shadow-lg backdrop-blur-sm sm:px-3">
        <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
            <h3 className="min-w-0 flex-1 truncate text-[11px] font-bold sm:text-xs">{entity?.name || '等待遭遇'}</h3>
            {entity&&<span className="shrink-0 text-[9px] tabular-nums text-white/70">Lv.{entity.level}</span>}
            <span className={`hidden shrink-0 rounded px-1 py-0.5 text-[9px] min-[420px]:inline ${enemy?'bg-orange-300/15 text-orange-200':'bg-sky-300/15 text-sky-200'}`}>{label}</span>
        </div>
        {entity?<div className="space-y-1">
            <Meter value={entity.hp} max={Number(entity.stats.hpMax)||0} label="HP" color={enemy?'bg-orange-400':'bg-emerald-400'}/>
            <Meter value={entity.mp} max={Number(entity.stats.mpMax)||0} label="MP" color="bg-sky-400"/>
            <div className="flex min-h-3 flex-wrap gap-1 pt-0.5 text-[9px] leading-3">
                {entity.bard?.beats!=null&&<span className="rounded bg-violet-300/20 px-1 text-violet-100">节拍 {entity.bard.beats}/3</span>}
                {entity.bard?.melody&&<span className="rounded bg-sky-300/20 px-1 text-sky-100">主旋律维持中</span>}
                {entity.states.length?entity.states.map((state,index)=><span key={`${state.code}:${index}`} className="rounded bg-white/15 px-1 text-amber-100">{state.code==='bard_resonance'?`共振 ${state.value||0}/3`:state.name}{state.remaining!=null?` · ${state.remaining}回合`:state.music&&state.expires!=null&&round!=null?` · ${Math.max(0,state.expires-round)}回合`:''}</span>):<span className="text-white/40">无持续状态</span>}
            </div>
        </div>:<p className="py-2 text-[10px] text-white/50">探索途中，等待下一次遭遇</p>}
    </section>;
}
