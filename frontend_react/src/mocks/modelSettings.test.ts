import assert from 'node:assert/strict';
import test from 'node:test';
import type {AIModel, AIProvider, SystemAIConfig, ThinkingCapability} from '../types/api/setting';
import {resolveModelSettingsRoute} from './modelSettings.ts';

const invoke = async <T>(path: string, method = 'GET', body?: unknown, empty = false): Promise<T> => await resolveModelSettingsRoute(new Request(`http://local${path}`, {
    method, ...(body === undefined ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}),
}), empty) as T;

test('model settings local fixture supports capability, edit, reload and simulated connection', async () => {
    const providers = await invoke<AIProvider[]>('/api/settings/providers/');
    assert.ok(providers[0].models.some(model => model.name === 'gpt-6.1-terra'));
    assert.deepEqual(await invoke('/api/settings/providers/', 'GET', undefined, true), []);
    const capability = await invoke<ThinkingCapability>('/api/settings/providers/local-provider/thinking_capability/?name=gpt-6.1-terra&type=chat&protocol=auto');
    assert.deepEqual(capability.effortOptions, ['none', 'low', 'medium', 'high', 'xhigh', 'max']);
    const updated = await invoke<AIModel>('/api/settings/models/local-openai-terra/', 'PATCH', {reasoningEffort: 'high'});
    assert.equal(updated.reasoningEffort, 'high');
    assert.equal((await invoke<AIModel>('/api/settings/models/local-openai-terra/')).reasoningEffort, 'high');
    assert.equal((await invoke<{simulated: boolean}>('/api/settings/models/local-openai-terra/test_connection/', 'POST')).simulated, true);
    const missing = await invoke<Response>('/api/settings/models/missing/');
    assert.equal(missing.status, 404);
});

test('default model settings survive saving and reloading in local mode', async () => {
    const initial = await invoke<SystemAIConfig>('/api/settings/config/get_ai_config/');
    const next = {...initial, defaultChatModelId: 'local-openai-terra', defaultImageGenerationModelId: 'local-openai-image'};
    await invoke('/api/settings/config/save_ai_config/', 'POST', next);
    assert.deepEqual(await invoke('/api/settings/config/get_ai_config/'), next);
});
