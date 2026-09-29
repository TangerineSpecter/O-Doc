import type {FarmSelection, FarmState} from '../../types/api/farm';
import {FarmBonus} from './FarmBonus';
const animalNames={chicken:'鸡',cow:'牛',sheep:'羊'};
export function FarmDetails({farm,selection,onSelect}:{farm:FarmState;selection:FarmSelection|null;onSelect:(value:FarmSelection)=>void}) {
    const at=Date.parse(farm.serverTime)/1000;
    const plot=selection?.kind==='plot'?farm.state.plots.find(p=>p.id===selection.id):null;
    const animal=selection?.kind==='animal'?farm.state.animals.find(a=>a.id===selection.id):null;
    const building=selection?.kind==='building'?farm.state.buildings[selection.id as 'coop'|'barn']:null;
    const remaining=(seconds:number)=>seconds<=0?'已成熟':`${Math.ceil(seconds/60)} 分钟有效生长时间`;
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-800">农场观察</h2>
        <FarmBonus farm={farm}/>
        <div aria-live="polite" className="mt-3 min-h-24 rounded-xl bg-lime-50/70 p-4 text-sm leading-6 text-slate-600">
            {plot?<><p className="font-semibold text-slate-800">地块 {Number(plot.id)+1} · {plot.crop?.rules.name || '空地'}</p><p>{plot.crop?remaining(plot.crop.rules.growthSeconds-plot.crop.grown):'等待居民播种'}</p><p>{(plot.wet ?? (plot.wateredUntil>at||farm.weather==='rain'))?'土地湿润':'土地干燥，生长暂停'}</p></>:animal?<><p className="font-semibold text-slate-800">{animalNames[animal.kind]} · {animal.halfHearts/2} / 5 心</p><p>{animal.cycle.result?`待领取：${animal.cycle.result.quality==='gold'?'金色':'普通'}${animal.cycle.rules.product} × ${animal.cycle.result.quantity}`:remaining(animal.cycle.rules.periodSeconds-animal.cycle.grown)}</p><p>{animal.fedUntil>at?'饲料充足':'等待居民喂养，生产暂停'}</p></>:selection?.kind==='building'?<><p className="font-semibold text-slate-800">{selection.id==='coop'?'鸡舍':'牛羊舍'}</p><p>{building?`${building.level} 级 · 可容纳 ${building.capacity} 只`:'尚未建造'}</p></>:<p>选择一块田、一只动物或一座建筑，观察它的成长。居民会按自己的偏好安排经营。</p>}
        </div>
        <h3 className="mt-5 text-xs font-semibold text-slate-500">耕地 · {farm.state.plots.length} / 16</h3>
        <div className="mt-2 grid grid-cols-4 gap-2">{farm.state.plots.map(p=><button key={p.id} onClick={()=>onSelect({kind:'plot',id:p.id})} className={`rounded-lg border p-2 text-xs ${selection?.kind==='plot'&&selection.id===p.id?'border-orange-300 bg-orange-50 text-orange-700':'border-slate-100 bg-slate-50 text-slate-600'}`}>田 {Number(p.id)+1}<span className="mt-1 block text-[10px]">{p.crop?.rules.name||'空地'}</span></button>)}</div>
        <h3 className="mt-5 text-xs font-semibold text-slate-500">牧场居民 · {farm.state.animals.length}</h3>
        {!farm.state.animals.length?<p className="mt-2 text-xs text-slate-400">居民还没有购买动物。</p>:<div className="mt-2 space-y-2">{farm.state.animals.map((a,i)=><button key={a.id} onClick={()=>onSelect({kind:'animal',id:a.id})} className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-left text-xs text-slate-600"><span>{animalNames[a.kind]} {i+1}</span><span className="text-rose-400" aria-label={`${a.halfHearts/2}颗心`}>{'♥'.repeat(Math.floor(a.halfHearts/2))}{a.halfHearts%2?'½':''}{'♡'.repeat(5-Math.ceil(a.halfHearts/2))}</span></button>)}</div>}
        <div className="mt-4 flex gap-2">{(['coop','barn'] as const).map(kind=><button className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600" key={kind} onClick={()=>onSelect({kind:'building',id:kind})}>{kind==='coop'?'鸡舍':'牛羊舍'} · {farm.state.buildings[kind]?.level||0}级</button>)}</div>
    </section>;
}
