import type {ReactNode} from 'react';
import type {InventoryItem} from '../../types/api/travel';
import {MaterialPortrait} from '../Combat/atlas/MaterialPortrait';
import {farmItemIcon} from '../Farm/assets';
import {ItemIconImage} from './ItemIconImage';

/** 背包按稳定 SKU 复用图鉴素材；居民设置的图片优先，读取失败时回退内置形象。 */
export function InventoryItemIcon({item, className, fallback}: {
    item: InventoryItem;
    className: string;
    fallback: ReactNode;
}) {
    const sku = item.source.sku || '';
    const builtin = sku.startsWith('combat.material.')
        ? <MaterialPortrait materialId={sku.slice('combat.'.length)} name={item.name} decorative className={className}/>
        : <ItemIconImage src={farmItemIcon(sku)} alt={item.name} className={className} fallback={fallback}/>;

    return item.iconUrl
        ? <ItemIconImage src={item.iconUrl} alt={item.name} className={className} fallback={builtin}/>
        : builtin;
}
