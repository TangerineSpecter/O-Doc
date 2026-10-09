import {cropKinds} from '../../types/api/farm';

// Vite production assets live below /static/, while development uses /.
export const farmAtlasUrl = `${import.meta.env.BASE_URL}farm/sprites.png`;
export const farmFramesUrl = `${import.meta.env.BASE_URL}farm/sprites.json`;

const itemSkus = new Set(['feed', ...cropKinds.flatMap(kind => [`seed.${kind}`, `crop.${kind}`]), ...['chicken', 'cow', 'sheep'].flatMap(kind => [`animal.${kind}`, `product.${kind}.normal`, `product.${kind}.gold`])]);
export const farmItemIcon = (sku: string) => itemSkus.has(sku) ? `${import.meta.env.BASE_URL}farm/items/${encodeURIComponent(sku)}.png` : undefined;
export const isFarmItemIcon = (src: string) => Array.from(itemSkus).some(sku => farmItemIcon(sku) === src);
