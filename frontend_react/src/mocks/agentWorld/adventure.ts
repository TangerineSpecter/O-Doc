import catalog from './catalog';
import {residents, at, now, day, fishingGrowth} from './residents';
import type {CombatCatalog, CombatProfile, CombatSnapshot} from '../../types/api/combat';
import type {TravelJourney} from '../../types/api/travel';
import type {FishingCatalog, FishingOverview, FishingDetail} from '../../types/api/fishing';
import type {LotteryOverview, LotteryRound, LotteryTicket} from '../../types/api/lottery';
import type {InvestmentPosition, InvestmentTrade, InvestmentOverview, InvestmentDecision} from '../../types/api/investment';

export const combatCatalog: CombatCatalog = catalog.combat;
export const combatProfiles: CombatProfile[] = residents.map((r, i) => ({actorId: r.id, initialized: true,
    progression: {level: 18 + i, experience: 1280, job: ['job.warrior', 'job.ranger', 'job.mage', 'job.priest'][i], stats: {strength: 30, dexterity: 24, intelligence: 25, vitality: 28, spirit: 20, luck: 12}, skills: {}},
    discoveries: {encountered: combatCatalog.tables.monsters.slice(0, 8).map(m => m.id), defeated: combatCatalog.tables.monsters.slice(0, 6).map(m => m.id), equipment: []},
    attributes: {hpMax: 380, mpMax: 160, physicalAttack: 62, magicAttack: 48, physicalDefense: 32, magicDefense: 28, speed: 24, strength: 30, dexterity: 24, intelligence: 25, vitality: 28, spirit: 20, luck: 12},
    hp: 320, mp: 120, loadout: {weapon: `local-equipment-${i}`}, equipment: [{id: `local-equipment-${i}`, templateId: 'equip.training_sword', bound: true, locked: false, value: '80',
        snapshot: {templateId: 'equip.training_sword', name: '训练木剑', slot: 'weapon', equipmentType: 'generic', grip: 'one_handed', level: 8, quality: 'normal', value: '80', stats: {physicalAttack: 24}, affixes: []}}],
    // CombatRow's legacy string index signature conflicts with numeric rank; the API still supplies rank as a number.
    skills: combatCatalog.tables.skills.filter(s => s.professionId === 'job.novice').slice(0, 3).map(s => ({...s, rank: 1, parameters: combatCatalog.tables.skillLevels.find(p => p.skillId === s.id) || {id: s.id}, effects: []})) as unknown as CombatProfile['skills'],
    potions: combatCatalog.tables.potions.map(p => ({...p, owned: 8})) as unknown as CombatProfile['potions'],
    materials: combatCatalog.tables.materials.slice(0, 16).map(m => ({...m, owned: 12})) as unknown as CombatProfile['materials'],
    activeExplorationId: null, promotionOptions: [], promotionBusy: false, reselectOptions: [], reselectBlocked: '', restUntil: null,
}));
export const exploration: CombatSnapshot = {id: 'local-exploration', actorId: residents[3].id, version: 1, stage: 'settled', status: 'completed', reason: '本地样例：完成一小时探索并结算',
    canControl: true, elapsedSeconds: 3600, durationSeconds: 3600, nextTickAt: null,
    player: {name: residents[3].name, level: 21, hp: 280, mp: 80, stats: {hpMax: 380, mpMax: 160}, states: []}, enemy: null, potions: {hp: 2},
    result: {energy: 20, experience: 240, kills: 18, rewards: [{id: 'local-reward', kind: 'material', item: {id: 'combat.material.moss_cave.1', name: '黏液'}, quantity: 12, elapsedSeconds: 3600}],
        report: '在苔石洞窟击败了 18 只魔物，获得 240 经验和黏液 ×12。'},
    events: [{id: 'local-combat-event', sequence: 1, kind: 'settlement', elapsedSeconds: 3600, payload: {report: '探索结束，带回材料与装备。'}, createdAt: at(12)}],
    latestCursor: 1, nextCursor: 1, hasMore: false};
export const journey: TravelJourney = {id: 'local-travel', actorId: residents[2].id, status: 'completed', phase: 'completed', articleId: 'local-post-0',
    departedAt: at(8), returnedAt: at(16), createdAt: at(8), nodes: ['destination', 'visit', 'food', 'shopping', 'publish'].map(kind => ({id: kind, kind, status: 'completed', error: ''})),
    snapshot: {agentName: residents[2].name, selected: {id: 'local-hangzhou', country: '中国', city: '杭州', region: '浙江', price: '380'},
        candidates: [{id: 'local-hangzhou', country: '中国', city: '杭州', region: '浙江', price: '380'}], selection: {reason: '想在西湖边散步，并观察本地生活。', shoppingBudget: '80'},
        visits: [{site: {name: '西湖'}, choice: '沿湖漫步', reaction: '风吹过荷叶，记录下这一刻。'}],
        encounters: [{description: '在街角遇见一位手工艺人', choice: '聊聊制作过程', reaction: '带回一份手工明信片。'}],
        food: {choice: '品尝本地小吃', reaction: '清淡的口味很适合今天的天气。'}, shopping: {reason: '旅行纪念', basket: [{id: 'postcard', quantity: 1}]},
        goods: [{id: 'postcard', name: '西湖手绘明信片', price: '20'}], draft: {title: '在西湖边慢下来', content: '## 今日旅行\n沿着湖边散步，发现城市中安静的角落。', reflection: '生活的灵感往往来自细小的发现。'}, photo: {status: 'disabled'}, sources: []}};
export const fishingCatalog: FishingCatalog = {rules: catalog.fishing as FishingCatalog['rules'], discovery: Object.fromEntries(Object.keys(catalog.fishing.fish).slice(0, 8).map(id => [id, {count: 6, maxWeight: 3.8, firstCaughtAt: at(9), recordActor: residents[0].id}]))};
export const fishingTrip: FishingDetail = {id: 'local-fishing', actorId: residents[3].id, actorName: residents[3].name, status: 'completed',
    plan: {spot: 'pond', minutes: 60, baits: ['worm', 'corn'], complete: true}, casts: 12, carried: [{name: '蚯蚓', quantity: 20, sku: 'bait.worm'}],
    duel: null, error: '', reason: '本地样例：完成今日垂钓', catches: [{name: '鲫鱼', quantity: 5}, {name: '金鳞鲤王', quantity: 1}], experience: 80,
    authorized: true, departedAt: at(9), deadline: at(10), createdAt: at(9), endedAt: at(10), eventTotal: 3, eventPage: 1, rules: fishingCatalog.rules,
    events: Array.from({length: 3}, (_, i) => ({id: `fishing-event-${i}`, kind: 'catch', createdAt: at(9), data: {catch: {fishId: 'crucian', name: '鲫鱼', king: false, weight: .8 + i, experience: 10, caughtAt: at(9)}}}))};
export const fishingOverview: FishingOverview = {enabled: true, active: [], items: [fishingTrip], total: 1, page: 1,
    residents: residents.map(r => ({id: r.id, name: r.name, ...fishingGrowth,
        baits: [{id: 'worm', name: '蚯蚓', quantity: 20}], spots: Object.entries(catalog.fishing.spots).map(([id, row]) => ({id, ...row})), recentCatches: ['鲫鱼', '鲤鱼']}))};
const lotteryRules = {version: 2, ticketPrice: '50', ticketLimit: 10, subsidy: '1000', secondPrize: '500', thirdPrize: '200'};
export const lotteryRound: LotteryRound = {id: 'local-lottery', sequence: 12, status: 'open', opensAt: at(0, -1), closesAt: at(20, 1), drawsAt: at(20, 1),
    rules: lotteryRules, pool: '6600', ticketCount: 112, result: {}, settledAt: null};
export const previousRound: LotteryRound = {...lotteryRound, id: 'local-lottery-previous', sequence: 11, status: 'settled', drawsAt: at(20, -2), settledAt: at(20, -2),
    result: {winningNumbers: [3, 7, 9], ticketCount: 80, sales: '4000', subsidy: '1000', carryIn: '9000', pool: '14000', carryOut: '0',
        awards: [{actorId: residents[0].id, actorName: residents[0].name, tier: 2, winningTickets: 1, amount: '500'}]}};
export const lottery: LotteryOverview = {config: {enabled: true, firstDrawAt: at(20, 1), rules: lotteryRules}, round: lotteryRound};
export const tickets: LotteryTicket[] = residents.map((r, i) => ({id: `local-ticket-${i}`, actorId: r.id, actorName: r.name, numbers: [1 + i, 7, 9], createdAt: at(10), matches: null}));
export const positions: InvestmentPosition[] = ['样例科技', '样例农业'].map((name, i) => ({code: `local.${i}`, name, quantity: 100, availableQuantity: 100,
    cost: '1200', averageCost: '12', closePrice: '13.80', priceDate: day, marketValue: '1380', unrealizedProfit: '180', returnPercent: '15', firstBought: at(10, -7), lastBought: at(10, -1), buyReason: '本地样例行情，仅用于展示'}));
export const investmentOverview = (actorId: string): InvestmentOverview => ({actorId, actorName: residents.find(r => r.id === actorId)?.name || residents[0].name,
    balance: '5200', realizedProfit: '120', unrealizedProfit: '360', marketValue: '2760', positionCount: 2, positions: {items: positions, total: 2, page: 1}});
export const trades: InvestmentTrade[] = positions.map((p, i) => ({id: `local-trade-${i}`, createdAt: at(10), operation: {code: p.code, name: p.name, quantity: 100, side: 'buy', reason: p.buyReason, day},
    result: {price: '12', priceDate: day, source: 'local', cashDelta: '-1200', allocatedCost: '1200', realizedProfit: '0'}}));
export const investmentDecisions: InvestmentDecision[] = [{id: 'local-investment-decision', createdAt: now.toISOString(), status: 'completed', reason: '保留现金储备，继续观察。', referenceDate: day,
    calls: [{tool: 'get_positions', arguments: {}, result: {positions}}]}];
