import type {GlobalSearchItem, GlobalSearchType} from '../types/api/search';

export function mergeGlobalSearchResults(
    keywordItems: GlobalSearchItem[],
    smartImageItems: GlobalSearchItem[] | null,
    filter: 'all' | GlobalSearchType,
): GlobalSearchItem[] {
    if (!smartImageItems || (filter !== 'all' && filter !== 'image')) return keywordItems;
    const smartImages = smartImageItems.filter(item => item.type === 'image');
    const byId = new Map(smartImages.map(item => [item.id, item]));
    const merged = keywordItems.map(item => byId.get(item.id) || item);
    const seen = new Set(merged.map(item => item.id));
    for (const item of smartImages) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        merged.push(item);
    }
    return merged;
}

export function visibleImageCount(keywordCount: number, mergedItems: GlobalSearchItem[], smartActive: boolean): number {
    if (!smartActive) return keywordCount;
    const shownImageIds = new Set(mergedItems.filter(item => item.type === 'image').map(item => item.id));
    return Math.max(keywordCount, shownImageIds.size);
}
