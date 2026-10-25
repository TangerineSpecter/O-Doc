import type {DailyFeedEvent} from '../../types/api/dailyFeed';

const now = new Date();
const atTime = (hour: number, minute = 0) => {
    const d = new Date(now);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
};

/**
 * 结构化多步执行明细 Mock 数据样本
 * 包含：
 * 1. 炼金制作（单瓶、多瓶、星级配方、经验与回收价值，带规划想法）
 * 2. 市场活动（进入市场、居民上架、装备上架、出售装备、商店购买、离开市场等多步时间线）
 * 3. 农场经营（AI规划、种植队列状态、收获、翻耕、播种浇水、施肥等自动化执行时间线）
 * 4. 迷宫探索结算（按后端 settle 生成的报告文案，覆盖按计划完成、额度耗尽、角色倒地与暂停未结算）
 * 精确覆盖用户截图中的全部样本，并补充小橘、林芽、星河、白露等居民的日常制作、农场与市场交互。
 */
export const feedStepsSamples: DailyFeedEvent[] = [
    ...([1, 3] as const).map(count => ({
        id: `local-feed-exploration-party-${count}`, actorId: 'local-resident-1', actorName: '小橘',
        category: 'exploration' as const, source: 'exploration', occurredAt: now.toISOString(),
        title: '迷宫探索 · 24 分钟',
        detail: `小橘探索24分钟，击败14只怪物，获得1283经验；消耗20体力。${count === 1 ? '角色倒地' : '全队倒地 本人参与击败14只，离队时队伍累计击败20只。'}消耗药剂 0 瓶，返回 Lv.12。`,
        status: 'failed', amount: null, explorationParty: {min: count, max: count, final: count},
        target: {kind: 'exploration', id: 'local-exploration'},
    })),
    // 样本 1：精确匹配用户图片 1（市场活动 7 步：进入市场、居民上架、装备上架、出售装备、离开市场）
    {
        id: 'local-feed-market-step-sample-1',
        actorId: 'local-resident-1',
        actorName: '小橘',
        actorIds: ['local-resident-1'],
        category: 'market',
        source: 'execution',
        occurredAt: new Date(now.getTime() - 8 * 60000).toISOString(),
        title: '市场活动',
        detail: '已执行 5 项操作 · 挂牌与多余装备回收已完成，离开市场。',
        reason: '挂牌与多余装备回收已完成，离开市场。',
        status: 'success',
        amount: '20.80',
        rating: null,
        target: {kind: 'market', id: 'local-market-session-sample-1'},
        steps: [
            {id: 'step-m1-1', title: '进入市场', detail: '', occurredAt: '', amount: null},
            {id: 'step-m1-2', title: '居民上架', detail: '蝠翼 × 15 · 单价 1.12', occurredAt: '', amount: null},
            {id: 'step-m1-3', title: '装备上架', detail: '复苏的轻行皮靴 × 1 · 单价 4.80', occurredAt: '', amount: null},
            {id: 'step-m1-4', title: '装备上架', detail: '复苏的新手护甲 × 1 · 单价 3.96', occurredAt: '', amount: null},
            {id: 'step-m1-5', title: '出售装备', detail: '丰盈的皮革护腕 × 1', occurredAt: '', amount: null},
            {id: 'step-m1-6', title: '装备上架', detail: '辉耀的猎行皮甲 × 1 · 单价 8.06', occurredAt: '', amount: null},
            {id: 'step-m1-7', title: '离开市场', detail: '', occurredAt: '', amount: null},
        ],
    },

    // 样本 2：精确匹配用户图片 2（猫猫 炼金制作 1 瓶：愈合药剂 ★1 ×1）
    {
        id: 'local-feed-alchemy-maomao-1',
        actorId: 'local-resident-maomao',
        actorName: '猫猫',
        actorIds: ['local-resident-maomao'],
        category: 'alchemy',
        source: 'execution',
        occurredAt: new Date(now.getTime() - 16 * 60000).toISOString(),
        title: '炼金制作',
        detail: '已炼制 1 瓶药水 · 愈合药剂 ★1 ×1',
        reason: '系统选择说明：按已确认的炼金配方和瓶数制作。',
        status: 'success',
        amount: null,
        rating: null,
        target: {kind: 'alchemy', id: 'local-alchemy-op-maomao-1'},
        steps: [
            {
                id: 'step-alchemy-maomao-1',
                title: '炼制',
                detail: '愈合药剂 ★1 ×1 · 炼金经验 +12 · 回收价值 12.00 币',
                occurredAt: '',
                amount: null,
            },
        ],
    },

    // 样本 3：精确匹配用户图片 3（银月 炼金制作 2 瓶：愈合药剂 ★1 ×1、愈合药剂 ★2 ×1）
    {
        id: 'local-feed-alchemy-yinyue-1',
        actorId: 'local-resident-yinyue',
        actorName: '银月',
        actorIds: ['local-resident-yinyue'],
        category: 'alchemy',
        source: 'execution',
        occurredAt: new Date(now.getTime() - 28 * 60000).toISOString(),
        title: '炼金制作',
        detail: '已炼制 2 瓶药水 · 愈合药剂 ★1 ×1、愈合药剂 ★2 ×1',
        reason: '系统选择说明：按已确认的炼金配方和瓶数制作。',
        status: 'success',
        amount: null,
        rating: null,
        target: {kind: 'alchemy', id: 'local-alchemy-op-yinyue-1'},
        steps: [
            {
                id: 'step-alchemy-yinyue-1',
                title: '炼制',
                detail: '愈合药剂 ★1 ×1 · 炼金经验 +12 · 回收价值 12.00 币',
                occurredAt: '',
                amount: null,
            },
            {
                id: 'step-alchemy-yinyue-2',
                title: '炼制',
                detail: '愈合药剂 ★2 ×1 · 炼金经验 +13 · 回收价值 14 币',
                occurredAt: '',
                amount: null,
            },
        ],
    },

    // 样本 4：精确匹配用户图片 4（市场活动 7 步：装备上架 4 件、商店购买小鱼饵 90、离开市场）
    {
        id: 'local-feed-market-step-sample-2',
        actorId: 'local-resident-2',
        actorName: '林芽',
        actorIds: ['local-resident-2'],
        category: 'market',
        source: 'execution',
        occurredAt: new Date(now.getTime() - 42 * 60000).toISOString(),
        title: '市场活动',
        detail: '已执行 5 项操作 · 补充鱼饵并上架闲置装备。',
        reason: '补充鱼饵并上架闲置装备。',
        status: 'success',
        amount: '-270.00',
        rating: null,
        target: {kind: 'market', id: 'local-market-session-sample-2'},
        steps: [
            {id: 'step-m2-1', title: '进入市场', detail: '', occurredAt: '', amount: null},
            {id: 'step-m2-2', title: '装备上架', detail: '御暗的新手靴子 × 1 · 单价 2.52', occurredAt: '', amount: null},
            {id: 'step-m2-3', title: '装备上架', detail: '幸运的新手护甲 × 1 · 单价 2.20', occurredAt: '', amount: null},
            {id: 'step-m2-4', title: '装备上架', detail: '御暗的新手手套 × 1 · 单价 3.42', occurredAt: '', amount: null},
            {id: 'step-m2-5', title: '装备上架', detail: '灵运的新手手套 × 1 · 单价 8.17', occurredAt: '', amount: null},
            {id: 'step-m2-6', title: '商店购买', detail: '小鱼饵 × 90 · 单价 3', occurredAt: '', amount: null},
            {id: 'step-m2-7', title: '离开市场', detail: '', occurredAt: '', amount: null},
        ],
    },

    // 样本 5：预置居民 小橘 的炼金制作（2瓶：活力药剂与敏捷药剂，带经验升级）
    {
        id: 'local-feed-alchemy-resident-1',
        actorId: 'local-resident-1',
        actorName: '小橘',
        actorIds: ['local-resident-1'],
        category: 'alchemy',
        source: 'execution',
        occurredAt: new Date(now.getTime() - 65 * 60000).toISOString(),
        title: '炼金制作',
        detail: '已炼制 2 瓶药水 · 活力药水 ★1 ×1、敏捷药剂 ★2 ×1',
        reason: '系统选择说明：按已确认的炼金配方和瓶数制作。',
        status: 'success',
        amount: null,
        rating: null,
        target: {kind: 'alchemy', id: 'local-alchemy-op-resident-1'},
        steps: [
            {
                id: 'step-alchemy-r1-1',
                title: '炼制',
                detail: '活力药水 ★1 ×1 · 炼金经验 +15 · 回收价值 18.00 币',
                occurredAt: '',
                amount: null,
            },
            {
                id: 'step-alchemy-r1-2',
                title: '炼制',
                detail: '敏捷药剂 ★2 ×1 · 炼金经验 +18 · 回收价值 24.00 币 · 炼金升至 Lv.5',
                occurredAt: '',
                amount: null,
            },
        ],
    },

    // 样本 6：预置居民 星河 的市场采购与上架（含农产品挂牌与肥料采购）
    {
        id: 'local-feed-market-resident-3',
        actorId: 'local-resident-3',
        actorName: '星河',
        actorIds: ['local-resident-3'],
        category: 'market',
        source: 'execution',
        occurredAt: new Date(now.getTime() - 95 * 60000).toISOString(),
        title: '市场活动',
        detail: '已执行 4 项操作 · 挂牌高品质草莓，回笼周转资金。',
        reason: '挂牌高品质草莓，回笼周转资金。',
        status: 'success',
        amount: '80.00',
        rating: null,
        target: {kind: 'market', id: 'local-market-session-resident-3'},
        steps: [
            {id: 'step-m3-1', title: '进入市场', detail: '', occurredAt: '', amount: null},
            {id: 'step-m3-2', title: '居民上架', detail: '优质草莓 × 20 · 单价 6.50', occurredAt: '', amount: null},
            {id: 'step-m3-3', title: '出售装备', detail: '轻巧的布帽 × 1', occurredAt: '', amount: null},
            {id: 'step-m3-4', title: '商店购买', detail: '有机肥料 × 10 · 单价 5', occurredAt: '', amount: null},
            {id: 'step-m3-5', title: '离开市场', detail: '', occurredAt: '', amount: null},
        ],
    },

    // 样本 7：预置居民 白露 的炼金制作（1瓶愈合药剂）
    {
        id: 'local-feed-alchemy-resident-4',
        actorId: 'local-resident-4',
        actorName: '白露',
        actorIds: ['local-resident-4'],
        category: 'alchemy',
        source: 'execution',
        occurredAt: new Date(now.getTime() - 130 * 60000).toISOString(),
        title: '炼金制作',
        detail: '已炼制 1 瓶药水 · 愈合药剂 ★1 ×1',
        reason: '系统选择说明：按已确认的炼金配方和瓶数制作。',
        status: 'success',
        amount: null,
        rating: null,
        target: {kind: 'alchemy', id: 'local-alchemy-op-resident-4'},
        steps: [
            {
                id: 'step-alchemy-r4-1',
                title: '炼制',
                detail: '愈合药剂 ★1 ×1 · 炼金经验 +12 · 回收价值 12.00 币',
                occurredAt: '',
                amount: null,
            },
        ],
    },

    // 样本 8：精确匹配用户最新截图：农场经营 8 步自动队列执行明细
    {
        id: 'local-feed-farm-queue-sample-1',
        actorId: 'local-resident-2',
        actorName: '林芽',
        actorIds: ['local-resident-2'],
        category: 'farm',
        source: 'execution',
        occurredAt: atTime(11, 25),
        title: '农场经营',
        detail: '已执行 6 项操作',
        reason: '凌晨有两批草莓陆续成熟了，放到中午正好一起收。上午去农场把果实领回来，顺便启动今天的种植队列，让空出来的地按计划重新种上。农场的事一天一次，放在上午最稳妥——该收的按时收，该种的按时种，事情按规矩转，才不会乱。',
        status: 'success',
        amount: null,
        rating: null,
        target: {kind: 'farm', id: 'local-farm-2'},
        steps: [
            {
                id: 'step-farm-q1',
                title: '队列状态',
                detail: '活动时段已截止，未播种项目失效；在田作物继续生长',
                occurredAt: atTime(0, 0),
                amount: null,
            },
            {
                id: 'step-farm-q2',
                title: 'AI规划',
                detail: '计划种植：草莓 ×56；采购上限 2240.00；尚未执行。按地块和生长周期估算；物资、体力、异常及实际开工延迟可能减少完成数量，计划不等于事实',
                occurredAt: atTime(0, 5),
                amount: null,
            },
            {
                id: 'step-farm-q3',
                title: '按队列自动执行 · 收获',
                detail: '1 个目标 · 草莓 ★1 × 2 · 种植经验 +28 · 体力 -2 · 来源计划 2026-10-22',
                occurredAt: atTime(1, 0),
                amount: null,
            },
            {
                id: 'step-farm-q4',
                title: '按队列自动执行 · 收获',
                detail: '1 个目标 · 草莓 ★1 × 3 · 种植经验 +28 · 体力 -2 · 来源计划 2026-10-22',
                occurredAt: atTime(2, 0),
                amount: null,
            },
            {
                id: 'step-farm-q8',
                title: '按队列自动执行 · 播种并浇水',
                detail: '草莓 · 4 个目标 · 体力 -2',
                occurredAt: atTime(11, 25),
                amount: null,
            },
            {
                id: 'step-farm-q9',
                title: '按队列自动执行 · 施肥',
                detail: '4 个目标 · 体力 -2',
                occurredAt: atTime(11, 25),
                amount: null,
            },
            {
                id: 'step-farm-q10',
                title: '按队列自动执行 · 播种并浇水',
                detail: '草莓 · 4 个目标 · 体力 -2',
                occurredAt: atTime(11, 25),
                amount: null,
            },
            {
                id: 'step-farm-q11',
                title: '按队列自动执行 · 施肥',
                detail: '4 个目标 · 体力 -2',
                occurredAt: atTime(11, 25),
                amount: null,
            },
        ],
    },

    // 样本 9：小橘的农场经营明细（含扩地、播种与施肥）
    {
        id: 'local-feed-farm-resident-1',
        actorId: 'local-resident-1',
        actorName: '小橘',
        actorIds: ['local-resident-1'],
        category: 'farm',
        source: 'execution',
        occurredAt: atTime(9, 45),
        title: '农场经营',
        detail: '已执行 4 项操作',
        reason: '随着旅行收集到的种子增多，现有地块有些紧凑。上午先购置4块新耕地并翻耕施肥，为下一批作物做好准备。',
        status: 'success',
        amount: null,
        rating: null,
        target: {kind: 'farm', id: 'local-farm-1'},
        steps: [
            {id: 'step-farm-r1-1', title: '队列状态', detail: '启动农场地块扩建计划', occurredAt: atTime(9, 30), amount: null},
            {id: 'step-farm-r1-2', title: '扩地', detail: '购买 4 块耕地', occurredAt: atTime(9, 32), amount: null},
            {id: 'step-farm-r1-3', title: '播种并浇水', detail: '番茄 · 4 个目标 · 体力 -2', occurredAt: atTime(9, 35), amount: null},
            {id: 'step-farm-r1-4', title: '施肥', detail: '4 个目标 · 体力 -2', occurredAt: atTime(9, 36), amount: null},
            {id: 'step-farm-r1-5', title: '队列状态', detail: '完成本轮地块定植与灌溉', occurredAt: atTime(9, 45), amount: null},
        ],
    },

    // 样本 10：星河的农场日常经营（收获与禽畜照料）
    {
        id: 'local-feed-farm-resident-3',
        actorId: 'local-resident-3',
        actorName: '星河',
        actorIds: ['local-resident-3'],
        category: 'farm',
        source: 'execution',
        occurredAt: atTime(8, 20),
        title: '农场经营',
        detail: '已执行 3 项操作',
        reason: '清晨顺路去农场看看昨晚成熟的玉米，顺便喂养小鸡小鸭，收集一些新鲜的禽蛋和羊毛。',
        status: 'success',
        amount: null,
        rating: null,
        target: {kind: 'farm', id: 'local-farm-3'},
        steps: [
            {id: 'step-farm-r3-1', title: '按队列自动执行 · 收获', detail: '4 个目标 · 玉米 ★2 × 12 · 种植经验 +56 · 体力 -2', occurredAt: atTime(8, 5), amount: null},
            {id: 'step-farm-r3-2', title: '喂养', detail: '投喂 4 份动物饲料 · 体力 -2', occurredAt: atTime(8, 10), amount: null},
            {id: 'step-farm-r3-3', title: '产物收集', detail: '新鲜鸡蛋 × 8、羊毛 × 4', occurredAt: atTime(8, 15), amount: null},
            {id: 'step-farm-r3-4', title: '队列状态', detail: '晨间农场巡视与打理完成', occurredAt: atTime(8, 20), amount: null},
        ],
    },

    // 样本 11：精确匹配用户截图（银月 迷宫探索 30 分钟：击杀、经验、体力、战利品、药剂返还与返回等级）
    {
        id: 'local-feed-exploration-yinyue-1',
        actorId: 'local-resident-yinyue',
        actorName: '银月',
        actorIds: ['local-resident-yinyue'],
        category: 'exploration',
        source: 'exploration',
        occurredAt: new Date(now.getTime() - 58 * 60000).toISOString(),
        title: '迷宫探索 · 30 分钟',
        detail: '银月探索30分钟，击败17只怪物，获得1679经验；消耗22体力。按计划完成探索 收获：蝠翼×8、苔石碎片×2、晶鳞×3。消耗药剂 0 瓶，返回 Lv.12。 炼金药水使用 2 瓶，返还 4 瓶。',
        status: 'success',
        amount: null,
        rating: null,
        target: {kind: 'exploration', id: 'local-exploration'},
    },

    // 样本 12：星河的长时间探索（每日额度耗尽结束，消耗药剂）
    {
        id: 'local-feed-exploration-resident-3',
        actorId: 'local-resident-3',
        actorName: '星河',
        actorIds: ['local-resident-3'],
        category: 'exploration',
        source: 'exploration',
        occurredAt: new Date(now.getTime() - 85 * 60000).toISOString(),
        title: '迷宫探索 · 60 分钟',
        detail: '星河探索60分钟，击败31只怪物，获得3260经验；消耗44体力。今日探索时间额度耗尽（每日累计探索限额：120 分钟） 收获：蝠翼×12、晶鳞×5、苔石碎片×4。消耗药剂 1 瓶，返回 Lv.18。',
        status: 'success',
        amount: null,
        rating: null,
        target: {kind: 'exploration', id: 'local-exploration'},
    },

    // 样本 13：白露中途倒地（红色休整横幅，仍按执行完成结算战利品）
    {
        id: 'local-feed-exploration-resident-4',
        actorId: 'local-resident-4',
        actorName: '白露',
        actorIds: ['local-resident-4'],
        category: 'exploration',
        source: 'exploration',
        occurredAt: new Date(now.getTime() - 120 * 60000).toISOString(),
        title: '迷宫探索 · 18 分钟',
        detail: '白露探索18分钟，击败6只怪物，获得540经验；消耗8体力。角色倒地，休息 30 分钟 收获：苔石碎片×3、蝠翼×2。消耗药剂 2 瓶，返回 Lv.9。',
        status: 'success',
        amount: null,
        rating: null,
        target: {kind: 'exploration', id: 'local-exploration'},
    },

    // 样本 14：小橘的探索等待自动恢复（尚未结算，仅展示进度回退文案）
    {
        id: 'local-feed-exploration-resident-1-paused',
        actorId: 'local-resident-1',
        actorName: '小橘',
        actorIds: ['local-resident-1'],
        category: 'exploration',
        source: 'exploration',
        occurredAt: new Date(now.getTime() - 155 * 60000).toISOString(),
        title: '迷宫探索 · 45 分钟',
        detail: '击败 12 只怪物，经验 860',
        status: 'paused',
        amount: null,
        rating: null,
        target: {kind: 'exploration', id: 'local-exploration'},
    },
];
