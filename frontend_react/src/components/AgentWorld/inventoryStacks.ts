import type {InventoryItem} from '../../types/api/travel';
import {hasItemStars} from '../../utils/itemQuality';
import {inventoryRarities} from './inventoryRarities';

export interface InventoryStack {
    id: string;
    quantity: number;
    batches: InventoryItem[];
}

const byName = new Intl.Collator('zh-CN', {numeric: true});

function stackId(item: InventoryItem): string {
    const {sku, stars, quality} = item.source;
    if (!sku || item.kind === 'combat_equipment') return JSON.stringify([item.id]);
    return JSON.stringify([
        item.actorId, sku, hasItemStars(sku) ? stars || 1 : null,
        quality || (sku.endsWith('.gold') ? 'gold' : 'normal'),
        Object.prototype.hasOwnProperty.call(inventoryRarities, item.rarity) ? item.rarity : 'common',
        item.kind === 'fish_king',
    ]);
}

export function stackInventory(items: readonly InventoryItem[]): InventoryStack[] {
    const stacks = new Map<string, InventoryStack>();
    for (const item of items) {
        const id = stackId(item);
        const stack = stacks.get(id);
        if (stack) {
            stack.quantity += item.quantity;
            stack.batches.push(item);
        } else {
            stacks.set(id, {id, quantity: item.quantity, batches: [item]});
        }
    }
    return Array.from(stacks.values()).sort((left, right) => {
        const a = left.batches[0], b = right.batches[0];
        return byName.compare(a.name, b.name)
            || (a.source.stars || 1) - (b.source.stars || 1);
    });
}
