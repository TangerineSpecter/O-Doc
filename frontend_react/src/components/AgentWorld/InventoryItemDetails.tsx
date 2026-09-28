import {farmItemIcon} from '../Farm/assets';
import type {CSSProperties} from 'react';
import {
    X,
    Coins,
    Package,
    Compass,
    User,
    History,
    Sparkles,
    ScrollText,
    ShieldCheck,
    Tag,
} from 'lucide-react';
import type {InventoryItem} from '../../types/api/travel';
import {inventoryRarities} from './inventoryRarities';
import {ItemIconImage} from './ItemIconImage';

export function InventoryItemDetails({item, onClose}: {item: InventoryItem; onClose: () => void}) {
    const isFarm = Boolean(farmItemIcon(item.source.sku || ''));
    const rarity = inventoryRarities[item.rarity] || inventoryRarities.common;
    const value = item.value ?? item.source.unitPrice;
    const number = value ? Number(value) : NaN;
    const displayValue = Number.isFinite(number) ? number.toLocaleString('zh-CN', {maximumFractionDigits: 2}) : '—';
    const firstChar = Array.from(item.name.trim())[0] || '物';
    const destination = [item.source.destination?.country, item.source.destination?.city].filter(Boolean).join(' · ') || (isFarm ? '世界物品' : '未明旅途');

    return (
        <section
            aria-label="物品档案详情"
            aria-live="polite"
            className="inventory-item-details"
            style={{
                '--quality': rarity.color,
                '--quality-accent': rarity.accentColor,
                '--quality-bg': rarity.badgeBg,
                '--quality-text': rarity.badgeText,
                '--quality-border': rarity.badgeBorder,
                '--quality-glow': rarity.glow,
            } as CSSProperties}
        >
            {/* 复古金属护角装饰 */}
            <div className="relic-corner relic-corner-tl" aria-hidden="true" />
            <div className="relic-corner relic-corner-tr" aria-hidden="true" />
            <div className="relic-corner relic-corner-bl" aria-hidden="true" />
            <div className="relic-corner relic-corner-br" aria-hidden="true" />

            {/* 内层装订细饰线 */}
            <div className="relic-inner-frame" aria-hidden="true" />

            {/* 顶部标题与品质/关闭栏 */}
            <div className="inventory-item-header">
                <div className="inventory-item-header-meta">
                    <span className="relic-dossier-heading">物品档案</span>
                    <span className="relic-dossier-pill">DOSSIER</span>
                </div>
                <div className="inventory-item-header-actions">
                    <span className="relic-rarity-seal" title={`品质等级：${rarity.label}`}>
                        <Sparkles size={11} className="relic-rarity-sparkle" />
                        <span className="relic-rarity-text">{rarity.label}</span>
                    </span>
                    <button
                        type="button"
                        className="inventory-item-dismiss"
                        aria-label="关闭物品详情"
                        onClick={onClose}
                        title="收起档案"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* 物品展示主角区 */}
            <div className="inventory-item-hero">
                <div className="inventory-item-emblem-wrapper">
                    <div className="inventory-item-emblem" aria-hidden="true">
                        <ItemIconImage src={item.iconUrl || (farmItemIcon(item.source.sku || ''))} alt={item.name} className="relative z-10 h-[80%] w-[80%]" fallback={<span className="relic-emblem-char">{firstChar}</span>}/>
                        <div className="relic-emblem-shine" />
                    </div>
                </div>
                <div className="inventory-item-hero-meta">
                    <div className="inventory-item-badge-tag">
                        <Compass size={11} />
                        <span>{isFarm ? '经营物品' : '旅行纪念珍藏'}</span>
                    </div>
                    <h3 className="inventory-item-title" title={item.name}>{item.name}</h3>
                </div>
            </div>

            {/* 公会参考估价券 */}
            <div className="inventory-item-valuation-card">
                <div className="relic-val-label-group">
                    <div className="relic-val-icon-wrap" aria-hidden="true">
                        <Coins size={15} />
                    </div>
                    <div className="relic-val-label-texts">
                        <span className="relic-val-title">公会参考估价</span>
                        <span className="relic-val-sub">VALUATION</span>
                    </div>
                </div>
                <div className="relic-val-amount-group">
                    <strong className="relic-val-number">{displayValue}</strong>
                    <span className="relic-val-unit">世界币</span>
                </div>
            </div>

            {/* 见闻实录/描述 */}
            {item.source.description && (
                <div className="inventory-item-chronicle">
                    <div className="relic-chronicle-header">
                        <ScrollText size={11} />
                        <span>见闻手记 · FIELD NOTES</span>
                    </div>
                    <p className="inventory-item-description">{item.source.description}</p>
                </div>
            )}

            {/* 属性档案清单 */}
            <dl className="relic-dossier-list">
                <div className="relic-dossier-row">
                    <dt className="relic-dossier-key">
                        <Package size={12} />
                        <span>持有数量</span>
                    </dt>
                    <span className="relic-dossier-line" aria-hidden="true" />
                    <dd className="relic-dossier-value relic-dossier-pill-val">
                        {item.quantity} 件
                    </dd>
                </div>

                <div className="relic-dossier-row">
                    <dt className="relic-dossier-key">
                        <Tag size={12} />
                        <span>{isFarm ? '参考单价' : item.source.debug ? '调试参考单价' : '购入单价'}</span>
                    </dt>
                    <span className="relic-dossier-line" aria-hidden="true" />
                    <dd className="relic-dossier-value">
                        {isFarm ? `${displayValue} 世界币` : item.source.unitPrice ? `${item.source.unitPrice} 世界币` : '—'}
                    </dd>
                </div>

                <div className="relic-dossier-row">
                    <dt className="relic-dossier-key">
                        <Compass size={12} />
                        <span>{isFarm ? '物品来源' : '旅行来源'}</span>
                    </dt>
                    <span className="relic-dossier-line" aria-hidden="true" />
                    <dd className="relic-dossier-value relic-dossier-dest" title={destination}>
                        {destination}
                    </dd>
                </div>

                <div className="relic-dossier-row">
                    <dt className="relic-dossier-key">
                        <History size={12} />
                        <span>原始获得者</span>
                    </dt>
                    <span className="relic-dossier-line" aria-hidden="true" />
                    <dd className="relic-dossier-value" title={item.originActorId}>
                        {item.originActorName || item.originActorId || '历史记录未提供'}
                    </dd>
                </div>

                <div className="relic-dossier-row relic-dossier-row-highlight">
                    <dt className="relic-dossier-key">
                        <User size={12} />
                        <span>当前所有者</span>
                    </dt>
                    <span className="relic-dossier-line" aria-hidden="true" />
                    <dd className="relic-dossier-value relic-owner-name" title={item.actorId}>
                        <ShieldCheck size={12} className="relic-owner-shield" />
                        {item.actorName || item.actorId || '未知'}
                    </dd>
                </div>
            </dl>

            {/* 底部收藏印章与调试标记 */}
            <div className="relic-footer">
                <div className="relic-verified-stamp" aria-hidden="true">
                    <span>COLLECTOR'S GUILD</span>
                    <strong>ARCHIVE RECORD</strong>
                </div>

                {item.source.debug && (
                    <div className="relic-debug-stamp">
                        <span>调试补录 · 仅供观测</span>
                    </div>
                )}
            </div>
        </section>
    );
}
