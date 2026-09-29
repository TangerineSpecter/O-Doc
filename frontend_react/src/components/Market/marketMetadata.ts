export interface SkuKnowledge {
    sku: string;
    name: string;
    category: 'crop' | 'animal' | 'feed' | 'other';
    categoryLabel: string;
    categoryColor: string;
    badgeBg: string;
    badgeText: string;
    building?: string;
    growthTimeText?: string;
    periodText?: string;
    productName?: string;
    productEstimatedYield?: string;
    estimatedRevenue?: string;
    profitRate?: string;
    summary: string;
    tips: string;
}

export const SKU_KNOWLEDGE_BASE: Record<string, SkuKnowledge> = {
    'seed.radish': {
        sku: 'seed.radish',
        name: '萝卜种子',
        category: 'crop',
        categoryLabel: '农作物种子',
        categoryColor: 'emerald',
        badgeBg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
        badgeText: '速成蔬菜',
        growthTimeText: '1 小时 (3,600秒)',
        productName: '鲜脆萝卜',
        productEstimatedYield: '1 个 / 垄',
        estimatedRevenue: '18 世界币 / 个',
        profitRate: '+80%',
        summary: '生长周期短、投入成本低的优质初级作物。',
        tips: '极其适合新手居民与预算有限的居民快速回本，是积累农场启动资金的首选。',
    },
    'seed.potato': {
        sku: 'seed.potato',
        name: '土豆种子',
        category: 'crop',
        categoryLabel: '农作物种子',
        categoryColor: 'amber',
        badgeBg: 'bg-amber-50 border-amber-200 text-amber-700',
        badgeText: '高产饱腹',
        growthTimeText: '2 小时 (7,200秒)',
        productName: '黄心土豆',
        productEstimatedYield: '2 个 / 垄',
        estimatedRevenue: '18 世界币 / 个 (总计 36 世界币)',
        profitRate: '+80%',
        summary: '产量翻倍的优质块茎作物，单次播种产出 2 个土豆。',
        tips: '单位土地利用率极佳，是集市上流通量大、供需稳定的中坚粮食作物。',
    },
    'seed.corn': {
        sku: 'seed.corn',
        name: '玉米种子',
        category: 'crop',
        categoryLabel: '农作物种子',
        categoryColor: 'yellow',
        badgeBg: 'bg-yellow-50 border-yellow-200 text-yellow-800',
        badgeText: '大宗高值',
        growthTimeText: '4 小时 (14,400秒)',
        productName: '金黄甜玉米',
        productEstimatedYield: '3 个 / 垄',
        estimatedRevenue: '20 世界币 / 个 (总计 60 世界币)',
        profitRate: '+71.4%',
        summary: '生长稍慢但总经济产值最高的大宗经济作物，单次产出 3 穗玉米。',
        tips: '适合农闲时间长或土地面积充裕的居民，单垄综合回报率最丰厚。',
    },
    'animal.chicken': {
        sku: 'animal.chicken',
        name: '鸡',
        category: 'animal',
        categoryLabel: '家禽牲畜',
        categoryColor: 'orange',
        badgeBg: 'bg-orange-50 border-orange-200 text-orange-700',
        badgeText: '每日产蛋',
        building: '鸡舍 (Coop)',
        periodText: '24 小时 (1 天)',
        productName: '新鲜鸡蛋',
        productEstimatedYield: '1 枚 / 周期 (普通/金色)',
        estimatedRevenue: '普通 30 世界币 (金色更高)',
        profitRate: '长期稳定',
        summary: '性格温顺的小母鸡，需安置于鸡舍，每天产出一枚高营养鸡蛋。',
        tips: '日常需确保牛舍/鸡舍饲料充足，好感度提升后产出金色鸡蛋概率大增。',
    },
    'animal.cow': {
        sku: 'animal.cow',
        name: '牛',
        category: 'animal',
        categoryLabel: '大牲畜',
        categoryColor: 'blue',
        badgeBg: 'bg-blue-50 border-blue-200 text-blue-700',
        badgeText: '牧场支柱',
        building: '牛羊舍 (Barn)',
        periodText: '48 小时 (2 天)',
        productName: '香浓鲜牛奶',
        productEstimatedYield: '1 桶 / 周期 (普通/金色)',
        estimatedRevenue: '普通 100 世界币 (金色更高)',
        profitRate: '高产值回报',
        summary: '健壮的花斑奶牛，需安置于牛羊舍，每两天产出一桶高价值牛奶。',
        tips: '牧场主要的大宗经济支柱，牛奶在居民集市与商店中常年保持高回收价。',
    },
    'animal.sheep': {
        sku: 'animal.sheep',
        name: '羊',
        category: 'animal',
        categoryLabel: '大牲畜',
        categoryColor: 'pink',
        badgeBg: 'bg-pink-50 border-pink-200 text-pink-700',
        badgeText: '优质毛纺',
        building: '牛羊舍 (Barn)',
        periodText: '48 小时 (2 天)',
        productName: '蓬松羊毛',
        productEstimatedYield: '1 份 / 周期 (普通/金色)',
        estimatedRevenue: '普通 90 世界币 (金色更高)',
        profitRate: '稀有毛纺',
        summary: '温和可爱的绵羊，需安置于牛羊舍，每两天剪收一次丰厚羊毛。',
        tips: '金色羊毛是极受欢迎的高端手工与交易原料，深受手工业者喜爱。',
    },
    'feed': {
        sku: 'feed',
        name: '常驻饲料',
        category: 'feed',
        categoryLabel: '农资必备',
        categoryColor: 'amber',
        badgeBg: 'bg-amber-50 border-amber-200 text-amber-800',
        badgeText: '常驻物资',
        building: '鸡舍 & 牛羊舍',
        periodText: '每日消耗',
        productName: '维持牲畜生长',
        productEstimatedYield: '保障牲畜持续产出',
        estimatedRevenue: '固定平价供应',
        profitRate: '刚需投入',
        summary: '动物维持生命与生产必需的配方谷物饲料，断粮会导致牲畜停产。',
        tips: '系统商店无限量常驻平价供应，农场主应时刻储备以防动物挨饿。',
    },
};

export function getSkuKnowledge(sku: string, fallbackName?: string): SkuKnowledge {
    if (SKU_KNOWLEDGE_BASE[sku]) {
        return SKU_KNOWLEDGE_BASE[sku];
    }

    if (sku.startsWith('seed.')) {
        return {
            sku,
            name: fallbackName || '农作物种子',
            category: 'crop',
            categoryLabel: '农作物种子',
            categoryColor: 'emerald',
            badgeBg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
            badgeText: '田园种苗',
            summary: '可播种在开垦农田中的作物种子。',
            tips: '定期浇水能保证其按时茁壮成长。',
        };
    }

    if (sku.startsWith('animal.')) {
        return {
            sku,
            name: fallbackName || '牧场动物',
            category: 'animal',
            categoryLabel: '牧场动物',
            categoryColor: 'orange',
            badgeBg: 'bg-orange-50 border-orange-200 text-orange-700',
            badgeText: '牧场牲畜',
            summary: '农场养殖的健康动物，需安置在对应农场建筑中。',
            tips: '按时喂食饲料以维持其健康产出。',
        };
    }

    return {
        sku,
        name: fallbackName || '集市商品',
        category: 'other',
        categoryLabel: '世界物资',
        categoryColor: 'slate',
        badgeBg: 'bg-slate-50 border-slate-200 text-slate-700',
        badgeText: '流通商品',
        summary: '在世界集市中自由流通的各类资源与货品。',
        tips: '居民可自主上架、交易与采购。',
    };
}
