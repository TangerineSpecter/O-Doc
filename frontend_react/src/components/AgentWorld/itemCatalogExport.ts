import type {CatalogItem, ItemCategory} from '../../types/api/itemCatalog';
import type {CatalogExportSheet} from '../../utils/catalogSpreadsheet';

export const itemCategoryLabels: Record<ItemCategory, string> = {
    souvenir: '纪念品',
    seed: '种子',
    feed: '饲料',
    fertilizer: '肥料',
    crop: '农作物',
    animal_product: '畜产品',
    dish: '美食',
    other: '其他',
};

const qualityLabels: Record<string, string> = {normal: '普通品质', gold: '金色品质'};

export function itemCatalogExportSheets(items: CatalogItem[]): CatalogExportSheet[] {
    const rows = items.map(item => {
        const starData = Object.fromEntries(Array.from({length: 5}, (_, index) => String(index + 1)).flatMap(star => [
            [`${star}星持有`, item.starQuantities?.[star] ?? ''] as const,
            [`${star}星回收单价`, item.starValues?.[star] ?? ''] as const,
        ]));
        return {
            名称: item.name,
            分类: itemCategoryLabels[item.category] || itemCategoryLabels.other,
            品质: qualityLabels[item.quality] || '常规品质',
            说明: item.description || '暂无物品详细背景描述。',
            当前持有: item.quantity,
            参考估价: item.referenceValue ?? '',
            购买单价: item.purchasePrice ?? (item.category === 'fertilizer' ? '以商店当前报价为准' : '暂不可购'),
            回收单价: item.salePrice ?? '',
            ...starData,
        };
    });

    return [{name: '物品图鉴', rows}];
}
