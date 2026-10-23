import assert from 'node:assert/strict';
import test from 'node:test';
import type {AgentTaskConfig, AgentTaskMcpToolScope} from '../../../types/api/setting';
import {buildAgentTaskPayload} from '../../../utils/agentTaskPayload';
import {emptyTravelConfig} from '../../../types/api/travel';
import {emptyPublishConfig, newPublishRule} from './publishDefaults';
import {
    agentTaskDraftToConfig,
    agentTaskToDraft,
    createAgentTaskDraft,
    isSystemTaskKind,
    toggleAgentTaskDraftAgent,
    validateAgentTaskDraft,
    type AgentTaskDraft,
} from './agentTaskDraft';

const residents = [
    {id: 'agent-1', mcpServers: ['search']},
    {id: 'agent-2', mcpServers: ['notes']},
    {id: 'archived-agent', mcpServers: ['archive']},
];
const draft = (overrides: Partial<AgentTaskDraft> = {}): AgentTaskDraft => ({
    ...createAgentTaskDraft('agent-1'), name: ' Research ', prompt: ' Find evidence ', ...overrides,
});
const task = (overrides: Partial<AgentTaskConfig> = {}): AgentTaskConfig => ({
    ...buildAgentTaskPayload({agent: 'agent-1', name: 'Saved task', prompt: 'Find evidence'}),
    id: 'saved-task', agentName: 'Agent One', ...overrides,
});
const publishConfig = () => ({...emptyPublishConfig(), collectionId: 'collection', searchServerId: 'search', rules: [newPublishRule('category')]});

test('each new editor starts with an independent custom draft and strict empty tool scope', () => {
    const first = createAgentTaskDraft('agent-1');
    const second = createAgentTaskDraft('agent-2');
    assert.deepEqual(first.agents, ['agent-1']);
    assert.deepEqual(second.agents, ['agent-2']);
    assert.deepEqual(first.mcpToolScope, {});
    assert.equal(first.executionMode, 'parallel');
    assert.equal(first.model, '');
    assert.equal(first.randomCount, '1');
    assert.equal(first.scheduleTime, '09:00');
    assert.equal(first.followupEnabled, false);
    first.randomAllocations['agent-1'] = 3;
    assert.deepEqual(second.randomAllocations, {});
    assert.deepEqual(createAgentTaskDraft().agents, []);
});

test('editing restores ordered agents, numeric fields, allocation map, and archived followup', () => {
    const value = agentTaskToDraft(task({
        agents: ['agent-2', 'agent-1'], executionMode: 'serial', randomCount: 5, intervalMinutes: 15,
        randomAllocations: [{agentId: 'agent-2', count: 3}, {agentId: 'agent-1', count: 2}],
        followupEnabled: true, followupAgent: 'archived-agent', mcpToolScope: null,
    }));
    assert.deepEqual(value.agents, ['agent-2', 'agent-1']);
    assert.equal(value.randomCount, '5');
    assert.equal(value.intervalMinutes, '15');
    assert.deepEqual(value.randomAllocations, {'agent-2': 3, 'agent-1': 2});
    assert.equal(value.followupAgent, 'archived-agent');
    assert.equal(value.mcpToolScope, null);
    assert.deepEqual(agentTaskToDraft(task({agents: [], agent: 'legacy-agent'})).agents, ['legacy-agent']);
    assert.equal(agentTaskToDraft(task({mcpToolScope: undefined})).mcpToolScope, null);
});

test('custom scopes keep null, strict empty, and selected tools without granting unbound servers', () => {
    const scopes: AgentTaskMcpToolScope[] = [null, {}, {search: ['web_search'], notes: ['save'], archive: ['read'], empty: []}];
    for (const scope of scopes) {
        const value = draft({mcpToolScope: scope});
        const config = agentTaskDraftToConfig(value, ['agent-1', 'agent-2'], residents);
        assert.deepEqual(config.mcpToolScope, scope === null ? null : 'search' in scope ? {search: ['web_search'], notes: ['save']} : {});
        assert.deepEqual(buildAgentTaskPayload(config).mcpToolScope, config.mcpToolScope);
    }
    const system = agentTaskDraftToConfig(draft({taskKind: 'farm', mcpToolScope: {search: ['web_search']}}), ['agent-2'], residents);
    assert.equal(system.mcpToolScope, undefined);
    assert.equal('mcpToolScope' in JSON.parse(JSON.stringify(buildAgentTaskPayload(system))), false);
});

test('every life-managed activity uses supplied current residents and serial life scheduling', () => {
    const kinds = ['post_interaction', 'post_publish', 'travel', 'farm', 'market', 'investment', 'cooking', 'alchemy', 'blacksmith', 'exploration'] as const;
    for (const taskKind of kinds) {
        const value = draft({
            taskKind, agents: ['stale-agent'], prompt: '',
            travelConfig: {...emptyTravelConfig(), collectionId: 'collection', categoryId: 'travel', searchServerId: 'search'},
            publishConfig: publishConfig(),
        });
        assert.equal(isSystemTaskKind(taskKind), true);
        assert.equal(validateAgentTaskDraft(value, ['agent-2', 'agent-1']), undefined);
        const config = agentTaskDraftToConfig(value, ['agent-2', 'agent-1'], residents);
        assert.deepEqual(config.agents, ['agent-2', 'agent-1']);
        assert.equal(config.agent, 'agent-2');
        assert.equal(config.executionMode, 'serial');
        assert.equal(config.schedule, '由统一生活日程安排');
        assert.equal(config.scheduleType, 'interval');
        assert.equal(config.followupEnabled, false);
        assert.equal(validateAgentTaskDraft(value, []), '请先在统一生活运行中选择居民');
    }
    assert.equal(isSystemTaskKind('custom'), false);
    assert.equal(isSystemTaskKind('memo_capture'), false);
});

test('random serial allocation validates totals while parallel runs keep per-agent targets', () => {
    const value = draft({agents: ['agent-1', 'agent-2'], scheduleMode: 'random', executionMode: 'serial', randomCount: '5'});
    assert.equal(validateAgentTaskDraft(value, value.agents), undefined);
    for (const randomCount of ['0', '-1', '1.5', '10001', 'NaN']) {
        assert.equal(validateAgentTaskDraft({...value, randomCount}, value.agents), '目标次数须为 1 到 10000 之间的整数');
    }
    const invalidAllocations: Record<string, number>[] = [{'agent-1': 6}, {'agent-1': 0, 'agent-2': 0}, {'agent-1': -1, 'agent-2': 3}, {'agent-1': 1.5}];
    for (const randomAllocations of invalidAllocations) {
        assert.equal(validateAgentTaskDraft({...value, randomAllocations}, value.agents), 'Agent 分配次数须为非负整数，合计大于 0 且不能超过任务总次数');
    }
    const serial = {...value, randomAllocations: {'agent-1': 2, 'agent-2': 3}};
    assert.equal(validateAgentTaskDraft(serial, serial.agents), undefined);
    const config = agentTaskDraftToConfig(serial, serial.agents, residents);
    assert.equal(config.schedule, '每天随机 · 合计 5 次');
    assert.deepEqual(config.randomAllocations, [{agentId: 'agent-1', count: 2}, {agentId: 'agent-2', count: 3}]);
    const parallel = {...serial, executionMode: 'parallel' as const};
    assert.equal(agentTaskDraftToConfig(parallel, parallel.agents, residents).schedule, '每天随机 · 每个 Agent 5 次');
    assert.deepEqual(agentTaskDraftToConfig(parallel, parallel.agents, residents).randomAllocations, []);
});

test('changing the selected agents clears stale allocations without changing the prior draft', () => {
    const original = draft({agents: ['agent-1', 'agent-2'], randomAllocations: {'agent-1': 2, 'agent-2': 3}});
    const removed = toggleAgentTaskDraftAgent(original, 'agent-1');
    assert.deepEqual(removed.agents, ['agent-2']);
    assert.deepEqual(removed.randomAllocations, {});
    assert.deepEqual(toggleAgentTaskDraftAgent(removed, 'agent-1').agents, ['agent-2', 'agent-1']);
    assert.deepEqual(original.randomAllocations, {'agent-1': 2, 'agent-2': 3});
});

test('fixed, random, and manual schedules retain their existing serialized meaning', () => {
    const cases: [Partial<AgentTaskDraft>, string][] = [
        [{scheduleType: 'daily', scheduleTime: '08:15'}, '每天 08:15'],
        [{scheduleType: 'weekly', scheduleWeekday: '0', scheduleTime: '08:15'}, '每周日 08:15'],
        [{scheduleType: 'monthly', scheduleMonthDay: '12', scheduleTime: '08:15'}, '每月 12 日 08:15'],
        [{scheduleType: 'interval', intervalMinutes: '35'}, '每 35 分钟'],
        [{trigger: '手动执行', scheduleType: 'interval', intervalMinutes: ''}, '手动执行'],
        [{scheduleMode: 'random', randomPeriod: 'yearly', randomCount: '8'}, '每年随机 · 每个 Agent 8 次'],
    ];
    for (const [patch, schedule] of cases) {
        const value = draft(patch);
        assert.equal(validateAgentTaskDraft(value, value.agents), undefined);
        assert.equal(agentTaskDraftToConfig(value, value.agents, residents).schedule, schedule);
    }
    const external = draft({trigger: 'Memos 触发', scheduleMode: 'random'});
    assert.equal(agentTaskDraftToConfig(external, external.agents, residents).scheduleMode, 'fixed');
    assert.equal(validateAgentTaskDraft(draft({scheduleType: 'interval', intervalMinutes: '0'}), ['agent-1']), '请填写大于 0 的间隔分钟数');
});

test('notifications and followups keep validation order and trim only the submitted fields', () => {
    const cases: [Partial<AgentTaskDraft>, string][] = [
        [{name: ' '}, '请填写任务名称和任务目标'],
        [{prompt: ' '}, '请填写任务名称和任务目标'],
        [{agents: []}, '请至少选择一个 Agent'],
        [{notifyEnabled: true, notifyWebhookUrl: ' '}, '请填写通知 Webhook 地址'],
        [{followupEnabled: true, followupAgent: ''}, '请选择完成后接手的 Agent'],
        [{followupEnabled: true, followupAgent: 'agent-1'}, '后续 Agent 不能与主执行 Agent 重复'],
    ];
    for (const [patch, message] of cases) {
        const value = draft(patch);
        assert.equal(validateAgentTaskDraft(value, value.agents), message);
    }
    const value = draft({notifyEnabled: true, notifyWebhookUrl: ' https://example.invalid/hook ', followupEnabled: true,
        followupAgent: 'agent-2', followupAction: 'continue_research', followupPrompt: ' Look deeper '});
    const config = agentTaskDraftToConfig(value, value.agents, residents);
    assert.equal(config.name, 'Research');
    assert.equal(config.prompt, 'Find evidence');
    assert.equal(config.notifyWebhookUrl, 'https://example.invalid/hook');
    assert.equal(config.followupPrompt, 'Look deeper');
    assert.equal(config.followupAction, 'continue_research');
    const disabled = agentTaskDraftToConfig({...value, notifyEnabled: false, followupEnabled: false}, value.agents, residents);
    assert.equal(disabled.notifyWebhookUrl, '');
    assert.equal(disabled.followupAgent, null);
    assert.equal(disabled.followupPrompt, '');
    assert.equal(value.name, ' Research ');
});

test('travel and publishing requirements run before saving and preserve quota limits', () => {
    const travel = draft({taskKind: 'travel', travelConfig: emptyTravelConfig()});
    assert.equal(validateAgentTaskDraft(travel, []), '请选择旅行日记的输出文集');
    const publish = draft({taskKind: 'post_publish', publishConfig: emptyPublishConfig()});
    assert.equal(validateAgentTaskDraft(publish, publish.agents), '请选择输出文集、搜索服务和至少一个有效分类及内容方式');
    const valid = {...publish, publishConfig: {...publishConfig(), quotaEnabled: true, quotaTotal: 10, quotaPerAgent: 3}};
    assert.equal(validateAgentTaskDraft(valid, valid.agents), undefined);
    assert.match(validateAgentTaskDraft({...valid, publishConfig: {...valid.publishConfig, quotaTotal: 0}}, valid.agents)!, /周期内所有 Agent/);
    assert.match(validateAgentTaskDraft({...valid, publishConfig: {...valid.publishConfig, quotaPerAgent: 11}}, valid.agents)!, /每位 Agent/);
    assert.equal(validateAgentTaskDraft({...valid, publishConfig: {...valid.publishConfig, quotaPerAgent: 0}}, valid.agents), undefined);
});
