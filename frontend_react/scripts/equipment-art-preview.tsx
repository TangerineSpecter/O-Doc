/** Browser-only fixture. Uses production portraits and typed local data. */
import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {EquipmentAtlasView} from '../src/components/Combat/atlas/EquipmentAtlasView';
import {EquipmentPortrait} from '../src/components/Combat/atlas/EquipmentPortrait';
import {PotionPortrait} from '../src/components/Combat/atlas/PotionPortrait';
import EquipmentCard from '../src/components/Combat/EquipmentCard';
import {DiabloEquipmentSlot} from '../src/components/Combat/DiabloEquipmentSlot';
import {MarketListingItemIcon} from '../src/components/Market/MarketListingItemIcon';
import {TransactionItemIcon} from '../src/components/Market/TransactionItemIcon';
import {combatCatalog} from '../src/mocks/agentWorld/adventure';
import {getCombatCatalog} from '../src/api/combat';
import {worker} from '../src/mocks/browser';
import {localMode} from '../src/config/development';
import {saveAuthToken} from '../src/utils/authStorage';
import type {CombatCatalog} from '../src/types/api/combat';
import {equipmentArtTemplates as rows,equipmentArtSamples,equipmentArtMarketSamples} from '../src/mocks/agentWorld/equipmentArtSamples';
import {ObservationLootGrid,ObservationLootDetails} from '../src/components/Combat/CombatObservationLoot';
import {MarketDetailSidebar} from '../src/components/Market/MarketDetailSidebar';
import '../src/index.css';
if (!localMode) throw new Error('Requires pure local mode');
await worker.start({onUnhandledRequest:'bypass'});
saveAuthToken('local-demo-token',false);
function App() {
 const params=new URLSearchParams(location.search);
 const view=params.get('view') || 'gallery';
 const marketSample=equipmentArtMarketSamples.find(item=>item.equipmentSnapshot?.templateId===params.get('item'))||equipmentArtMarketSamples[4];
 const [selected,setSelected]=useState<string|null>(null);
 const [catalog,setCatalog]=useState<CombatCatalog|null>(null), [error,setError]=useState('');
 useEffect(()=>{if(view==='atlas')getCombatCatalog().then(setCatalog).catch(()=>setError('装备目录加载失败'));},[view]);
 return <main className="p-4" style={{minHeight:'100dvh',height:view==='atlas'?'100dvh':undefined,display:'flex',flexDirection:'column',gap:12}}>
 {view==='atlas' ? error ? <div role="alert">{error}</div> : catalog ? <EquipmentAtlasView catalog={catalog}/> : <div role="status">正在加载装备目录</div> :
 view==='loot' ? <><ObservationLootGrid slots={equipmentArtSamples.map(item=>({key:item.id,quantity:1,times:[12],reward:{id:item.id,kind:'equipment',item:item.snapshot,quantity:1,elapsedSeconds:12}}))} onSelect={setSelected}/>{selected&&<ObservationLootDetails slot={{key:selected,quantity:1,times:[12],reward:{id:selected,kind:'equipment',item:equipmentArtSamples.find(item=>item.id===selected)!.snapshot,quantity:1,elapsedSeconds:12}}} onClose={()=>setSelected(null)}/>}</> :
 view==='market' ? <MarketDetailSidebar type="listing" listing={{id:'local-art-listing',sellerId:'local',sellerName:'白露',item:marketSample,initialQuantity:1,remainingQuantity:1,unitPrice:'120',version:1,status:'active',createdAt:'2026-10-24T00:00:00Z',history:[]}}/> :
 <><h1 className="text-xl font-bold">装备图标 · 公共绘制检查</h1><div className="flex items-center gap-4"><EquipmentPortrait equipmentId="equip.sword" name="长剑" className="h-24 w-24"/><PotionPortrait potionId="elixir.arcane" className="h-20 w-20"/><span>长剑 / 药水风格参照</span></div><div className={view==='surfaces'?'grid grid-cols-1 gap-3 lg:grid-cols-3':'grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6'}>{rows.map((e,index)=><article key={e.id} data-equipment-row={e.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between"><EquipmentPortrait equipmentId={e.id} name={e.name} slot={e.slot} equipmentType={e.equipmentType} className="h-24 w-24"/><EquipmentPortrait equipmentId={e.id} name={e.name} className="h-9 w-9"/></div><p className="text-sm font-semibold">{e.name}</p><p className="text-xs text-slate-400">Lv.{e.levelMin}</p><div className="mt-2 flex justify-around border-t border-slate-100 pt-2"><MarketListingItemIcon item={equipmentArtMarketSamples[index]} className="h-10 w-10" fallback={<span>缺图</span>}/><TransactionItemIcon transaction={{id:e.id,actorId:'local',actorName:'白露',sessionId:'local',operation:{kind:'sell_combat_equipment'},result:{kind:'combat_equipment',equipmentId:e.id,name:e.name},createdAt:'2026-10-24T00:00:00Z'}} isSell isBuy={false}/></div>{view==='surfaces'&&<><EquipmentCard item={equipmentArtSamples[index]}/><DiabloEquipmentSlot slot={e.slot!} item={equipmentArtSamples[index]} onInspect={()=>{}}/></>}</article>)}</div></>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
