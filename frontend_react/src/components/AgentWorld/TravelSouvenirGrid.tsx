import {useRef, useState} from 'react';
import {Package, RefreshCw, X} from 'lucide-react';
import {inventoryRarities} from './inventoryRarities';
import type {InventoryItem} from '../../types/api/travel';
import {TravelSouvenirDetails} from './TravelSouvenirDetails';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';

interface TravelSouvenirGridProps {
    items: InventoryItem[];
    name?: string;
    onClose?: () => void;
    onRefresh?: () => void;
    loading?: boolean;
    error?: string;
}

export function TravelSouvenirGrid({items, name = '旅行者', onClose, onRefresh, loading, error}: TravelSouvenirGridProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selected = items.find(item => item.id === selectedId);
    const selectedButton = useRef<HTMLButtonElement | null>(null);
    const closeDetails = () => {setSelectedId(null); selectedButton.current?.focus();};
    useEscapeDismissal(Boolean(selected), () => {closeDetails(); return true;});

    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const showItems = !loading && !error && items.length > 0;

    return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600"><Package size={19}/></span>
                <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-800">{name}的背包</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                        {loading ? '正在读取持有物…' : error ? '读取失败，可刷新重试' : `持有 ${count} 件物品 · ${items.length} 种珍藏`}
                    </p>
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
                {onRefresh && <button type="button" onClick={onRefresh} disabled={loading} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600 disabled:cursor-wait disabled:opacity-50" aria-label="刷新背包" title="刷新背包"><RefreshCw size={16}/></button>}
                {onClose && <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" aria-label="关闭背包" title="关闭背包"><X size={17}/></button>}
            </div>
        </header>

        {loading ? <div role="status" className="grid min-h-36 place-items-center py-8 text-sm text-slate-400">正在打开背包…</div>
            : error ? <div role="alert" className="grid min-h-36 place-items-center py-8 text-sm text-red-600">{error}</div>
                : items.length === 0 ? <div className="grid min-h-36 place-items-center py-8 text-center">
                    <div>
                        <Package className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true"/>
                        <p className="mt-2 text-sm font-medium text-slate-600">行囊里还没有物品</p>
                        <p className="mt-1 text-xs text-slate-400">旅行中获得的纪念品会收进这里</p>
                    </div>
                </div>
                    : <div className={`mt-4 ${selected && showItems ? 'grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]' : ''}`}>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6" role="group" aria-label="背包物品格" aria-busy={loading}>
                            {items.map(item => {
                                const rarity = inventoryRarities[item.rarity] || inventoryRarities.common;
                                const isSelected = selected?.id === item.id;
                                return <button key={item.id} ref={isSelected ? selectedButton : undefined} type="button"
                                    className={`relative flex min-h-32 min-w-0 flex-col items-start rounded-xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 ${isSelected ? 'border-orange-300 bg-orange-50/40' : 'border-slate-200 bg-white hover:border-orange-200'}`}
                                    aria-label={`${item.name}，${rarity.label}，${item.quantity} 件`} aria-pressed={isSelected}
                                    title={`${item.name} · ${rarity.label} · ×${item.quantity}`}
                                    onClick={event => {selectedButton.current = event.currentTarget; setSelectedId(item.id);}}>
                                    <span className="flex w-full items-start justify-between gap-2">
                                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-100 bg-slate-50 text-lg font-semibold" style={{color: rarity.color}} aria-hidden="true">
                                            {Array.from(item.name.trim())[0] || '物'}
                                        </span>
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">×{item.quantity}</span>
                                    </span>
                                    <span className="mt-3 line-clamp-2 w-full break-words text-sm font-medium leading-5 text-slate-800">{item.name}</span>
                                    <span className="mt-auto flex items-center gap-1.5 pt-2 text-xs text-slate-500">
                                        <span className="h-2 w-2 rounded-full" style={{backgroundColor: rarity.color}} aria-hidden="true"/>
                                        {rarity.label}
                                    </span>
                                </button>;
                            })}
                        </div>
                        {selected && showItems && <TravelSouvenirDetails item={selected} onClose={closeDetails}/>}
                    </div>}
        {showItems && <p className="mt-3 text-xs text-slate-400">点击物品卡片查看来源和详情</p>}
    </section>;
}
