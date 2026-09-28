import type {CSSProperties} from 'react';
import {X} from 'lucide-react';
import type {InventoryItem} from '../../types/api/travel';
import {inventoryRarities} from './inventoryRarities';

export function InventoryItemDetails({item, onClose}: {item: InventoryItem; onClose: () => void}) {
    const rarity = inventoryRarities[item.rarity] || inventoryRarities.common;
    const value = item.value ?? item.source.unitPrice;
    const number = value ? Number(value) : NaN;
    const displayValue = Number.isFinite(number) ? number.toLocaleString('zh-CN', {maximumFractionDigits: 2}) : '—';
    return <section aria-label="物品详情" aria-live="polite" className="inventory-item-details" style={{'--quality': rarity.color} as CSSProperties}>
        <button type="button" className="inventory-item-dismiss" aria-label="关闭物品详情" onClick={onClose}><X size={16}/></button>
        <div className="inventory-item-topline"><span>物品档案</span><span className="inventory-item-grade">{rarity.label}</span></div>
        <div className="inventory-item-hero">
            <div className="inventory-item-emblem" aria-hidden="true">{Array.from(item.name.trim())[0] || '物'}</div>
            <div><p className="inventory-item-category">旅行纪念品</p><h3>{item.name}</h3></div>
        </div>
        <div className="inventory-item-value"><span>单件参考价值</span><strong>{displayValue}</strong><small>世界币</small></div>
        {item.source.description && <p className="inventory-item-description">{item.source.description}</p>}
        <dl>
            <div><dt>持有数量</dt><dd>{item.quantity} 件</dd></div>
            <div><dt>{item.source.debug ? '调试参考单价' : '购入单价'}</dt><dd>{item.source.unitPrice || '—'} 世界币</dd></div>
            <div><dt>旅行来源</dt><dd>{[item.source.destination?.country, item.source.destination?.city].filter(Boolean).join(' · ') || '旅行'}</dd></div>
            <div className="inventory-item-owner"><dt>当前所有者</dt><dd title={item.actorId}>{item.actorName || item.actorId || '未知'}</dd></div>
            <div><dt>原始获得者</dt><dd title={item.originActorId}>{item.originActorName || item.originActorId || '历史记录未提供'}</dd></div>
        </dl>
        {item.source.debug && <p className="inventory-item-debug">本地调试补录，未扣余额</p>}
    </section>;
}
