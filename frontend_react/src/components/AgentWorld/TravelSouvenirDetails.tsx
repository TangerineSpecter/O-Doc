import {Coins, Compass, History, Package, User, X} from 'lucide-react';
import type {InventoryItem} from '../../types/api/travel';
import {inventoryRarities} from './inventoryRarities';

export function TravelSouvenirDetails({item, onClose}: {item: InventoryItem; onClose: () => void}) {
    const rarity = inventoryRarities[item.rarity] || inventoryRarities.common;
    const value = item.value ?? item.source.unitPrice;
    const number = value ? Number(value) : NaN;
    const displayValue = Number.isFinite(number) ? number.toLocaleString('zh-CN', {maximumFractionDigits: 2}) : '—';
    const destination = [item.source.destination?.country, item.source.destination?.city].filter(Boolean).join(' · ') || '未明旅途';

    return <section aria-label="物品详情" aria-live="polite" className="h-full min-h-0 w-full min-w-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-100 bg-slate-50" style={{color: rarity.color}} aria-hidden="true"><Package size={17}/></span>
                <div className="min-w-0">
                    <p className="text-[11px] text-slate-500">物品详情</p>
                    <h3 className="truncate text-sm font-semibold text-slate-800" title={item.name}>{item.name}</h3>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-slate-50 px-2 py-1 text-[11px] font-medium" style={{color: rarity.color}}>{rarity.label}</span>
                <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" aria-label="返回物品格" title="返回物品格"><X size={15}/></button>
            </div>
        </header>

        {item.source.description && <p className="mt-2 line-clamp-2 break-words text-xs leading-4 text-slate-600">{item.source.description}</p>}

        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
            <div><dt className="flex items-center gap-1 text-[10px] text-slate-500"><Package size={11}/>数量</dt><dd className="mt-0.5 truncate text-xs font-medium text-slate-800">{item.quantity} 件</dd></div>
            <div><dt className="flex items-center gap-1 text-[10px] text-slate-500"><Coins size={11}/>参考价值</dt><dd className="mt-0.5 truncate text-xs font-medium text-slate-800">{displayValue} 世界币</dd></div>
            <div><dt className="flex items-center gap-1 text-[10px] text-slate-500"><Coins size={11}/>{item.source.debug ? '调试单价' : '购入单价'}</dt><dd className="mt-0.5 truncate text-xs font-medium text-slate-800">{item.source.unitPrice ? `${item.source.unitPrice} 世界币` : '—'}</dd></div>
            <div><dt className="flex items-center gap-1 text-[10px] text-slate-500"><Compass size={11}/>旅行来源</dt><dd className="mt-0.5 truncate text-xs font-medium text-slate-800" title={destination}>{destination}</dd></div>
            <div><dt className="flex items-center gap-1 text-[10px] text-slate-500"><History size={11}/>原始获得者</dt><dd className="mt-0.5 truncate text-xs font-medium text-slate-800" title={item.originActorId}>{item.originActorName || item.originActorId || '历史记录未提供'}</dd></div>
            <div><dt className="flex items-center gap-1 text-[10px] text-slate-500"><User size={11}/>当前所有者</dt><dd className="mt-0.5 truncate text-xs font-medium text-slate-800" title={item.actorId}>{item.actorName || item.actorId || '未知'}</dd></div>
        </dl>

        {item.source.debug && <p className="mt-2 text-[10px] text-amber-700">本地调试补录，未扣余额</p>}
    </section>;
}
