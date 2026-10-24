import type {AdventureOption} from '../../types/api/combat';

export default function AdventureModeChoice({parties,loading,error,reload,value,onChange}:{parties:AdventureOption[];loading:boolean;error:string;reload:()=>void;value:AdventureOption|null;onChange:(value:AdventureOption|null)=>void}) {
    return <section aria-label="冒险方式" className="mt-4 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2"><h4 className="font-semibold text-slate-700">自己出发，或加入同行的居民</h4><button type="button" disabled={loading} onClick={reload} className="shrink-0 text-slate-500 underline">刷新队伍</button></div>
        <button type="button" aria-pressed={!value} onClick={()=>onChange(null)} className={`w-full rounded-xl border px-3 py-2.5 text-left ${!value?'border-orange-400 bg-orange-50':'border-slate-200 bg-white'}`}>
            <span className="font-semibold">自己出发</span><span className="ml-2 text-slate-500">途中允许其他居民加入，最多4人</span>
        </button>
        {loading&&<p role="status" className="py-2 text-slate-500">正在检查可加入的冒险…</p>}
        {error&&<p role="alert" className="text-rose-700">{error} <button type="button" onClick={reload} className="underline">重新加载</button></p>}
        {!loading&&!error&&!parties.length&&<p className="text-slate-500">当前没有符合等级、时间和体力要求的队伍。</p>}
        <div className="scrollbar-hide max-h-48 space-y-2 overflow-y-auto">
            {parties.map(party=><button type="button" key={party.id} aria-pressed={value?.id===party.id} onClick={()=>onChange(party)} className={`w-full rounded-xl border px-3 py-2.5 text-left ${value?.id===party.id?'border-orange-400 bg-orange-50':'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <span className="flex justify-between gap-2 font-semibold"><span>{party.dungeonName}</span><span className="shrink-0 tabular-nums">{party.members.length}/4人 · 可参与{Math.floor(party.durationSeconds/60)}分钟</span></span>
                <span className="mt-1 block break-words text-slate-600">{party.members.map(m=>`${m.name} · Lv.${m.level} ${m.jobName}`).join('；')}</span>
            </button>)}
        </div>
        {value&&<p className="text-slate-500">独立准备补给，在下一波开始前加入；队伍结束或满员时会结束本次准备。</p>}
    </section>;
}
