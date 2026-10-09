import {farmItemIcon} from '../Farm/assets';
import {useRef, useState, type CSSProperties} from 'react';
import {RefreshCw, X} from 'lucide-react';
import {inventoryRarities} from './inventoryRarities';
import type {InventoryItem} from '../../types/api/travel';
import {InventoryItemDetails} from './InventoryItemDetails';
import {InventoryBackpackSkin} from './InventoryBackpackSkin';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import './InventoryBackpack.css';
import {ItemIconImage} from './ItemIconImage';

interface InventoryBackpackProps {
    items: InventoryItem[];
    name?: string;
    onClose?: () => void;
    onRefresh?: () => void;
    loading?: boolean;
    error?: string;
}

export function InventoryBackpack({items, name = '居民', onClose, onRefresh, loading, error}: InventoryBackpackProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selected = items.find(item => item.id === selectedId);
    const selectedButton = useRef<HTMLButtonElement | null>(null);
    const closeDetails = () => {setSelectedId(null); selectedButton.current?.focus();};
    useEscapeDismissal(Boolean(selected), () => {closeDetails(); return true;});
    // Empty cells are decoration; all records remain available in the scrolling grid.
    const slotCount = Math.max(24, Math.ceil(items.length / 6) * 6);
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    return <div className="inventory-backpack-container">
        <div className="inventory-backpack-stage">
            <div className="inventory-backpack">
                <InventoryBackpackSkin/>
                <div className="inventory-backpack-nameplate">
                    <span className="nameplate-top-emblem" aria-hidden="true">✦</span>
                    <h2>{name}的行囊</h2>
                    <div className="nameplate-divider" aria-hidden="true" />
                    <p>RESIDENT’S INVENTORY</p>
                </div>
                <div className="inventory-backpack-tools">
                    {onRefresh && <button type="button" onClick={onRefresh} disabled={loading} className="inventory-backpack-tool" aria-label="刷新背包"><RefreshCw size={14}/></button>}
                    {onClose && <button type="button" onClick={onClose} className="inventory-backpack-tool" aria-label="关闭面板"><X size={16}/></button>}
                </div>
                <div className="inventory-backpack-slots" role="group" aria-label="背包物品格" aria-busy={loading}>
                    {loading || error ? <div className="inventory-backpack-message" role={error ? 'alert' : 'status'}>{error || '正在打开背包…'}</div> : Array.from({length: slotCount}, (_, index) => {
                        const item = items[index];
                        if (!item) return <div key={`empty-${index}`} className="inventory-backpack-slot inventory-backpack-empty" aria-hidden="true"/>;
                        const rarity = inventoryRarities[item.rarity] || inventoryRarities.common;
                        return <button key={item.id} type="button" className="inventory-backpack-slot inventory-backpack-item"
                            style={{'--item-color': rarity.color} as CSSProperties}
                            aria-label={`${item.name}，${item.source.sku?.startsWith('crop.') ? `${item.source.stars || 1}星` : rarity.label}，${item.quantity} 件`} aria-pressed={selected?.id === item.id}
                            title={`${item.name} · ${item.source.sku?.startsWith('crop.') ? `${item.source.stars || 1}星` : rarity.label} · ×${item.quantity}`} onClick={event => {selectedButton.current = event.currentTarget; setSelectedId(item.id);}}>
                            <ItemIconImage src={item.iconUrl || (farmItemIcon(item.source.sku || ''))} alt={item.name} className="absolute inset-0 h-full w-full object-cover rounded-[6px]" fallback={<span className="inventory-backpack-initial">{Array.from(item.name.trim())[0] || '物'}</span>}/>
                            {item.source.sku?.startsWith('crop.') && <span className="absolute left-1 top-1 rounded bg-white/90 px-1 text-[10px] font-bold text-amber-700">★{item.source.stars || 1}</span>}
                            <span className="inventory-backpack-quantity">×{item.quantity}</span>
                        </button>;
                    })}
                </div>
                <p className="inventory-backpack-summary">{loading ? '正在读取持有物…' : error ? '读取失败，可点击刷新重试' : `持有 ${count} 件物品 · ${items.length} 种物品`}</p>
            </div>
            {selected && !loading && !error && <InventoryItemDetails item={selected} onClose={closeDetails}/>}
            <p className="inventory-backpack-hint">{!loading && !error && !items.length ? '背包里还没有物品，获得的物品会收进这里。' : '点击格子，查看物品详情'}</p>
        </div>
    </div>;
}
