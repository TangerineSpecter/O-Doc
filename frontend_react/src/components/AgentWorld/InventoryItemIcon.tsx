import type {ReactNode} from 'react';
import type {InventoryItem} from '../../types/api/travel';
import {MaterialPortrait} from '../Combat/atlas/MaterialPortrait';
import {PotionPortrait} from '../Combat/atlas/PotionPortrait';
import {RecipePixelPortrait} from '../Cooking/RecipePixelPortrait';
import {BaitPortrait} from '../Fishing/BaitPortrait';
import {FishPortrait} from '../Fishing/FishPortrait';
import {farmItemIcon} from '../Farm/assets';
import {ItemIconImage} from './ItemIconImage';

/** 背包按稳定 SKU 复用图鉴素材；居民设置的图片优先，读取失败时回退内置形象。 */
export function InventoryItemIcon({item, className, fallback}: {
    item: InventoryItem;
    className: string;
    fallback: ReactNode;
}) {
    const sku = item.source.sku || '';
    const potionId = sku.startsWith('combat.potion.')
        ? sku.slice('combat.'.length)
        : sku.startsWith('potion.')
        ? sku
        : /(治疗|回蓝)药剂/.test(item.name)
        ? (item.name.includes('治疗') ? `potion.heal.${item.name.match(/\d+/)?.[0] || '1'}` : `potion.mana.${item.name.match(/\d+/)?.[0] || '1'}`)
        : null;

    const elixirId = sku.startsWith('elixir.') ? sku : null;

    const materialId = sku.startsWith('combat.material.')
        ? sku.slice('combat.'.length)
        : sku.startsWith('material.')
        ? sku
        : null;

    const builtin = sku.startsWith('dish.')
        ? <RecipePixelPortrait recipeId={sku} name={item.name} decorative className={className}/>
        : sku.startsWith('bait.')
        ? <BaitPortrait baitId={sku} className={className}/>
        : sku.startsWith('fish.')
        ? <FishPortrait fishId={sku.slice(5)} name={item.name} decorative className={className}/>
        : elixirId
        ? <PotionPortrait potionId={elixirId} name={item.name} decorative className={className}/>
        : potionId
        ? <PotionPortrait potionId={potionId} name={item.name} decorative className={className}/>
        : materialId
        ? <MaterialPortrait materialId={materialId} name={item.name} decorative className={className}/>
        : <ItemIconImage src={farmItemIcon(sku)} alt={item.name} className={className} fallback={fallback}/>;

    return item.iconUrl
        ? <ItemIconImage src={item.iconUrl} alt={item.name} className={className} fallback={builtin}/>
        : builtin;
}
