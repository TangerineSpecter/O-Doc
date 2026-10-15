import WorldDialog from '../AgentWorld/WorldDialog';
import EquipmentCard from './EquipmentCard';
import {EquipmentPortrait} from './atlas/EquipmentPortrait';
import {MaterialPortrait} from './atlas/MaterialPortrait';
import {elapsed,qualityLabels} from './presentation';
import {isEquipmentReward} from './observationRecords';
import type {ObservationLoot} from './observationRecords';
import type {CombatReward} from '../../types/api/combat';

function LootPortrait({reward,className}:{reward:CombatReward;className:string}) {
    return isEquipmentReward(reward)?<EquipmentPortrait equipmentId={reward.item.templateId} name={reward.item.name} slot={reward.item.slot} equipmentType={reward.item.equipmentType} decorative className={className} fallbackClassName="h-7 w-7"/>:
        <MaterialPortrait materialId={'id' in reward.item?reward.item.id||'':''} name={reward.item.name} decorative className={className}/>;
}

export function ObservationLootGrid({slots,onSelect}:{slots:ObservationLoot[];onSelect:(key:string)=>void}) {
    const emptySlots=Math.max(0,12-slots.length);
    return <div>
        <div className="mb-3 flex items-center justify-between text-[10px] text-slate-400"><span>本次探索所得</span><span>{slots.length} 格 · 点击查看详情</span></div>
        <div className="grid grid-cols-4 gap-2">{slots.map(slot=>{
            const equipment=isEquipmentReward(slot.reward)?slot.reward.item:null;
            const quality=equipment?.quality;
            return <button key={slot.key} type="button" aria-label={`查看${slot.reward.item.name||'掉落物'}，数量${slot.quantity}`} onClick={()=>onSelect(slot.key)}
                className="group min-w-0 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
                <div className={`relative aspect-square overflow-hidden rounded-xl border transition group-hover:-translate-y-0.5 group-hover:shadow-sm ${quality==='gold'?'border-amber-200 bg-amber-50':quality==='blue'?'border-sky-200 bg-sky-50':'border-slate-200 bg-slate-50'}`}>
                    <LootPortrait reward={slot.reward} className="h-full w-full p-1"/>
                    <span className="absolute bottom-1 right-1 rounded bg-white/90 px-1 text-[10px] font-bold tabular-nums text-slate-600">{slot.quantity}</span>
                </div>
                <p className="mt-1.5 truncate text-center text-[10px] text-slate-500">{slot.reward.item.name||'掉落物'}</p>
            </button>;
        })}{Array.from({length:emptySlots},(_,index)=><div key={`empty:${index}`} aria-hidden="true" className="aspect-square rounded-xl border border-dashed border-slate-200/80 bg-slate-50/40"/>)}</div>
        {!slots.length&&<p className="mt-5 text-center text-xs text-slate-400">尚未获得掉落物</p>}
    </div>;
}

export function ObservationLootDetails({slot,onClose}:{slot:ObservationLoot;onClose:()=>void}) {
    const reward=slot.reward,equipment=isEquipmentReward(reward)?reward.item:null;
    const material='id' in reward.item?reward.item:null;
    return <WorldDialog title="掉落详情" size="compact" onClose={onClose}>
        <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <LootPortrait reward={reward} className="h-20 w-20 shrink-0 rounded-xl border border-white bg-white p-2"/>
                <div><p className="text-[11px] text-slate-400">{equipment?qualityLabels[equipment.quality]||'装备':'战利品材料'}{reward.item.level?` · Lv.${reward.item.level}`:''}</p><h3 className="mt-1 text-base font-bold text-slate-800">{reward.item.name||'掉落物'}</h3><p className="mt-1 text-xs text-slate-500">本次获得 ×{slot.quantity}</p></div>
            </div>
            {equipment&&<EquipmentCard item={{id:reward.equipmentId||reward.id,snapshot:equipment,bound:false,locked:false,value:equipment.value}}/>}
            {material&&<div className="space-y-2 rounded-xl border border-slate-100 p-3 text-xs text-slate-500">
                {material.description&&<p className="leading-6">{material.description}</p>}
                {material.salePrice!=null&&<p className="flex justify-between"><span>商店回收基准价</span><strong className="text-amber-700">¥{material.salePrice} / 个</strong></p>}
                <p className="text-[11px] leading-5 text-slate-400">探索战利品可在居民背包结算或商店回收。</p>
            </div>}
            <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500"><p className="mb-2 font-semibold text-slate-600">获得记录</p><div className="flex flex-wrap gap-2">{slot.times.map((seconds,index)=><span key={index} className="rounded-full bg-white px-2 py-1">{elapsed(seconds)}</span>)}</div></div>
        </div>
    </WorldDialog>;
}
