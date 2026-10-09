/** Stars are independent of the existing normal/gold and souvenir rarity fields. */
export function hasItemStars(sku?: string): boolean {
    return Boolean(sku?.startsWith('crop.') || sku?.startsWith('dish.'));
}
