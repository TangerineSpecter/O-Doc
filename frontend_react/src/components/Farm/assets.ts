import {cropKinds} from '../../types/api/farm';

// Vite production assets live below /static/, while development uses /.
// 精灵图集现仅供设置里的居民形象预览使用；场景本身由 scene/ 下的代码实时绘制。
export const farmAtlasUrl = `${import.meta.env.BASE_URL}farm/sprites.png`;

const itemSkus = new Set(['feed', 'fertilizer.quality', 'fertilizer.yield', ...cropKinds.flatMap(kind => [`seed.${kind}`, `crop.${kind}`]), ...['chicken', 'cow', 'sheep'].flatMap(kind => [`animal.${kind}`, `product.${kind}.normal`, `product.${kind}.gold`])]);
export const farmItemIcon = (sku: string) => itemSkus.has(sku) ? `${import.meta.env.BASE_URL}farm/items/${encodeURIComponent(sku)}.png` : undefined;
export const isFarmItemIcon = (src: string) => Array.from(itemSkus).some(sku => farmItemIcon(sku) === src);
