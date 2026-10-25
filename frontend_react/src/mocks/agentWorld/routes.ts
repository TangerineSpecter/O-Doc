import {reservationItems} from './reservations';
import {bardProfiles,bardSnapshot,bardParty} from './bardSamples';
import type {AgentTaskConfig} from '../../types/api/setting';
import type {LotteryConfig} from '../../types/api/lottery';
import {blacksmithActivities, blacksmithFacts, blacksmithLifeItems, resolveBlacksmithRoute, runMockBlacksmith} from './blacksmith';
import {observationRoute, observationRequests, observationMetrics, observationFacts, addBlacksmithObservation} from './tokenUsage';
import {residents, professions, activities, graph, feed, residentDecisions, lifeConfig, lifeItems, goals, ledger, day, at} from './residents';
import {farms, farmRules, farmHistory, inventory, cooking, alchemy, itemCatalog, shop, listings, transactions, sessions, marketPlans} from './production';
import {combatCatalog, combatProfiles, exploration, localParty, localOlderPartyEvents, localAdventureOptions, localPartyExploration, journey, fishingCatalog, fishingOverview, fishingTrip, fishingTrips, lottery, lotteryRound, previousRound, tickets, positions, investmentOverview, trades, investmentDecisions} from './adventure';
import {moments, comments, theatre, socialConfig, bounties, analytics, analyticsLedger, metrics, worldPosts} from './social';
import type {LifeItem} from '../../types/api/agentLife';
import {tournamentEvents, tournamentHistory, tournamentOverview, tournamentReports} from './tournament';
import {resolveItemIconRoute} from './itemIcons';
import {resolveCookingRoute} from './cooking';
import {resolveAlchemyRoute} from './alchemy';
import {fishingAnalyticsMock} from './fishingAnalytics';
import {lotteryAnalyticsMock} from './lotteryAnalytics';
import {lifeScheduleResponse} from './lifeSchedule';
import {localCombatPreparation} from './combatPreparation';
import {combatAnalyticsMock} from './combatAnalytics';

const base = '/api/settings/agent-world';
export const emptyScenario = () => new URLSearchParams(location.search).get('mockState') === 'empty';
const list = <T,>(items: T[]) => emptyScenario() ? [] : items;
const page = <T,>(items: T[], url: URL) => {
    const rows = list(items), current = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const size = Math.max(1, Number(url.searchParams.get('page_size') || url.searchParams.get('pageSize')) || 20);
    return {items: rows.slice((current - 1) * size, current * size), total: rows.length, page: current, pageSize: size, hasMore: current * size < rows.length};
};
const actor = (url: URL) => url.searchParams.get('actor_id') || url.searchParams.get('actorId') || url.searchParams.get('agentId') || url.searchParams.get('agent') || url.searchParams.get('seller_id') || '';
const forActor = <T extends {actorId?: string; agentId?: string}>(rows: T[], url: URL) => rows.filter(r => !actor(url) || (r.actorId || r.agentId) === actor(url));
const resource = new Map<string, unknown>();
lifeItems.push(...blacksmithLifeItems, ...reservationItems);
for (const item of lifeItems) {
    if (item.source === 'interleaved') item.activityUsage = {requests: 4, inputTokens: 860, outputTokens: 32, totalTokens: 892, usageComplete: true};
    if (item.activity === 'fishing') item.domainDetail = {kind: 'fishing', id: fishingTrip.id};
    if (item.activity === 'exploration' && item.source !== 'reservation') item.domainDetail = {kind: 'exploration', id: exploration.id};
    item.context = {...item.context, dailyChoice: {time: at(7), plan: {id: `choice-${item.id}`, activity: item.activity, reason: '结合当前体力、库存和生活偏好安排今天的行动。', offeredActivities: ['farm', 'cooking', 'alchemy', 'blacksmith', 'exploration', 'travel']}}};
    if (item.activity === 'cooking') {
        const recipe = cooking.recipes[4];
        item.context.cookingPlan = {version: 1, entries: [{recipeId: recipe.id, quantity: 3, ingredientStrategy: 'low_stars_first', rule: structuredClone(recipe)}], materials: structuredClone(recipe.ingredients)};
    }
    if (item.activity === 'alchemy') {
        const recipe = alchemy.recipes[0];
        item.context.alchemyPlan = {version: 1, entries: [{recipeId: recipe.id, quantity: 2, rule: structuredClone(recipe)}], materials: structuredClone(recipe.ingredients)};
    }
    if (item.activity === 'travel') item.context.travelPlan = {destination: {...journey.snapshot.selected!, countryCode: 'CN'}, budget: '460', budgetSource: 'structured', quotedAt: at(7)};
    if (item.activity === 'lottery') {item.context.lotteryPlan = {roundId: lotteryRound.id, quantity: 2}; item.context.lotteryNumbers = [[3, 7, 9], [1, 4, 6]];}
}
const categories = [{id: 'local-category', name: '生活观察', description: '记录居民生活与探索', sort: 1, enabled: true, workflowKind: 'general'},
    {id: 'local-travel-category', name: '旅行手记', description: '旅行中的见闻', sort: 2, enabled: true, workflowKind: 'travel'}];
const providers = [{id: 'local-provider', name: '本地样例（不发起模型请求）', type: 'OpenAi', baseUrl: '', apiKey: '', models: [{id: 'local-model', name: '本地样例模型', type: 'chat'}]}];
const activityNames: Record<string, string> = {farm: '农场经营', market: '市场交易', cooking: '美食制作', alchemy: '炼金制作', blacksmith: '铁匠铺打造', exploration: '迷宫探索', travel: '旅行', fishing: '居民钓鱼', lottery: '大乐透', publish: '自主发帖', post_interaction: '阅读评论', investment: '模拟投资'};
const tasks: AgentTaskConfig[] = (['farm', 'market', 'cooking', 'alchemy', 'blacksmith', 'exploration', 'travel', 'fishing', 'lottery', 'publish', 'post_interaction', 'investment'] as const).map(activity => ({id: `local-task-${activity}`,
    name: activityNames[activity], agent: residents[0].id, agentName: residents[0].name, agents: residents.map(r => r.id), agentNames: residents.map(r => r.name),
    taskKind: activity === 'publish' ? 'post_publish' : activity, executionMode: 'serial', trigger: 'scheduled', schedule: '每日', scheduleType: 'daily', scheduleMode: 'fixed', scheduleTime: '10:00', scheduleWeekday: '1', scheduleMonthDay: '1', intervalMinutes: 60,
    enabled: activity !== 'blacksmith', prompt: '本地样例任务，不调用模型', notifyEnabled: false, notifyPlatform: 'feishu', notifyWebhookUrl: '', followupEnabled: false, followupAgent: null, followupAction: 'review', followupPrompt: '',
    travelConfig: {collectionId: 'local-world', categoryId: 'local-category', searchServerId: '', nodeMinutes: 1, recentCities: 3, energyCost: 20, photoEnabled: false}}));
const run = {id: 'local-run', task: tasks[0].id, taskName: '农场经营', agent: residents[0].id, agentName: residents[0].name,
    trigger: 'scheduled', status: 'success', startedAt: at(10), duration: '18s', summary: '已收获草莓、完成补种并更新市场规划。',
    output: '## 今日行动\n完成收获与补种，保留晚餐所需食材。', steps: [{time: at(10), status: 'success', title: '读取农场状态', detail: '草莓已成熟，可收获。'},
        {time: at(10), status: 'success', title: '收获并补种', detail: '收获三星草莓 ×8，补种草莓 ×4。'}], tokenUsage: {...metrics, agents: []}, agentRuns: []};

const staticData: Record<string, unknown> = {
    '/api/user/profile': {userid: 'local-user', username: 'local', nickname: '本地演示', email: 'local@example.com', avatar: '/favicon.svg', role: 'admin', roleName: '管理员', isAdmin: true, isSuperuser: true, isStaff: true},
    '/api/auth/login': {token: 'local-demo-token', userid: 'local-user', username: 'local', nickname: '本地演示', email: 'local@example.com', avatar: '/favicon.svg', role: 'admin', roleName: '管理员', isAdmin: true},
    [`${base}/categories/`]: categories, [`${base}/professions/`]: professions,
    [`${base}/income/`]: {enabled: true, postAmount: '80', commentAmount: '5', prizeEnabled: true, firstAmount: '500', secondAmount: '300', thirdAmount: '100'},
    [`${base}/settlements/`]: [{id: 'local-settlement', collectionId: 'local-world', collectionTitle: '居民生活手记', month: day.slice(0, 7), status: 'settled', awards: []}],
    [`${base}/pending-income/`]: [{id: 'local-pending', status: 'pending', snapshot: {postId: 'local-post-0', postTitle: '今天的收获与明天的计划'}, createdAt: at(10)}],
    [`${base}/life/config/`]: lifeConfig, [`${base}/farm-catalog/`]: farmRules, [`${base}/market/shop/`]: shop,
    [`${base}/combat/catalog/`]: combatCatalog, [`${base}/combat/config/`]: {dailyMinutes: 120},
    [`${base}/social/config/`]: socialConfig, [`${base}/social/inbox/`]: {items: [], unread: 0},
    [`${base}/lottery/config/`]: lottery.config, [`${base}/lottery/current/`]: lottery,
    [`${base}/fishing/config/`]: {enabled: true}, [`${base}/fishing/catalog/`]: fishingCatalog,
    [`${base}/stamina/config/`]: {recoveryPerHour: 10, maxStamina: 100},
    '/api/settings/providers/': providers, '/api/settings/agent-tasks/': tasks,
    '/api/settings/agent-tasks/world_runner/': {enabled: false},
    '/api/settings/mcp-servers/': [], '/api/settings/skills/': [],
    '/api/settings/decision-models/': {providers: [], connections: [{id: 'local-decision', name: '本地样例连接', protocol: 'systemone', baseUrl: '', modelId: 'local-model', builtIn: true, configured: true, apiKeyConfigured: false}]},
    '/api/settings/config/get_memos_push_config/': {enabled: false, pushTime: '10:00', frequency: 'daily', weekday: '1', monthDay: '1'},
    '/api/settings/config/get_ai_config/': {defaultChatModelId: 'local-model', simpleChatModelId: 'local-model', defaultImageModelId: '', defaultImageGenerationModelId: '', defaultEmbeddingModelId: '', defaultRerankModelId: ''},
    '/api/settings/config/get_runtime_info/': {firstStartedAt: at(8, -20), lastStartedAt: at(8), uptimeSeconds: 7200},
    '/api/settings/config/get_image_upload_config/': {maxLongEdge: 2048, maxFileSizeMb: 10},
    '/api/message/notifications/': [], '/api/system/logs/report/': null,
};

function schedule(url: URL) {
    // Week/list views request different date ranges. Populate the requested dates as well as today.
    const start = url.searchParams.get('start')?.slice(0, 10) || day;
    const end = url.searchParams.get('end')?.slice(0, 10) || day;
    let rows = list(forActor(lifeItems, url));
    if (!(start <= day && day <= end)) rows = rows.map(i => ({...i, scheduledAt: `${start}${i.scheduledAt.slice(10)}`, originalAt: `${start}${i.originalAt.slice(10)}`}));
    return lifeScheduleResponse(rows, url);
}

export async function resolveLocalRoute(request: Request): Promise<unknown> {
    const url = new URL(request.url), path = url.pathname;
    const iconResult = await resolveItemIconRoute(request.clone(), emptyScenario());
    if (iconResult !== undefined) return iconResult;
    const blacksmithResult = await resolveBlacksmithRoute(request.clone(), emptyScenario());
    if (blacksmithResult !== undefined) return blacksmithResult;
    const cookingResult = await resolveCookingRoute(request.clone(), emptyScenario());
    if (cookingResult !== undefined) return cookingResult;
    const alchemyResult = await resolveAlchemyRoute(request.clone(), emptyScenario());
    if (alchemyResult !== undefined) return alchemyResult;
    if (request.method === 'GET' && path.startsWith(`${base}/tournaments/`)) {
        if (path === `${base}/tournaments/current/`) return {...tournamentOverview, autoEnabled: (resource.get('/api/settings/agent-tasks/world_runner/') as {enabled: boolean} | undefined)?.enabled ?? false, event: emptyScenario() ? null : tournamentOverview.event};
        if (path === `${base}/tournaments/`) return page(tournamentHistory, url);
        const route = path.slice(`${base}/tournaments/`.length).split('/').filter(Boolean).map(decodeURIComponent);
        const event = tournamentEvents.find(row => row.id === route[0]);
        if (event && route.length === 1) return event;
        if (event && route.length === 3 && route[1] === 'matches' && event.rounds.some(row => row.matches.some(match => match.id === route[2]))) {
            return tournamentReports.get(route[2]);
        }
        return undefined;
    }
    const writing = !['GET', 'HEAD'].includes(request.method);
    const body: Record<string, unknown> = writing && request.headers.get('content-type')?.includes('json') ? await request.json() as Record<string, unknown> : {};
    if (path === `${base}/lottery/current/`) return {...lottery, config: (resource.get(`${base}/lottery/config/`) as LotteryConfig | undefined) ?? lottery.config};
    if (path === '/api/settings/agent-tasks/') {
        if (!writing) return list(tasks);
        const row = {...tasks[0], ...body, id: `local-task-${String(body.taskKind || Date.now())}`} as AgentTaskConfig;
        tasks.push(row); return row;
    }
    if (path === '/api/settings/agents/') {
        if (writing) {const row = {...residents[0], ...body, id: String(body.id || `local-resident-${residents.length + 1}`)}; residents.push(row); return row;}
        return list(residents.filter(r => url.searchParams.get('status') === 'all' || (url.searchParams.get('status') === 'archived' ? r.archived : !r.archived)));
    }
    if (path.startsWith('/api/settings/agents/')) {
        const id = path.split('/')[4], resident = residents.find(r => r.id === id) || residents[0];
        if (path.endsWith('/loadout-portrait/')) return {imageUrl: '', assetId: '', scale: 1, offsetX: 0, offsetY: 0};
        if (path.endsWith('/loadout-portrait-options/')) return {configured: false, models: [], message: '本地模式不调用生图服务'};
        if (path.endsWith('/battle-appearance/')) return {configured: false};
        if (path.endsWith('/battle-appearance-generation-options/')) return {configured: false, message: '本地模式使用默认战斗形象'};
        if (path.endsWith('/loadout-portrait-generation/') || path.endsWith('/battle-appearance-generation/') || path.endsWith('/battle-appearance-generation-recover/')) {
            return request.method === 'GET' && !url.searchParams.has('taskId') ? [] : {taskId: 'local-portrait-task', requestId: 'local-portrait-request', status: 'failed', message: '本地模式使用默认战斗形象，不调用生图服务'};
        }
        if (path.endsWith('/archive/') || path.endsWith('/restore/')) {resident.archived = path.endsWith('/archive/'); return resident;}
        if (path.endsWith('/memories/')) return [{id: 'local-memory', agent: resident.id, scope: 'world', memoryType: 'preference', content: '喜欢和朋友一起分享收获。', importance: 70, status: 'active', protected: false, createdAt: at(8)}];
        if (path.endsWith('/memory-status/')) return {active: {count: 1, characters: 15, limit: 100, characterLimit: 10000}, archived: {count: 0, characters: 0, limit: 100, characterLimit: 10000}, protectedCount: 0, state: {enabledAt: at(8, -7), processedDay: day, status: 'idle', detail: '本地样例', updatedAt: at(8)}};
        if (path === `/api/settings/agents/${id}/`) {if (writing) Object.assign(resident, body); return resident;}
        return undefined;
    }
    if (path === '/api/settings/agent-activities/today-summary/') return {todayActivityCount: list(feed).length, todayWorkCount: list(worldPosts).length, activeAgentCount: emptyScenario() ? 0 : 1,
        latest: list(activities), agents: list(residents).map((r, i) => ({id: r.id, name: r.name, avatar: r.avatar, status: i === 2 ? 'running' : 'idle', currentAction: i === 2 ? '探索苔石洞窟' : '', latestTitle: '本地样例居民', todayCount: 12}))};
    if (path === '/api/settings/agent-activities/') return {items: list(activities.filter(r => !actor(url) || r.agent.id === actor(url))), nextCursor: null, hasMore: false};
    if (path === '/api/settings/agent-relations/') return emptyScenario() ? {nodes: [], edges: []} : graph;
    if (path === `${base}/daily-feed/`) {
        const allRows = [...feed, ...observationFacts, ...blacksmithFacts];
        const withDecisions = url.searchParams.get('include_decisions') === '1' && !!actor(url);
        const rows = list([...allRows, ...(withDecisions ? residentDecisions : [])]).filter(r => !url.searchParams.get('date') || new Date(r.occurredAt).toLocaleDateString('sv-SE', {timeZone: 'Asia/Shanghai'}) === url.searchParams.get('date'))
            .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id)), category = url.searchParams.get('category') || 'all';
        const selected = forActor(rows, url).filter(r => category === 'all' || r.category === category);
        const offset = Number(url.searchParams.get('cursor')) || 0, size = Number(url.searchParams.get('page_size')) || 20;
        return {date: url.searchParams.get('date') || day, items: selected.slice(offset, offset + size), total: selected.length, allTotal: allRows.length,
            hasMore: offset + size < selected.length, nextCursor: offset + size < selected.length ? String(offset + size) : null,
            counts: Object.fromEntries([...new Set(rows.map(r => r.category))].map(c => [c, rows.filter(r => r.category === c).length])),
            actorCounts: Object.fromEntries([...new Set([...residents.map(r => r.id), ...rows.map(f => f.actorId)])].map(id => [id, rows.filter(f => f.actorId === id).length]))};
    }
    if (path === `${base}/ledger/`) return list(forActor(ledger, url));
    if (path === `${base}/inventory/`) return list(forActor(inventory, url));
    if (path === `${base}/item-catalog/`) return list(itemCatalog);
    if (path === `${base}/inventory/manage/`) {const result = page(forActor(inventory, url), url); return {...result, list: result.items, agents: residents};}
    if (path.includes('/farm-catalog/crops/')) {const kind = path.split('/').slice(-2)[0] as keyof typeof farmRules.crops; if (writing) Object.assign(farmRules.crops[kind], body); return farmRules.crops[kind];}
    if (path === `${base}/life/goals/`) return url.searchParams.has('options') ? {destinations: [journey.snapshot.selected], items: itemCatalog} : list(forActor(goals, url));
    if (path === `${base}/life/schedule/`) {
        if (writing) {if (body.action === 'pause' || body.action === 'resume') {lifeConfig.pausedAgents = body.action === 'pause' ? [...new Set([...lifeConfig.pausedAgents, String(body.actorId)])] : lifeConfig.pausedAgents.filter(id => id !== body.actorId); return {pausedAgents: lifeConfig.pausedAgents};} return {count: 1};}
        return schedule(url);
    }
    const lifeMatch = path.match(/\/life\/schedule\/([^/]+)\/$/);
    if (lifeMatch) {const item = lifeItems.find(r => r.id === lifeMatch[1])!; if (!item) return null;
        if (writing && item.reservation) {
            if (body.action === 'cancel') for (const member of lifeItems.filter(r => r.reservation?.id === item.reservation!.id)) {member.status='cancelled'; member.reservation={...member.reservation!,status:'cancelled',reason:String(body.reason||'人工取消')};}
            return item;
        }
        if (writing) {item.status = body.action === 'cancel' ? 'cancelled' : 'pending'; item.result = {reason: String(body.reason || '本地模拟操作')};} return item satisfies LifeItem;}
    if (path.includes('/life/profiles/')) return {id: path.split('/').slice(-2)[0], preferences: '喜欢旅行、农场和制作美食。', direction: '攒钱探索新的目的地。', ...body};
    if (path === `${base}/farms/`) return list(farms);
    const farmMatch = path.match(/\/farms\/([^/]+)\/(history\/)?$/);
    if (farmMatch) {const farm = farms.find(r => r.id === farmMatch[1]) || farms[0]; if (farmMatch[2]) return list(farmHistory);
        if (writing && body.appearance) farm.appearance = body.appearance as typeof farm.appearance; return farm;}
    if (path.startsWith(`${base}/market/`)) {
        if (path.endsWith('/listings/')) return page(forActor(listings.map(r => ({...r, actorId: r.sellerId})), url).filter(r => !url.searchParams.get('search') || r.item.name.includes(url.searchParams.get('search')!)), url);
        if (path.endsWith('/transactions/')) return page(forActor(transactions, url), url);
        if (path.endsWith('/sessions/')) return page(forActor(sessions, url), url);
        if (path.endsWith('/automation/')) return {date: day, plans: list(forActor(marketPlans, url))};
    }
    if(path===`${base}/combat/parties/local-bard-party/events/`)return {events:[],hasMore:false};
    if (new RegExp(`^${base}/combat/parties/[^/]+/events/$`).test(path)) return {events:emptyScenario()?[]:[...localOlderPartyEvents,...localParty.events].filter(e=>e.sequence<Number(url.searchParams.get('before')||100)),hasMore:false};
    if(path===`${base}/combat/explorations/local-bard-exploration/`)return emptyScenario()?{...bardSnapshot,party:{...bardParty,players:[],enemies:[],events:[]},events:[]}:structuredClone(bardSnapshot);
    if (path.startsWith(`${base}/combat/agents/`)) {
        const id = path.split('/')[6], profile = bardProfiles.find(r=>r.actorId===id) || combatProfiles.find(r => r.actorId === id) || combatProfiles[0];
        if (path.endsWith('/adventure-options/')) return {solo:true,parties:emptyScenario()?[]:localAdventureOptions.parties};
        if (body.operation==='prepare') return localCombatPreparation.prepare(id,body,emptyScenario());
        if (path.endsWith('/history/')) return {list: list([{id: exploration.id, status: exploration.status, elapsedSeconds: exploration.elapsedSeconds, result: exploration.result, createdAt: at(12)}]), total: emptyScenario() ? 0 : 1, page: 1};
        if (body.operation === 'preview_equip') return {attributes: profile.attributes};
        return {...profile,...(emptyScenario()?{skills:[],equipment:[],loadout:{}}:{}),activeExplorationId:id.startsWith('local-bard-')?profile.activeExplorationId:localCombatPreparation.active(id)};
    }
    if (request.method === 'GET' || request.method === 'POST') {
        if (new RegExp(`^${base}/combat/explorations/[^/]+/$`).test(path)) {
            const id=decodeURIComponent(path.split('/')[6]);
            const prepared=request.method==='POST'?localCombatPreparation.command(id,body.operation):localCombatPreparation.read(id);
            if(prepared)return prepared;
            return emptyScenario()?{...exploration,party:null}:path.includes('/local-party-exploration/')?localPartyExploration:exploration;
        }
        if (new RegExp(`^${base}/travel/[^/]+/$`).test(path)) return journey;
    }
    if (path === `${base}/moments/`) {
        if (writing) {const row = {...moments[0], id: `local-moment-${Date.now()}`, content: String(body.content), images: [], createdAt: new Date().toISOString()}; moments.unshift(row); return {moment: row};}
        return {moments: url.searchParams.has('before') ? [] : list(forActor(moments, url)), nextCursor: null};
    }
    const momentMatch = path.match(/\/moments\/([^/]+)\/(.*)$/);
    if (momentMatch) {const row = moments.find(r => r.id === momentMatch[1]) || moments[0];
        if (momentMatch[2] === 'comments/') {if (writing) {const comment = {...comments[0], id: `local-comment-${Date.now()}`, content: String(body.content)}; comments.push(comment); return {comment};} return {comments: list(comments)};}
        if (momentMatch[2] === 'like/' && writing) {row.liked = Boolean(body.active); row.likeCount += row.liked ? 1 : -1;}
        if (request.method === 'DELETE') moments.splice(moments.indexOf(row), 1); return row;
    }
    if (path === `${base}/social/discussions/`) return {items: list([theatre]), nextCursor: null};
    if (path.startsWith(`${base}/social/discussions/`)) return writing ? {event: theatre} : theatre;
    if (path === `${base}/fishing/`) return {...fishingOverview, enabled: (resource.get(`${base}/fishing/config/`) as {enabled: boolean} | undefined)?.enabled ?? fishingOverview.enabled, ...page(forActor(fishingOverview.items, url), url), active: list(forActor(fishingOverview.active, url)), residents: list(fishingOverview.residents)};
    if (path.includes('/fishing/trips/')) return fishingTrips.find(trip => path.includes(`/${trip.id}/`)) || fishingTrip;
    if (path === `${base}/lottery/rounds/`) return page([lotteryRound, previousRound], url);
    if (path.includes('/lottery/rounds/')) return path.endsWith('/tickets/') ? page(tickets, url) : {...lottery, config: (resource.get(`${base}/lottery/config/`) as LotteryConfig | undefined) ?? lottery.config, round: path.includes(previousRound.id) ? previousRound : lotteryRound};
    if (path.startsWith(`${base}/investment/`)) {
        if (path.endsWith('/accounts/')) return list(residents.map(r => ({id: r.id, name: r.name, positionCount: 2})));
        if (path.endsWith('/overview/')) return {...investmentOverview(actor(url)), ...(emptyScenario() ? {positions: page([], url), positionCount: 0, marketValue: '0', unrealizedProfit: '0'} : {})};
        if (path.endsWith('/positions/')) return page(positions, url);
        if (path.endsWith('/trades/')) return page(trades, url);
        if (path.endsWith('/decisions/')) return page(investmentDecisions, url);
        if (path.endsWith('/detail/')) return {position: positions.find(p => p.code === url.searchParams.get('code')) || positions[0], analysis: null, analysisError: '本地样例行情'};
    }
    if (path === `${base}/analytics/`) {
        const combat=combatAnalyticsMock(url,emptyScenario());
        return {...analytics, startDate: url.searchParams.get('start_date') || analytics.startDate, endDate: url.searchParams.get('end_date') || day, actorId: actor(url), lotteryStatistics: lotteryAnalyticsMock(url, emptyScenario()), fishingComparison: fishingAnalyticsMock(url, emptyScenario()),
            combatComparison:combat.combatComparison,outcomes:{...analytics.outcomes,explorations:combat.explorations,wins:combat.wins},
            ...(emptyScenario() ? {daily: [], categories: [], peers: [], comparison: [], residents: []} : {})};
    }
    if (path === `${base}/analytics/ledger/`) {const result = page(forActor(analyticsLedger, url), url); return {...result, nextPage: result.hasMore ? result.page + 1 : null};}
    if (path.startsWith(`${base}/token-usage/`)) return observationRoute(url, emptyScenario());
    if (path === `${base}/bounties/options/`) return {collections: [{id: 'local-world', title: '居民生活手记'}], categories, residents, searchReady: true, inviteDelayMinutes: 5, claimHours: 24};
    if (path === `${base}/bounties/`) {if (writing) {const row = {...bounties[0], ...body, id: `local-bounty-${Date.now()}`, status: 'open' as const}; bounties.unshift(row); return {id: row.id, status: row.status, inviteAt: at(12)};}
        return page(bounties.filter(b => !url.searchParams.get('status') || url.searchParams.get('status')!.split(',').includes(b.status)), url);}
    if (path.startsWith(`${base}/bounties/`)) {const row = bounties.find(b => b.id === path.split('/').slice(-2)[0]) || bounties[0];
        if (body.action === 'cancel') row.status = 'cancelled'; if (body.action === 'review') row.status = body.approve ? 'accepted' : 'claimed'; return row;}
    if (path === '/api/settings/agent-run-records/') return {...page([run], url), results: list([run]), nextCursor: null};
    if (path.startsWith('/api/settings/agent-run-records/')) {
        const blacksmith = blacksmithActivities.find(row => path.includes(encodeURIComponent(row.recordId)) || path.includes(row.recordId));
        if (blacksmith) return {...run, id: blacksmith.recordId, task: 'local-task-blacksmith', taskName: '铁匠铺打造', agent: blacksmith.actorId, agentName: blacksmith.actorName, status: blacksmith.status, startedAt: blacksmith.createdAt, summary: String(blacksmith.result.reason), output: JSON.stringify(blacksmith.result), steps: blacksmith.stages.map(stage => ({time: blacksmith.createdAt, title: String(stage.scene), detail: String(stage.label || stage.choice), status: 'success'})), tokenUsage: {...observationMetrics(observationRequests.filter(row => row.recordKey === blacksmith.recordId)), agents: []}};
    }
    if (path.startsWith('/api/settings/agent-run-records/')) {const id = decodeURIComponent(path.split('/').slice(-2)[0]); const rows = observationRequests.filter(r => r.recordKey === id); return {...run, id, taskName: rows[0]?.taskName || run.taskName, agent: rows[0]?.agentKey || run.agent, agentName: rows[0]?.agentName || run.agentName, startedAt: rows[0]?.startedAt || run.startedAt, tokenUsage: {...observationMetrics(rows), agents: []}};}
    if (path === '/api/settings/agent-tasks/local-task-blacksmith/run_now/') {const activity = runMockBlacksmith(String(body.actorId || body.actor_id || residents[0].id)); if (!activity) return Response.json({code: 400, msg: '没有可执行的打造配方', data: null}, {status: 400}); addBlacksmithObservation(activity); const life = blacksmithLifeItems.find(row => row.recordId === activity.recordId); if (life) lifeItems.unshift(life); return {...run, id: activity.recordId, taskName: '铁匠铺打造', summary: activity.result.reason};}
    if (path.startsWith('/api/settings/agent-tasks/') && writing && !path.endsWith('/run_now/') && path !== '/api/settings/agent-tasks/world_runner/') {const id = path.split('/').filter(Boolean).slice(-1)[0]; const task = tasks.find(row => row.id === id); if (task) {Object.assign(task, body); return task;}}
    if (path.endsWith('/run_now/')) return run;
    if (path === '/api/anthology/list' && url.searchParams.get('type') === 'agent') return list([{collId: 'local-world', title: '居民生活手记', type: 'agent', count: 4, iconId: 'bot', description: '居民创作与旅行记录', permission: 'public', isTop: true, articles: worldPosts}]);
    if (path === '/api/article/list' && (url.searchParams.get('collId') === 'local-world' || url.searchParams.get('type') === 'agent')) return list(worldPosts);
    if (path.startsWith('/api/article/detail/local-post-')) return worldPosts.find(r => r.articleId === path.split('/').slice(-1)[0]) || worldPosts[0];
    if (path === '/api/anthology/detail/local-world') return {collId: 'local-world', title: '居民生活手记', type: 'agent', description: '本地样例', permission: 'public', iconId: 'bot', articles: worldPosts};
    if (path in staticData) {
        if (writing) {const original = resource.get(path) ?? staticData[path]; const updated = typeof original === 'object' && original && !Array.isArray(original) ? {...original, ...body} : body; resource.set(path, updated); return updated;}
        return resource.get(path) ?? staticData[path];
    }
    return undefined;
}
