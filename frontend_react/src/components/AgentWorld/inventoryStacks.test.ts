import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {InventoryItem} from '../../types/api/travel';
import {stackInventory} from './inventoryStacks';

const item: InventoryItem = {
    id: 'harvest', actorId: 'a', actorName: '可莉', originActorId: 'a', originActorName: '可莉',
    name: '草莓', kind: 'crop', rarity: 'common', quantity: 4, value: '12.00',
    source: {sku: 'crop.strawberry', quality: 'normal'},
};

test('同 SKU 同星级汇总数量，并保留不同的原始获得者、价格和图片', () => {
    const bought = {...item, id: 'trade', originActorId: 'b', originActorName: '林芽',
        rarity: 'normal', quantity: 6, value: '15.00', iconUrl: '/example.webp',
        source: {...item.source, stars: 1}};
    const stacks = stackInventory([bought, item]);
    assert.equal(stacks.length, 1);
    assert.equal(stacks[0].quantity, 10);
    assert.deepEqual(stacks[0].batches, [bought, item]);
    assert.equal(stacks[0].id, stackInventory([item])[0].id);
    assert.equal(item.quantity, 4);
});

test('星级、商品标识、品质、居民归属和无 SKU 的旧物品各自保留', () => {
    const stacks = stackInventory([
        item,
        {...item, id: 'two-star', source: {...item.source, stars: 2}},
        {...item, id: 'different-sku', source: {sku: 'crop.tomato'}},
        {...item, id: 'gold', source: {...item.source, quality: 'gold'}},
        {...item, id: 'rare', rarity: 'rare'},
        {...item, id: 'other-resident', actorId: 'b'},
        {...item, id: 'legacy-one', source: {}},
        {...item, id: 'legacy-two', source: {}},
    ]);
    assert.equal(stacks.length, 8);
    assert.equal(stacks.reduce((sum, stack) => sum + stack.quantity, 0), 32);
    assert.deepEqual(stackInventory([]), []);
});

test('普通鱼和鱼王以及同款独立装备不合并', () => {
    const fish = {...item, kind: 'fish', source: {sku: 'fish.crucian'}};
    const gear = {...item, id: 'gear-one', kind: 'combat_equipment', source: {sku: 'combat.equipment.staff'}};
    assert.equal(stackInventory([
        fish, {...fish, id: 'fish-king', kind: 'fish_king'},
        gear, {...gear, id: 'gear-two'},
    ]).length, 4);
});
