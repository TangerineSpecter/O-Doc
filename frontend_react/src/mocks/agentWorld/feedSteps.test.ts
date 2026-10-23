import assert from 'node:assert/strict';
import {test, after} from 'node:test';
import {register} from 'node:module';
import type {DailyFeedResult} from '../../types/api/dailyFeed';
import {parseSettlementReport} from '../../components/Combat/observationRecords';

const location = new URL('http://localhost/?mockState=populated');
const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
Object.defineProperty(globalThis, 'location', {value: location, configurable: true});
after(() => {
    if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation);
    else Reflect.deleteProperty(globalThis, 'location');
});

register('../../../scripts/raw-json-test-loader.mjs', import.meta.url);
const {resolveLocalRoute} = await import('./routes');

test('本地 Mock daily-feed 能正确返回符合图片样式的炼金制作执行明细', async () => {
    const request = new Request('http://localhost/api/settings/agent-world/daily-feed/?category=alchemy', {method: 'GET'});
    const response = (await resolveLocalRoute(request)) as DailyFeedResult;
    assert.ok(response && Array.isArray(response.items));

    // 验证猫猫的单瓶炼金制作（图片 2）
    const maomaoFeed = response.items.find(item => item.actorName === '猫猫' && item.category === 'alchemy');
    assert.ok(maomaoFeed, '未找到猫猫的炼金 mock 数据');
    assert.equal(maomaoFeed.title, '炼金制作');
    assert.equal(maomaoFeed.detail, '已炼制 1 瓶药水 · 愈合药剂 ★1 ×1');
    assert.equal(maomaoFeed.reason, '系统选择说明：按已确认的炼金配方和瓶数制作。');
    assert.ok(maomaoFeed.steps && maomaoFeed.steps.length === 1);
    assert.equal(maomaoFeed.steps[0].title, '炼制');
    assert.equal(maomaoFeed.steps[0].detail, '愈合药剂 ★1 ×1 · 炼金经验 +12 · 回收价值 12.00 币');

    // 验证银月的双瓶炼金制作（图片 3）
    const yinyueFeed = response.items.find(item => item.actorName === '银月' && item.category === 'alchemy');
    assert.ok(yinyueFeed, '未找到银月的炼金 mock 数据');
    assert.equal(yinyueFeed.title, '炼金制作');
    assert.equal(yinyueFeed.detail, '已炼制 2 瓶药水 · 愈合药剂 ★1 ×1、愈合药剂 ★2 ×1');
    assert.equal(yinyueFeed.reason, '系统选择说明：按已确认的炼金配方和瓶数制作。');
    assert.ok(yinyueFeed.steps && yinyueFeed.steps.length === 2);
    assert.equal(yinyueFeed.steps[0].title, '炼制');
    assert.equal(yinyueFeed.steps[0].detail, '愈合药剂 ★1 ×1 · 炼金经验 +12 · 回收价值 12.00 币');
    assert.equal(yinyueFeed.steps[1].title, '炼制');
    assert.equal(yinyueFeed.steps[1].detail, '愈合药剂 ★2 ×1 · 炼金经验 +13 · 回收价值 14 币');
});

test('本地 Mock daily-feed 能正确返回符合图片样式的市场交易 7 步执行明细', async () => {
    const request = new Request('http://localhost/api/settings/agent-world/daily-feed/?category=market', {method: 'GET'});
    const response = (await resolveLocalRoute(request)) as DailyFeedResult;
    assert.ok(response && Array.isArray(response.items));

    // 验证样本 1（图片 1：进入市场、居民上架、装备上架、出售装备、离开市场）
    const sample1 = response.items.find(item => item.id === 'local-feed-market-step-sample-1');
    assert.ok(sample1, '未找到市场样例 1 mock 数据');
    assert.ok(sample1.steps && sample1.steps.length === 7);
    assert.deepEqual(sample1.steps.map(s => s.title), [
        '进入市场',
        '居民上架',
        '装备上架',
        '装备上架',
        '出售装备',
        '装备上架',
        '离开市场',
    ]);
    assert.equal(sample1.steps[1].detail, '蝠翼 × 15 · 单价 1.12');
    assert.equal(sample1.steps[2].detail, '复苏的轻行皮靴 × 1 · 单价 4.80');
    assert.equal(sample1.steps[3].detail, '复苏的新手护甲 × 1 · 单价 3.96');
    assert.equal(sample1.steps[4].detail, '丰盈的皮革护腕 × 1');
    assert.equal(sample1.steps[5].detail, '辉耀的猎行皮甲 × 1 · 单价 8.06');

    // 验证样本 2（图片 4：进入市场、装备上架、商店购买、离开市场）
    const sample2 = response.items.find(item => item.id === 'local-feed-market-step-sample-2');
    assert.ok(sample2, '未找到市场样例 2 mock 数据');
    assert.ok(sample2.steps && sample2.steps.length === 7);
    assert.deepEqual(sample2.steps.map(s => s.title), [
        '进入市场',
        '装备上架',
        '装备上架',
        '装备上架',
        '装备上架',
        '商店购买',
        '离开市场',
    ]);
    assert.equal(sample2.steps[1].detail, '御暗的新手靴子 × 1 · 单价 2.52');
    assert.equal(sample2.steps[2].detail, '幸运的新手护甲 × 1 · 单价 2.20');
    assert.equal(sample2.steps[3].detail, '御暗的新手手套 × 1 · 单价 3.42');
    assert.equal(sample2.steps[4].detail, '灵运的新手手套 × 1 · 单价 8.17');
    assert.equal(sample2.steps[5].detail, '小鱼饵 × 90 · 单价 3');
});

test('本地 Mock daily-feed 能正确返回符合图片样式的农场经营 12 步执行明细', async () => {
    const request = new Request('http://localhost/api/settings/agent-world/daily-feed/?category=farm', {method: 'GET'});
    const response = (await resolveLocalRoute(request)) as DailyFeedResult;
    assert.ok(response && Array.isArray(response.items));

    // 验证林芽的农场 12 步队列执行
    const farmSample = response.items.find(item => item.id === 'local-feed-farm-queue-sample-1');
    assert.ok(farmSample, '未找到农场经营 12 步 mock 数据');
    assert.equal(farmSample.title, '农场经营');
    assert.equal(farmSample.detail, '已执行 6 项操作');
    assert.ok(farmSample.reason?.includes('凌晨有两批草莓陆续成熟了'));
    assert.ok(farmSample.steps && farmSample.steps.length === 12);

    assert.equal(farmSample.steps[0].title, '队列状态');
    assert.equal(farmSample.steps[0].detail, '活动时段已截止，未播种项目失效；在田作物继续生长');

    assert.equal(farmSample.steps[1].title, 'AI规划');
    assert.ok(farmSample.steps[1].detail.includes('计划种植：草莓 ×56'));

    assert.equal(farmSample.steps[2].title, '按队列自动执行 · 收获');
    assert.equal(farmSample.steps[2].detail, '1 个目标 · 草莓 ★1 × 2 · 种植经验 +28 · 体力 -2 · 来源计划 2026-10-22');

    assert.equal(farmSample.steps[3].title, '按队列自动执行 · 收获');
    assert.equal(farmSample.steps[3].detail, '1 个目标 · 草莓 ★1 × 3 · 种植经验 +28 · 体力 -2 · 来源计划 2026-10-22');

    assert.equal(farmSample.steps[7].title, '按队列自动执行 · 播种并浇水');
    assert.equal(farmSample.steps[7].detail, '草莓 · 4 个目标 · 体力 -2');

    assert.equal(farmSample.steps[8].title, '按队列自动执行 · 施肥');
    assert.equal(farmSample.steps[8].detail, '4 个目标 · 体力 -2');

    assert.equal(farmSample.steps[11].title, '队列状态');
    assert.equal(farmSample.steps[11].detail, '居民正在执行其他任务，下一轮重试');
});

test('本地 Mock daily-feed 能返回可解析的探索结算样例', async () => {
    const request = new Request('http://localhost/api/settings/agent-world/daily-feed/?category=exploration', {method: 'GET'});
    const response = (await resolveLocalRoute(request)) as DailyFeedResult;
    assert.ok(response && Array.isArray(response.items));

    // 截图态：银月 30 分钟探索，含战利品与返还药水
    const sample = response.items.find(item => item.id === 'local-feed-exploration-yinyue-1');
    assert.ok(sample, '未找到探索结算 mock 数据');
    assert.equal(sample.title, '迷宫探索 · 30 分钟');
    assert.equal(sample.target?.kind, 'exploration');
    const parsed = parseSettlementReport(sample.detail);
    assert.ok(parsed, '探索结算文案未被解析');
    assert.equal(parsed.minutes, 30);
    assert.equal(parsed.kills, 17);
    assert.equal(parsed.experience, 1679);
    assert.equal(parsed.energy, 22);
    assert.equal(parsed.level, 12);
    assert.equal(parsed.potions, 0);
    assert.deepEqual(parsed.loots, [
        {name: '蝠翼', count: 8},
        {name: '苔石碎片', count: 2},
        {name: '晶鳞', count: 3},
    ]);
    // 解析结果只做空白归一；横幅中的 “ · ” 分隔由界面文案层负责
    assert.equal(parsed.reason, '按计划完成探索 返还 4 瓶');

    // 倒地结算：横幅走休整样式
    const fallen = response.items.find(item => item.id === 'local-feed-exploration-resident-4');
    assert.ok(fallen);
    assert.ok(parseSettlementReport(fallen.detail)?.reason?.includes('倒地'));

    // 暂停探索：后端只提供进度回退文案，不进入结算卡片
    const paused = response.items.find(item => item.id === 'local-feed-exploration-resident-1-paused');
    assert.ok(paused);
    assert.equal(paused.status, 'paused');
    assert.equal(parseSettlementReport(paused.detail), null);
});

test('全部视图下最新事件包含图片样式的炼金与市场活动，并支持居民隔离过滤', async () => {
    // 1. 全部视图
    const allRequest = new Request('http://localhost/api/settings/agent-world/daily-feed/?category=all', {method: 'GET'});
    const allResponse = (await resolveLocalRoute(allRequest)) as DailyFeedResult;
    assert.ok(allResponse && allResponse.items.length > 0);
    const topAlchemies = allResponse.items.filter(item => item.category === 'alchemy' && item.steps?.length);
    assert.ok(topAlchemies.length >= 2, '全部视图下应包含带步骤的炼金事件');
    const topMarkets = allResponse.items.filter(item => item.category === 'market' && item.steps?.length === 7);
    assert.ok(topMarkets.length >= 2, '全部视图下应包含 7 步的市场事件');

    // 2. 按居民过滤（小橘）
    const actorRequest = new Request('http://localhost/api/settings/agent-world/daily-feed/?category=all&actor_id=local-resident-1', {method: 'GET'});
    const actorResponse = (await resolveLocalRoute(actorRequest)) as DailyFeedResult;
    assert.ok(actorResponse.items.every(item => item.actorId === 'local-resident-1'));
    assert.ok(actorResponse.items.some(item => item.category === 'alchemy' && item.steps?.length));
    assert.ok(actorResponse.items.some(item => item.category === 'market' && item.steps?.length === 7));
});
