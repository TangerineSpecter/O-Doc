import assert from 'node:assert/strict';
import test from 'node:test';
import type {AgentTaskConfig, AgentTaskMcpToolScope} from '../../types/api/setting';
import {buildAgentTaskPayload} from '../../utils/agentTaskPayload.ts';
import {resolveLocalRoute} from './routes.ts';

Object.defineProperty(globalThis, 'location', {
    value: new URL('http://localhost/?mockState=sample'), writable: true, configurable: true,
});

const base = '/api/settings/agent-tasks/';
const invoke = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> =>
    await resolveLocalRoute(new Request(`http://localhost${path}`, {
        method,
        ...(body === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}),
    })) as T;

test('local task create, update, and reload preserve explicit and omitted MCP scopes', async () => {
    const initialScope = {'local-mcp': ['search']};
    const created = await invoke<AgentTaskConfig>(base, 'POST', buildAgentTaskPayload({
        name: 'MCP scope regression', taskKind: 'custom', agents: ['local-resident-1'], mcpToolScope: initialScope,
    }));
    assert.deepEqual(created.mcpToolScope, initialScope);
    const path = `${base}${created.id}/`;
    const scopes: AgentTaskMcpToolScope[] = [null, {}, {'local-mcp': ['search', 'fetch']}];
    for (const scope of scopes) {
        const updated = await invoke<AgentTaskConfig>(path, 'PUT', buildAgentTaskPayload({...created, mcpToolScope: scope}));
        assert.deepEqual(updated.mcpToolScope, scope);
        const listed = (await invoke<AgentTaskConfig[]>(base)).find(task => task.id === created.id);
        assert.deepEqual(listed?.mcpToolScope, scope);
    }
    const updated = await invoke<AgentTaskConfig>(path, 'PUT', buildAgentTaskPayload({
        id: created.id, name: 'Updated title', taskKind: 'custom', mcpToolScope: undefined,
    }));
    assert.deepEqual(updated.mcpToolScope, scopes[scopes.length - 1]);
    assert.equal(updated.name, 'Updated title');
});
