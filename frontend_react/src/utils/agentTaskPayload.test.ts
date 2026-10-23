import assert from 'node:assert/strict';
import test from 'node:test';
import type {AgentTaskMcpToolScope} from '../types/api/setting';
import {buildAgentTaskPayload} from './agentTaskPayload.ts';

const scopes: {name: string; value: AgentTaskMcpToolScope | undefined}[] = [
    {name: 'omitted scope stays omitted', value: undefined},
    {name: 'null scope keeps inherited tools', value: null},
    {name: 'empty scope grants no tools', value: {}},
    {name: 'explicit scope keeps only the selected tools', value: {'mcp-search': ['web_search', 'fetch_page']}},
];

for (const {name, value} of scopes) {
    test(name, () => {
        const payload = buildAgentTaskPayload({taskKind: 'custom', mcpToolScope: value});
        assert.deepEqual(payload.mcpToolScope, value);
        const wirePayload = JSON.parse(JSON.stringify(payload));
        assert.equal(Object.prototype.hasOwnProperty.call(wirePayload, 'mcpToolScope'), value !== undefined);
        if (value !== undefined) assert.deepEqual(wirePayload.mcpToolScope, value);
    });
}

test('task defaults remain unchanged at the request boundary', () => {
    assert.deepEqual(buildAgentTaskPayload({}), {
        id: undefined, model: null, name: '', agent: '', agents: [], executionMode: 'parallel', taskKind: 'custom',
        mcpToolScope: undefined, publishConfig: undefined, travelConfig: undefined, investmentConfig: undefined, marketConfig: undefined,
        postCollectionIds: [], postCategoryIds: [], trigger: '定时任务', schedule: '', scheduleType: 'daily',
        scheduleMode: 'fixed', randomPeriod: 'daily', randomCount: 1, randomAllocations: [], scheduleTime: '09:00',
        scheduleWeekday: '1', scheduleMonthDay: '1', intervalMinutes: 60, enabled: true, prompt: '',
        notifyEnabled: false, notifyPlatform: 'feishu', notifyWebhookUrl: '', followupEnabled: false,
        followupAgent: null, followupAction: 'review', followupPrompt: '',
    });
});

test('explicit task values and legacy single-agent fallback keep their existing meaning', () => {
    const payload = buildAgentTaskPayload({
        id: 'task', model: 'model', name: 'Task', agent: 'legacy-agent', agents: ['agent-2', 'agent-3'],
        executionMode: 'serial', taskKind: 'post_publish', trigger: '手动执行', schedule: '手动执行',
        scheduleType: 'interval', scheduleMode: 'random', randomPeriod: 'weekly', randomCount: 0,
        randomAllocations: [{agentId: 'agent-2', count: 2}], intervalMinutes: 15, enabled: false,
        notifyEnabled: true, notifyWebhookUrl: 'https://example.invalid/notify', followupEnabled: true,
        followupAgent: 'agent-4', followupAction: 'continue_research', followupPrompt: 'Continue',
        postCollectionIds: ['collection'], postCategoryIds: ['category'],
    });
    assert.equal(payload.id, 'task');
    assert.equal(payload.model, 'model');
    assert.equal(payload.agent, 'agent-2');
    assert.deepEqual(payload.agents, ['agent-2', 'agent-3']);
    assert.equal(payload.executionMode, 'serial');
    assert.equal(payload.taskKind, 'post_publish');
    assert.equal(payload.trigger, '手动执行');
    assert.equal(payload.scheduleMode, 'random');
    assert.equal(payload.randomPeriod, 'weekly');
    assert.equal(payload.randomCount, 0);
    assert.deepEqual(payload.randomAllocations, [{agentId: 'agent-2', count: 2}]);
    assert.equal(payload.intervalMinutes, 15);
    assert.equal(payload.enabled, false);
    assert.equal(payload.notifyWebhookUrl, 'https://example.invalid/notify');
    assert.equal(payload.followupAction, 'continue_research');
    assert.deepEqual(payload.postCollectionIds, ['collection']);
    assert.deepEqual(payload.postCategoryIds, ['category']);
    assert.deepEqual(buildAgentTaskPayload({agent: 'legacy-agent'}).agents, ['legacy-agent']);
    assert.equal(buildAgentTaskPayload({agent: 'legacy-agent', agents: []}).agent, 'legacy-agent');
});
