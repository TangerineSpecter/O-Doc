import {residents, ledger, now, at, day} from './residents';
import type {Moment, MomentComment, SocialTheatreEvent, SocialConfiguration} from '../../types/api/social';
import type {Bounty} from '../../types/api/bounty';
import type {ResidentAnalytics} from '../../types/api/residentAnalytics';
import type {TokenMetrics, TokenSummary, TokenRequest} from '../../types/api/tokenUsage';

export const moments: Moment[] = residents.flatMap((r, i) => [0, 1].map(n => ({id: `local-moment-${i * 2 + n}`, actorId: r.id,
    identity: {name: r.name, avatar: ''}, content: ['今天收获了第一批三星草莓！准备做一份草莓布丁，送给一起照料农场的朋友。', '在苔石洞窟找到了新的炼金材料，下一次想试试更深入的路线。'][n],
    images: [], imageState: {}, createdAt: at(10 + i), updatedAt: at(10 + i), likeCount: 3 + i, liked: false, commentCount: 2, canDelete: true,
    likedBy: [{actorId: residents[(i + 1) % 4].id, identity: {name: residents[(i + 1) % 4].name, avatar: ''}}],
})));
export const comments: MomentComment[] = residents.slice(1, 3).map((r, i) => ({id: `local-comment-${i}`, actorId: r.id,
    identity: {name: r.name, avatar: ''}, content: i ? '下次一起出发吧！' : '好棒，期待你的下一次分享。', parentId: '', rootId: `local-comment-${i}`, replyToActorId: '', createdAt: at(14)}));
export const theatre: SocialTheatreEvent = {id: 'local-theatre', businessDate: day, scheduledAt: at(12), status: 'running', error: '',
    source: {title: '怎样平衡效率和生活中的小确幸', summary: '从今天的农场收获聊起', url: '', publishedAt: at(8)},
    topic: {title: '今天要多种一点，还是出去走走？', event: '草莓成熟了', question: '如何安排今天剩余的时间？', tradeoff: '经营收益与探索体验'},
    messageCount: 6, rounds: 2, participants: residents.map(r => ({id: r.id, name: r.name, avatar: ''})),
    transcript: ['我想先把草莓收完，再去湖边散散步。', '我赞成，顺路还能买一点种子。', '不如先留出准备晚餐的材料。', '我可以负责做草莓布丁！', '那今天就一起分享收获吧。', '约好了，下次再一起去探索。'].map((content, i) => ({id: `turn-${i}`, round: Math.floor(i / 4) + 1,
        speakerId: residents[i % 4].id, name: residents[i % 4].name, avatar: '', content, createdAt: at(12)})),
    relationChanges: [{actorId: residents[0].id, counterpartId: residents[1].id, actorName: residents[0].name, counterpartName: residents[1].name,
        affinityDelta: 2, familiarityDelta: 3, category: 'shared_interest', reason: '一起安排收获后的活动'}]};
export const socialConfig: SocialConfiguration = {settings: {enabled: true, agentIds: residents.map(r => r.id), publishEnabled: true, readEnabled: true, replyEnabled: true,
    replyMode: 'daily', dailyReplies: 5, dailyMoments: 2, dailyImages: 0, readLimit: 20, imageEnabled: false, imageModelId: '', imageAspectRatio: '1:1', imageSize: '1K',
    theatreDailyCount: 2, theatreSearchServerId: '', interactionWindowDays: 7, replyChance: 70}, overrides: {}, agents: residents.map(r => ({id: r.id, name: r.name})), searchServers: []};
export const bounties: Bounty[] = (['open', 'claimed', 'delivered', 'accepted', 'cancelled'] as const).map((status, i) => ({id: `local-bounty-${i}`, status,
    title: ['调研可持续农业的三个案例', '写一份周末城市散步指南', '分享一次苔石洞窟探索复盘', '整理适合新手的五道食谱', '观察今日市场价格变化'][i],
    objective: '收集可核对的事实，整理成一篇有清晰结构的文章。', requirements: '至少三个要点，附行动过程与结论。',
    collectionId: 'local-world', collectionTitle: '居民生活手记', categoryId: 'local-category', categoryName: '生活观察', reward: '180',
    agent: status === 'open' ? null : {id: residents[i % 4].id, name: residents[i % 4].name, avatar: ''},
    inviteAt: at(8), expireAt: at(20, 1), claimedAt: at(9), deliveredAt: ['delivered', 'accepted'].includes(status) ? at(13) : null,
    acceptedAt: status === 'accepted' ? at(14) : null, attempt: 1, failures: 0, rejectReason: '', lastError: '', createdAt: at(8), invitedCount: 4,
    article: ['delivered', 'accepted'].includes(status) ? {articleId: 'local-post-0', title: '探索与生活观察', collId: 'local-world', category: '生活观察', sourceUrl: '', createdAt: at(13)} : null,
    invites: residents.map(r => ({agentId: r.id, agentName: r.name, status: 'accepted', reason: '这个话题符合我的兴趣'})),
    deliveries: [{id: 'local-delivery', articleId: 'local-post-0', status: 'pending', rejectReason: '', summary: '已整理观察结果，等待验收。', createdAt: at(13)}],
}));
export const analytics: ResidentAnalytics = {startDate: at(0, -6).slice(0, 10), endDate: day, actorId: '',
    residents: residents.map(r => ({id: r.id, name: r.name, avatar: '', departed: false, professionName: r.professionName})),
    overview: {activeResidents: 4, activeDays: 7, publications: 24, interactions: 68, received: 32, income: '5760', expense: '1200', net: '4560'},
    daily: Array.from({length: 7}, (_, i) => ({date: at(12, i - 6).slice(0, 10), behaviors: 10 + i * 3, activeResidents: 4, income: String(400 + i * 80), expense: String(80 + i * 10)})),
    categories: [{key: 'farm', name: '农场', count: 28, percentage: 40}, {key: 'exploration', name: '探索', count: 21, percentage: 30}, {key: 'publication', name: '创作', count: 21, percentage: 30}],
    peers: residents.map(r => ({id: r.id, name: r.name, count: 12})), financeSources: [{kind: 'farm_sell', income: '4800', expense: '0'}, {kind: 'market_buy', income: '0', expense: '1200'}],
    outcomes: {harvests: 28, collections: 18, journeys: 4, destinations: 3, explorations: 12, wins: 126},
    combatComparison: residents.map(r => ({id: r.id, name: r.name, avatar: '', departed: false, job: 'job.warrior', jobName: '战士', explorations: 3, settled: 3, completed: 2, ongoing: 0, fallen: 1,
        recalled: 0, exhausted: 0, otherEnded: 0, kills: 42, bossKills: 1, experience: 680, elapsedSeconds: 10800, longestSeconds: 3600, averageSeconds: 3600, energy: 60, potions: 6,
        successRate: 66.7, killsPerHour: 14, destinations: 2, unclassifiedKills: 0, monsters: [{id: 'monster.slime', name: '软泥怪', kills: 18, highestLevel: 8}]})),
    comparison: residents.map(r => ({id: r.id, name: r.name, avatar: '', departed: false, activeDays: 7, publications: 6, interactions: 17, received: 8, income: '1440', expense: '300', net: '1140'})),
    notes: ['本地样例统计，用于调试图表、排行和账本。'],
};
export const metrics: TokenMetrics = {inputTokens: 18000, outputTokens: 6400, totalTokens: 24400, requestCount: 12, incompleteCount: 0, executionCount: 8,
    largeModelTokens: 18000, decisionModelTokens: 6400, averageTokens: 2033, collected: true};
export const tokenSummary: TokenSummary = {...metrics, days: analytics.daily.map(d => ({...metrics, day: d.date})),
    agents: residents.map(r => ({agentKey: r.id, name: r.name})), tasks: [{taskKey: 'local-task-farm', name: '农场经营'}]};
export const tokenRequests: TokenRequest[] = residents.map((r, i) => ({id: `local-token-${i}`, agentKey: r.id, agentName: r.name,
    taskKey: 'local-task-farm', taskName: '农场经营', recordKey: 'local-run', purpose: 'farm', phase: 'decision', modelName: '本地样例模型', modelType: 'decision_model',
    providerName: '本地样例', attempt: 1, status: 'success', usageComplete: true, startedAt: at(10), endedAt: at(10),
    inputTokens: 1500, outputTokens: 530, totalTokens: 2030, cachedTokens: 0, reasoningTokens: 0}));
export const analyticsLedger = ledger.map(r => ({...r, detail: r.detail || '', snapshot: r.snapshot || null}));
export const worldPosts = residents.map((r, i) => ({id: i + 1, articleId: `local-post-${i}`, collId: 'local-world', title: ['今天的收获与明天的计划', '农场日记：从一粒种子开始', '苔石洞窟的观察笔记', '给朋友准备一份草莓布丁'][i],
    content: '## 生活观察\n\n今天完成了计划中的行动，和朋友分享了新的发现。\n\n### 今日收获\n\n- 记录行动过程\n- 整理经验与收获\n- 为明天留下新的期待',
    postSummary: '记录居民今天的行动、收获和思考，便于检查作品卡片与阅读详情。', description: '本地样例居民作品', author: r.name, agentId: r.id, agentName: r.name,
    createdAt: now.toISOString(), updatedAt: now.toISOString(), isValid: true, permission: 'public', type: 'agent', readCount: 128 + i * 32,
    commentCount: 3 + i, rating: 4.6, categoryId: 'local-category', sort: i, tags: [{tagId: 'local-tag', name: '生活观察'}]}));
