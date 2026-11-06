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
    const reviewedDate = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
    return {
        id: `market-plan-preview-today${suffix}`,
        actorId,
        actorName,
        status: 'active',
        budget: (320 + variant * 80).toFixed(2),
        spent: (84.5 + variant * 31).toFixed(2),
        summary: '本地样例预览 · 补齐农场种植缺口，优先购入当季种子；装备按小时汇总未判断可穿戴挂牌，进场后逐件决定。',
        equipmentSignature: 'preview-equipment-signature',
        goals: [
            {id: 'preview-goal-seed', kind: 'shop', sku: 'seed.strawberry', slot: '', minStars: 1, quantity: 12, filledQuantity: 6, maxUnitPrice: '8.50', status: 'open', reason: '补足今日播种缺口'},
            {id: 'preview-goal-fertilizer', kind: 'shop', sku: 'fertilizer.growth', slot: '', minStars: 1, quantity: 3, filledQuantity: 1, maxUnitPrice: '35.00', status: 'open', reason: '保留预算内补充肥料'},
            {id: 'preview-goal-listing', kind: 'listing', sku: 'dish.tomato_eggs', slot: '', minStars: 4, quantity: 2, filledQuantity: 1, maxUnitPrice: '42.00', status: 'open', reason: '只考虑四星及以上成品'},
        ],
        dispositions: [
            {sku: 'crop.sunflower', targetHold: 8, sellRatio: 25, listRatio: 35, starOrder: 'high', listPriceRatio: '1.25', status: 'active', source: 'model', reason: ''},
            {sku: 'dish.tomato_eggs', targetHold: 2, sellRatio: 10, listRatio: 60, starOrder: 'high', listPriceRatio: '1.35', status: 'active', source: 'model', reason: ''},
            {sku: 'product.chicken.normal', targetHold: 12, sellRatio: 45, listRatio: 15, starOrder: 'low', listPriceRatio: '1.10', status: 'active', source: 'manual', reason: ''},
            {sku: 'elixir.healing', targetHold: 3, sellRatio: 0, listRatio: 40, starOrder: 'high', listPriceRatio: '1.50', status: 'active', source: 'model', reason: ''},
            {sku: 'combat.material.moss_cave.1', targetHold: 20, sellRatio: 30, listRatio: 40, starOrder: 'high', listPriceRatio: '1.20', status: 'active', source: 'model', reason: ''},
            {sku: 'souvenir.meadow_postcard', targetHold: 1, sellRatio: 0, listRatio: 75, starOrder: 'low', listPriceRatio: '1.40', status: 'active', source: 'model', reason: ''},
            {sku: 'crop.strawberry', targetHold: 10, sellRatio: 20, listRatio: 25, starOrder: 'high', listPriceRatio: '1.15', status: 'review', source: 'default', reason: '上次决策连接不可用，等待复核'},
            {sku: 'product.cow.normal', targetHold: 6, sellRatio: 35, listRatio: 20, starOrder: 'low', listPriceRatio: '1.20', status: 'active', source: 'model', reason: ''},
        ].map((row, index) => {
            const purpose = row.sku.startsWith('combat.material.') ? 'alchemy' as const : row.sku.startsWith('crop.') || row.sku.startsWith('product.') ? 'cooking' as const : 'selfUse' as const;
            const target = row.targetHold, committed = index === 4 ? 12 : Math.min(2, target);
            const forge = index === 4 ? 30 : 0, required = Math.max(target, committed) + forge;
            const total = index === 4 ? 595 : index === 6 ? 3 : required + 12;
            const protectedQuantity = Math.min(total, required);
            return {...row, sellRatio: row.sku.startsWith('elixir.') || row.sku.startsWith('souvenir.') ? 0 : 50,
                listRatio: row.sku.startsWith('elixir.') || row.sku.startsWith('souvenir.') ? 100 : 50,
                strategy: {version: 1 as const, targets: {[purpose]: target}, retainOrder: 'high' as const, reviewedDate},
                reviewedDate, reviewStatus: index === 6 ? 'review' : 'current',
                protection: {total, protected: protectedQuantity, required, missing: Math.max(0, required - total), disposable: Math.max(0, total - required),
                    blockedListing: index === 5 ? 2 : 0, blockedReason: index === 5 ? '到期返还库存暂不能再次挂牌' : index === 6 ? '已确认用途需求尚有缺口' : '',
                    uses: {[purpose]: {target, committed, required: Math.max(target, committed), protected: Math.min(total, Math.max(target, committed)), missing: Math.max(0, Math.max(target, committed) - total)},
                        ...(forge ? {forge: {target: 0, committed: forge, required: forge, protected: forge, missing: 0}} : {})}}};
        }),
        noBuy: [
            {equipmentId: 'preview-equipment-01', price: '128.00', reason: '同部位属性没有提升', decidedAt: '2026-10-21T17:10:00+08:00'},
            {equipmentId: 'preview-equipment-02', price: '96.00', reason: '逐件比较后认为价格不划算', decidedAt: '2026-10-21T16:42:00+08:00'},
            {equipmentId: 'preview-equipment-03', price: '74.00', reason: '居民逐件比较后明确不买', decidedAt: '2026-10-21T15:26:00+08:00'},
            {equipmentId: 'preview-equipment-04', price: '52.00', reason: '比较后判定不买', decidedAt: '2026-10-21T14:08:00+08:00'},
            {equipmentId: 'preview-equipment-05', price: '109.00', reason: '同位置已有更高属性装备', decidedAt: '2026-10-21T13:31:00+08:00'},
        ],
        ticks: [
            {scheduledAt: '2026-10-26T17:17:00+08:00', status: 'done', reason: '完成1笔，失败1笔', hits: {outcome: {failed: [{operation: {kind: 'sell_combat_material', materialId: 'material.moss_cave.1', quantity: 545}, reason: '库存价格批次不一致，未提交本笔交易'}]}, equipmentCandidates: [{type: 'mage_staff', name: '法杖', count: 2}], entryChoice: 'enter'}, sessionId: 'preview-equipment-session'},
            {scheduledAt: '2026-10-26T18:48:00+08:00', status: 'skipped', reason: '本轮没有可执行的买卖', hits: {equipmentCandidates: []}, sessionId: ''},
            {scheduledAt: '2026-10-21T21:39:00+08:00', status: 'skipped', reason: '本机自动执行已关闭', hits: {}, sessionId: ''},
            {scheduledAt: '2026-10-21T22:15:00+08:00', status: 'skipped', reason: '本机自动执行已关闭', hits: {}, sessionId: ''},
        ],
    };
}
