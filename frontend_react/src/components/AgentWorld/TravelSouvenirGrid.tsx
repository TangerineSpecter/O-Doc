import {farmItemIcon} from '../Farm/assets';
import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Package} from 'lucide-react';
import {inventoryRarities} from './inventoryRarities';
import type {InventoryItem} from '../../types/api/travel';
import {TravelSouvenirDetails} from './TravelSouvenirDetails';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {ItemIconImage} from './ItemIconImage';

interface TravelSouvenirGridProps {
    items: InventoryItem[];
    name?: string;
}

export function TravelSouvenirGrid({items, name = '旅行者'}: TravelSouvenirGridProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [columnCount, setColumnCount] = useState(6);
    const selected = items.find(item => item.id === selectedId);
    const selectedButton = useRef<HTMLButtonElement | null>(null);
    const gridArea = useRef<HTMLDivElement | null>(null);
    const closeDetails = () => {setSelectedId(null); selectedButton.current?.focus();};
    useEscapeDismissal(Boolean(selected), () => {closeDetails(); return true;});

    const count = items.reduce((sum, item) => sum + item.quantity, 0);

    useEffect(() => {
        const element = gridArea.current;
        if (!element || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(([entry]) => {
            const availableWidth = entry.contentRect.width;
            const nextCount = Math.max(1, Math.floor((availableWidth + 6) / 50));
            setColumnCount(current => current === nextCount ? current : nextCount);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return <>
    <section className="flex h-[130px] min-h-0 items-center gap-5 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <header className="flex w-48 shrink-0 flex-col justify-center gap-1 border-r border-slate-100 pr-5">
            <h2 className="truncate text-sm font-semibold text-slate-800">{name}的背包</h2>
            <p className="text-xs text-slate-500">持有 {count} 件 · {items.length} 种</p>
        </header>

        <div ref={gridArea} className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid w-full max-h-[94px] content-start grid-rows-[repeat(2,44px)] auto-rows-[44px] gap-y-1.5" style={{gridTemplateColumns: `repeat(${columnCount}, 44px)`, justifyContent: 'space-between'}} role="group" aria-label="背包物品格">
                {items.map(item => {
                    const rarity = inventoryRarities[item.rarity] || inventoryRarities.common;
                    const isSelected = selected?.id === item.id;
                    return <button key={item.id} ref={isSelected ? selectedButton : undefined} type="button"
                        className={`relative grid h-11 w-11 place-items-center rounded-lg border bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 ${isSelected ? 'border-orange-300 bg-orange-50/40' : 'border-slate-200 hover:border-orange-200 hover:bg-orange-50/30'}`}
                        style={{borderColor: isSelected ? undefined : `${rarity.color}88`}}
                        aria-label={`${item.name}，${rarity.label}，${item.quantity} 件`} aria-pressed={isSelected}
                        title={`${item.name} · ${rarity.label} · ×${item.quantity}`}
                        onClick={event => {selectedButton.current = event.currentTarget; setSelectedId(item.id);}}>
                        <span className="absolute right-0 top-0 z-10 min-w-4 rounded-full bg-slate-100 px-1 text-[9px] leading-4 text-slate-600">×{item.quantity}</span>
                        <span aria-hidden="true" className="absolute bottom-1 left-1 h-1 w-1 rounded-full" style={{backgroundColor: rarity.color}}/>
                        <ItemIconImage src={item.iconUrl || (farmItemIcon(item.source.sku || ''))} alt={item.name} className="h-9 w-9" fallback={<Package className="h-5 w-5" style={{color: rarity.color}} aria-hidden="true"/>}/>
                    </button>;
                })}
                {Array.from({length: Math.max(0, columnCount * 2 - items.length)}, (_, index) => <span key={`empty-slot-${index}`} className="grid h-11 w-11 place-items-center rounded-lg border border-slate-200/80 bg-slate-50/60" aria-hidden="true"/>)}
            </div>
        </div>
    </section>
    {selected && typeof document !== 'undefined' && createPortal(<div className="fixed inset-0 z-[120] grid place-items-center bg-slate-900/30 p-4" role="dialog" aria-modal="true" aria-label={`${selected.name}的物品详情`} onClick={closeDetails}>
        <div className="w-full max-w-lg" onClick={event => event.stopPropagation()}>
            <TravelSouvenirDetails item={selected} onClose={closeDetails}/>
        </div>
    </div>, document.body)}
    </>;
}
