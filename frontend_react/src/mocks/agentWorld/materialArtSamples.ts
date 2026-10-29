import catalog from './catalog';
import type {InventoryItem} from '../../types/api/travel';
import type {MarketItem} from '../../types/api/market';

/** Existing catalog identities with explicit display fixtures; no simulated decisions. */
export const materialArtRows = catalog.combat.tables.materials.filter(row=>row.id.startsWith('material.element.'));
export const materialArtInventorySamples:InventoryItem[] = materialArtRows.map(row=>({
    id:`local-art-${row.id}`,actorId:'local',actorName:'白露',originActorId:'local',originActorName:'白露',
    name:row.name!,kind:'combat_material',rarity:'normal',quantity:3,value:String(row.salePrice),
    source:{sku:`combat.${row.id}`},
}));
export const materialArtMarketSamples:MarketItem[] = materialArtRows.map(row=>({
    name:row.name!,kind:'combat_material',quantity:3,rarity:'normal',value:String(row.salePrice),
    source:{kind:'combat_material',sku:`combat.${row.id}`},
}));
