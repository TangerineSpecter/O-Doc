import assert from 'node:assert/strict';
import {test} from 'node:test';
import {observationRequests, observationRoute} from '../mocks/agentWorld/tokenUsage.ts';
import {observedActivities, knownTokens, changedBlocks, dayOf, shiftDay, inputClues} from './tokenObservatory.ts';
import {inputBlocksFromRequest, outputFromResponse} from './executionFlow.ts';
import type {DailyFeedEvent} from '../types/api/dailyFeed.ts';
import type {TokenRequests} from '../types/api/tokenUsage.ts';

test('只有明确执行与居民身份才合并；无 ID 请求独立且按时间正序', () => {
    const base = observationRequests[0];
    const rows = [{...base, id: 'b', recordKey: '', phase: '相同阶段'}, {...base, id: 'a', recordKey: '', phase: '相同阶段'}, {...base, id: 'r1', recordKey: 'run'}, {...base, id: 'r2', recordKey: 'run', agentKey: 'other'}];
    const fact: DailyFeedEvent = {id: 'f', actorId: base.agentKey, actorName: base.agentName, occurredAt: base.startedAt, category: 'record', source: 'run', title: '完成', detail: '已保存', status: 'success', amount: null, target: {kind: 'run', id: 'run'}};
    const groups = observedActivities(rows, [fact, {...fact, id: 'unknown', target: {kind: 'market', id: 'run'}}]);
    assert.equal(groups.length, 5);
    assert.equal(groups.find(g => g.id === `run:run:${base.agentKey}`)?.facts.length, 1);
    assert.equal(groups.find(g => g.id === 'run:run:other')?.facts.length, 0);
    assert.ok(groups.some(g => g.id === 'request:a'));
    assert.ok(groups.some(g => g.id === 'request:b'));
    assert.ok(groups.some(g => g.id === 'fact:unknown'));
});

test('未知、真实零和已知消耗分别保留', () => {
    const base = observationRequests[0];
    assert.equal(knownTokens([{...base, totalTokens: null}], 'totalTokens'), null);
    assert.equal(knownTokens([{...base, totalTokens: 0}], 'totalTokens'), 0);
    assert.equal(knownTokens([{...base, totalTokens: 12}, {...base, totalTokens: null}], 'totalTokens'), 12);
});

test('上海跨日归属与前后一天独立于浏览器时区', () => {
    assert.equal(dayOf('2026-10-21T16:00:00Z'), '2026-10-22');
    assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
});

test('工具 Schema、调用参数与 tool_call_id 不再被流程解析丢弃', () => {
    const input = {messages: [{role: 'assistant', content: null, tool_calls: [{id: 'call-7', function: {name: 'lookup', arguments: '{"code":"600000"}'}}]}, {role: 'tool', tool_call_id: 'call-7', content: '{"price":12}'}], tools: [{function: {name: 'lookup', parameters: {required: ['code']}}}]};
    const blocks = inputBlocksFromRequest(input);
    assert.ok(blocks.some(b => b.kind === 'tools' && b.text.includes('required')));
    assert.ok(blocks.some(b => b.text.includes('600000')));
    assert.ok(blocks.some(b => b.source?.includes('call-7')));
    const output = outputFromResponse({choices: [{message: input.messages[0]}]});
    assert.ok(output?.blocks.some(b => b.text.includes('call-7') && b.text.includes('600000')));
});

test('相邻变化不把同样内容说成新增，无法比较的历史不伪造一致', () => {
    const previous = inputBlocksFromRequest({messages: [{role: 'user', content: '旧资料'}]});
    const current = inputBlocksFromRequest({messages: [{role: 'user', content: '新资料'}]});
    assert.equal(changedBlocks(current, previous)[0].state, '变化');
    assert.equal(changedBlocks(previous, previous)[0].state, '沿用');
    assert.equal(changedBlocks([], previous)[0].state, '移除');
    assert.equal(inputClues(observationRequests[0], current).some(c => c.title.includes('一致')), false);
});

test('local 请求筛选与分页覆盖全部样例，空场景和过期正文有明确语义', () => {
    const actor = observationRequests[0].agentKey;
    const firstUrl = new URL(`http://local/api/settings/agent-world/token-usage/requests/?all=1&agent_id=${actor}`);
    const first = observationRoute(firstUrl, false) as TokenRequests;
    assert.equal(first.items.length, 5);
    assert.equal(first.hasMore, true);
    const expected = observationRequests.filter(row => row.agentKey === actor);
    const rows = [...first.items];
    const cursors = new Set<string>();
    let page = first;
    while (page.hasMore) {
        assert.ok(page.nextCursor);
        assert.ok(!cursors.has(page.nextCursor), '分页游标必须前进');
        cursors.add(page.nextCursor);
        firstUrl.searchParams.set('cursor', page.nextCursor);
        page = observationRoute(firstUrl, false) as TokenRequests;
        rows.push(...page.items);
    }
    assert.equal(rows.length, expected.length);
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
    assert.deepEqual(new Set(rows.map(row => row.id)), new Set(expected.map(row => row.id)));
    assert.ok(rows.every(row => row.agentKey === actor));
    assert.equal((observationRoute(firstUrl, true) as TokenRequests).items.length, 0);
    assert.deepEqual(observationRoute(new URL('http://local/api/settings/agent-world/token-usage/requests/local-observation-0-8/content/'), false), {available: false, reason: 'not_found', message: '当前服务器未找到该请求的输入输出正文文件'});
});

test('凌晨历史英文阶段在时间轴与调用链统一转成中文，未知阶段不泄露标识', async () => {
    const {requestPhaseName} = await import('./tokenUsageLabels');
    const base = observationRequests[0];
    const labels = {daily_consolidation: '每日记忆整理', life_interleaving: '空档活动选择', combat_preparation: '迷宫探索准备'};
    for (const [phase, label] of Object.entries(labels)) {
        const row = {...base, taskName: '', phase};
        assert.equal(requestPhaseName(row), label);
        assert.equal(observedActivities([row], [])[0].title, label);
    }
    assert.equal(requestPhaseName({...base, phase: 'new_internal_phase', purpose: 'memory'}), '记忆整理');
    assert.equal(requestPhaseName({...base, phase: '已确认中文阶段'}), '已确认中文阶段');
    for (const row of observationRequests.filter(r => r.id.startsWith('local-legacy-'))) {
        const body = observationRoute(new URL(`http://local/api/settings/agent-world/token-usage/requests/${row.id}/content/`), false) as {available: boolean; request: unknown; response: unknown};
        assert.ok(body.available && body.request && body.response);
    }
});
