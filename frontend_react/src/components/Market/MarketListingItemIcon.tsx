import type {ReactNode} from 'react';
import type {MarketItem} from '../../types/api/market';
import {EquipmentPortrait} from '../Combat/atlas/EquipmentPortrait';
import {MaterialPortrait} from '../Combat/atlas/MaterialPortrait';
import {farmItemIcon} from '../Farm/assets';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {BaitPortrait} from '../Fishing/BaitPortrait';
import {FishPortrait} from '../Fishing/FishPortrait';
import {RecipePixelPortrait} from '../Cooking/RecipePixelPortrait';

export function MarketListingItemIcon({item, className, fallback}: {
    item: MarketItem;
    className: string;
    fallback: ReactNode;
}) {
    const sku = item.source?.sku || '';
    const isCombatMaterial = item.kind === 'combat_material'
        || item.source?.kind === 'combat_material'
        || sku.startsWith('combat.material.');
    const materialId = sku.startsWith('combat.') ? sku.slice('combat.'.length) : sku;
    const isCombatEquipment = item.kind === 'combat_equipment' || item.source?.kind === 'combat_equipment';
    const equipmentId = item.source?.equipmentId || '';
    const snapshot = item.equipmentSnapshot;
    const builtinIcon = sku.startsWith('dish.')
        ? <RecipePixelPortrait recipeId={sku} name={item.name} decorative className={className}/>
        : sku.startsWith('bait.')
        ? <BaitPortrait baitId={sku} className={className}/>
        : sku.startsWith('fish.')
        ? <FishPortrait fishId={sku.slice(5)} name={item.name} decorative className={className}/>
        : isCombatMaterial && materialId
        ? <MaterialPortrait materialId={materialId} name={item.name} decorative className={className}/>
        : isCombatEquipment && equipmentId
            ? <EquipmentPortrait
                equipmentId={equipmentId}
                name={item.name}
                slot={snapshot?.slot}
                equipmentType={snapshot?.equipmentType}
                decorative
                className={className}
                fallbackClassName="h-6 w-6"
            />
            : <ItemIconImage src={farmItemIcon(sku)} alt={item.name} className={className} fallback={fallback}/>;
    const customIcon = item.iconUrl || (item.iconAssetId ? `/api/resource/view/${item.iconAssetId}` : undefined);

    return customIcon
        ? <ItemIconImage src={customIcon} alt={item.name} className={className} fallback={builtinIcon}/>
        : builtinIcon;
}
