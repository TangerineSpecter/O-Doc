import catalog from './catalog';
import {residents, now, day, at} from './residents';
import {cropKinds, type FarmRules, type FarmState, type FarmOperation, type CropKind} from '../../types/api/farm';
import type {CookingRecipe, CookingRecipes} from '../../types/api/cooking';
import type {AlchemyRecipe, AlchemyRecipes} from '../../types/api/alchemy';
import type {InventoryItem} from '../../types/api/travel';
import type {CatalogItem} from '../../types/api/itemCatalog';
import type {MarketListing, MarketTransaction, MarketSession, MarketShop, MarketAutomationPlan} from '../../types/api/market';
import {createMarketPlanPreview} from '../../components/Market/marketPlanPreviewData';

export const farmRules: FarmRules = structuredClone(catalog.farm);
export const skill = {level: 6, experience: 560, levelExperience: 400, levelFloor: 400, nextLevelExperience: 700, progress: 53};
export const inventory: InventoryItem[] = residents.flatMap(r => cropKinds.flatMap((kind, i) => [1, 3, 5].map(stars => ({
    id: `${r.id}-${kind}-${stars}`, actorId: r.id, actorName: r.name, originActorId: r.id, originActorName: r.name,
    kind: 'crop', name: farmRules.crops[kind].name, quantity: 5 + i, rarity: 'normal', value: String(farmRules.crops[kind].salePrice * stars),
    source: {sku: `crop.${kind}`, stars, quality: 'normal'}, iconUrl: '',
}))));
export const farms: FarmState[] = residents.map((r, i) => ({id: r.id, actorName: r.name, appearance: {style: i % 3, palette: i % 3},
    avatar: '', professionName: r.professionName, balance: r.money, planting: skill, farmBonus: {professionId: r.profession!, professionName: r.professionName!, percentage: '25'},
    revision: 1, serverTime: now.toISOString(), weather: i % 2 ? 'rain' : 'sun', hour: 14, currentAction: '照料作物，等待本轮成熟',
    state: {cropSchemaVersion: 2, plantingExperience: 560, buildings: {coop: {level: 2, capacity: 4}, barn: {level: 1, capacity: 2}},
        plots: Array.from({length: 9}, (_, n) => {const kind = cropKinds[(n + i) % cropKinds.length]; return {id: String(n), wateredUntil: now.getTime() / 1000 + 3600, wet: true,
            crop: n === 8 ? null : {kind, grown: farmRules.crops[kind].growthSeconds * (n % 3 === 0 ? 1 : .45), checkedAt: now.getTime() / 1000,
                plantedAt: now.getTime() / 1000 - 7200, rules: farmRules.crops[kind], qualityVersion: 2, cycleId: `cycle-${n}`, plantingLevel: 6,
                starProbabilities: [.1, .2, .4, .2, .1], result: {stars: 3, event: 'normal', eventName: '丰收', fertilizerExtra: 1, unitPrice: 35, experience: 15}}};}),
        animals: (['chicken', 'cow', 'sheep'] as const).map((kind, n) => ({id: `animal-${n}`, kind, building: farmRules.animals[kind].building,
            halfHearts: 8, fedUntil: now.getTime() / 1000 + 86400, lastFedDay: day,
            cycle: {number: 2, grown: n === 0 ? 86400 : 48000, checkedAt: now.getTime() / 1000, rules: farmRules.animals[kind]}})),
        plantingPlanId: `plan-${r.id}`, plantingPlans: {[`plan-${r.id}`]: {version: 2, id: `plan-${r.id}`, revision: 1, day, itemId: `local-life-${i}-0`, taskId: 'local-task-farm',
            startsAt: now.getTime() / 1000 - 3600, cutoff: now.getTime() / 1000 + 36000, activatedAt: now.getTime() / 1000 - 3600, status: 'active',
            entries: [{id: 'entry-1', sku: 'seed.strawberry', quantity: 6, priority: 1, fertilizerMode: 'optional', fertilizer: 'quality'}],
            progress: {'entry-1': 2}, procurementLimit: '240', investment: {kind: 'expand', building: null, cost: '500.00',
                label: '购买相邻四块耕地（4→8块）', executedAt: now.getTime() / 1000 - 3500, spent: '500.00'},
            purchases: [], reason: '为甜点制作准备原料',
            events: [{id: 'event-1', at: now.getTime() / 1000, code: 'planted', detail: '已播种草莓，等待成熟', entryId: 'entry-1'}], waitStates: {}, versions: []}}},
    inventory: [...inventory.filter(item => item.actorId === r.id).map(item => ({...item, sku: item.source.sku!, stars: item.source.stars, quality: 'normal'})),
        {id: 'seed', name: '草莓种子', quantity: 8, value: '40', sku: 'seed.strawberry', quality: 'normal'}],
}));
export const farmHistory: FarmOperation[] = ['harvest', 'plant', 'water', 'feed', 'collect'].map((kind, i) => ({id: `local-farm-op-${i}`, operation: {kind, targets: ['0']},
    result: {label: ['收获草莓', '播种土豆', '浇水', '喂养动物', '收集鸡蛋'][i], amount: '35', energyCost: 2, experienceGained: 15,
        products: [{name: i === 4 ? '鸡蛋' : '草莓', quantity: 3, quality: 'normal'}]}, reason: '本地样例：按今日种植计划执行', createdAt: at(8 + i)}));
farmHistory.push({id: 'local-farm-op-expand', operation: {kind: 'expand'},
    result: {label: '扩地', amount: '-500.00', energyCost: 2, investmentPlanId: 'plan-local'}, reason: '本地样例：按队列规划扩地', createdAt: at(7)});

const ingredientName = (sku: string) => sku.startsWith('crop.') ? farmRules.crops[sku.slice(5) as CropKind]?.name || sku : sku.includes('chicken') ? '普通鸡蛋' : '普通牛奶';
export const cookingRecipes: CookingRecipe[] = catalog.cooking.map(row => {
    const [id, name, level, price, materials] = row as [string, string, number, number, Record<string, number>];
    return {id, sku: `dish.${id}`, name, requiredLevel: level, salePrice: String(price), experience: level * 10, energyCost: 3,
        description: '使用农场食材制作，基础调味料和水不占库存。', ingredients: Object.entries(materials).map(([key, quantity]) => {
            const sku = key === 'egg' ? 'product.chicken.normal' : key === 'milk' ? 'product.cow.normal' : `crop.${key}`;
            return {sku, quantity, name: ingredientName(sku), owned: id === 'spiced_peanuts' ? 0 : 24};}),
        state: level > 6 ? 'locked' : id === 'spiced_peanuts' ? 'missing' : 'ready', maxPortions: level > 6 ? 0 : 8,
        timesMade: level * 3, ingredientValue: '24', processingGain: String(price - 24), iconAssetId: null, iconUrl: '',
        adventureEffects: [1, 2, 3, 4, 5].map(stars => ({stars, effects: {hp: stars * .02}, summary: `生命上限 +${stars * 2}%`}))};
});
export const cooking: CookingRecipes = {recipes: cookingRecipes, skill, ingredientOptions: [
    ...cropKinds.map(k => ({sku: `crop.${k}`, name: farmRules.crops[k].name})),
    {sku: 'product.chicken.normal', name: '普通鸡蛋'}, {sku: 'product.cow.normal', name: '普通牛奶'},
]};
export const alchemyRecipes: AlchemyRecipe[] = catalog.alchemy.map(row => ({...row, sku: `elixir.${row.id}`, description: '使用迷宫掉落材料炼制的战斗药剂。',
    ingredients: row.ingredients.map(([sku, quantity]) => ({sku: String(sku), quantity: Number(quantity), name: (catalog.materials as Record<string, (string | number)[]>)[sku]?.[0] as string || String(sku),
        tier: 1, source: '苔石洞窟', owned: row.id === 'iron' ? 0 : 20})),
    state: row.requiredLevel > 6 ? 'locked' : row.id === 'iron' ? 'missing' : 'ready', maxBottles: 6, timesMade: 12,
    ownedBottles: 8, ownedByStars: {'1': 3, '3': 5}, ingredientValue: '5.20', dungeonLabels: ['苔石洞窟'],
    effects: [1, 2, 3, 4, 5].map(stars => ({stars, effects: {hp: stars * 15}, summary: `恢复生命 ${stars * 15}`})),
    qualityPreviews: [], iconAssetId: null, iconUrl: '',
}));
export const alchemy: AlchemyRecipes = {recipes: alchemyRecipes, skill: {...skill, bottlesMade: 28}, carryCap: 5,
    materials: Object.entries(catalog.materials).map(([sku, row]) => ({sku, name: String(row[0]), level: Number(row[1]), salePrice: String(row[2]), dungeon: '苔石洞窟'}))};
export const itemCatalog: CatalogItem[] = [
    ...cropKinds.flatMap(k => [{id: `seed.${k}`, sku: `seed.${k}`, name: `${farmRules.crops[k].name}种子`, category: 'seed' as const, description: '统一纸袋种子，种下后可收获对应作物。', purchasePrice: farmRules.crops[k].seedPrice, salePrice: null, quality: 'normal', quantity: 12, iconUrl: ''},
        {id: `crop.${k}`, sku: `crop.${k}`, name: farmRules.crops[k].name, category: 'crop' as const, description: '农场收获的食材，可用于烹饪和交易。', purchasePrice: null, salePrice: farmRules.crops[k].salePrice, quality: 'normal', quantity: 24, starQuantities: {'1': 10, '3': 8, '5': 6}, iconUrl: ''}]),
    ...cookingRecipes.map(r => ({id: r.sku, sku: r.sku, name: r.name, category: 'dish' as const, description: r.description, purchasePrice: null, salePrice: Number(r.salePrice), quality: 'normal', quantity: 6, iconUrl: ''})),
    ...alchemyRecipes.map(r => ({id: r.sku, sku: r.sku, name: r.name, category: 'elixir' as const, description: r.description, purchasePrice: null, salePrice: Number(r.salePrice), quality: 'normal', quantity: 8, iconUrl: ''})),
    ...(['quality', 'yield'] as const).map(k => ({id: `fertilizer.${k}`, sku: `fertilizer.${k}`, name: farmRules.fertilizers[k].name, category: 'fertilizer' as const, description: '播种时施用的农场肥料。', purchasePrice: farmRules.fertilizers[k].basePrice, salePrice: null, quality: 'normal', quantity: 10, iconUrl: `/farm/items/fertilizer.${k}.png`})),
    {id: 'feed', sku: 'feed', name: '饲料', category: 'feed', description: '用于照料牧场动物。', purchasePrice: 5, salePrice: null, quality: 'normal', quantity: 30, iconUrl: ''},
    ...(['chicken', 'cow', 'sheep'] as const).flatMap(k => ['normal', 'gold'].map(quality => ({id: `product.${k}.${quality}`, sku: `product.${k}.${quality}`, name: `${quality === 'gold' ? '金色' : '普通'}${farmRules.animals[k].product}`, category: 'animal_product' as const, description: '牧场产物，可以用于制作或出售。', purchasePrice: null, salePrice: farmRules.animals[k].salePrice, quality, quantity: 8, iconUrl: `/farm/items/product.${k}.${quality}.png`}))),
    {id: 'souvenir.west_lake', sku: 'souvenir.west_lake', name: '西湖手绘明信片', category: 'souvenir', description: '旅行带回的小小纪念，记录沿途的发现。', purchasePrice: 20, salePrice: 10, quality: 'normal', quantity: 4, iconUrl: ''},
];
inventory.push(...residents.flatMap(r => itemCatalog.filter(item => ['dish', 'elixir', 'fertilizer', 'feed', 'animal_product', 'souvenir', 'seed'].includes(item.category)).map((item, i) => ({
    id: `${r.id}-extra-${i}`, actorId: r.id, actorName: r.name, originActorId: r.id, originActorName: r.name,
    kind: item.category, name: item.name, quantity: item.quantity, rarity: 'normal', value: String(item.salePrice || item.purchasePrice || 5),
    iconUrl: item.iconUrl, source: {sku: item.sku, stars: ['dish', 'elixir'].includes(item.category) ? 3 : undefined, quality: item.quality},
}))));
export const shop: MarketShop = {id: 'local-shop', startsAt: at(0), expiresAt: at(0, 1), serverTime: now.toISOString(),
    slots: [...cropKinds.map((k, i) => ({id: String(i), sku: `seed.${k}`, name: `${farmRules.crops[k].name}种子`, kind: 'seed' as const, price: String(farmRules.crops[k].seedPrice), initialQuantity: 50, remainingQuantity: 32})),
        ...(['chicken', 'cow', 'sheep'] as const).map((kind, i) => ({id: String(16 + i), sku: `animal.${kind}`, name: farmRules.animals[kind].name, kind: 'animal' as const, price: String(farmRules.animals[kind].price), initialQuantity: 4, remainingQuantity: 2}))],
    feed: {sku: 'feed', name: '饲料', price: '5'}, supplies: [
        ...(['quality', 'yield'] as const).map(k => ({id: k, sku: `fertilizer.${k}`, kind: 'fertilizer' as const, price: String(farmRules.fertilizers[k].basePrice), ...farmRules.fertilizers[k]}))]};
export const listings: MarketListing[] = inventory.slice(0, 24).map((item, i) => ({id: `local-listing-${i}`, sellerId: item.actorId, sellerName: item.actorName,
    item: {...item, kind: 'crop', iconAssetId: item.iconAssetId || undefined}, initialQuantity: 12, remainingQuantity: 8, unitPrice: item.value, version: 1, status: 'active', createdAt: at(10), history: []}));
export const transactions: MarketTransaction[] = [...residents.map((r, i) => ({id: `local-transaction-${i}`, actorId: r.id, actorName: r.name,
    sessionId: `local-session-${i}`, operation: {kind: 'buy', reason: '补足下一轮种植的种子'}, result: {kind: 'seed', name: '草莓种子', quantity: 3, total: '120', unitPrice: '40'}, createdAt: at(10 + i)})),
    {id: 'local-transaction-fish', actorId: residents[0].id, actorName: residents[0].name, sessionId: 'local-session-0',
        operation: {kind: 'sell', reason: '进场自动回收普通鱼'}, result: {kind: 'fish', name: '鲫鱼', quantity: 3, total: '6', fishing_sku: 'fish.crucian'}, createdAt: at(14)}];
export const sessions: MarketSession[] = residents.map((r, i) => ({id: `local-session-${i}`, actorId: r.id, actorName: r.name, status: 'completed', mode: 'automatic', callCount: 2,
    createdAt: at(10), expiresAt: at(11), endedAt: at(11), reason: '已完成采购并保留日常储备金',
    calls: [{name: 'buy', at: at(10), arguments: {sku: 'seed.strawberry', quantity: 3}, result: {name: '草莓种子', quantity: 3, total: '120', budgetBefore: '300', budgetAfter: '180'}}],
    transactions: [transactions[i]]}));
export const marketPlans: MarketAutomationPlan[] = residents.map((r, i) => createMarketPlanPreview(r, i));
