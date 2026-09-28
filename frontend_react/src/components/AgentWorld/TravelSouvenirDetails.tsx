import {Coins, Compass, History, Package, User, X} from 'lucide-react';
import type {InventoryItem} from '../../types/api/travel';
import {inventoryRarities} from './inventoryRarities';

export function TravelSouvenirDetails({item, onClose}: {item: InventoryItem; onClose: () => void}) {
    const rarity = inventoryRarities[item.rarity] || inventoryRarities.common;
    const value = item.value ?? item.source.unitPrice;
    const number = value ? Number(value) : NaN;
    const displayValue = Number.isFinite(number) ? number.toLocaleString('zh-CN', {maximumFractionDigits: 2}) : '—';
    const firstChar = Array.from(item.name.trim())[0] || '物';
    const destination = [item.source.destination?.country, item.source.destination?.city].filter(Boolean).join(' · ') || '未明旅途';

    return <section aria-label="物品详情" aria-live="polite" className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-lg font-semibold shadow-sm" style={{color: rarity.color}} aria-hidden="true">{firstChar}</span>
                <div className="min-w-0">
                    <p className="text-xs text-slate-500">物品详情</p>
                    <h3 className="mt-0.5 break-words text-sm font-semibold text-slate-800">{item.name}</h3>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600" style={{color: rarity.color}}>{rarity.label}</span>
                <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-600" aria-label="关闭物品详情" title="关闭详情"><X size={16}/></button>
            </div>
        </header>

        {item.source.description && <p className="mt-3 break-words text-sm leading-6 text-slate-600">{item.source.description}</p>}

        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5"><dt className="flex items-center gap-1.5 text-xs text-slate-500"><Package size={13}/>持有数量</dt><dd className="mt-1 text-sm font-medium text-slate-800">{item.quantity} 件</dd></div>
            <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5"><dt className="flex items-center gap-1.5 text-xs text-slate-500"><Coins size={13}/>单件参考价值</dt><dd className="mt-1 text-sm font-medium text-slate-800">{displayValue} 世界币</dd></div>
            <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5"><dt className="flex items-center gap-1.5 text-xs text-slate-500"><Coins size={13}/>{item.source.debug ? '调试参考单价' : '购入单价'}</dt><dd className="mt-1 text-sm font-medium text-slate-800">{item.source.unitPrice ? `${item.source.unitPrice} 世界币` : '—'}</dd></div>
            <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5"><dt className="flex items-center gap-1.5 text-xs text-slate-500"><Compass size={13}/>旅行来源</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800">{destination}</dd></div>
            <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5"><dt className="flex items-center gap-1.5 text-xs text-slate-500"><History size={13}/>原始获得者</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800" title={item.originActorId}>{item.originActorName || item.originActorId || '历史记录未提供'}</dd></div>
            <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5"><dt className="flex items-center gap-1.5 text-xs text-slate-500"><User size={13}/>当前所有者</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800" title={item.actorId}>{item.actorName || item.actorId || '未知'}</dd></div>
        </dl>

        {item.source.debug && <p className="mt-3 text-xs text-amber-700">本地调试补录，未扣余额</p>}
    </section>;
}
