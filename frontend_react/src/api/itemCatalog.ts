import request from '../utils/request';
import type {CatalogItem} from '../types/api/itemCatalog';
export const getItemCatalog = (signal?: AbortSignal) => request.get<never, CatalogItem[]>('/settings/agent-world/item-catalog/', {signal});
export const setCatalogItemIcon = (sku: string, assetId: string | null) =>
    request.patch<never, {sku: string; iconAssetId: string | null}>(`/settings/agent-world/item-catalog/${encodeURIComponent(sku)}/icon/`, {assetId});
export const setCatalogInventoryIcon = (itemId: string, assetId: string | null) =>
    request.patch<never, {iconAssetId: string | null; updatedCount: number}>(
        `/settings/agent-world/item-catalog/inventory/${encodeURIComponent(itemId)}/icon/`, {assetId});
