/** Local-only browser fixture using production components and MSW catalog routes. */
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {MaterialPortrait} from '../src/components/Combat/atlas/MaterialPortrait';
import {MaterialAtlasView} from '../src/components/Combat/atlas/MaterialAtlasView';
import {InventoryItemIcon} from '../src/components/AgentWorld/InventoryItemIcon';
import {MarketListingItemIcon} from '../src/components/Market/MarketListingItemIcon';
import {TransactionItemIcon} from '../src/components/Market/TransactionItemIcon';
import {ObservationLootGrid,ObservationLootDetails} from '../src/components/Combat/CombatObservationLoot';
import {materialArtRows as rows,materialArtInventorySamples as bags,materialArtMarketSamples as market} from '../src/mocks/agentWorld/materialArtSamples';
import {getCombatCatalog} from '../src/api/combat';
import {worker} from '../src/mocks/browser';
import {localMode} from '../src/config/development';
import {saveAuthToken} from '../src/utils/authStorage';
import type {CombatCatalog} from '../src/types/api/combat';
import '../src/index.css';
if(!localMode)throw new Error('Requires pure local mode');
await worker.start({onUnhandledRequest:'bypass'});
saveAuthToken('local-demo-token',false);
function App(){
 const view=new URLSearchParams(location.search).get('view')||'gallery';
 const [catalog,setCatalog]=useState<CombatCatalog|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState<string|null>(null);
 useEffect(()=>{if(view==='atlas')getCombatCatalog().then(setCatalog).catch(()=>setError('材料目录加载失败'));},[view]);
 const slots=rows.map(row=>({key:row.id,quantity:3,times:[12],reward:{id:row.id,kind:'material' as const,item:row,quantity:3,elapsedSeconds:12}}));
 return <main className="p-4" style={{height:view==='atlas'?'100dvh':undefined,display:'flex',flexDirection:'column',gap:12}}>
 {view==='atlas'?error?<div role="alert">{error}</div>:catalog?<MaterialAtlasView catalog={catalog}/>:<div role="status">正在加载材料目录</div>:
 view==='loot'?<><ObservationLootGrid slots={slots} onSelect={setSelected}/>{selected&&<ObservationLootDetails slot={slots.find(row=>row.key===selected)!} onClose={()=>setSelected(null)}/>}</>:
 <><h1 className="text-xl font-bold">四元素材料 · 像素图标</h1><div className="flex gap-3"><MaterialPortrait materialId="material.sunken_ruins.3" name="遗迹碎晶" className="h-20 w-20"/><MaterialPortrait materialId="material.ember_fortress.2" name="熔岩碎片" className="h-20 w-20"/><MaterialPortrait materialId="material.star_rift.2" name="星蚀结晶" className="h-20 w-20"/></div>
 <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">{rows.map((row,i)=><article key={row.id} data-material-row={row.id} className="rounded-2xl border border-slate-200 bg-white p-3"><MaterialPortrait materialId={row.id} name={row.name} className="h-24 w-full"/><p className="text-center text-sm font-semibold">{row.name}</p><div className="mt-3 flex items-center justify-around border-t border-slate-100 pt-2"><InventoryItemIcon item={bags[i]} className="h-9 w-9" fallback="缺图"/><MarketListingItemIcon item={market[i]} className="h-9 w-9" fallback="缺图"/><TransactionItemIcon transaction={{id:row.id,actorId:'local',actorName:'白露',sessionId:'local',operation:{kind:'sell_combat_material',material_id:row.id},result:{name:row.name,materialId:row.id},createdAt:'2026-10-29T00:00:00Z'}} isSell isBuy={false}/></div></article>)}</div></>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
