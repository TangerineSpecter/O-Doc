import {useCallback, useState} from 'react';
import {CloudRain, Package, Settings2, Sun, Warehouse} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Select} from '../common/Select';
import {AgentInventoryDialog} from '../AgentWorld/AgentInventoryDialog';
import {FarmCanvas} from './FarmCanvas';
import {FarmDetails} from './FarmDetails';
import {FarmConfiguration} from './FarmConfiguration';
import {useFarm} from '../../hooks/useFarm';
import type {FarmSelection} from '../../types/api/farm';
export default function FarmPanel({initialAgentId}: {initialAgentId: string}) {
    const {farms,agentId,setAgentId,farm,history,loading,error,refresh}=useFarm(initialAgentId);
    const [selection,setSelection]=useState<FarmSelection|null>(null),[configure,setConfigure]=useState(false),[inventory,setInventory]=useState(false);
    const close=useCallback(()=>setConfigure(false),[]);
    return <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            {!!farms.length&&<div className="min-w-40"><Select menuPortal value={agentId} options={farms.map(f=>({value:f.id,label:f.actorName}))} onChange={id=>{setAgentId(id);setSelection(null);setConfigure(false);setInventory(false);}}/></div>}
            <div className="flex flex-wrap items-center gap-2">
                <Link to="/settings?tab=agent" className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">经营任务设置</Link>
                {farm&&<><button onClick={()=>setInventory(true)} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600"><Package className="h-4 w-4"/>打开背包</button><button onClick={()=>setConfigure(true)} className="flex items-center gap-1 rounded-lg bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-600"><Settings2 className="h-4 w-4"/>农场配置</button></>}
            </div>
        </div>
        {error&&<div role="alert" className="flex items-center justify-between rounded-xl bg-orange-50 p-4 text-sm text-orange-700">{error}<button onClick={refresh} className="ml-3 shrink-0 underline">重试</button></div>}
        {loading&&!farm?<div className="rounded-2xl bg-white p-12 text-center text-slate-500">正在查看农场…</div>:!farm?<section className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm"><Warehouse className="mx-auto h-12 w-12 text-lime-400"/><h2 className="mt-4 font-semibold text-slate-700">农场还在等待第一位居民</h2><p className="mt-2 text-sm text-slate-500">在 Agent 任务中配置并启用“农场经营”，绑定居民后获得四块初始耕地。</p><Link to="/settings?tab=agent" className="mt-5 inline-block rounded-lg bg-orange-500 px-4 py-2 text-sm text-white">配置农场任务</Link></section>:<>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]"><div className="space-y-4"><div className="flex flex-wrap items-center gap-3 px-1 text-xs text-slate-600"><span className="inline-flex items-center gap-1 rounded-full bg-lime-50 px-3 py-1.5 text-lime-700">{farm.weather==='rain'?<CloudRain className="h-4 w-4"/>:<Sun className="h-4 w-4"/>}{farm.weather==='rain'?'雨天 · 自动浇水':'晴天'}</span><span>余额 <b className="text-slate-800">{farm.balance??'历史居民'}</b></span><span>{farm.currentAction||'居民正在按自己的节奏生活'}</span></div><FarmCanvas farm={farm} onSelect={setSelection}/><p className="px-1 text-xs leading-5 text-slate-400">农场按现实时间成长，缺水或缺饲料暂停，不会枯萎。动物每天首次喂养增加半颗心；满心有50%双产、10%金色产物。</p></div><FarmDetails farm={farm} selection={selection} onSelect={setSelection}/></div>
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-bold text-slate-800">经营记录</h2>{!history.length?<p className="mt-4 text-sm text-slate-400">尚无经营记录，等待居民的第一次行动。</p>:<div className="mt-4 max-h-80 space-y-3 overflow-y-auto">{history.map(o=><article key={o.id} className="border-l-2 border-lime-200 pl-3"><div className="flex justify-between gap-3 text-xs"><b className="text-slate-700">{o.result.label}</b><span className={Number(o.result.amount)>0?'text-lime-600':'text-slate-500'}>{Number(o.result.amount)!==0?`${Number(o.result.amount)>0?'+':''}${o.result.amount}`:'体力 −2'}</span></div><p className="mt-1 text-xs leading-5 text-slate-500">{o.reason}</p>{o.result.products&&<p className="text-xs text-amber-700">{o.result.products.map(p=>`${p.name} ×${p.quantity}`).join('、')}</p>}<time className="text-[10px] text-slate-400">{new Date(o.createdAt).toLocaleString('zh-CN')}</time></article>)}</div>}</section>
        </>}
        {configure&&farm&&<FarmConfiguration farm={farm} onClose={close} onSaved={refresh}/>}
        {inventory&&farm&&<AgentInventoryDialog agentId={farm.id} name={farm.actorName} onClose={()=>setInventory(false)}/>}
    </div>;
}
