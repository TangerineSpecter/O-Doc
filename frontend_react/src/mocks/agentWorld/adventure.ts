import catalog from './catalog';
import {residents, at, now, day} from './residents';
import type {CombatCatalog, CombatProfile, CombatSnapshot, CombatReward} from '../../types/api/combat';
import type {TravelJourney} from '../../types/api/travel';
export {fishingCatalog, fishingOverview, fishingTrip, fishingTrips} from './fishing';
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

const localPartyRewards: CombatReward[] = [
    {id:'local-party-loot',kind:'material',item:combatCatalog.tables.materials.find(m=>m.id==='material.moss_cave.1')!,quantity:2,elapsedSeconds:240},
    {id:'local-party-equipment',kind:'equipment',equipmentId:'local-party-sword',item:{templateId:'equip.sword',name:'苔石长剑',slot:'weapon',equipmentType:'long_sword',grip:'one_handed',level:18,quality:'blue',value:'180',stats:{physicalAttack:60},affixes:[]},elapsedSeconds:240},
];
export const localParty: import('../../types/api/combat').AdventurePartySnapshot = {
    id:'local-party',version:3,leaderId:residents[0].id,status:'active',dungeonId:'dungeon.moss_cave',teamKills:21,wave:2,round:8,phase:'battle',roundSeconds:3,
    actionOrder:[residents[1].id,'local-monster-1',residents[0].id,residents[3].id,residents[2].id],endsAt:new Date(Date.now()+30*60_000).toISOString(),
    players:residents.slice(0,4).map((r,i)=>({id:r.id,name:r.name,level:70,jobId:['job.spellblade','job.sharpshooter','job.highpriest','job.cryomancer'][i],jobName:['盾卫','神射手','神官','冰术师'][i],hp:i===1?200:i===3?0:800-i*100,mp:300,stats:{hpMax:1000,mpMax:600,dexterity:30+i*10},states:i===0?[{code:'modifier',name:'盾墙·全队减伤',remaining:2}]:[],revived:i===1})),
    enemies:[0,1,2,3].map(i=>({id:`local-monster-${i}`,templateId:['monster.moss_beast','monster.cave_bat','monster.cave_crystal_lizard','monster.slime'][i],name:['苔石兽','洞穴蝙蝠','洞穴晶蜥','软泥怪'][i],rank:i===0?'elite':'normal',level:18,hp:i===2?0:450,mp:80,stats:{hpMax:1000,mpMax:100},states:[],taunt:{actorId:residents[0].id,expires:10}})),
    events:[{id:'local-party-event',sequence:3,kind:'round',payload:{round:8,events:[
        {kind:'revive',actorId:residents[2].id,actor:residents[2].name,targetId:residents[1].id,target:residents[1].name,action:'复活术',healing:200},
        {kind:'damage',actorId:'local-monster-1',actor:'洞穴蝙蝠',targetId:residents[3].id,target:residents[3].name,action:'普通攻击',damage:500},
        {kind:'loot_roll',rolls:localPartyRewards.map(reward=>({rewardId:reward.id,winnerId:residents[0].id,rounds:[{[residents[0].id]:91,[residents[1].id]:32,[residents[2].id]:65,[residents[3].id]:78}],reward}))},
    ]}}],
};
export const localAdventureOptions: import('../../types/api/combat').AdventureOptions = {solo:true,parties:[{id:'local-open-party',revision:3,dungeonId:'dungeon.moss_cave',dungeonName:'苔石洞窟',durationSeconds:1500,endsAt:localParty.endsAt,members:residents.slice(1,3).map((u,i)=>({actorId:u.id,name:u.name,level:19+i,jobId:i?'job.mage':'job.ranger',jobName:i?'法师':'游侠'}))}]};
export const localOlderPartyEvents: import('../../types/api/combat').AdventurePartySnapshot['events'] = [
    {id:'local-party-earlier',sequence:2,kind:'round',payload:{round:7,events:[{kind:'heal',actorId:residents[2].id,actor:residents[2].name,targetId:residents[0].id,target:residents[0].name,action:'大治愈术',healing:300}]}},
];

export const localPartyExploration: CombatSnapshot = {...exploration,id:'local-party-exploration',actorId:residents[0].id,status:'active',stage:'battle',reason:'',elapsedSeconds:240,durationSeconds:1800,player:localParty.players[0],party:localParty,
    result:{energy:12,experience:240,kills:18,rewards:localPartyRewards},events:[{id:'local-party-personal',sequence:1,kind:'round',elapsedSeconds:240,createdAt:now.toISOString(),payload:{sharedEventId:'local-party-event',events:[{kind:'kill',monster:{id:'monster.cave_crystal_lizard',name:'洞穴晶蜥',level:18,rank:'normal'},experience:16,rewards:localPartyRewards}]}}],latestCursor:1,nextCursor:1,hasMore:false};
