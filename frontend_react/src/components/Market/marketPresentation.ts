import type {MarketItem} from '../../types/api/market';

export const marketOperationLabels: Record<string, string> = {
    adjust_life_budget: '调整采购预算（不计市场次数）',
    buy_shop: '购买商店商品', buy_listing: '购买居民商品', sell: '出售给商店', list: '上架商品', reprice: '调整价格', withdraw: '撤回商品',
    buy_potion: '购买药剂', buy_combat_potion: '购买药剂', sell_combat_material: '出售战斗素材', sell_combat_equipment: '出售战斗装备',
    list_combat_equipment: '上架冒险装备',
    get_market_shop: '查看系统商店', list_market_listings: '浏览居民集市', get_my_market_listings: '查看我的挂牌', get_my_market_transactions: '查看成交', get_market_context: '查看经营需求', enter_market: '进入市场', buy_market_shop: '购买商店商品', buy_market_listing: '购买居民商品', sell_to_market_shop: '出售给商店', create_market_listing: '上架商品', reprice_market_listing: '调整价格', withdraw_market_listing: '撤回商品', leave_market: '离开市场',
};
export const marketTime = (value?: string) => value ? new Date(value).toLocaleString('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : '—';
export const marketMoney = (value: string) => Number(value).toLocaleString('zh-CN', {maximumFractionDigits: 2});

export function marketListingCategory(item: MarketItem) {
    const sku = item.source?.sku || '';
    if (sku.startsWith('fish.')) return {label: item.kind === 'fish_king' ? '鱼王' : '鱼类', className: 'bg-teal-50 border-teal-200 text-teal-700'};
    if (item.kind === 'combat_material' || item.source?.kind === 'combat_material' || sku.startsWith('combat.material.')) {
        return {label: '冒险材料', className: 'bg-sky-50 border-sky-200 text-sky-700'};
    }
    if (item.kind === 'combat_equipment' || item.source?.kind === 'combat_equipment') {
        return {label: '冒险装备', className: 'bg-orange-50 border-orange-200 text-orange-700'};
    }
    if (item.kind === 'souvenir') {
        return {label: '纪念品', className: 'bg-indigo-50 border-indigo-200 text-indigo-700'};
    }
    if (item.source?.quality === 'gold') {
        return {label: '金色', className: 'bg-amber-50 border-amber-200 text-amber-700'};
    }
    if (sku.startsWith('dish.')) {
        return {label: '美食', className: 'bg-rose-50 border-rose-200 text-rose-700'};
    }
    if (sku.startsWith('elixir.')) {
        return {label: '炼金成品', className: 'bg-violet-50 border-violet-200 text-violet-700'};
    }
    return {label: '农产自营', className: 'bg-emerald-50 border-emerald-200 text-emerald-700'};
}

const unknownSkuLabels: Array<[string, string]> = [
    ['seed.', '作物种子'],
    ['fish.', '鱼类'], ['bait.', '鱼饵'],
    ['crop.', '农作物'],
    ['product.', '畜牧产物'],
    ['dish.', '美食'],
    ['elixir.', '炼金药剂'],
    ['combat.material.', '冒险材料'],
    ['material.', '冒险材料'],
    ['fertilizer.', '肥料'],
    ['animal.', '牧场动物'],
    ['souvenir.', '旅行纪念品'],
];

export function marketSkuName(sku: string, names: Record<string, string>) {
    if (names[sku]) return names[sku];
    if (sku === 'feed') return '饲料';
    return unknownSkuLabels.find(([prefix]) => sku.startsWith(prefix))?.[1] || '集市商品';
}

export const marketEquipmentSlotLabels: Record<string, string> = {
    weapon: '武器', offhand: '副手', head: '头饰', body: '护甲', hands: '手套',
    legs: '护腿', feet: '靴子', accessory: '吊坠', ring_1: '戒指位 1', ring_2: '戒指位 2',
};

export const marketTickStatusLabels: Record<string, string> = {
    pending: '待处理', running: '执行中', done: '已完成', failed: '失败', skipped: '跳过',
};
