import type {AgentConfig, AgentActivity, AgentRelationGraph} from '../../types/api/setting';
import type {DailyFeedEvent, DailyFeedCategory} from '../../types/api/dailyFeed';
import type {LifeConfig, LifeItem, LifeGoal} from '../../types/api/agentLife';
import type {WorldLedger, WorldProfession} from '../../types/api/agentWorld';
import {feedStepsSamples} from './feedStepsSamples';
import {fishingGrowthFor, fishingSkillFor} from './fishingGrowth';

export const now = new Date();
export const day = now.toLocaleDateString('en-CA');
export const at = (hour: number, offset = 0) => {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
};
export const residents: AgentConfig[] = ['小橘', '林芽', '星河', '白露'].map((name, i) => ({
    id: `local-resident-${i + 1}`, name, avatar: '', model: 'local-model', prompt: '本地演示居民，喜欢探索、种植与分享。',
    money: String(3500 + i * 1280), stamina: String(95 - i * 12), profession: `local-profession-${i + 1}`,
    professionName: ['旅行作家', '农场主', '探险家', '美食家'][i], mcpServers: [], skills: [],
    feishuImEnabled: false, feishuAppId: '', feishuAppSecret: '', feishuVerificationToken: '', feishuEncryptKey: '',
    archived: false, postCollectionIds: ['local-world'], postCategoryIds: ['local-category'],
}));
export const professions: WorldProfession[] = residents.map((r, i) => ({id: r.profession!, name: r.professionName!, description: '本地样例职业与成长加成', enabled: true,
    bonuses: [{category: 'local-category', percentage: '15'}], farmYieldPercentage: String(i === 1 ? 25 : 5),
    mazeEquipmentDropBonusPercentage: '5', mazeMaterialYieldPercentage: '10', mazeEquipmentIntervalReductionPercentage: '5', mazeExperienceBonusPercentage: '10'}));
const categories: Exclude<DailyFeedCategory, 'all'>[] = ['fishing', 'publication', 'interaction', 'travel', 'exploration', 'farm', 'cooking', 'alchemy', 'market', 'trade', 'investment', 'finance', 'record'];
const labels = ['出钓归来', '发布了新芽草甸观察笔记', '和朋友讨论今天的收获', '完成杭州旅行，带回一份纪念品', '从苔石洞窟满载归来', '收获三星草莓，获得种植经验', '制作番茄炒蛋，厨艺提升', '炼制愈合药剂，经验提升', '采购下一轮种植所需种子', '出售多余收获，入账 240 橘币', '完成模拟投资复盘', '收到作品收益 120 橘币', '今天的生活计划已排好'];
const targets = ['fishing', 'activity', 'moment', 'travel', 'exploration', 'farm', 'cooking', 'alchemy', 'market', 'market', 'investment', 'life', 'life'];

export const fishingFeedSamples = [
    {
        title: '出钓归来',
        detail: '乌鳢、乌鳢、乌鳢、乌鳢、乌鳢、乌鳢、乌鳢、乌鳢、乌鳢、乌鳢 · 抛竿20次 · 系统说明: 本次垂钓结束，为后续日程保留体力',
        status: 'success',
    },
    {
        title: '出钓归来',
        detail: '乌鳢、鲫鱼、鲫鱼、乌鳢 · 抛竿7次 · 系统说明: 本次垂钓结束，为后续日程保留体力',
        status: 'success',
    },
    {
        title: '出钓归来',
        detail: '鲫鱼、鲫鱼、鲫鱼、鲫鱼、鲫鱼、彩鳑鲏 · 抛竿12次 · 鱼饵用尽或当前时间没有适用鱼种',
        status: 'success',
    },
    {
        title: '出钓归来',
        detail: '金鳞鲤王 ×1、鲤鱼 ×3 · 抛竿15次 · 成功捕获稀有鱼王，尽兴而归',
        status: 'success',
    },
    {
        title: '出钓归来',
        detail: '乌鳢、乌鳢、乌鳢、乌鳢 · 抛竿8次 · 系统说明: 本次垂钓结束，为后续日程保留体力',
        status: 'success',
    },
    {
        title: '出钓归来',
        detail: '尚无收获 · 抛竿5次 · 系统说明: 本次垂钓结束，为后续日程保留体力',
        status: 'success',
    },
    {
        title: '正在钓鱼',
        detail: '乌鳢 ×2 · 抛竿6次 · 正在浅滩钓点挥竿，等待大鱼上钩',
        status: 'running',
    },
    {
        title: '出钓已暂停',
        detail: '尚无收获 · 抛竿0次 · 请到钓鱼面板检查本机运行开关，并继续出钓',
        status: 'paused',
    },
];

const generatedFeed: DailyFeedEvent[] = Array.from({length: 48}, (_, i) => {
    const r = residents[(i + Math.floor(i / categories.length)) % 4], n = i % categories.length;
    const cat = categories[n];
    const isFishing = cat === 'fishing';
    const fishingSample = isFishing ? fishingFeedSamples[Math.floor(i / categories.length) % fishingFeedSamples.length] : null;
    const title = fishingSample ? fishingSample.title : labels[n];
    const detail = fishingSample ? fishingSample.detail : '本地样例：保留完整行动原因、过程与结算说明，方便检查长文案、折行和弹窗样式。';
    const status = fishingSample ? fishingSample.status : (i === 3 ? 'running' : 'success');
    return {id: `local-feed-${i}`, actorId: r.id, actorName: r.name, actorIds: [r.id], category: cat, source: isFishing ? 'fishing' : 'local',
        occurredAt: new Date(now.getTime() - (i + 10) * 18 * 60000).toISOString(), title,
        detail, status,
        amount: ['trade', 'finance'].includes(cat) ? '120.00' : null, rating: n === 1 ? 4.6 : null,
    target: {kind: targets[n], id: targets[n] === 'travel' ? 'local-travel' : targets[n] === 'exploration' ? 'local-exploration' : targets[n] === 'fishing' ? 'local-fishing' : 'local-moment-0',
            ...(n === 1 ? {collId: 'local-world', articleId: 'local-post-0'} : {}), ...(n === 2 ? {artifactId: 'local-moment-0'} : {})}};
});

export const feed: DailyFeedEvent[] = [{
    id: 'run:local-idle-waiting', actorId: residents[0].id, actorName: residents[0].name,
    category: 'record', source: 'run', occurredAt: now.toISOString(),
    title: '自由活动 · 等待重试', detail: '体力不足，顺延；计划于 10/25 15:58 重试',
    status: 'deferred', amount: null, target: {kind: 'run', id: 'local-run-0'},
}, ...feedStepsSamples, ...generatedFeed];
export const residentDecisions: DailyFeedEvent[] = residents.flatMap((resident, index) => [
    {id: `local-decision-plan-${index}`, actorId: resident.id, actorName: resident.name,
        category: 'decision', source: 'life-decision', occurredAt: new Date(now.getTime() - (index * 18 + 6) * 60000).toISOString(),
        title: '选择了迷宫探索', detail: '想先去熟悉的区域积累经验，再准备下一次长途探索。',
        decisionBasis: 'model_reason', decisionSlot: at(11), status: 'success', amount: null, target: {kind: 'life', id: `local-life-${index}-3`}},
    {id: `local-decision-promotion-${index}`, actorId: resident.id, actorName: resident.name,
        category: 'decision', source: 'combat-promotion', occurredAt: new Date(now.getTime() - (index * 18 + 35) * 60000).toISOString(),
        title: `Lv.10 转职为${['战士', '游侠', '法师', '牧师'][index]}`, detail: '这个职业的技能与当前装备更契合，也能补足队伍的战斗短板。',
        decisionBasis: 'model_reason', status: 'success', amount: null, target: {kind: 'exploration', id: 'local-exploration'}},
    {id: `local-decision-choice-only-${index}`, actorId: resident.id, actorName: resident.name,
        category: 'decision', source: 'life-decision', occurredAt: new Date(now.getTime() - (index * 18 + 90) * 60000).toISOString(),
        title: '选择了农场经营', detail: '', decisionBasis: 'choice_only', decisionSlot: at(14),
        status: 'success', amount: null, target: {kind: 'life', id: `local-life-${index}-0`}},
]);
export const activities: AgentActivity[] = feed.slice(0, 8).map((f, i) => ({id: f.id, type: i % 2 ? 'interaction' : 'publication', status: 'success',
    agent: {id: f.actorId, name: f.actorName, avatar: ''}, title: f.title, summary: f.detail, occurredAt: f.occurredAt, runRecordId: 'local-run'}));
export const fishingGrowth = fishingGrowthFor(0);
export const graph: AgentRelationGraph = {nodes: residents.map((r, i) => ({id: r.id, name: r.name, avatar: '', money: r.money, stamina: r.stamina,
    professionName: r.professionName, creativity: 68 + i * 7, postCount: 12 + i * 6, ratedPostCount: 8 + i, activeDays: 21 + i,
    inventoryCount: 18, status: i === 2 ? 'running' : 'idle', currentAction: i === 2 ? '探索苔石洞窟' : '整理今天的收获',
    cooking: {level: 6, experience: 560, levelExperience: 400, nextLevelExperience: 700, progress: 53},
    alchemy: {level: 4, experience: 320, levelExperience: 200, nextLevelExperience: 500, progress: 40},
    fishing: fishingSkillFor(i),
    planting: {level: 6, experience: 560, levelFloor: 400, nextLevelExperience: 700, progress: 53},
    combatLevel: 15 + i * 4, combatProfessionName: ['战士', '游侠', '法师', '牧师'][i]})),
    edges: residents.slice(1).map((r, i) => ({sourceId: residents[0].id, targetId: r.id, tier: 'friend', band: 'friend',
        sourceScore: 70 + i, targetScore: 65 + i, sourceName: residents[0].name, targetName: r.name}))};
export const lifeConfig: LifeConfig = {settings: {agentIds: residents.map(r => r.id), mode: 'fixed', period: 'daily', count: 8,
    intervalMinutes: 60, activeStart: '08:00', activeEnd: '23:00', minGapMinutes: 30, minRemainingMinutes: 10,
    decisionModelId: 'local-model', decisionConnectionIds: ['local-decision'], marketAutomationV2: true, interleavingEnabled: false, interleavingCheckMinutes: 5, interleavingDecisionMinutes: 30, interleavingWaitMinutes: 60},
    pausedAgents: [], migrated: true, activeAgentIds: residents.map(r => r.id), profileAgentIds: residents.map(r => r.id),
    activeCycle: [{id: 'local-cycle', startsAt: at(0), endsAt: at(0, 1)}]};
export const lifeItems: LifeItem[] = residents.flatMap((r, index) => ['farm', 'cooking', 'market', 'exploration', 'travel', 'alchemy', 'fishing', 'lottery', 'post_publish'].map((activity, i) => ({
    source: ['cooking', 'alchemy', 'fishing', 'exploration'].includes(activity) ? 'interleaved' as const : 'schedule' as const,
    actualStartedAt: i % 5 < 2 ? at(8 + i) : null, actualEndedAt: i % 5 === 0 ? at(9 + i) : null, actualEnergyCost: i % 5 < 2 ? '4' : null,
    id: `local-life-${index}-${i}`, actorId: r.id, originalAt: at(8 + i), scheduledAt: at(8 + i), activity, taskId: `local-task-${activity}`,
    status: index === 0 && i === 2 ? 'deferred' : ['completed', 'running', 'pending', 'failed', 'cancelled'][i % 5], intent: `本地样例：${r.name}的${activity}计划，检查不同状态的展示`,
    budget: String(100 + i * 10), spent: i % 5 === 0 ? '48.00' : '0.00', recordId: 'local-run',
    result: index === 0 && i === 2 ? {} : {reason: i % 5 === 3 ? '体力不足，等待恢复后重试（本地样例）' : i % 5 === 4 ? '活动条件变化，取消本次安排（本地样例）' : '已完成本轮行动并保存结算'},
    retryAvailable: i % 5 === 3, revisions: index === 0 && i === 2
        ? [{id: 'local-revision-delay', before: {status: 'pending', scheduledAt: at(9)}, after: {status: 'deferred', scheduledAt: at(10)}, reason: '居民正在执行其他任务，请稍后重试', createdAt: at(9)}]
        : [{id: 'local-revision', before: {status: 'pending'}, after: {status: 'success'}, reason: '本地样例执行记录', createdAt: at(9)}],
})));
export const goals: LifeGoal[] = residents.map(r => ({id: `goal-${r.id}`, actorId: r.id, title: '为下一次旅行攒够 5000 橘币',
    condition: {kind: 'savings', amount: '5000'}, progress: r.money, status: 'active', reason: '一边经营农场，一边记录生活。'}));
export const ledger: WorldLedger[] = feed.slice(0, 24).map((f, i) => ({id: `ledger-${i}`, agentId: f.actorId, agentName: f.actorName,
    kind: i % 2 ? 'market_buy' : 'farm_sell', amount: i % 2 ? '-48.00' : '240.00', createdAt: f.occurredAt,
    detail: i % 2 ? '采购草莓种子 ×2' : '出售三星草莓 ×8', snapshot: {name: '草莓', quantity: 8, reason: '本地样例账目'}}));
