import {alchemyRecipes, cookingRecipes, inventory, itemCatalog} from './production';
import type {ItemIcon, ItemImagePage} from '../../types/api/itemIcons';

const base = '/api/settings/agent-world';
interface LocalIcon {icon: ItemIcon; file: Blob; names: string[]}
const icons = new Map<string, LocalIcon>();
const builtins = new Map(itemCatalog.map(item => [item.sku, item.iconUrl]));
let uploadedCount = 0;
const error = (message: string, status = 400) => Response.json({code: status, msg: message, data: null}, {status});

function usageCount(id: string) {
    return itemCatalog.filter(item => item.iconAssetId === id).length + inventory.filter(item => item.iconAssetId === id).length;
}

function iconData(row: LocalIcon, name = ''): ItemIcon {
    return {...row.icon, usageCount: usageCount(row.icon.id), recommended: !!name && row.names.includes(name)};
}

function bindSku(sku: string, assetId: string | null) {
    const target = itemCatalog.find(item => item.sku === sku)!;
    const asset = assetId ? icons.get(assetId) : null;
    const image = {iconAssetId: assetId, iconUrl: asset?.icon.url || builtins.get(sku) || ''};
    Object.assign(target, image);
    for (const recipe of [...cookingRecipes, ...alchemyRecipes]) if (recipe.sku === sku) Object.assign(recipe, image);
    for (const item of inventory) if (item.source.sku === sku) Object.assign(item, image);
    if (asset && !asset.names.includes(target.name)) asset.names.push(target.name);
}

// 提供有自定义图片和无图两类菜品，供纯 local 验收移除后恢复默认像素图标。
for (const [sku, id, image] of [
    ['dish.baked_potato', 'local-icon-potato', '<ellipse cx="128" cy="192" rx="108" ry="32" fill="#b8d9de" stroke="#57717b" stroke-width="6"/><path d="M38 157Q43 76 125 56Q205 62 220 159Q204 208 113 203Q53 202 38 157" fill="#d9a044" stroke="#78512d" stroke-width="8"/><path d="M63 143L99 86L181 95L192 153L138 179Z" fill="#f5d76a" stroke="#a87835" stroke-width="5"/><path d="M98 121h24v18H98zm43 22h18v16h-18zm12-39h17v13h-17z" fill="#67a54d"/><path d="M116 103h29v23h-29z" fill="#fff0a8"/>'],
    ['dish.garden_fried_rice', 'local-icon-rice', '<ellipse cx="128" cy="192" rx="112" ry="34" fill="#dce8db" stroke="#739085" stroke-width="6"/><path d="M40 172Q51 58 128 55Q207 65 219 172Q177 208 79 197Z" fill="#ebca7e" stroke="#ac8642" stroke-width="7"/><path d="M72 137h18v14H72zm42-49h18v18h-18zm57 44h19v16h-19zm-48 29h20v17h-20z" fill="#f28c48"/><path d="M88 108h14v17H88zm64-17h16v15h-16zm5 65h15v17h-15z" fill="#76a558"/><path d="M107 132h21v17h-21zm40-18h19v15h-19zm-65 55h19v13H82z" fill="#fff0b3"/>'],
] as const) {
    const target = itemCatalog.find(item => item.sku === sku)!;
    const file = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${image}</svg>`], {type: 'image/svg+xml'});
    icons.set(id, {icon: {id, name: target.name, url: `/api/resource/view/${id}`, size: file.size, width: 256, height: 256, usageCount: 0, recommended: false, fileExists: true}, file, names: [target.name]});
    bindSku(sku, id);
}

export async function resolveItemIconRoute(request: Request, empty: boolean): Promise<unknown> {
    const url = new URL(request.url), path = url.pathname;
    const resource = path.match(/^\/api\/resource\/(?:view|download)\/([^/]+)\/?$/);
    if (resource) {
        const resourceId = decodeURIComponent(resource[1]);
        if (!resourceId.startsWith('local-icon-')) return undefined;
        const asset = icons.get(resourceId);
        if (!asset) return error('图标不存在', 404);
        return new Response(asset.file, {headers: {'Content-Type': asset.file.type, 'Cache-Control': 'no-store'}});
    }
    if (path === `${base}/item-icons/`) {
        if (request.method === 'GET') {
            const search = (url.searchParams.get('search') || '').trim().toLocaleLowerCase();
            const item = inventory.find(row => row.id === (url.searchParams.get('itemId') || url.searchParams.get('item_id')));
            const rows = empty ? [] : [...icons.values()].filter(row => row.names.some(name => name.toLocaleLowerCase().includes(search)) || row.icon.name.toLocaleLowerCase().includes(search)).map(row => iconData(row, item?.name));
            rows.sort((left, right) => Number(right.recommended) - Number(left.recommended));
            const pageSize = Math.min(60, Math.max(1, Number(url.searchParams.get('pageSize') || url.searchParams.get('page_size')) || 20));
            const page = Math.min(Math.max(1, Number(url.searchParams.get('page')) || 1), Math.max(1, Math.ceil(rows.length / pageSize)));
            return {list: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize} satisfies ItemImagePage<ItemIcon>;
        }
        if (request.method === 'POST') {
            const data = await request.formData(), file = data.get('file');
            const name = String(data.get('name') || '').trim();
            if (!(file instanceof Blob) || !file.type.startsWith('image/')) return error('请选择图片文件');
            if (!name || name.length > 200) return error('图标名称需要 1–200 个字符');
            const id = `local-icon-upload-${++uploadedCount}`;
            const row: LocalIcon = {icon: {id, name, url: `/api/resource/view/${id}`, size: file.size, width: 256, height: 256, usageCount: 0, recommended: false, fileExists: true, duplicate: false}, file, names: [name]};
            icons.set(id, row);
            return iconData(row);
        }
        return undefined;
    }
    const detail = path.match(/^\/api\/settings\/agent-world\/item-icons\/([^/]+)\/$/);
    if (detail) {
        const id = decodeURIComponent(detail[1]), row = icons.get(id);
        if (!row) return error('图标不存在', 404);
        if (request.method === 'PATCH') {
            const body = await request.json() as {name?: unknown};
            if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 200) return error('图标名称需要 1–200 个字符');
            row.icon.name = body.name.trim();
            return iconData(row);
        }
        if (request.method === 'DELETE') {
            if (usageCount(id)) return error('图标正在被物品使用，请先解除关联', 409);
            icons.delete(id);
            return null;
        }
        return undefined;
    }
    const catalog = path.match(/^\/api\/settings\/agent-world\/item-catalog\/([^/]+)\/icon\/$/);
    if (catalog && request.method === 'PATCH') {
        const sku = decodeURIComponent(catalog[1]);
        if (!itemCatalog.some(item => item.sku === sku)) return error('图鉴物品不存在', 404);
        const body = await request.json() as {assetId?: unknown};
        if (body.assetId !== null && (typeof body.assetId !== 'string' || !icons.has(body.assetId))) return error('图标不存在或不属于当前账号');
        bindSku(sku, body.assetId);
        return {sku, iconAssetId: body.assetId};
    }
    const inventoryIcon = path.match(/^\/api\/settings\/agent-world\/(item-catalog\/inventory|inventory)\/([^/]+)\/icon\/$/);
    if (inventoryIcon && request.method === 'PATCH') {
        const item = inventory.find(row => row.id === decodeURIComponent(inventoryIcon[2]));
        if (!item) return error('物品不存在', 404);
        const body = await request.json() as {assetId?: unknown};
        if (body.assetId !== null && (typeof body.assetId !== 'string' || !icons.has(body.assetId))) return error('图标不存在或不属于当前账号');
        const asset = body.assetId ? icons.get(body.assetId) : null;
        const rows = inventoryIcon[1] === 'item-catalog/inventory' ? inventory.filter(row => row.name === item.name && row.source.sku === item.source.sku) : [item];
        for (const row of rows) Object.assign(row, {iconAssetId: body.assetId, iconUrl: asset?.icon.url || ''});
        return inventoryIcon[1] === 'item-catalog/inventory' ? {iconAssetId: body.assetId, updatedCount: rows.length} : item;
    }
    return undefined;
}
