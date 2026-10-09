export type ItemCategory = 'souvenir' | 'seed' | 'feed' | 'crop' | 'animal_product' | 'dish' | 'other';
export interface CatalogItem {
    id: string; sku: string; name: string; category: ItemCategory; description: string;
    purchasePrice: number | null; salePrice: number | null; quality: string; quantity: number;
    referenceValue?: number | null;
    iconAssetId?: string | null; iconUrl: string;
}
