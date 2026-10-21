import type {MarketAutomationPlan} from '../../types/api/market';

export const marketPlanPreviewNames: Record<string, string> = {
    'seed.strawberry': '草莓种子',
    'fertilizer.growth': '生长肥料',
    'dish.tomato_eggs': '番茄炒蛋',
    'crop.sunflower': '向日葵',
    'product.chicken.normal': '新鲜鸡蛋',
    'elixir.healing': '微光恢复药剂',
    'combat.material.moss_cave.1': '黏液',
    'souvenir.meadow_postcard': '新芽草甸明信片',
    'crop.strawberry': '草莓',
    'product.cow.normal': '鲜牛奶',
};

export function createMarketPlanPreview(actor?: {id: string; name: string}, variant = 0): MarketAutomationPlan {
    const actorId = actor?.id || 'market-plan-preview-agent';
    const actorName = actor?.name || '菲伦';
    const suffix = `-${variant + 1}`;
    return {
        id: `market-plan-preview-today${suffix}`,
        actorId,
        actorName,
        status: 'active',
        budget: (320 + variant * 80).toFixed(2),
        spent: (84.5 + variant * 31).toFixed(2),
        summary: '本地样例预览 · 补齐农场种植缺口，优先购入当季种子；成交价受日预算和生活预留共同限制。',
        equipmentSignature: 'preview-equipment-signature',
        goals: [
            {id: 'preview-goal-seed', kind: 'shop', sku: 'seed.strawberry', slot: '', minStars: 1, quantity: 12, filledQuantity: 6, maxUnitPrice: '8.50', status: 'open', reason: '补足今日播种缺口'},
            {id: 'preview-goal-fertilizer', kind: 'shop', sku: 'fertilizer.growth', slot: '', minStars: 1, quantity: 3, filledQuantity: 1, maxUnitPrice: '35.00', status: 'open', reason: '保留预算内补充肥料'},
            {id: 'preview-goal-listing', kind: 'listing', sku: 'dish.tomato_eggs', slot: '', minStars: 4, quantity: 2, filledQuantity: 1, maxUnitPrice: '42.00', status: 'open', reason: '只考虑四星及以上成品'},
            {id: 'preview-goal-equipment', kind: 'equipment', sku: '', slot: 'ring_1', minStars: 1, quantity: 1, filledQuantity: 0, maxUnitPrice: '88.00', status: 'open', reason: '评估戒指位升级'},
        ],
        dispositions: [
            {sku: 'crop.sunflower', targetHold: 8, sellRatio: 25, listRatio: 35, starOrder: 'high', listPriceRatio: '1.25', status: 'active', source: 'model', reason: ''},
            {sku: 'dish.tomato_eggs', targetHold: 2, sellRatio: 10, listRatio: 60, starOrder: 'high', listPriceRatio: '1.35', status: 'active', source: 'model', reason: ''},
            {sku: 'product.chicken.normal', targetHold: 12, sellRatio: 45, listRatio: 15, starOrder: 'low', listPriceRatio: '1.10', status: 'active', source: 'manual', reason: ''},
            {sku: 'elixir.healing', targetHold: 3, sellRatio: 0, listRatio: 40, starOrder: 'high', listPriceRatio: '1.50', status: 'active', source: 'model', reason: ''},
            {sku: 'combat.material.moss_cave.1', targetHold: 5, sellRatio: 30, listRatio: 40, starOrder: 'high', listPriceRatio: '1.20', status: 'active', source: 'model', reason: ''},
            {sku: 'souvenir.meadow_postcard', targetHold: 1, sellRatio: 0, listRatio: 75, starOrder: 'low', listPriceRatio: '1.40', status: 'active', source: 'model', reason: ''},
            {sku: 'crop.strawberry', targetHold: 10, sellRatio: 20, listRatio: 25, starOrder: 'high', listPriceRatio: '1.15', status: 'review', source: 'default', reason: '上次决策连接不可用，等待复核'},
            {sku: 'product.cow.normal', targetHold: 6, sellRatio: 35, listRatio: 20, starOrder: 'low', listPriceRatio: '1.20', status: 'active', source: 'model', reason: ''},
        ],
        noBuy: [
            {equipmentId: 'preview-equipment-01', price: '128.00', reason: '同部位属性没有提升', decidedAt: '2026-10-21T17:10:00+08:00'},
            {equipmentId: 'preview-equipment-02', price: '96.00', reason: '价格超过当日装备上限', decidedAt: '2026-10-21T16:42:00+08:00'},
            {equipmentId: 'preview-equipment-03', price: '74.00', reason: '当前职业无法穿戴', decidedAt: '2026-10-21T15:26:00+08:00'},
            {equipmentId: 'preview-equipment-04', price: '52.00', reason: '比较后判定不买', decidedAt: '2026-10-21T14:08:00+08:00'},
            {equipmentId: 'preview-equipment-05', price: '109.00', reason: '同位置已有更高属性装备', decidedAt: '2026-10-21T13:31:00+08:00'},
        ],
        ticks: [
            {scheduledAt: '2026-10-21T17:17:00+08:00', status: 'skipped', reason: '本机自动执行已关闭', hits: {}, sessionId: ''},
            {scheduledAt: '2026-10-21T18:48:00+08:00', status: 'skipped', reason: '错过执行时段，不补跑', hits: {}, sessionId: ''},
            {scheduledAt: '2026-10-21T21:39:00+08:00', status: 'skipped', reason: '本机自动执行已关闭', hits: {}, sessionId: ''},
            {scheduledAt: '2026-10-21T22:15:00+08:00', status: 'skipped', reason: '本机自动执行已关闭', hits: {}, sessionId: ''},
        ],
    };
}
